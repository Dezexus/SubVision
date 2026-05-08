import difflib
from core.constants import SUBTITLE_SIMILARITY_THRESH

def is_similar(text1: str | None, text2: str | None, threshold: float = SUBTITLE_SIMILARITY_THRESH) -> bool:
    """Calculate text similarity ratio using SequenceMatcher."""
    if not text1 or not text2:
        return False
    return difflib.SequenceMatcher(None, text1, text2).ratio() > threshold