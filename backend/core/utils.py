"""
Utility functions for text comparison and filename validation.
"""
import re
import difflib


def is_similar(text1: str | None, text2: str | None, threshold: float = 0.5) -> bool:
    if not text1 or not text2:
        return False
    return difflib.SequenceMatcher(None, text1, text2).ratio() > threshold


def validate_filename(filename: str) -> str:
    """
    Return the sanitized basename after checking for illegal patterns.
    """
    import os
    safe = os.path.basename(filename)
    if not safe or safe.startswith('.') or '..' in safe:
        raise ValueError("Invalid filename")
    if not re.match(r'^[a-zA-Z0-9._\- ]+$', safe):
        raise ValueError("Filename contains forbidden characters")
    if len(safe) > 255:
        raise ValueError("Filename too long")
    return safe