import difflib
import re
from datetime import timedelta


def format_timestamp(seconds: float) -> str:
    """Formats seconds into SRT timestamp format (HH:MM:SS,ms)."""
    td = timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    ms = int(td.microseconds / 1000)
    return (
        f"{total_seconds // 3600:02d}:"
        f"{(total_seconds % 3600) // 60:02d}:"
        f"{total_seconds % 60:02d},{ms:03d}"
    )


def is_similar(text1: str | None, text2: str | None, threshold: float = 0.5) -> bool:
    """Checks if two strings are similar above a given threshold."""
    if not text1 or not text2:
        return False
    return difflib.SequenceMatcher(None, text1, text2).ratio() > threshold


def is_better_quality(new_text: str, old_text: str) -> bool:
    """Determines if the new text is of higher quality (word count/length) than the old."""
    spaces_new = new_text.count(" ")
    spaces_old = old_text.count(" ")
    if spaces_new > spaces_old:
        return True
    if spaces_new == spaces_old and len(new_text) > len(old_text):
        return True
    return False


def clean_llm_text(text: str) -> str:
    """Removes common LLM formatting artifacts from the text."""
    text = text.replace("**", "")
    text = re.sub(r"\\(.*?\\)", "", text)
    text = re.sub(r"\\[.*?\]", "", text)
    return text.strip()
