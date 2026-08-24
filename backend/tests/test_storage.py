import pytest

from subvision.core.storage import StorageManager


@pytest.mark.asyncio
async def test_chunk_upload_and_complete(upload_dir):
    storage = StorageManager(upload_dir=upload_dir)
    data = b"hello world chunk data"

    ok = await storage.save_chunk("video.mp4", data, 0)
    assert ok is True

    ok = await storage.complete_local_upload("video.mp4")
    assert ok is True

    dest = upload_dir + "/copy.mp4"
    ok = await storage.copy_from("video.mp4", dest)
    assert ok is True
    assert open(dest, "rb").read() == data


@pytest.mark.asyncio
async def test_delete_missing_file_returns_true(upload_dir):
    storage = StorageManager(upload_dir=upload_dir)
    assert await storage.delete_file("nonexistent.mp4") is True


@pytest.mark.asyncio
async def test_copy_from_missing_returns_false(upload_dir):
    storage = StorageManager(upload_dir=upload_dir)
    assert await storage.copy_from("missing.mp4", upload_dir + "/out.mp4") is False
