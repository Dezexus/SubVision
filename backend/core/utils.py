"""
This module provides a collection of utility functions for text and time
formatting and comparison.
"""
import difflib
from datetime import timedelta


def format_timestamp(seconds: float) -> str:
    """
    Formats a duration in seconds into the standard SRT timestamp
    format (HH:MM:SS,ms).

    Args:
        seconds: The time in seconds.

    Returns:
        The formatted timestamp string.
    """
    td = timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    milliseconds = int(td.microseconds / 1000)
    return (
        f"{total_seconds // 3600:02d}:"
        f"{(total_seconds % 3600) // 60:02d}:"
        f"{total_seconds % 60:02d},{milliseconds:03d}"
    )


def is_similar(text1: str | None, text2: str | None, threshold: float = 0.5) -> bool:
    """
    Checks if two strings are similar based on the SequenceMatcher ratio,
    exceeding a given threshold.

    Args:
        text1: The first string.
        text2: The second string.
        threshold: The similarity ratio required to be considered similar.

    Returns:
        True if the strings are similar, False otherwise.
    """
    if not text1 or not text2:
        return False
    return difflib.SequenceMatcher(None, text1, text2).ratio() > threshold
