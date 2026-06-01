import re

def parse_srt(content: str) -> list[dict]:
    """Parse SRT content into a list of subtitle dictionaries with automatic time offset correction."""
    content = content.replace('\r\n', '\n').replace('\r', '\n')

    pattern = re.compile(r'(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n((?:(?!\n\n).)*)', re.DOTALL)
    tag_pattern = re.compile(r'<[^>]+>')

    matches = pattern.findall(content + '\n\n')
    subtitles = []

    def time_to_seconds(t_str: str) -> float:
        """Convert HH:MM:SS,ms time string format to total seconds."""
        h, m, s_ms = t_str.split(':')
        s, ms = s_ms.split(',')
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

    offset = 0.0

    for i, match in enumerate(matches):
        idx, start_str, end_str, text_block = match
        clean_text = text_block.strip()
        clean_text = tag_pattern.sub('', clean_text)
        
        start_sec = time_to_seconds(start_str)
        end_sec = time_to_seconds(end_str)

        if i == 0 and start_sec >= 3600:
            hours_offset = int(start_sec // 3600)
            offset = hours_offset * 3600.0

        subtitles.append({
            "id": int(idx),
            "start": max(0.0, start_sec - offset),
            "end": max(0.0, end_sec - offset),
            "text": clean_text,
            "conf": 1.0,
            "isEdited": False
        })

    return subtitles