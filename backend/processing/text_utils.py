import difflib

SUBTITLE_SIMILARITY_THRESH = 0.6

def is_similar(text1: str | None, text2: str | None, threshold: float = 0.5) -> bool:
    if not text1 or not text2:
        return False
    return difflib.SequenceMatcher(None, text1, text2).ratio() > threshold