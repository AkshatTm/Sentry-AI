"""
SentryOS — Vision Tracker (MediaPipe Face Detection — Task API)
================================================================

Encapsulates Google MediaPipe's **Face Detection** Task API for real-time
face counting on standard laptop webcams.

Architecture Role
-----------------
This class is instantiated **once** by the Vision Thread orchestrator
(``vision_thread.py``).  On every captured frame, the orchestrator calls
``detect(frame)`` and receives back an integer face count plus a list of
bounding-box tuples for debug rendering.

Design Decisions
----------------
* **MediaPipe Face Detection Task API** (``mp.tasks.vision.FaceDetector``)
  is used with the **BlazeFace short-range** model
  (``blaze_face_short_range.tflite``).  This is the recommended API for
  MediaPipe ≥ 0.10.x — the legacy ``mp.solutions`` namespace has been
  removed in recent releases.
* The short-range model targets faces within ≤ 2 m — ideal for the
  laptop-distance shoulder-surfing threat model.
* ``min_detection_confidence=0.5`` balances recall (catching a lurker at
  the edge of the frame) against false positives (posters, TV faces).
* ``RunningMode.IMAGE`` is used for synchronous per-frame inference,
  keeping the caller in full control of frame pacing.

Thread Safety
-------------
A single ``VisionTracker`` instance is owned exclusively by the Vision
Thread — no concurrent access.  Therefore this class carries **no
internal locking**.  All cross-thread communication happens through
``ThreadSafeState`` in ``models.py``.

Performance Budget
------------------
MediaPipe BlazeFace (short-range, float16) delivers ~25-40 FPS on a
modern i5/i7 laptop CPU.  Combined with the 30 FPS cap in the vision
loop, the module comfortably meets the PRD requirement of 15-24 FPS
sustained.

Model File
----------
The ``blaze_face_short_range.tflite`` model must be present in the
``backend/`` directory.  It is downloaded from Google's MediaPipe model
repository during project setup.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import List

import mediapipe as mp
import numpy as np

# ── Module Logger ───────────────────────────────────────────────────────────

logger = logging.getLogger("sentryos.vision_tracker")

# ── Detection Result ────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class FaceBBox:
    """Axis-aligned bounding box of a detected face in **pixel** coords.

    Used exclusively for debug overlay rendering (``cv2.rectangle``).
    The box is derived from MediaPipe's normalised coordinates scaled to
    the frame dimensions.

    Attributes
    ----------
    x : int
        Left edge of the bounding box (pixels).
    y : int
        Top edge of the bounding box (pixels).
    w : int
        Width of the bounding box (pixels).
    h : int
        Height of the bounding box (pixels).
    confidence : float
        Detection confidence in [0.0, 1.0].
    """

    x: int
    y: int
    w: int
    h: int
    confidence: float


@dataclass(frozen=True, slots=True)
class DetectionResult:
    """Immutable result of a single ``detect()`` call.

    Attributes
    ----------
    face_count : int
        Number of faces found in the frame.  ``0`` if none detected.
    bboxes : list[FaceBBox]
        Bounding boxes for each detected face (empty list if none).
    """

    face_count: int
    bboxes: List[FaceBBox]


# ── Constants ───────────────────────────────────────────────────────────────

# Path to the MediaPipe BlazeFace TFLite model, resolved relative to this
# file's directory so it works regardless of the working directory.
_MODEL_PATH: str = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "blaze_face_short_range.tflite",
)

# Minimum confidence threshold to accept a face detection.
# 0.5 is MediaPipe's recommended default; increase to 0.65+ if false
# positives (posters, TV screens) are problematic in your environment.
_MIN_CONFIDENCE: float = 0.5


# ── VisionTracker Class ────────────────────────────────────────────────────

class VisionTracker:
    """Real-time face counter backed by MediaPipe Face Detection Task API.

    Lifecycle
    ---------
    1. ``__init__()`` — creates the ``FaceDetector`` from the TFLite model.
    2. ``detect(frame)`` — called per-frame by the vision loop.
    3. ``close()`` — releases MediaPipe resources on shutdown.

    Example
    -------
    >>> tracker = VisionTracker()
    >>> result = tracker.detect(frame_bgr)
    >>> print(result.face_count)
    1
    >>> tracker.close()
    """

    def __init__(
        self,
        model_path: str = _MODEL_PATH,
        min_confidence: float = _MIN_CONFIDENCE,
    ) -> None:
        """Initialise the MediaPipe Face Detection Task pipeline.

        Parameters
        ----------
        model_path : str
            Absolute path to the ``blaze_face_short_range.tflite`` model.
        min_confidence : float
            Minimum detection confidence in ``[0.0, 1.0]``.

        Raises
        ------
        FileNotFoundError
            If the model file does not exist at ``model_path``.
        """
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"MediaPipe model not found at '{model_path}'. "
                "Download it from: https://storage.googleapis.com/mediapipe-models/"
                "face_detector/blaze_face_short_range/float16/latest/"
                "blaze_face_short_range.tflite"
            )

        # Build the Task API options chain:
        #   BaseOptions(model) → FaceDetectorOptions → FaceDetector.create
        base_options = mp.tasks.BaseOptions(model_asset_path=model_path)
        options = mp.tasks.vision.FaceDetectorOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            min_detection_confidence=min_confidence,
        )
        self._detector = mp.tasks.vision.FaceDetector.create_from_options(options)
        self._is_open: bool = True

        logger.info(
            "VisionTracker initialised (model=%s, confidence=%.2f)",
            os.path.basename(model_path),
            min_confidence,
        )

    # -- Public API -----------------------------------------------------------

    def detect(self, frame: np.ndarray) -> DetectionResult:
        """Run face detection on a single BGR frame.

        Parameters
        ----------
        frame : numpy.ndarray
            Raw BGR frame from ``cv2.VideoCapture.read()``.
            Shape: ``(H, W, 3)``, dtype: ``uint8``.

        Returns
        -------
        DetectionResult
            Contains ``face_count`` and a list of ``FaceBBox`` objects.
            Returns ``DetectionResult(0, [])`` if no faces are found or
            if the detector has been closed.

        Notes
        -----
        MediaPipe Task API expects an ``mp.Image`` in **RGB** format.
        This method handles the BGR → RGB conversion internally so the
        caller does not need to pre-process the frame.
        """
        if not self._is_open:
            logger.warning("detect() called on a closed VisionTracker")
            return DetectionResult(face_count=0, bboxes=[])

        # Convert BGR (OpenCV native) → RGB (MediaPipe requirement).
        frame_rgb = frame[:, :, ::-1].copy()  # .copy() required for mp.Image
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

        # Run synchronous face detection.
        result = self._detector.detect(mp_image)

        if not result.detections:
            return DetectionResult(face_count=0, bboxes=[])

        # Convert MediaPipe detection objects → pixel-space FaceBBox list.
        height, width = frame.shape[:2]
        bboxes = _extract_bboxes(result.detections, width, height)
        face_count = len(bboxes)

        logger.debug("Detected %d face(s)", face_count)
        return DetectionResult(face_count=face_count, bboxes=bboxes)

    def close(self) -> None:
        """Release MediaPipe resources.

        Safe to call multiple times (idempotent).
        """
        if self._is_open:
            self._detector.close()
            self._is_open = False
            logger.info("VisionTracker closed — MediaPipe resources released")


# ── Private Helpers ─────────────────────────────────────────────────────────

def _extract_bboxes(
    detections: list,
    frame_width: int,
    frame_height: int,
) -> List[FaceBBox]:
    """Convert MediaPipe Task API detections to pixel-space ``FaceBBox`` list.

    The Task API returns ``Detection`` objects with a ``bounding_box``
    attribute that contains **pixel** coordinates directly (origin_x,
    origin_y, width, height) — unlike the legacy API which used
    normalised [0,1] coordinates.

    Parameters
    ----------
    detections : list
        ``result.detections`` from ``FaceDetector.detect()``.
    frame_width : int
        Width of the source frame in pixels (for clamping).
    frame_height : int
        Height of the source frame in pixels (for clamping).

    Returns
    -------
    list[FaceBBox]
        One ``FaceBBox`` per detected face.
    """
    bboxes: List[FaceBBox] = []

    for detection in detections:
        bbox = detection.bounding_box
        # Task API bounding_box fields are already in pixels.
        x = max(0, bbox.origin_x)
        y = max(0, bbox.origin_y)
        w = min(bbox.width, frame_width - x)
        h = min(bbox.height, frame_height - y)

        # Confidence score — first (and typically only) category score.
        confidence = round(detection.categories[0].score, 3) if detection.categories else 0.0

        bboxes.append(FaceBBox(x=x, y=y, w=w, h=h, confidence=confidence))

    return bboxes
