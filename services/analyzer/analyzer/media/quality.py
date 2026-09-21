"""Per-frame sharpness and brightness."""

import cv2
import numpy as np


def blur_score(bgr: np.ndarray) -> float:
    """Variance of the Laplacian. Low = blurry. Compare frames at the same scale."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def mean_luma(bgr: np.ndarray) -> float:
    """Mean luma (0..255)."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(gray.mean())
