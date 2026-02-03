import gradio as gr

from core.presets import get_preset_choices
from ui import callbacks

CUSTOM_CSS = """
footer {visibility: hidden}
"""


def create_app() -> gr.Blocks:
    """Constructs the main Gradio application interface."""
    theme = gr.themes.Default(radius_size=gr.themes.sizes.radius_lg)

    with gr.Blocks(title="SubVision", theme=theme, css=CUSTOM_CSS) as app:
        total_frames_state = gr.State(value=100)
        pending_video_path_state = gr.State(value=None)

        with gr.Row():
            gr.Markdown(
                """
                # SubVision
                ### AI-Powered Video OCR
                """
            )

        with gr.Row():
            with gr.Column(scale=6):
                with gr.Accordion("Source Input", open=True):
                    video_input = gr.File(
                        label="Video File",
                        show_label=False,
                        file_types=[".mp4", ".avi", ".mkv", ".mov"],
                        height=220,
                    )
                    btn_convert = gr.Button(
                        "🛠️ Fix Format (Convert to H.264)",
                        visible=False,
                        variant="secondary",
                    )

                with gr.Group():
                    frame_slider = gr.Slider(
                        0, 100, value=0, step=1, label="Frame Selector", visible=False
                    )
                    roi_editor = gr.ImageEditor(
                        label="Select Subtitle Area",
                        type="numpy",
                        interactive=True,
                        brush=gr.Brush(colors=["#ff0000"], default_size=20),
                        height=350,
                        show_label=True,
                        visible=False,
                    )

                with gr.Accordion("AI Editing", open=True):
                    use_llm = gr.Checkbox(label="Enable AI Correction", value=False)

                    with gr.Accordion("Advanced Config", open=False):
                        llm_repo_input = gr.Textbox(
                            value=callbacks.DEFAULT_LLM_REPO, label="Repo ID"
                        )
                        llm_file_input = gr.Textbox(
                            value=callbacks.DEFAULT_LLM_FILE, label="Filename"
                        )

                        llm_prompt_input = gr.TextArea(
                            value=callbacks.DEFAULT_PROMPT,
                            label="Prompt Template",
                            lines=15,
                            max_lines=15,
                        )
                        btn_reset_ai = gr.Button("Default Settings", size="sm")

            with gr.Column(scale=4):
                with gr.Accordion("Algorithm Vision", open=True):
                    preview_img = gr.Image(show_label=False, height=220, interactive=False)

                with gr.Accordion("Settings & Presets", open=True):
                    with gr.Row():
                        preset_selector = gr.Dropdown(
                            choices=get_preset_choices(),
                            value="⚖️ Balance",
                            label="Preset Mode",
                            scale=2,
                        )
                        langs = gr.Dropdown(
                            choices=[
                                ("English", "en"),
                                ("Russian", "ru"),
                                ("Japanese", "japan"),
                                ("Chinese", "ch"),
                            ],
                            value="en",
                            label="Language",
                            scale=1,
                        )

                    step = gr.Slider(1, 10, value=2, step=1, label="Scan Step")
                    with gr.Row():
                        conf_slider = gr.Slider(50, 100, value=80, step=1, label="Min Accuracy %")
                        clahe_slider = gr.Slider(
                            0.1,
                            6.0,
                            value=2.0,
                            step=0.1,
                            label="Contrast (CLAHE)",
                        )

                    with gr.Row():
                        chk_upscale = gr.Checkbox(label="Upscaling (2x)", value=True)
                        chk_smart_skip = gr.Checkbox(label="Smart Skip", value=True)

                    chk_visual_cutoff = gr.Checkbox(label="Visual Cutoff", value=True)

                with gr.Row():
                    btn_run = gr.Button("START PROCESSING", variant="primary", scale=2)
                    btn_stop = gr.Button("STOP", variant="stop", scale=1)

                progress_bar = gr.HTML(label="Progress", value="")
                btn_download = gr.DownloadButton(
                    label="Download .SRT", visible=False, variant="primary", size="lg"
                )

                log_out = gr.TextArea(visible=False)

        gr.Markdown("### Live Results")
        subs_table = gr.Dataframe(
            headers=["#", "Detected Text", "Confidence", "AI Correction"],
            datatype=["str", "str", "markdown", "markdown"],
            row_count=(6, "fixed"),
            col_count=(4, "fixed"),
            interactive=False,
            wrap=True,
        )

        video_input.change(
            callbacks.on_video_upload,
            inputs=video_input,
            outputs=[
                roi_editor,
                total_frames_state,
                frame_slider,
                btn_convert,
                pending_video_path_state,
            ],
        )

        btn_convert.click(
            callbacks.on_convert_click,
            inputs=pending_video_path_state,
            outputs=[video_input, btn_convert, pending_video_path_state],
        )

        frame_slider.change(
            callbacks.on_frame_change,
            inputs=[video_input, frame_slider],
            outputs=roi_editor,
        )

        preset_selector.change(
            fn=callbacks.on_preset_change,
            inputs=preset_selector,
            outputs=[
                step,
                conf_slider,
                clahe_slider,
                chk_smart_skip,
                chk_visual_cutoff,
                chk_upscale,
            ],
        )

        btn_reset_ai.click(
            fn=callbacks.on_reset_ai,
            outputs=[llm_repo_input, llm_file_input, llm_prompt_input],
        )

        gr.on(
            triggers=[
                roi_editor.change,
                frame_slider.change,
                clahe_slider.change,
                chk_upscale.change,
            ],
            fn=callbacks.on_preview_update,
            inputs=[video_input, frame_slider, roi_editor, clahe_slider, chk_upscale],
            outputs=preview_img,
            show_progress="hidden",
        )

        btn_run.click(
            callbacks.on_run_click,
            inputs=[
                video_input,
                roi_editor,
                langs,
                step,
                conf_slider,
                use_llm,
                clahe_slider,
                chk_upscale,
                chk_smart_skip,
                chk_visual_cutoff,
                llm_repo_input,
                llm_file_input,
                llm_prompt_input,
            ],
            outputs=[log_out, btn_download, subs_table, progress_bar],
        )
        btn_stop.click(callbacks.on_stop_click, outputs=log_out)

    return app
