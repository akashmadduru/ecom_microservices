from ecom_common.http import CircuitBreaker


def test_opens_after_threshold():
    cb = CircuitBreaker("svc", failure_threshold=3, reset_timeout=30)
    assert cb.allow()
    for _ in range(3):
        cb.record_failure()
    assert cb.state == "open"
    assert not cb.allow()


def test_success_resets():
    cb = CircuitBreaker("svc", failure_threshold=3)
    cb.record_failure()
    cb.record_failure()
    cb.record_success()
    for _ in range(2):
        cb.record_failure()
    assert cb.state == "closed"


def test_half_open_after_timeout(monkeypatch):
    cb = CircuitBreaker("svc", failure_threshold=1, reset_timeout=30)
    cb.record_failure()
    assert cb.state == "open"

    import time

    real = time.monotonic()
    monkeypatch.setattr(time, "monotonic", lambda: real + 31)
    assert cb.state == "half-open"
    assert cb.allow()
