"""
SentryOS — Canonical Data Models & Thread-Safe State Container
==============================================================

This module defines the **single source of truth** for all data flowing
between the Vision Thread (producer) and the WebSocket broadcaster
(consumer) inside the SentryOS backend.

Architecture Role
-----------------
┌──────────────┐       write()        ┌──────────────────┐       get_snapshot()        ┌──────────────┐
│ Vision Thread │  ──────────────────► │ ThreadSafeState  │  ◄──────────────────────── │  FastAPI /ws  │
│ (producer)    │                      │ (shared memory)  │                            │  (consumer)   │
└──────────────┘                      └──────────────────┘                            └──────────────┘

ADR-01 Contract:  Flat JSON schema (PRD Section 6.1)
    {
        "face_count":     int,    // -1 = camera fault, 0+ = detected faces
        "dominant_color": str,    // HEX e.g. "#4A90E2"
        "system_status":  str,    // "active" | "initializing" | "camera_unavailable"
        "timestamp":      float   // time.time() epoch seconds
    }

Thread Safety
-------------
All reads and writes to `SensorPayload` go through `ThreadSafeState`,
which guards the internal state with a `threading.Lock`.  The lock is
held only for shallow copies (dict snapshots), never during I/O or
`await` calls, so contention is negligible.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field, asdict
from typing import Literal

# ── Public Exports ──────────────────────────────────────────────────────────

__all__ = ["SensorPayload", "ThreadSafeState", "SystemStatus"]

# ── Type Aliases ────────────────────────────────────────────────────────────

SystemStatus = Literal["initializing", "active", "camera_unavailable"]
"""
Allowed values for ``system_status``:

* ``"initializing"`` — backend has started but the vision loop has not
  delivered its first frame yet.
* ``"active"``       — the camera is open and processing frames normally.
* ``"camera_unavailable"`` — ``cv2.VideoCapture.read()`` is returning
  ``False``.  The frontend should treat this as a security fault and
  default to BLURRED.
"""


# ── Data Contract ───────────────────────────────────────────────────────────

@dataclass
class SensorPayload:
    """Canonical WebSocket payload — ADR-01 flat schema.

    Every field maps 1-to-1 to a key in the emitted JSON.  No nesting,
    no wrapper objects.

    Attributes
    ----------
    face_count : int
        Number of human faces detected in the current frame.
        * ``-1``  → camera fault / unavailable (security fault).
        * ``0``   → no faces detected (user may have left).
        *  ``1``  → single authorised user (SECURE state).
        *  ``2+`` → potential shoulder-surfer (BLURRED state).
    dominant_color : str
        HEX colour string (e.g. ``"#4A90E2"``) extracted from the centre
        ROI of the frame via MiniBatchKMeans clustering.
    system_status : SystemStatus
        Human-readable status of the AI sensory engine.
    timestamp : float
        Unix epoch timestamp (``time.time()``) of the most recent sensor
        update.  Allows the frontend to detect stale data and apply
        degraded-security behaviour.
    """

    face_count: int = 0
    dominant_color: str = "#1a1a2e"
    system_status: SystemStatus = "initializing"
    timestamp: float = field(default_factory=time.time)

    # -- Serialisation helpers ------------------------------------------------

    def to_dict(self) -> dict:
        """Return a plain ``dict`` suitable for ``json.dumps`` / ``send_json``.

        Uses ``dataclasses.asdict`` to guarantee the output matches the
        field names exactly — no manual key-mapping required.
        """
        return asdict(self)


# ── Thread-Safe State Container ────────────────────────────────────────────

class ThreadSafeState:
    """Mutex-guarded container for the latest ``SensorPayload``.

    This class is the **only** mechanism through which the Vision Thread
    communicates with the FastAPI WebSocket broadcaster.  It enforces a
    copy-on-read pattern so that the consumer never holds a reference to
    the mutable internal state while the producer is writing.

    Usage
    -----
    >>> state = ThreadSafeState()
    >>> state.update(face_count=2, system_status="active")
    >>> snapshot = state.get_snapshot()
    >>> snapshot["face_count"]
    2

    Concurrency Guarantee
    ---------------------
    * ``update()`` acquires the lock, mutates internal fields, releases.
    * ``get_snapshot()`` acquires the lock, shallow-copies to ``dict``,
      releases.  The returned ``dict`` is an independent object — safe
      to pass into ``await websocket.send_json()`` without holding the
      lock.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._payload = SensorPayload()  # starts in "initializing" state

    # -- Producer API (called by Vision Thread) -------------------------------

    def update(
        self,
        *,
        face_count: int | None = None,
        dominant_color: str | None = None,
        system_status: SystemStatus | None = None,
    ) -> None:
        """Atomically update one or more sensor fields.

        Only the supplied keyword arguments are mutated; omitted fields
        retain their previous values.  The ``timestamp`` is **always**
        refreshed to ``time.time()`` on every call, ensuring the
        consumer can detect freshness.

        Parameters
        ----------
        face_count : int, optional
            Updated face count from MediaPipe.
        dominant_color : str, optional
            Updated HEX colour from the K-Means extractor.
        system_status : SystemStatus, optional
            Updated engine status string.
        """
        with self._lock:
            if face_count is not None:
                self._payload.face_count = face_count
            if dominant_color is not None:
                self._payload.dominant_color = dominant_color
            if system_status is not None:
                self._payload.system_status = system_status

            # Always refresh the timestamp so the consumer can detect
            # stale data if the producer stops writing.
            self._payload.timestamp = time.time()

    # -- Consumer API (called by WebSocket broadcaster) -----------------------

    def get_snapshot(self) -> dict:
        """Return an independent ``dict`` copy of the current payload.

        The returned dictionary is safe to use outside the lock scope,
        including across ``await`` boundaries in async code.

        Returns
        -------
        dict
            Shallow copy matching the ADR-01 flat JSON schema.
        """
        with self._lock:
            return self._payload.to_dict()
