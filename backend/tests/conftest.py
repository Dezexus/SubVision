import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import ASGITransport, AsyncClient

from subvision.main import app


@pytest.fixture
async def client():
    app.state.redis = AsyncMock()
    app.state.redis.ping = AsyncMock(return_value=True)
    app.state.arq_pool = MagicMock()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def upload_dir(tmp_path):
    return str(tmp_path / "uploads")
