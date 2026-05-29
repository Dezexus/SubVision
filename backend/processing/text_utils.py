import difflib
import re
from core.constants import SUBTITLE_SIMILARITY_THRESH

def is_similar(text1: str | None, text2: str | None, threshold: float = SUBTITLE_SIMILARITY_THRESH) -> bool:
    """Calculate text similarity ratio using SequenceMatcher."""
    if not text1 or not text2:
        return False
    return difflib.SequenceMatcher(None, text1, text2).ratio() > threshold

def normalize_text(text: str) -> str:
    """Clean and normalize OCR text output."""
    if not text:
        return ""
    text = text.replace("’", "'").replace("‘", "'").replace("`", "'")
    text = re.sub(r'\.{2,}', '...', text)
    text = re.sub(r'\s+([.,!?])', r'\1', text)
    return text.strip()