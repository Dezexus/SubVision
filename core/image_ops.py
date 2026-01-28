import cv2
import numpy as np
from PIL import Image


def apply_clahe(frame, clip_limit=2.0, tile_grid_size=(8, 8)):
    """
    Применяет CLAHE (умный адаптивный контраст) к изображению.

    Использует цветовое пространство LAB, чтобы менять только яркость,
    не искажая цвета.

    Args:
        frame (numpy.ndarray): Входное изображение (BGR).
        clip_limit (float): Порог контраста (обычно 1.0 - 4.0).
        tile_grid_size (tuple): Размер сетки для локального выравнивания.

    Returns:
        numpy.ndarray: Обработанное изображение.
    """
    if frame is None:
        return None

    # Конвертируем в LAB (Lightness, A, B)
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)

    # Разделяем каналы
    l, a, b = cv2.split(lab)

    # Создаем CLAHE объект
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)

    # Применяем только к каналу L (яркость)
    cl = clahe.apply(l)

    # Собираем каналы обратно
    limg = cv2.merge((cl, a, b))

    # Конвертируем обратно в BGR
    processed = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)

    return processed


def extract_frame_cv2(video_path, frame_index):
    """
    Извлекает кадр из видео по индексу.

    Args:
        video_path (str): Путь к видео.
        frame_index (int): Индекс кадра.

    Returns:
        numpy.ndarray: Кадр в формате BGR или None.
    """
    if video_path is None:
        return None

    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    cap.release()

    if not ok:
        return None

    return frame


def calculate_roi_from_mask(image_dict):
    """
    Вычисляет координаты (ROI) из маски компонента Gradio.

    Args:
        image_dict (dict): Словарь с данными от gr.ImageEditor.

    Returns:
        list: Координаты [x, y, w, h] или [0, 0, 0, 0].
    """
    if not image_dict or not "layers" in image_dict:
        return [0, 0, 0, 0]

    mask = image_dict["layers"][0]
    coords = cv2.findNonZero(mask[:, :, 3])

    if coords is None:
        return [0, 0, 0, 0]

    x, y, w, h = cv2.boundingRect(coords)
    return [int(x), int(y), int(w), int(h)]
