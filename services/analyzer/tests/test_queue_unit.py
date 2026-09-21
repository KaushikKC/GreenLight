from analyzer.queue import backoff_s


def test_backoff_doubles_from_five_seconds():
    assert [backoff_s(n) for n in (1, 2, 3, 4)] == [5, 10, 20, 40]


def test_backoff_is_capped_at_five_minutes():
    assert backoff_s(20) == 300


def test_backoff_handles_zero_attempts():
    assert backoff_s(0) == 5
