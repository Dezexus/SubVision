import gradio as gr
import os
import cv2
from PIL import Image

# Core imports
from core.worker import OCRWorker
from core.image_ops import extract_frame_cv2, calculate_roi_from_mask, apply_clahe, apply_sharpening, denoise_frame
from core.presets import get_preset_choices, get_preset_values
from core.ui_utils import generate_progress_html

workers_registry = {}

# Constants
DEFAULT_LLM_REPO = "bartowski/google_gemma-3-4b-it-GGUF"
DEFAULT_LLM_FILE = "google_gemma-3-4b-it-Q4_K_M.gguf"
DEFAULT_PROMPT = (
    "<start_of_turn>user\n"
    "You are a professional subtitle editor. Your task is to carefully read the entire subtitle text provided below and correct any grammatical, punctuation, or spelling errors in {language}.\n\n"
    "KEY RULES:\n"
    "1. Preserve fictional names and terms.\n"
    "2. Do not rephrase sentences. Only fix clear errors.\n"
    "3. Preserve original punctuation.\n"
    "4. The input is a numbered list. Your output must be a numbered list matching the original line numbers.\n"
    "5. IMPORTANT: Only include lines that you have corrected in your output.\n\n"
    "Here is the text:\n"
    "---\n"
    "{subtitles}\n"
    "---\n\n"
    "OUTPUT (Corrected lines only, as a numbered list):<end_of_turn>\n"
    "<start_of_turn>model\n"
)


def reset_ai_settings():
    """Returns default values for AI settings."""
    return DEFAULT_LLM_REPO, DEFAULT_LLM_FILE, DEFAULT_PROMPT


def apply_preset_ui(preset_name):
    vals = get_preset_values(preset_name)
    if not vals:
        return gr.update(), gr.update(), gr.update(), gr.update(), gr.update()
    return vals[0], vals[1], vals[2], vals[3], vals[4]


def get_video_info(video_path):
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
    frame = extract_frame_cv2(video_path, frame_index)
    if frame is None:
        return None
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


def ui_generate_preview(video_path, frame_index, editor_data, clahe_val):
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

    denoised = denoise_frame(frame_roi, strength=3)
    processed = apply_clahe(denoised, clip_limit=clahe_val)
    processed = cv2.resize(processed, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    final = apply_sharpening(processed)

    return Image.fromarray(cv2.cvtColor(final, cv2.COLOR_BGR2RGB))


def run_processing(video_file, editor_data, langs, step, conf_threshold, use_llm, clahe_val,
                   use_smart_skip, use_visual_cutoff,
                   llm_repo, llm_file, llm_prompt, request: gr.Request):
    if video_file is None:
        yield "❌ No video file", None, None, ""
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
        'min_conf': conf_threshold / 100.0,
        'roi': roi_state,
        'use_llm': use_llm,
        'clip_limit': clahe_val,
        'smart_skip': use_smart_skip,
        'visual_cutoff': use_visual_cutoff,
        'llm_repo': llm_repo,
        'llm_filename': llm_file,
        'llm_prompt': llm_prompt
    }
    logs = []
    table_data = []
    is_finished = [False]

    prog_state = [0, 100, "Calculating..."]

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

    def progress_callback(cur, tot, eta):
        prog_state[0] = cur
        prog_state[1] = tot
        prog_state[2] = eta

    def on_finish(success):
        is_finished[0] = True
        if session_id in workers_registry:
            del workers_registry[session_id]

    callbacks = {
        'log': log_callback, 'finish': on_finish,
        'subtitle': subtitle_callback, 'ai_update': ai_update_callback,
        'progress': progress_callback
    }
    worker = OCRWorker(params, callbacks)
    workers_registry[session_id] = worker
    worker.start()

    while not is_finished[0]:
        import time
        time.sleep(0.5)
        html_bar = generate_progress_html(prog_state[0], prog_state[1], prog_state[2])
        yield "\n".join(logs), None, table_data, html_bar

    if os.path.exists(output_srt):
        logs.append(f"✅ Done: {os.path.basename(output_srt)}")
        final_html = generate_progress_html(100, 100, "00:00")
        yield "\n".join(logs), output_srt, table_data, final_html
    else:
        yield "\n".join(logs), None, table_data, generate_progress_html(0, 100, "--:--")


def stop_processing(request: gr.Request):
    session_id = request.session_hash
    if session_id in workers_registry:
        workers_registry[session_id].stop()
        return "🛑 Stopping..."
    return "No active processes."


with gr.Blocks(title="SubVision") as app:
    total_frames_state = gr.State(value=100)
    gr.Markdown("## ⚡ SubVision (AI Video OCR)")
    with gr.Row():
        with gr.Column(scale=6):
            video_input = gr.File(label="1. Video File", file_types=[".mp4", ".avi", ".mkv", ".mov"])
            frame_slider = gr.Slider(0, 100, value=0, step=1, label="2. Frame Selection")
            roi_editor = gr.ImageEditor(label="3. Subtitle Zone", type="numpy", interactive=True,
                                        brush=gr.Brush(colors=["#ff0000"], default_size=20), height=300)

            with gr.Group():
                gr.Markdown("### 🤖 AI Post-Processing")
                use_llm = gr.Checkbox(label="Enable AI Editing (Gemma)", value=False)
                with gr.Accordion("Advanced AI Config", open=False):
                    llm_repo_input = gr.Textbox(value=DEFAULT_LLM_REPO, label="Repo ID")
                    llm_file_input = gr.Textbox(value=DEFAULT_LLM_FILE, label="Filename")
                    llm_prompt_input = gr.TextArea(value=DEFAULT_PROMPT, label="Prompt Template", lines=6)
                    btn_reset_ai = gr.Button("Default Settings", size="sm")

        with gr.Column(scale=4):
            preview_img = gr.Image(label="AI Preview", height=200)

            with gr.Accordion("OCR Settings", open=True):
                preset_selector = gr.Dropdown(
                    choices=get_preset_choices(),
                    value="⚖️ Balance",
                    label="Preset Mode",
                    interactive=True
                )

                langs = gr.Dropdown(
                    choices=[
                        ("English", "en"),
                        ("Russian", "ru"),
                        ("Japanese", "japan"),
                        ("Chinese", "ch")
                    ],
                    value="en",
                    label="OCR Language",
                    interactive=True
                )

                step = gr.Slider(1, 10, value=2, step=1, label="Step")
                conf_slider = gr.Slider(50, 100, value=80, step=1, label="Min Accuracy %")
                clahe_slider = gr.Slider(0.1, 6.0, value=2.0, step=0.1, label="CLAHE (Contrast)")

                with gr.Row():
                    chk_smart_skip = gr.Checkbox(label="⚡ Smart Skip", value=True)
                    chk_visual_cutoff = gr.Checkbox(label="✂ Visual Cutoff", value=True)

            with gr.Row():
                btn_run = gr.Button("🚀 START", variant="primary")
                btn_stop = gr.Button("⏹ STOP")

            progress_bar = gr.HTML(label="Progress", value="")
            log_out = gr.TextArea(label="Log", lines=5, autoscroll=True)
            file_out = gr.File(label="Download SRT")

    gr.Markdown("### 📝 Recognized Subtitles")
    subs_table = gr.Dataframe(
        headers=["#", "Original", "Accuracy", "AI Edit"],
        datatype=["str", "str", "markdown", "markdown"],
        row_count=(5, "dynamic"),
        column_count=(4, "fixed"),
        interactive=False
    )

    video_input.change(get_video_info, inputs=video_input, outputs=[roi_editor, total_frames_state, frame_slider])
    frame_slider.change(ui_extract_frame, inputs=[video_input, frame_slider], outputs=roi_editor)

    preset_selector.change(
        fn=apply_preset_ui,
        inputs=preset_selector,
        outputs=[step, conf_slider, clahe_slider, chk_smart_skip, chk_visual_cutoff]
    )

    # AI Reset Handler
    btn_reset_ai.click(
        fn=reset_ai_settings,
        outputs=[llm_repo_input, llm_file_input, llm_prompt_input]
    )

    gr.on(
        triggers=[roi_editor.change, frame_slider.change, clahe_slider.change],
        fn=ui_generate_preview,
        inputs=[video_input, frame_slider, roi_editor, clahe_slider],
        outputs=preview_img,
        show_progress="hidden"
    )

    btn_run.click(
        run_processing,
        inputs=[video_input, roi_editor, langs, step, conf_slider, use_llm, clahe_slider,
                chk_smart_skip, chk_visual_cutoff,
                llm_repo_input, llm_file_input, llm_prompt_input],
        outputs=[log_out, file_out, subs_table, progress_bar]
    )
    btn_stop.click(stop_processing, outputs=log_out)

if __name__ == "__main__":
    app.queue().launch(server_name="0.0.0.0", server_port=7860)
