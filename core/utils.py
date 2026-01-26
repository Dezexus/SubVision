from datetime import timedelta
import difflib
import re

def format_timestamp(seconds):
    """
    Форматирует секунды в стандартный формат субтитров (HH:MM:SS,ms).

    Args:
        seconds (float): Общее количество секунд.

    Returns:
        str: Отформатированная временная метка.
    """
    td = timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    ms = int(td.microseconds / 1000)
    return f"{total_seconds // 3600:02d}:{(total_seconds % 3600) // 60:02d}:{total_seconds % 60:02d},{ms:03d}"

def is_similar(text1, text2, threshold=0.5):
    """
    Проверяет, похожи ли две строки выше заданного порога.

    Args:
        text1 (str): Первая строка.
        text2 (str): Вторая строка.
        threshold (float): Порог схожести (от 0.0 до 1.0).

    Returns:
        bool: True, если строки похожи, иначе False.
    """
    if not text1 or not text2:
        return False
    return difflib.SequenceMatcher(None, text1, text2).ratio() > threshold

def is_better_quality(new_text, old_text):
    """
    Определяет, является ли новый текст "лучше" старого (по словам/длине).

    Args:
        new_text (str): Новый текст для сравнения.
        old_text (str): Старый текст для сравнения.

    Returns:
        bool: True, если новый текст лучше.
    """
    spaces_new = new_text.count(' ')
    spaces_old = old_text.count(' ')
    if spaces_new > spaces_old:
        return True
    if spaces_new == spaces_old and len(new_text) > len(old_text):
        return True
    return False

def clean_llm_text(text):
    """
    Удаляет из текста распространенные артефакты форматирования от LLM.

    Args:
        text (str): Входная строка.

    Returns:
        str: Очищенная строка.
    """
    text = text.replace('**', '')
    text = re.sub(r'\\(.*?\\)', '', text)
    text = re.sub(r'\\[.*?\]', '', text)
    return text.strip()
