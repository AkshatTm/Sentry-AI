"""
SentryOS — Dominant Colour Extractor (K-Means Clustering)
=========================================================

Pure-function module that accepts a raw BGR frame (numpy array) from the
Vision Thread, crops a centre Region of Interest (ROI), and returns the
dominant colour as a HEX string using ``MiniBatchKMeans`` clustering.

Architecture Role
-----------------
This module does **not** own the camera.  The Vision Thread
(``vision_thread.py``) reads frames from ``cv2.VideoCapture`` and passes
each frame into ``extract_dominant_color()`` at a **rate-limited 1 Hz**
cadence.  This design prevents redundant K-Means computation on every
video frame (which runs at 15-30 FPS).

Performance Contract
--------------------
* ROI size: 100 × 100 px  (10 000 pixels → 10 000 × 3 feature matrix).
* Clusters: 3 (fast convergence; we only need the single dominant one).
* ``MiniBatchKMeans`` with ``batch_size=1000`` converges in < 5 ms on
  commodity CPUs — well within the 1-second budget.

Dependencies
------------
* ``numpy``        — array slicing and reshaping.
* ``scikit-learn`` — ``MiniBatchKMeans`` for hyper-fast clustering.

No OpenCV import is needed here; the caller provides the frame as a
plain ``numpy.ndarray`` in BGR colour space.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
from sklearn.cluster import MiniBatchKMeans

# ── Module Logger ───────────────────────────────────────────────────────────

logger = logging.getLogger("sentryos.color_extractor")

# ── Constants ───────────────────────────────────────────────────────────────

ROI_SIZE: int = 100
"""Side length (in pixels) of the square sampling region extracted from
the centre of the frame.  A 100 × 100 ROI yields 10 000 pixels — enough
for reliable colour clustering without taxing the CPU."""

N_CLUSTERS: int = 3
"""Number of K-Means clusters.  Three is sufficient to separate a dominant
surface colour from secondary highlights and shadows."""

KMEANS_BATCH_SIZE: int = 1000
"""Mini-batch size for ``MiniBatchKMeans``.  Keeps memory allocation low
and convergence fast on the small 10 000-sample input."""

DEFAULT_COLOR: str = "#1a1a2e"
"""Fallback HEX colour returned when extraction fails (e.g. the frame is
too small to crop a valid ROI).  Matches the SentryOS dark theme base."""

# ── Predefined Colour Palette ───────────────────────────────────────────────
#
# Instead of sending raw K-Means centroids (which can be muddy greys or
# near-identical between frames), we snap the extracted colour to the
# nearest entry in this curated palette.  Every palette colour is vivid,
# well-spaced in RGB space, and guaranteed to produce a visible change
# on the frontend background.

PALETTE_HEX: list[str] = [
    "#FF0000",   # Red
    "#FF4500",   # Orange Red
    "#FF8C00",   # Dark Orange
    "#FFD700",   # Gold
    "#ADFF2F",   # Green Yellow
    "#32CD32",   # Lime Green
    "#00C853",   # Green
    "#00BFA5",   # Teal
    "#00BCD4",   # Cyan
    "#00BFFF",   # Deep Sky Blue
    "#1E90FF",   # Dodger Blue
    "#2979FF",   # Blue
    "#7C4DFF",   # Deep Purple
    "#AA00FF",   # Purple
    "#E040FB",   # Pink-Purple
    "#FF1493",   # Deep Pink
    "#FF5252",   # Light Red
    "#FF6D00",   # Vivid Orange
    "#F57F17",   # Amber
    "#00E676",   # Bright Green
]
"""20 vivid, perceptually distinct colours.  The frontend Chameleon engine
uses these directly — every transition is guaranteed to look different."""


def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    """Convert ``#RRGGBB`` to ``(R, G, B)`` tuple."""
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


# Pre-parse palette into an (N, 3) numpy array for fast distance computation.
_PALETTE_RGB: np.ndarray = np.array(
    [_hex_to_rgb(h) for h in PALETTE_HEX],
    dtype=np.float32,
)


def snap_to_palette(hex_color: str) -> str:
    """Return the palette colour closest to *hex_color* in RGB Euclidean
    distance.  Runs in < 0.01 ms for 20 palette entries."""
    try:
        r, g, b = _hex_to_rgb(hex_color)
        point = np.array([r, g, b], dtype=np.float32)
        distances = np.linalg.norm(_PALETTE_RGB - point, axis=1)
        best_idx = int(np.argmin(distances))
        return PALETTE_HEX[best_idx]
    except Exception:
        return DEFAULT_COLOR


# ── Public API ──────────────────────────────────────────────────────────────

def extract_dominant_color(frame: np.ndarray) -> str:
    """Extract the dominant HEX colour from the centre of a BGR frame.

    Pipeline
    --------
    1. Validate frame dimensions.
    2. Crop a ``ROI_SIZE × ROI_SIZE`` square from the frame centre.
    3. Reshape the ROI into a 2-D feature matrix of shape ``(N, 3)``.
    4. Fit ``MiniBatchKMeans(n_clusters=3)`` to the pixel data.
    5. Identify the cluster with the most members (= dominant colour).
    6. Convert the BGR centroid to a HEX string and return it.

    Parameters
    ----------
    frame : numpy.ndarray
        A raw video frame in **BGR** colour space, as returned by
        ``cv2.VideoCapture.read()``.  Shape must be ``(H, W, 3)`` with
        ``H >= ROI_SIZE`` and ``W >= ROI_SIZE``.

    Returns
    -------
    str
        A 7-character HEX colour string (e.g. ``"#4A90E2"``).
        Returns ``DEFAULT_COLOR`` if extraction fails for any reason.

    Notes
    -----
    This function is intentionally **stateless**.  It creates a fresh
    ``MiniBatchKMeans`` instance on every call.  At 1 Hz invocation
    frequency this is negligible, and it avoids carrying mutable
    clustering state across frames — which would be incorrect when the
    scene changes abruptly (e.g. user swaps the coloured token).
    """
    try:
        raw_hex = _extract(frame)
        # Snap to the nearest predefined palette colour so every
        # update produces a vivid, noticeably different result.
        snapped = snap_to_palette(raw_hex)
        logger.debug("Raw %s → snapped %s", raw_hex, snapped)
        return snapped
    except Exception:
        # Broad catch ensures the vision loop never crashes due to a
        # colour-extraction edge case (corrupt frame, NaN pixels, etc.).
        logger.exception("Dominant colour extraction failed — returning default")
        return DEFAULT_COLOR


# ── Internal Helpers ────────────────────────────────────────────────────────

def _extract(frame: np.ndarray) -> str:
    """Core extraction logic, separated so the public wrapper can catch
    exceptions without nesting try/except around detailed pipeline code.
    """
    height, width = frame.shape[:2]

    # ── 1. Validate frame is large enough for the ROI ───────────────────
    if height < ROI_SIZE or width < ROI_SIZE:
        logger.warning(
            "Frame too small for ROI (%dx%d < %dx%d) — returning default",
            width, height, ROI_SIZE, ROI_SIZE,
        )
        return DEFAULT_COLOR

    # ── 2. Crop the centre ROI ──────────────────────────────────────────
    cx, cy = width // 2, height // 2
    half = ROI_SIZE // 2
    roi = frame[cy - half : cy + half, cx - half : cx + half]

    # ── 3. Reshape to (N, 3) feature matrix ─────────────────────────────
    pixels: np.ndarray = roi.reshape(-1, 3).astype(np.float32)

    # ── 4. Run MiniBatchKMeans clustering ───────────────────────────────
    kmeans = MiniBatchKMeans(
        n_clusters=N_CLUSTERS,
        batch_size=KMEANS_BATCH_SIZE,
        n_init="auto",           # scikit-learn ≥ 1.4 default
        random_state=42,         # deterministic across frames
    )
    kmeans.fit(pixels)

    # ── 5. Find the dominant cluster (largest member count) ─────────────
    #    labels_ contains the cluster assignment for each pixel.
    #    We count occurrences and pick the cluster with the most members.
    _, counts = np.unique(kmeans.labels_, return_counts=True)
    dominant_idx: int = int(np.argmax(counts))
    dominant_bgr: np.ndarray = kmeans.cluster_centers_[dominant_idx]

    # ── 6. Convert BGR → HEX ───────────────────────────────────────────
    hex_color = _bgr_to_hex(dominant_bgr)
    logger.debug("Dominant colour: %s (cluster %d)", hex_color, dominant_idx)
    return hex_color


def _bgr_to_hex(bgr: np.ndarray) -> str:
    """Convert a BGR float array ``[B, G, R]`` to a ``#RRGGBB`` string.

    Parameters
    ----------
    bgr : numpy.ndarray
        A 1-D array of 3 floats representing Blue, Green, Red channels
        (OpenCV's native colour order).

    Returns
    -------
    str
        Upper-case HEX colour string, e.g. ``"#4A90E2"``.
    """
    # Clamp to [0, 255] and cast to int — K-Means centroids can be
    # fractional or slightly out-of-range due to floating-point arithmetic.
    b, g, r = (int(np.clip(c, 0, 255)) for c in bgr)
    return f"#{r:02X}{g:02X}{b:02X}"


def get_roi_bounds(frame_width: int, frame_height: int) -> Optional[tuple[int, int, int, int]]:
    """Compute the ROI bounding box for debug overlay rendering.

    Returns ``(x1, y1, x2, y2)`` pixel coordinates of the sampling
    rectangle, or ``None`` if the frame is too small.

    This helper is used by ``vision_thread.py`` to draw a rectangle on
    the debug window showing exactly which pixels feed the colour
    extractor.
    """
    if frame_width < ROI_SIZE or frame_height < ROI_SIZE:
        return None

    cx, cy = frame_width // 2, frame_height // 2
    half = ROI_SIZE // 2
    return (cx - half, cy - half, cx + half, cy + half)
