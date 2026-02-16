import re

def parse_srt(content: str) -> list[dict]:
    """
    Parses SRT file content into a list of subtitle dictionaries.
    """
    # Normalize line endings
    content = content.replace('\r\n', '\n').replace('\r', '\n')

    # Regex to find blocks: Index \n Time --> Time \n Text
    pattern = re.compile(r'(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n((?:(?!\n\n).)*)', re.DOTALL)

    matches = pattern.findall(content + '\n\n') # Add newlines to catch last block
    subtitles = []

    def time_to_seconds(t_str):
        h, m, s_ms = t_str.split(':')
        s, ms = s_ms.split(',')
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

    for i, match in enumerate(matches):
        idx, start_str, end_str, text_block = match

        subtitles.append({
            "id": int(idx),
            "start": time_to_seconds(start_str),
            "end": time_to_seconds(end_str),
            "text": text_block.strip(),
            "conf": 1.0, # Imported subs have 100% confidence
            "isEdited": True
        })

    return subtitles
