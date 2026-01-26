import cv2
import numpy as np
from PIL import Image

def apply_gamma_correction(frame, gamma=2.5):
    """
    Применяет гамма-коррекцию к изображению.

    Args:
        frame (numpy.ndarray): Входное изображение (BGR).
        gamma (float): Коэффициент гаммы.

    Returns:
        numpy.ndarray: Обработанное изображение.
    """
    if frame is None:
        return None
        
    lookUpTable = np.empty((1, 256), np.uint8)
    for i in range(256):
        lookUpTable[0, i] = np.clip(pow(i / 255.0, gamma) * 255.0, 0, 255)
    
    processed = cv2.LUT(frame, lookUpTable)
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
