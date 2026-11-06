"""Tests for ML compatibility shims."""

import pytest

from subvision.core.ml_compat import apply_ml_compat, apply_torch_load_compat


def test_torch_load_defaults_weights_only_false(monkeypatch):
    torch = pytest.importorskip("torch")

    calls = []

    def fake_load(*args, **kwargs):
        calls.append(kwargs)
        return {}

    monkeypatch.setattr(torch, "load", fake_load)
    apply_torch_load_compat()
    torch.load("x.pt")
    assert calls[0]["weights_only"] is False


def test_apply_ml_compat_idempotent():
    apply_ml_compat()
    apply_ml_compat()
