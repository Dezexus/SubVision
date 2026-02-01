import os
import time
from collections.abc import Callable, Generator
from typing import Any

import gradio as gr
import numpy as np
from PIL import Image

from core.presets import get_preset_values
from core.ui_utils import generate_progress_html
from services.process_manager import ProcessManager
from services.video_manager import VideoManager

process_mgr = ProcessManager()

DEFAULT_LLM_REPO = "bartowski/google_gemma-3-4b-it-GGUF"
DEFAULT_LLM_FILE = "google_gemma-3-4b-it-Q4_K_M.gguf"
DEFAULT_PROMPT = (
    "<start_of_turn>user\n"
    "You are a professional subtitle editor. Your task is to carefully read "
    "the entire subtitle text provided below and correct any grammatical, "
    "punctuation, or spelling errors in {language}.\n\n"
    "KEY RULES:\n"
    "1. Preserve fictional names and terms.\n"
    "2. Do not rephrase sentences. Only fix clear errors.\n"
    "3. Preserve original punctuation.\n"
    "4. The input is a numbered list. Your output must be a numbered list "
    "matching the original line numbers.\n"
    "5. IMPORTANT: Only include lines that you have corrected in your output.\n\n"
    "Here is the text:\n"
    "---\n"
    "{subtitles}\n"
    "---\n\n"
    "OUTPUT (Corrected lines only, as a numbered list):<end_of_turn>\n"
    "<start_of_turn>model\n"
)


def on_preset_change(preset_name: str) -> tuple[Any, ...]:
    """Updates UI components based on the selected preset."""
    vals = get_preset_values(preset_name)
    if not vals:
        return gr.update(), gr.update(), gr.update(), gr.update(), gr.update()
    gr.Info(f"Applied preset: {preset_name}")
    return vals[0], vals[1], vals[2], vals[3], vals[4]


def on_reset_ai() -> tuple[str, str, str]:
    """Resets AI configuration settings to defaults."""
    gr.Info("AI settings reset to default.")
    return DEFAULT_LLM_REPO, DEFAULT_LLM_FILE, DEFAULT_PROMPT


def on_video_upload(video_path: str | None) -> tuple[Any, ...]:
    """Handles video file upload and extracts metadata."""
    if not video_path:
        return (
            None,
            gr.State(1),
            gr.update(value=0, maximum=1, visible=False),
            gr.update(visible=False),
            None,
        )

    gr.Info("Analyzing video file...")
    frame, total = VideoManager.get_video_info(video_path)

    if frame is None:
        gr.Warning("Codec likely unsupported (AV1/VP9).")
        gr.Info("Click 'Fix Format' button below to convert.")
        return (
            None,
            gr.State(1),
            gr.update(value=0, maximum=1, visible=False),
            gr.update(visible=True),
            video_path,
        )

    gr.Info(f"Video loaded! Found {total} frames.")

    return (
        gr.update(value=frame, visible=True),
        gr.State(total),
        gr.update(value=0, maximum=total - 1, visible=True),
        gr.update(visible=False),
        None,
    )


def on_convert_click(video_path: str | None) -> tuple[Any, ...]:
    """Converts incompatible video formats to H.264."""
    if not video_path:
        return None, gr.update(visible=False), None

    gr.Info("Converting video to H.264... Please wait.")
    new_path = VideoManager.convert_video_to_h264(video_path)

    if new_path:
        gr.Info("Conversion successful! Loading new file...")
        return new_path, gr.update(visible=False), None

    gr.Error("Conversion failed. Check logs.")
    return None, gr.update(visible=False), None


def on_frame_change(video_path: str, frame_index: int) -> np.ndarray | None:
    """Fetches the specific frame image."""
    return VideoManager.get_frame_image(video_path, frame_index)


def on_preview_update(
    video_path: str, frame_index: int, editor_data: dict[str, Any], clahe_val: float
) -> Image.Image | None:
    """Generates a preview with applied filters."""
    return VideoManager.generate_preview(video_path, frame_index, editor_data, clahe_val)


def on_stop_click(request: gr.Request) -> str:
    """Stops the active processing session."""
    if process_mgr.stop_process(request.session_hash):
        gr.Warning("Process stopped by user.")
        return "Stopping..."
    return "No active processes."


def on_run_click(
    video_file: str | None,
    editor_data: dict[str, Any] | None,
    langs: str,
    step: int,
    conf_threshold: float,
    use_llm: bool,
    clahe_val: float,
    use_smart_skip: bool,
    use_visual_cutoff: bool,
    llm_repo: str,
    llm_file: str,
    llm_prompt: str,
    request: gr.Request,
) -> Generator[tuple[str, Any, list[list[Any]], str], None, None]:
    """Starts the subtitle extraction process and streams updates."""
    if video_file is None:
        gr.Error("Please upload a video first!")
        yield "Error: No video", gr.update(visible=False), [], ""
        return

    gr.Info("Processing started...")

    session_id = request.session_hash
    logs: list[str] = []
    table_data: list[list[Any]] = []
    is_finished = [False]
    prog_state: list[int | str] = [0, 100, "Initializing..."]

    def log_cb(msg: str) -> None:
        logs.append(msg)

    def finish_cb(success: bool) -> None:
        is_finished[0] = True

    def progress_cb(c: int, t: int, e: str) -> None:
        prog_state[0] = c
        prog_state[1] = t
        prog_state[2] = e

    def subtitle_cb(item: dict[str, Any]) -> None:
        conf = item.get("conf", 0.0)
        color, dot = (
            ("green", "🟢")
            if conf >= 0.90
            else ("#FFD700", "🟡")
            if conf >= 0.75
            else ("red", "🔴")
        )
        conf_html = (
            f"<span style='color:{color}; font-weight:bold;'>{dot} {int(conf * 100)}%</span>"
        )
        table_data.append([str(item["id"]), item["text"], conf_html, ""])

    def ai_cb(item: dict[str, Any]) -> None:
        target_id = str(item["id"])
        for row in table_data:
            if row[0] == target_id:
                original_text = row[1].strip()
                new_text = item["text"].strip()

                if original_text != new_text:
                    row[3] = f"✨ **{new_text}**"
                else:
                    row[3] = "✅ Verified"
                break

    callbacks: dict[str, Callable[..., Any]] = {
        "log": log_cb,
        "subtitle": subtitle_cb,
        "ai_update": ai_cb,
        "finish": finish_cb,
        "progress": progress_cb,
    }

    try:
        output_path = process_mgr.start_process(
            session_id,
            video_file,
            editor_data,
            langs,
            step,
            conf_threshold,
            use_llm,
            clahe_val,
            use_smart_skip,
            use_visual_cutoff,
            llm_repo,
            llm_file,
            llm_prompt,
            callbacks,
        )
    except Exception as e:
        gr.Error(f"Failed to start: {e}")
        return

    while not is_finished[0]:
        time.sleep(0.5)
        html_bar = generate_progress_html(
            int(prog_state[0]), int(prog_state[1]), str(prog_state[2])
        )
        yield "\n".join(logs), gr.update(visible=False), table_data, html_bar

    if os.path.exists(output_path):
        gr.Info("Extraction complete!")
        logs.append(f"Done: {os.path.basename(output_path)}")
        final_html = generate_progress_html(100, 100, "00:00")
        yield (
            "\n".join(logs),
            gr.update(value=output_path, visible=True),
            table_data,
            final_html,
        )
    else:
        gr.Warning("Process finished but no file was generated.")
        yield (
            "\n".join(logs),
            gr.update(visible=False),
            table_data,
            generate_progress_html(0, 100, "--:--"),
        )
