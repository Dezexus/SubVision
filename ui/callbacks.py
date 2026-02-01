import gradio as gr
from core.presets import get_preset_values
from core.ui_utils import generate_progress_html
from services.video_manager import VideoManager
from services.process_manager import ProcessManager

# Singleton instance
process_mgr = ProcessManager()

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


def on_preset_change(preset_name):
    vals = get_preset_values(preset_name)
    if not vals:
        return gr.update(), gr.update(), gr.update(), gr.update(), gr.update()
    return vals[0], vals[1], vals[2], vals[3], vals[4]


def on_reset_ai():
    return DEFAULT_LLM_REPO, DEFAULT_LLM_FILE, DEFAULT_PROMPT


def on_video_upload(video_path):
    frame, total = VideoManager.get_video_info(video_path)
    if frame is None:
        return None, gr.State(1), gr.update(value=0, maximum=1)
    return frame, gr.State(total), gr.update(maximum=total - 1, value=0)


def on_frame_change(video_path, frame_index):
    return VideoManager.get_frame_image(video_path, frame_index)


def on_preview_update(video_path, frame_index, editor_data, clahe_val):
    return VideoManager.generate_preview(video_path, frame_index, editor_data, clahe_val)


def on_stop_click(request: gr.Request):
    if process_mgr.stop_process(request.session_hash):
        return "🛑 Stopping..."
    return "No active processes."


def on_run_click(video_file, editor_data, langs, step, conf_threshold, use_llm, clahe_val,
                 use_smart_skip, use_visual_cutoff,
                 llm_repo, llm_file, llm_prompt, request: gr.Request):
    if video_file is None:
        yield "❌ No video file", None, None, ""
        return

    session_id = request.session_hash
    logs = []
    table_data = []
    is_finished = [False]
    prog_state = [0, 100, "Calculating..."]

    # Callbacks for the worker to update UI state
    def log_cb(msg):
        logs.append(msg)

    def finish_cb(success):
        is_finished[0] = True

    def progress_cb(c, t, e):
        prog_state[0] = c
        prog_state[1] = t
        prog_state[2] = e

    def subtitle_cb(item):
        conf = item.get('conf', 0.0)
        color, dot = ("green", "🟢") if conf >= 0.90 else ("#FFD700", "🟡") if conf >= 0.75 else ("red", "🔴")
        conf_html = f"<span style='color:{color}; font-weight:bold;'>{dot} {int(conf * 100)}%</span>"
        table_data.append([str(item['id']), item['text'], conf_html, ""])

    def ai_cb(item):
        target_id = str(item['id'])
        for row in table_data:
            if row[0] == target_id:
                if row[1].strip() != item['text'].strip():
                    row[3] = f"✨️ **{item['text']}**"
                break

    callbacks = {
        'log': log_cb, 'subtitle': subtitle_cb, 'ai_update': ai_cb,
        'finish': finish_cb, 'progress': progress_cb
    }

    output_path = process_mgr.start_process(
        session_id, video_file, editor_data, langs, step, conf_threshold, use_llm, clahe_val,
        use_smart_skip, use_visual_cutoff, llm_repo, llm_file, llm_prompt, callbacks
    )

    # UI Update Loop
    while not is_finished[0]:
        import time
        time.sleep(0.5)
        html_bar = generate_progress_html(prog_state[0], prog_state[1], prog_state[2])
        yield "\n".join(logs), None, table_data, html_bar

    import os
    if os.path.exists(output_path):
        logs.append(f"✅ Done: {os.path.basename(output_path)}")
        final_html = generate_progress_html(100, 100, "00:00")
        yield "\n".join(logs), output_path, table_data, final_html
    else:
        yield "\n".join(logs), None, table_data, generate_progress_html(0, 100, "--:--")
