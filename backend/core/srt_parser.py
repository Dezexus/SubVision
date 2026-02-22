"""
Module for parsing SRT files into structured subtitle dictionaries.
"""
import re

def parse_srt(content: str) -> list[dict]:
    """
    Parses SRT file content into a list of subtitle dictionaries.
    Removes HTML tags to ensure correct text width calculation for Smart Blur.
    """
    content = content.replace('\r\n', '\n').replace('\r', '\n')

    pattern = re.compile(r'(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n((?:(?!\n\n).)*)', re.DOTALL)

    tag_pattern = re.compile(r'<[^>]+>')

    matches = pattern.findall(content + '\n\n')
    subtitles = []

    def time_to_seconds(t_str: str) -> float:
        """
        Converts an SRT timestamp string into total seconds.
        """
        h, m, s_ms = t_str.split(':')
        s, ms = s_ms.split(',')
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

    for i, match in enumerate(matches):
        idx, start_str, end_str, text_block = match

        clean_text = text_block.strip()
        clean_text = tag_pattern.sub('', clean_text)

        subtitles.append({
            "id": int(idx),
            "start": time_to_seconds(start_str),
            "end": time_to_seconds(end_str),
            "text": clean_text,
            "conf": 1.0,
            "isEdited": True
        })

    return subtitles
