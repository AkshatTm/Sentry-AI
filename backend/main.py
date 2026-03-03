"""
SentryOS Backend — FastAPI Application & WebSocket Broadcaster
===============================================================

This is the entry point for the SentryOS AI Sensory Engine.  It
orchestrates three responsibilities:

1. **Lifecycle management** — starts the Vision Thread on application
   startup and ensures graceful shutdown (camera release, thread join)
   on ``SIGINT`` / ``SIGTERM`` / uvicorn shutdown.
2. **WebSocket broadcaster** — pushes the latest ``ThreadSafeState``
   snapshot to a single connected client at exactly **10 Hz** (100 ms
   intervals).  Enforces **ADR-03: single-client limit** by rejecting
   additional connections with close code ``4001``.
3. **REST health probe** — ``GET /health`` returns engine status so the
   frontend can confirm the backend is alive before attempting the
   WebSocket upgrade.

Architecture
------------
┌──────────────┐                        ┌───────────────────┐
│ Vision Thread │──update()────────────►│  ThreadSafeState   │
│ (daemon)      │                        │  (mutex-guarded)   │
└──────────────┘                        └────────┬──────────┘
                                                 │ get_snapshot()
                                                 ▼
                                        ┌───────────────────┐
                                        │  FastAPI /ws       │
                                        │  10 Hz broadcaster │
                                        └───────────────────┘

ADR Register
------------
* **ADR-01** — Flat JSON schema (``face_count``, ``dominant_color``,
  ``system_status``, ``timestamp``).
* **ADR-03** — Single WebSocket client.  Second connection gets
  ``close(4001, "single_client_limit")``.
* **ADR-04** — Debug window gated by ``SENTRY_DEBUG=1`` env var
  (handled in ``vision_thread.py``).
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from models import ThreadSafeState
from vision_thread import VisionLoop

# ── Logging Configuration ───────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("sentryos.main")

# ── Shared Infrastructure ──────────────────────────────────────────────────

shared_state = ThreadSafeState()
vision_loop = VisionLoop(shared_state)

# ── Constants ───────────────────────────────────────────────────────────────

BROADCAST_INTERVAL: float = 0.1
"""Seconds between WebSocket broadcasts — 10 Hz (100 ms).  Matches the
Design.md Section 6.1 rate specification."""

WS_CLOSE_SINGLE_CLIENT: int = 4001
"""Custom WebSocket close code sent when a second client attempts to
connect while one is already active (ADR-03)."""

# ── Active Client Tracking (ADR-03) ────────────────────────────────────────

_active_ws: dict[str, WebSocket] = {}
"""At most one entry.  Keyed by a unique client identifier.  Used to
enforce the single-client limit."""


# ── Lifespan (Startup / Shutdown) ──────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: start vision thread on boot, stop on
    shutdown.

    Using the modern ``lifespan`` context manager instead of the
    deprecated ``@app.on_event("startup")`` / ``"shutdown"`` hooks
    (FastAPI ≥ 0.93).
    """
    # ── Startup ─────────────────────────────────────────────────────
    logger.info("=" * 60)
    logger.info("  SentryOS AI Sensory Engine — Starting Up")
    logger.info("=" * 60)

    vision_loop.start()
    logger.info("Vision thread launched")

    # Register OS signal handlers for graceful shutdown on Ctrl+C.
    # uvicorn already handles SIGINT, but these ensure the vision
    # thread is stopped even if uvicorn's handler doesn't reach our
    # shutdown code.
    _register_signal_handlers()

    yield  # ← application runs here

    # ── Shutdown ────────────────────────────────────────────────────
    logger.info("Shutdown signal received — tearing down …")
    vision_loop.stop(timeout=5.0)

    # Close any lingering WebSocket connection.
    for client_id, ws in list(_active_ws.items()):
        try:
            await ws.close(code=1001, reason="server_shutdown")
        except Exception:
            pass
    _active_ws.clear()

    logger.info("SentryOS AI Sensory Engine — Shutdown complete")


# ── FastAPI Application ────────────────────────────────────────────────────

app = FastAPI(
    title="SentryOS API",
    description=(
        "Backend for the SentryOS Zero-Trust Remote Workspace. "
        "Streams real-time face-count and dominant-colour data over WebSocket."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the Next.js dev server (localhost:3000) to connect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST Endpoints ─────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Liveness + readiness probe.

    Returns the current engine status so the frontend can distinguish
    between "backend is up but camera failed" vs "backend is down".

    Response Schema
    ---------------
    ```json
    {
        "status": "ok",
        "service": "SentryOS",
        "engine": { ... current ThreadSafeState snapshot ... },
        "vision_thread_alive": true,
        "uptime_seconds": 123.45
    }
    ```
    """
    return {
        "status": "ok",
        "service": "SentryOS",
        "engine": shared_state.get_snapshot(),
        "vision_thread_alive": vision_loop.is_running,
        "uptime_seconds": round(time.time() - _start_time, 2),
    }


# ── WebSocket Endpoint ────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Primary WebSocket channel — push-only, 10 Hz sensor broadcast.

    Connection Protocol
    -------------------
    1. Client requests upgrade → server checks single-client limit.
    2. If a client is already connected → reject with ``4001``.
    3. Otherwise → accept, send a handshake event, enter broadcast loop.
    4. On disconnect (client or server) → clean up tracking state.

    Broadcast Payload (ADR-01)
    --------------------------
    Every 100 ms the server sends:
    ```json
    {
        "face_count": 1,
        "dominant_color": "#4A90E2",
        "system_status": "active",
        "timestamp": 1678882345.123
    }
    ```

    The client does **not** need to send any messages.  The channel is
    unidirectional (server → client).  If the client sends data it is
    silently consumed so the read buffer doesn't fill up.
    """
    client_id = f"{websocket.client.host}:{websocket.client.port}"

    # ── ADR-03: Single-client enforcement ───────────────────────────
    if _active_ws:
        logger.warning(
            "Rejecting second client %s — single-client limit (ADR-03)",
            client_id,
        )
        await websocket.accept()
        await websocket.close(
            code=WS_CLOSE_SINGLE_CLIENT,
            reason="single_client_limit",
        )
        return

    # ── Accept & register ───────────────────────────────────────────
    await websocket.accept()
    _active_ws[client_id] = websocket
    logger.info("WebSocket client connected: %s", client_id)

    # Send a one-time handshake event so the frontend can confirm
    # protocol compatibility.
    await websocket.send_json({
        "event": "connected",
        "message": "SentryOS WebSocket ready",
        "version": "1.0.0",
    })

    try:
        # Launch a background task to drain any client-sent messages
        # (prevents the WebSocket read buffer from filling up and
        # blocking the connection).
        drain_task = asyncio.create_task(_drain_client_messages(websocket))

        # ── 10 Hz broadcast loop ────────────────────────────────────
        while True:
            snapshot = shared_state.get_snapshot()
            await websocket.send_json(snapshot)
            await asyncio.sleep(BROADCAST_INTERVAL)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected: %s", client_id)
    except Exception:
        logger.exception("WebSocket error for client %s", client_id)
    finally:
        # ── Cleanup ─────────────────────────────────────────────────
        _active_ws.pop(client_id, None)
        drain_task.cancel()
        logger.info(
            "WebSocket slot released — ready for new client",
        )


# ── Internal Helpers ────────────────────────────────────────────────────────

async def _drain_client_messages(websocket: WebSocket) -> None:
    """Continuously read and discard any messages the client sends.

    This prevents the WebSocket internal buffer from growing unbounded
    if a client accidentally sends data on what is designed to be a
    server→client push channel.
    """
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass  # Connection closed — nothing to drain.


def _register_signal_handlers() -> None:
    """Register OS signal handlers for graceful shutdown.

    On Windows, ``SIGTERM`` is not reliably delivered, so we also
    register ``SIGINT`` (Ctrl+C) and ``SIGBREAK`` (Ctrl+Break).
    """
    def _handle_signal(sig, frame):
        logger.info("Received signal %s — requesting shutdown …", sig)
        vision_loop.stop(timeout=3.0)

    signal.signal(signal.SIGINT, _handle_signal)
    if hasattr(signal, "SIGBREAK"):
        # Windows-specific: Ctrl+Break
        signal.signal(signal.SIGBREAK, _handle_signal)


# ── Module-level timestamp for uptime calculation ──────────────────────────

_start_time: float = time.time()


# ── Dev Entry Point ────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,       # Reload is unsafe with background threads
        log_level="info",
    )

