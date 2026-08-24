import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from subvision.core.jobs import cancel_job


@pytest.mark.asyncio
async def test_cancel_job_sets_flag_and_aborts():
    redis_conn = AsyncMock()
    pool = MagicMock()

    with patch("subvision.core.jobs.Job") as job_cls:
        job = AsyncMock()
        job.abort = AsyncMock()
        job_cls.return_value = job

        await cancel_job(pool, redis_conn, "ocr_client1_ab12cd34", "client1")

    redis_conn.setex.assert_awaited_once_with("job:ocr_client1_ab12cd34:cancel", 3600, "1")
    redis_conn.delete.assert_awaited_once_with("active_job:client1")
    job.abort.assert_awaited_once()
