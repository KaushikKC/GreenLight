"""Small, dependency-free metric helpers for the eval suites."""

from dataclasses import dataclass


@dataclass
class PR:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    tn: int = 0

    def add(self, predicted: bool, expected: bool) -> None:
        if predicted and expected:
            self.tp += 1
        elif predicted:
            self.fp += 1
        elif expected:
            self.fn += 1
        else:
            self.tn += 1

    @property
    def precision(self) -> float | None:
        return self.tp / (self.tp + self.fp) if self.tp + self.fp else None

    @property
    def recall(self) -> float | None:
        return self.tp / (self.tp + self.fn) if self.tp + self.fn else None


def pct(x: float | None) -> str:
    return "–" if x is None else f"{x:.0%}"


def percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    i = (len(s) - 1) * q
    lo, hi = int(i), min(int(i) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)
