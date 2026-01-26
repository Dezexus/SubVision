import gradio as gr
import os
import cv2
from PIL import Image
from core.worker import OCRWorker
from core.image_ops import extract_frame_cv2, calculate_roi_from_mask, apply_gamma_correction

workers_registry = {}

def get_video_info(video_path):
    """
    Извлекает информацию о видео.

    Args:
        video_path (str): Путь к видеофайлу.

    Returns:
        tuple: Кортеж, содержащий первый кадр видео в формате RGB, 
               общее количество кадров и обновленный слайдер Gradio.
    """
    os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "1"
    if video_path is None:
        return None, 1, gr.update(value=0, maximum=1)
    cap = cv2.VideoCapture(video_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        return None, 1, gr.update(maximum=1)
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    return frame_rgb, total, gr.update(maximum=total - 1, value=0)

def ui_extract_frame(video_path, frame_index):
    """
    Извлекает определенный кадр из видео.

    Args:
        video_path (str): Путь к видеофайлу.
        frame_index (int): Индекс кадра для извлечения.

    Returns:
        numpy.ndarray: Извлеченный кадр в формате RGB или None, если кадр не найден.
    """
    frame = extract_frame_cv2(video_path, frame_index)
    if frame is None:
        return None
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

def ui_generate_preview(video_path, frame_index, editor_data, gamma_val):
    """
    Генерирует предварительный просмотр кадра с примененной гамма-коррекцией и ROI.

    Args:
        video_path (str): Путь к видеофайлу.
        frame_index (int): Индекс кадра для предварительного просмотра.
        editor_data (dict): Данные из редактора изображений Gradio, содержащие маску ROI.
        gamma_val (float): Значение гамма-коррекции.

    Returns:
        PIL.Image.Image: Изображение для предварительного просмотра или None.
    """
    if video_path is None:
        return None
    frame_bgr = extract_frame_cv2(video_path, frame_index)
    if frame_bgr is None:
        return None
    roi = calculate_roi_from_mask(editor_data)
    if roi[2] > 0:
        h_img, w_img = frame_bgr.shape[:2]
        x = min(max(0, roi[0]), w_img)
        y = min(max(0, roi[1]), h_img)
        w = min(roi[2], w_img - x)
        h = min(roi[3], h_img - y)
        frame_roi = frame_bgr[y:y + h, x:x + w]
    else:
        frame_roi = frame_bgr
    processed = apply_gamma_correction(frame_roi, gamma=gamma_val)
    if processed.shape[0] < 80:
        processed = cv2.resize(processed, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    return Image.fromarray(cv2.cvtColor(processed, cv2.COLOR_BGR2RGB))

def run_processing(video_file, editor_data, langs, step, use_llm, gamma_val, request: gr.Request):
    """
    Запускает процесс распознавания текста на видео.

    Args:
        video_file (str): Путь к видеофайлу.
        editor_data (dict): Данные из редактора изображений Gradio.
        langs (str): Строка с языками для распознавания.
        step (int): Шаг для обработки кадров.
        use_llm (bool): Флаг использования LLM для редактуры.
        gamma_val (float): Значение гамма-коррекции.
        request (gr.Request): Запрос Gradio для получения ID сессии.

    Yields:
        tuple: Кортеж с логами, путем к файлу субтитров и данными для таблицы.
    """
    if video_file is None:
        yield "❌ Нет видео", None, None
        return
    session_id = request.session_hash
    roi_state = calculate_roi_from_mask(editor_data)
    output_srt = video_file.replace(os.path.splitext(video_file)[1], ".srt")
    if os.path.exists(output_srt):
        os.remove(output_srt)
    params = {
        'video_path': video_file, 'output_path': output_srt,
        'langs': langs, 'step': int(step),
        'conf': 0.5,
        'roi': roi_state,
        'use_llm': use_llm,
        'gamma': gamma_val
    }
    logs = []
    table_data = []
    is_finished = [False]

    def log_callback(msg):
        logs.append(msg)

    def subtitle_callback(item):
        confidence = item.get('conf', 0.0)
        if confidence >= 0.90:
            color, dot = "green", "🟢"
        elif confidence >= 0.75:
            color, dot = "#FFD700", "🟡"
        else:
            color, dot = "red", "🔴"
        conf_html = f"<span style='color:{color}; font-weight:bold;'>{dot} {int(confidence * 100)}%</span>"
        row = [str(item['id']), item['text'], conf_html, ""]
        table_data.append(row)

    def ai_update_callback(item):
        target_id = str(item['id'])
        fixed_text = item['text']
        for row in table_data:
            if row[0] == target_id:
                original_text = row[1]
                if original_text.strip() != fixed_text.strip():
                    row[3] = f"✨️ **{fixed_text}**"
                else:
                    row[3] = ""
                break

    def on_finish(success):
        is_finished[0] = True
        if session_id in workers_registry:
            del workers_registry[session_id]

    callbacks = {
        'log': log_callback, 'finish': on_finish,
        'subtitle': subtitle_callback, 'ai_update': ai_update_callback
    }
    worker = OCRWorker(params, callbacks)
    workers_registry[session_id] = worker
    worker.start()
    while not is_finished[0]:
        import time
        time.sleep(0.5)
        yield "\n".join(logs), None, table_data
    if os.path.exists(output_srt):
        logs.append(f"✅ Готово: {os.path.basename(output_srt)}")
        yield "\n".join(logs), output_srt, table_data
    else:
        yield "\n".join(logs), None, table_data

def stop_processing(request: gr.Request):
    """
    Останавливает текущий процесс распознавания.

    Args:
        request (gr.Request): Запрос Gradio для получения ID сессии.

    Returns:
        str: Сообщение о статусе остановки.
    """
    session_id = request.session_hash
    if session_id in workers_registry:
        workers_registry[session_id].stop()
        return "🛑 Остановка..."
    return "Нет активных процессов."

with gr.Blocks(title="SubVision") as app:
    total_frames_state = gr.State(value=100)
    gr.Markdown("## ⚡ SubVision (AI Video OCR)")
    with gr.Row():
        with gr.Column(scale=6):
            video_input = gr.File(label="1. Видео файл", file_types=[".mp4", ".avi", ".mkv", ".mov"])
            frame_slider = gr.Slider(0, 100, value=0, step=1, label="2. Выбор кадра")
            roi_editor = gr.ImageEditor(label="3. Зона субтитров", type="numpy", interactive=True,
                                        brush=gr.Brush(colors=["#ff0000"], default_size=20), height=300)
        with gr.Column(scale=4):
            preview_img = gr.Image(label="Глазами нейросети (Pre-processed)", height=200)
            with gr.Group():
                use_llm = gr.Checkbox(label="ИИ Редактура (Gemma)", value=False)
                langs = gr.Textbox(value="en", label="Языки")
            with gr.Accordion("Настройки", open=True):
                step = gr.Slider(1, 10, value=2, step=1, label="Шаг")
                gamma_slider = gr.Slider(0.1, 5.0, value=2.5, step=0.1, label="Gamma (Контраст)")
            with gr.Row():
                btn_run = gr.Button("🚀 СТАРТ", variant="primary")
                btn_stop = gr.Button("⏹ СТОП")
            log_out = gr.TextArea(label="Лог", lines=5, autoscroll=True)
            file_out = gr.File(label="Скачать SRT")

    gr.Markdown("### 📝 Распознанные субтитры")
    subs_table = gr.Dataframe(
        headers=["№", "Оригинал", "Точность", "ИИ Редактура"],
        datatype=["str", "str", "markdown", "markdown"],
        row_count=(5, "dynamic"),
        column_count=(4, "fixed"),
        interactive=False
    )

    video_input.change(get_video_info, inputs=video_input, outputs=[roi_editor, total_frames_state, frame_slider])
    frame_slider.change(ui_extract_frame, inputs=[video_input, frame_slider], outputs=roi_editor)
    gr.on(
        triggers=[roi_editor.change, frame_slider.change, gamma_slider.change],
        fn=ui_generate_preview,
        inputs=[video_input, frame_slider, roi_editor, gamma_slider],
        outputs=preview_img,
        show_progress="hidden"
    )

    btn_run.click(
        run_processing,
        inputs=[video_input, roi_editor, langs, step, use_llm, gamma_slider],
        outputs=[log_out, file_out, subs_table]
    )
    btn_stop.click(stop_processing, outputs=log_out)

if __name__ == "__main__":
    app.queue().launch(server_name="0.0.0.0", server_port=7860)
