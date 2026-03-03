"""
SentryOS — Vision Thread Orchestrator
======================================

Owns the camera hardware, runs the main frame-processing loop on a
dedicated ``threading.Thread(daemon=True)``, and coordinates the two AI
sub-systems:

* **VisionTracker** (face detection)  — called on **every** frame.
* **extract_dominant_color**          — called at **1 Hz** (rate-limited).

After each frame the orchestrator writes the latest sensor readings into
the shared ``ThreadSafeState``, which the FastAPI WebSocket broadcaster
reads asynchronously at 10 Hz.

Debug Mode (``SENTRY_DEBUG=1``)
-------------------------------
When the environment variable ``SENTRY_DEBUG`` is set to ``"1"``, the
loop renders an annotated OpenCV window showing:

* Green bounding boxes around every detected face.
* A cyan rectangle marking the 100 × 100 ROI used for colour sampling.
* An FPS counter in the top-left corner.
* The current dominant HEX colour rendered as a filled swatch.

Press **q** in the debug window to trigger a graceful shutdown.

Thread Safety
-------------
* The camera (``cv2.VideoCapture``) is opened **and** released on this
  thread — critical on Windows where cross-thread release can deadlock.
* The only cross-thread communication channel is ``ThreadSafeState``
  (mutex-guarded copy-on-read; see ``models.py``).

Performance Budget
------------------
* Frame cap: 30 FPS (``time.sleep`` governor) — exceeds PRD 15-24 FPS.
* K-Means: 1 Hz — negligible CPU overhead.
* Face detection: ~4-8 ms/frame on i5 CPU (MediaPipe short-range model).
"""

from __future__ import annotations

import logging
import os
import time
import threading
from typing import Optional

import cv2
import numpy as np

from models import ThreadSafeState
from vision_tracker import VisionTracker
from color_extractor import (
    extract_dominant_color,
    get_roi_bounds,
    DEFAULT_COLOR,
)

# ── Module Logger ───────────────────────────────────────────────────────────

logger = logging.getLogger("sentryos.vision_thread")

# ── Constants ───────────────────────────────────────────────────────────────

TARGET_FPS: int = 30
"""Maximum frame rate for the capture loop.  A ``time.sleep`` governor
ensures the loop never exceeds this value, preventing unnecessary CPU
saturation while staying well above the PRD minimum of 15-24 FPS."""

FRAME_INTERVAL: float = 1.0 / TARGET_FPS
"""Minimum time (in seconds) between consecutive loop iterations."""

COLOR_SAMPLE_INTERVAL: float = 1.0
"""Seconds between K-Means dominant-colour extractions.  Colour themes
do not need 30 FPS updates — 1 Hz is perceptually smooth and saves
significant CPU cycles."""

CAMERA_RETRY_DELAYS: list[float] = [1.0, 2.0, 4.0, 8.0, 10.0]
"""Exponential back-off schedule (seconds) for camera re-acquisition
attempts.  Caps at 10 s to avoid unresponsive startup when the camera
is locked by another application (Zoom, Teams, etc.)."""

DEBUG_WINDOW_NAME: str = "SentryOS Debug — Vision Pipeline"
"""Title of the ``cv2.imshow`` window shown in debug mode."""

# ── Colour Constants for Debug Overlay ──────────────────────────────────────

_GREEN = (0, 255, 0)
_CYAN = (255, 255, 0)
_WHITE = (255, 255, 255)
_BLACK = (0, 0, 0)


# ── VisionLoop Class ───────────────────────────────────────────────────────

class VisionLoop:
    """Orchestrator that owns the camera and drives face detection + colour
    extraction on a background thread.

    Lifecycle
    ---------
    1. ``__init__(shared_state)`` — stores references; no heavy init.
    2. ``start()`` — spawns the daemon thread (calls ``_run()``).
    3. ``_run()`` — the main loop (camera open → process → write state).
    4. ``stop()`` — signals the loop to exit, joins the thread, and
       guarantees camera + MediaPipe resources are released.

    Parameters
    ----------
    shared_state : ThreadSafeState
        The mutex-guarded state container that the WebSocket broadcaster
        reads from.  This is the **only** cross-thread data channel.
    device_index : int, optional
        ``cv2.VideoCapture`` device index.  ``0`` = default system webcam.

    Example
    -------
    >>> from models import ThreadSafeState
    >>> state = ThreadSafeState()
    >>> loop = VisionLoop(state)
    >>> loop.start()
    >>> # ... later ...
    >>> loop.stop()
    """

    def __init__(
        self,
        shared_state: ThreadSafeState,
        device_index: int = 0,
    ) -> None:
        self._shared_state = shared_state
        self._device_index = device_index

        # Resolve debug mode from environment variable (ADR-04).
        self._debug: bool = os.environ.get("SENTRY_DEBUG", "0") == "1"

        # Threading primitives.
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        # Sub-systems (instantiated lazily inside the thread).
        self._tracker: Optional[VisionTracker] = None
        self._cap: Optional[cv2.VideoCapture] = None

        # FPS tracking for logging / debug overlay.
        self._fps: float = 0.0
        self._frame_count: int = 0
        self._fps_timer: float = 0.0

        logger.info(
            "VisionLoop created (device=%d, debug=%s)",
            device_index,
            self._debug,
        )

    # ── Public API ──────────────────────────────────────────────────────

    def start(self) -> None:
        """Spawn the vision processing thread.

        Raises ``RuntimeError`` if the loop is already running.
        """
        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("VisionLoop is already running")

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name="SentryOS-VisionThread",
            daemon=True,
        )
        self._thread.start()
        logger.info("Vision thread started (tid=%s)", self._thread.ident)

    def stop(self, timeout: float = 5.0) -> None:
        """Signal the loop to exit and block until the thread joins.

        Parameters
        ----------
        timeout : float
            Maximum seconds to wait for the thread to finish.  If the
            thread does not join in time, a warning is logged but the
            method returns (the thread is a daemon so it will die with
            the process).
        """
        logger.info("Stopping vision thread …")
        self._stop_event.set()

        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=timeout)
            if self._thread.is_alive():
                logger.warning(
                    "Vision thread did not join within %.1fs — it will "
                    "terminate when the process exits (daemon thread)",
                    timeout,
                )
            else:
                logger.info("Vision thread joined cleanly")

        self._thread = None

    @property
    def is_running(self) -> bool:
        """``True`` if the background thread is alive."""
        return self._thread is not None and self._thread.is_alive()

    # ── Main Loop (runs on background thread) ───────────────────────────

    def _run(self) -> None:
        """Main frame-processing loop.

        This method executes entirely on the background thread.  It:

        1. Opens the camera (with retry / back-off).
        2. Instantiates ``VisionTracker``.
        3. Enters the frame loop:
           a. Read frame → detect faces → write ``face_count``.
           b. Every 1 s → extract dominant colour → write ``dominant_color``.
           c. If debug → render annotated overlay.
           d. Sleep to maintain FPS cap.
        4. On exit → release camera, close MediaPipe, destroy windows.
        """
        try:
            self._open_camera()
            self._tracker = VisionTracker()

            # Mark engine as active once camera + tracker are ready.
            self._shared_state.update(system_status="active")
            logger.info("Vision pipeline active — entering frame loop")

            last_color_time: float = 0.0
            self._fps_timer = time.monotonic()
            self._frame_count = 0

            while not self._stop_event.is_set():
                loop_start = time.monotonic()

                # ── 1. Capture frame ────────────────────────────────
                ret, frame = self._cap.read()  # type: ignore[union-attr]
                if not ret or frame is None:
                    logger.warning("Camera read failed — emitting fault state")
                    self._shared_state.update(
                        face_count=-1,
                        system_status="camera_unavailable",
                    )
                    # Brief pause before retrying to avoid busy-spin on
                    # a dead camera.
                    self._stop_event.wait(0.5)
                    continue

                # ── 2. Face detection (every frame) ─────────────────
                result = self._tracker.detect(frame)
                self._shared_state.update(
                    face_count=result.face_count,
                    system_status="active",
                )

                # ── 3. Colour extraction (rate-limited to 1 Hz) ────
                now = time.monotonic()
                if now - last_color_time >= COLOR_SAMPLE_INTERVAL:
                    hex_color = extract_dominant_color(frame)
                    self._shared_state.update(dominant_color=hex_color)
                    last_color_time = now

                # ── 4. FPS bookkeeping ──────────────────────────────
                self._frame_count += 1
                elapsed_since_log = now - self._fps_timer
                if elapsed_since_log >= 10.0:
                    self._fps = self._frame_count / elapsed_since_log
                    logger.info("Vision loop: %.1f FPS (avg over 10 s)", self._fps)
                    self._frame_count = 0
                    self._fps_timer = now

                # ── 5. Debug overlay (SENTRY_DEBUG=1) ───────────────
                if self._debug:
                    should_quit = self._render_debug(frame, result, hex_color if now - last_color_time < 0.1 else None)
                    if should_quit:
                        logger.info("Debug window: 'q' pressed — shutting down")
                        break

                # ── 6. FPS governor ─────────────────────────────────
                elapsed = time.monotonic() - loop_start
                sleep_time = FRAME_INTERVAL - elapsed
                if sleep_time > 0:
                    # Use Event.wait instead of time.sleep so that
                    # stop() can interrupt immediately.
                    self._stop_event.wait(sleep_time)

        except Exception:
            logger.exception("Fatal error in vision thread")
            self._shared_state.update(
                face_count=-1,
                system_status="camera_unavailable",
            )
        finally:
            self._cleanup()

    # ── Camera Management ───────────────────────────────────────────────

    def _open_camera(self) -> None:
        """Open ``cv2.VideoCapture`` with exponential back-off on failure.

        Raises
        ------
        RuntimeError
            If the camera cannot be opened after exhausting all retry
            delays **and** the stop event is not set.
        """
        for attempt, delay in enumerate(CAMERA_RETRY_DELAYS, start=1):
            if self._stop_event.is_set():
                raise RuntimeError("Stop requested during camera acquisition")

            logger.info(
                "Opening camera device %d (attempt %d/%d) …",
                self._device_index,
                attempt,
                len(CAMERA_RETRY_DELAYS),
            )
            self._cap = cv2.VideoCapture(self._device_index)

            if self._cap.isOpened():
                # Read one test frame to confirm the device is functional.
                ret, _ = self._cap.read()
                if ret:
                    logger.info(
                        "Camera %d opened successfully (%.0f×%.0f)",
                        self._device_index,
                        self._cap.get(cv2.CAP_PROP_FRAME_WIDTH),
                        self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT),
                    )
                    return
                else:
                    logger.warning("Camera opened but first read() failed")
                    self._cap.release()

            logger.warning(
                "Camera not available — retrying in %.1f s …", delay,
            )
            self._shared_state.update(
                face_count=-1,
                system_status="camera_unavailable",
            )
            self._stop_event.wait(delay)

        # All retries exhausted.
        raise RuntimeError(
            f"Could not open camera device {self._device_index} "
            f"after {len(CAMERA_RETRY_DELAYS)} attempts"
        )

    # ── Debug Overlay Rendering ─────────────────────────────────────────

    def _render_debug(
        self,
        frame: np.ndarray,
        result,
        latest_color: Optional[str],
    ) -> bool:
        """Draw face bounding boxes, ROI rectangle, and FPS on the frame.

        Parameters
        ----------
        frame : numpy.ndarray
            The raw BGR frame (will be mutated for overlay drawing).
        result : DetectionResult
            Face detection results from ``VisionTracker.detect()``.
        latest_color : str or None
            If a colour extraction just ran this iteration, the HEX
            string; otherwise ``None`` (we skip the swatch update).

        Returns
        -------
        bool
            ``True`` if the user pressed 'q' to quit the debug window.
        """
        height, width = frame.shape[:2]

        # ── Face bounding boxes (green) ─────────────────────────────
        for bbox in result.bboxes:
            cv2.rectangle(
                frame,
                (bbox.x, bbox.y),
                (bbox.x + bbox.w, bbox.y + bbox.h),
                _GREEN,
                2,
            )
            # Confidence label above the box.
            label = f"{bbox.confidence:.0%}"
            cv2.putText(
                frame, label,
                (bbox.x, max(bbox.y - 8, 16)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, _GREEN, 1,
            )

        # ── ROI rectangle (cyan) ────────────────────────────────────
        roi_bounds = get_roi_bounds(width, height)
        if roi_bounds:
            x1, y1, x2, y2 = roi_bounds
            cv2.rectangle(frame, (x1, y1), (x2, y2), _CYAN, 1)
            cv2.putText(
                frame, "ROI",
                (x1, y1 - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, _CYAN, 1,
            )

        # ── FPS counter (top-left) ──────────────────────────────────
        fps_text = f"FPS: {self._fps:.1f}"
        cv2.putText(
            frame, fps_text,
            (10, 28),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, _WHITE, 2,
        )

        # ── Face count (top-right) ──────────────────────────────────
        count_text = f"Faces: {result.face_count}"
        text_size = cv2.getTextSize(
            count_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2,
        )[0]
        cv2.putText(
            frame, count_text,
            (width - text_size[0] - 10, 28),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, _WHITE, 2,
        )

        # ── Colour swatch (bottom-left 40×40 filled square) ────────
        snapshot = self._shared_state.get_snapshot()
        hex_str = snapshot.get("dominant_color", DEFAULT_COLOR)
        bgr_swatch = _hex_to_bgr(hex_str)
        cv2.rectangle(frame, (10, height - 50), (50, height - 10), bgr_swatch, -1)
        cv2.rectangle(frame, (10, height - 50), (50, height - 10), _WHITE, 1)
        cv2.putText(
            frame, hex_str,
            (58, height - 18),
            cv2.FONT_HERSHEY_SIMPLEX, 0.45, _WHITE, 1,
        )

        # ── Show window ─────────────────────────────────────────────
        cv2.imshow(DEBUG_WINDOW_NAME, frame)
        key = cv2.waitKey(1) & 0xFF
        return key == ord("q")

    # ── Cleanup (always runs on the vision thread) ──────────────────────

    def _cleanup(self) -> None:
        """Release all resources.  Called from ``finally`` in ``_run()``.

        Camera release happens on the **same thread** that opened it —
        critical on Windows to avoid ``cv2.VideoCapture`` deadlocks.
        """
        if self._cap is not None:
            self._cap.release()
            self._cap = None
            logger.info("Camera device released")

        if self._tracker is not None:
            self._tracker.close()
            self._tracker = None

        if self._debug:
            cv2.destroyAllWindows()
            logger.info("Debug windows destroyed")

        logger.info("Vision thread cleanup complete")


# ── Private Helpers ─────────────────────────────────────────────────────────

def _hex_to_bgr(hex_str: str) -> tuple[int, int, int]:
    """Convert a ``#RRGGBB`` string to a ``(B, G, R)`` tuple for OpenCV.

    Parameters
    ----------
    hex_str : str
        A 7-character HEX colour string (e.g. ``"#4A90E2"``).

    Returns
    -------
    tuple[int, int, int]
        BGR values in [0, 255].
    """
    hex_str = hex_str.lstrip("#")
    r = int(hex_str[0:2], 16)
    g = int(hex_str[2:4], 16)
    b = int(hex_str[4:6], 16)
    return (b, g, r)
