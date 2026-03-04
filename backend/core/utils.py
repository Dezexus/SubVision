"""
This module provides a collection of utility functions for text comparison.
"""
import difflib


def is_similar(text1: str | None, text2: str | None, threshold: float = 0.5) -> bool:
    """
    Checks if two strings are similar based on the SequenceMatcher ratio.
    """
    if not text1 or not text2:
        return False
    return difflib.SequenceMatcher(None, text1, text2).ratio() > threshold
