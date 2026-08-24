import pytest

from subvision.processing.subtitle_parser import parse_srt


def test_parse_srt_basic():
    content = """1
00:00:01,000 --> 00:00:03,000
Hello world

2
00:00:04,000 --> 00:00:06,000
Second line
"""
    subs = parse_srt(content)
    assert len(subs) == 2
    assert subs[0]["text"] == "Hello world"
    assert subs[0]["start"] == pytest.approx(1.0)
    assert subs[1]["end"] == pytest.approx(6.0)
