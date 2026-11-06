"""Regression tests for render failure propagation and diagnostics."""

import sys

import pytest

from subvision.rendering.transcoder import FFmpegTranscoder
from subvision.rendering.video_writer import AsyncVideoWriter


def test_video_writer_close_propagates_flush_error():
    class FailingStream:
        def encode(self):
            raise RuntimeError("flush failed")

    class Container:
        closed = False

        def close(self):
            self.closed = True

    writer = object.__new__(AsyncVideoWriter)
    writer._closed = False
    writer.stream = FailingStream()
    writer.container = Container()

    with pytest.raises(RuntimeError, match="flush failed"):
        writer.close()
    assert writer.container.closed is True
    assert writer._closed is True


@pytest.mark.asyncio
async def test_transcoder_error_contains_process_stderr():
    with pytest.raises(RuntimeError) as exc_info:
        await FFmpegTranscoder.run_cmd([
            sys.executable,
            "-c",
            "import sys; sys.stderr.write('diagnostic boom'); sys.exit(7)",
        ])

    message = str(exc_info.value)
    assert "code 7" in message
    assert "diagnostic boom" in message
