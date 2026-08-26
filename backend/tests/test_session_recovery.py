import json
import pytest
from unittest.mock import AsyncMock, MagicMock

from subvision.api.routers.session import get_session_status, ack_session_state, AckRequest


class _App:
    def __init__(self, redis):
        self.state = MagicMock()
        self.state.redis = redis


class _Request:
    def __init__(self, redis):
        self.app = _App(redis)


@pytest.mark.asyncio
async def test_status_prefers_active_job_over_stale_finish():
    redis = AsyncMock()
    redis.get = AsyncMock(
        side_effect=lambda key: {
            "active_job:c1": b"blur_c1_aaaaaaaa",
            "job_status:blur_c1_aaaaaaaa": json.dumps(
                {"type": "progress", "current": 3, "total": 10, "job_id": "blur_c1_aaaaaaaa"}
            ).encode(),
            "job_meta:blur_c1_aaaaaaaa": json.dumps(
                {"filename": "ep1.mp4", "kind": "blur", "job_id": "blur_c1_aaaaaaaa"}
            ).encode(),
        }.get(key)
    )
    res = await get_session_status("c1", _Request(redis))
    assert res["has_active_job"] is True
    assert res["job_id"] == "blur_c1_aaaaaaaa"
    assert res["filename"] == "ep1.mp4"
    assert res["last_state"]["type"] == "progress"


@pytest.mark.asyncio
async def test_status_idle_returns_last_finish():
    redis = AsyncMock()
    redis.get = AsyncMock(
        side_effect=lambda key: {
            "active_job:c1": None,
            "client_last_state:c1": json.dumps(
                {"type": "finish", "success": True, "job_id": "ocr_c1_bbbbbbbb", "subtitles": []}
            ).encode(),
            "job_meta:ocr_c1_bbbbbbbb": json.dumps(
                {"filename": "ep1.mp4", "kind": "ocr"}
            ).encode(),
        }.get(key)
    )
    res = await get_session_status("c1", _Request(redis))
    assert res["has_active_job"] is False
    assert res["last_state"]["type"] == "finish"
    assert res["kind"] == "ocr"


@pytest.mark.asyncio
async def test_ack_endpoint():
    redis = AsyncMock()
    redis.eval = AsyncMock(return_value=1)
    res = await ack_session_state(AckRequest(client_id="c1", job_id="ocr_c1_bbbbbbbb"), _Request(redis))
    assert res["status"] == "acked"
