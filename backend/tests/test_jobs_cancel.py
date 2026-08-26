import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from subvision.core.jobs import (
    ack_client_last_state,
    cancel_job,
    clear_active_job_if_match,
    parse_client_id_from_job_id,
    set_active_job,
)


def test_parse_client_id_from_job_id():
    assert parse_client_id_from_job_id("ocr_abc-def_ab12cd34") == "abc-def"
    assert parse_client_id_from_job_id("blur_uuid-here_deadbeef") == "uuid-here"


@pytest.mark.asyncio
async def test_cancel_job_sets_flag_and_cas_clears_active():
    redis_conn = AsyncMock()
    redis_conn.eval = AsyncMock(return_value=1)
    pool = MagicMock()

    with patch("subvision.core.jobs.Job") as job_cls:
        job = AsyncMock()
        job.abort = AsyncMock()
        job_cls.return_value = job

        await cancel_job(pool, redis_conn, "ocr_client1_ab12cd34", "client1")

    redis_conn.setex.assert_awaited_once_with("job:ocr_client1_ab12cd34:cancel", 3600, "1")
    redis_conn.eval.assert_awaited()
    job.abort.assert_awaited_once()


@pytest.mark.asyncio
async def test_clear_active_job_if_match_uses_cas():
    redis_conn = AsyncMock()
    redis_conn.eval = AsyncMock(return_value=1)
    ok = await clear_active_job_if_match(redis_conn, "client1", "ocr_client1_ab12cd34")
    assert ok is True
    args = redis_conn.eval.await_args.args
    assert args[2] == "active_job:client1"
    assert args[3] == "ocr_client1_ab12cd34"


@pytest.mark.asyncio
async def test_ack_client_last_state():
    redis_conn = AsyncMock()
    redis_conn.eval = AsyncMock(return_value=1)
    ok = await ack_client_last_state(redis_conn, "client1", "ocr_client1_ab12cd34")
    assert ok is True
    needle = redis_conn.eval.await_args.args[3]
    assert "ocr_client1_ab12cd34" in needle


@pytest.mark.asyncio
async def test_set_active_job_clears_last_state_and_stores_meta():
    redis_conn = AsyncMock()
    pipe = AsyncMock()
    redis_conn.get = AsyncMock(return_value=b"ocr_client1_oldold01")
    redis_conn.pipeline = MagicMock(return_value=pipe)
    pipe.setex = MagicMock(return_value=pipe)
    pipe.delete = MagicMock(return_value=pipe)
    pipe.execute = AsyncMock(return_value=[True, True, 1])

    prev = await set_active_job(redis_conn, "client1", "blur_client1_newnew01", "video.mp4")
    assert prev == "ocr_client1_oldold01"
    pipe.execute.assert_awaited_once()
