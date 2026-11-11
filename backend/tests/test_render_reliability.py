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
    writer._proc = None
    writer.stream = FailingStream()
    writer.container = Container()

    with pytest.raises(RuntimeError, match="flush failed"):
        writer.close()
    assert writer.container.closed is True
    assert writer._closed is True


def test_resolve_encoder_uses_ffmpeg_cli_when_pyav_lacks_nvenc(monkeypatch):
    from subvision.rendering import video_writer

    monkeypatch.setattr(video_writer.av, "codecs_available", {"libx264"})
    monkeypatch.setattr(video_writer, "_ffmpeg_cli_has_nvenc", lambda: True)
    assert video_writer._resolve_encoder("auto") == ("ffmpeg", "h264_nvenc")
    assert video_writer._resolve_encoder("libx264") == ("pyav", "libx264")

    monkeypatch.setattr(video_writer, "_ffmpeg_cli_has_nvenc", lambda: False)
    assert video_writer._resolve_encoder("nvenc") == ("pyav", "libx264")


def test_ffmpeg_writer_close_reports_encoder_failure():
    class Proc:
        returncode = None

        class stdin:
            @staticmethod
            def close():
                pass

        def wait(self):
            self.returncode = 1

    import tempfile

    writer = object.__new__(AsyncVideoWriter)
    writer._closed = False
    writer._proc = Proc()
    writer._stderr = tempfile.TemporaryFile()
    writer._stderr.write(b"No NVENC capable devices found")

    with pytest.raises(RuntimeError, match="No NVENC capable devices found"):
        writer.close()


@pytest.mark.asyncio
async def test_transcoder_error_contains_process_stderr():
    with pytest.raises(RuntimeError) as exc_info:
        await FFmpegTranscoder.run_cmd(
            [
                sys.executable,
                "-c",
                "import sys; sys.stderr.write('diagnostic boom'); sys.exit(7)",
            ]
        )

    message = str(exc_info.value)
    assert "code 7" in message
    assert "diagnostic boom" in message
