"""Admin emotion config API tests."""

from __future__ import annotations

from copy import deepcopy

import pytest
from unittest.mock import AsyncMock

from subvision.api.routers.admin import patch_emotion_config, EmotionConfigPatch
from subvision.core.config import settings


class _App:
    def __init__(self, redis):
        self.state = type("S", (), {"redis": redis})()


class _Request:
    def __init__(self, redis):
        self.app = _App(redis)


@pytest.mark.asyncio
async def test_patch_emotion_config_deep_merge(monkeypatch):
    monkeypatch.setattr(settings, "admin_enabled", True)
    monkeypatch.setattr(settings, "admin_api_key", "test")
    monkeypatch.setattr(settings, "emotion_export_enabled", True)

    stored = {"export": {"batch_size": 16}}

    async def _load(_redis):
        return deepcopy(stored)

    async def _save(_redis, patch):
        stored.clear()
        stored.update(patch)

    monkeypatch.setattr("subvision.core.admin_config.load_admin_patch", _load)
    monkeypatch.setattr("subvision.core.admin_config.save_admin_patch", _save)
    monkeypatch.setattr("subvision.api.routers.admin.load_admin_patch", _load)
    monkeypatch.setattr("subvision.api.routers.admin.save_admin_patch", _save)

    redis = AsyncMock()
    body = EmotionConfigPatch(export={"confidence_threshold": 0.5})
    res = await patch_emotion_config(body, _Request(redis))
    assert res["status"] == "ok"
    assert res["effective"]["export"]["confidence_threshold"] == 0.5
    assert res["effective"]["export"]["batch_size"] == 16
