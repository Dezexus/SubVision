import gradio as gr
from core.presets import get_preset_choices
from ui import callbacks


def create_app():
    with gr.Blocks(title="SubVision") as app:
        total_frames_state = gr.State(value=100)

        gr.Markdown("## ⚡ SubVision (AI Video OCR)")

        with gr.Row():
            # LEFT COLUMN: INPUTS & AI
            with gr.Column(scale=6):
                video_input = gr.File(label="1. Video File", file_types=[".mp4", ".avi", ".mkv", ".mov"])
                frame_slider = gr.Slider(0, 100, value=0, step=1, label="2. Frame Selection")
                roi_editor = gr.ImageEditor(label="3. Subtitle Zone", type="numpy", interactive=True,
                                            brush=gr.Brush(colors=["#ff0000"], default_size=20), height=300)

                with gr.Group():
                    gr.Markdown("### 🤖 AI Post-Processing")
                    use_llm = gr.Checkbox(label="Enable AI Editing (Gemma)", value=False)
                    with gr.Accordion("Advanced AI Config", open=False):
                        llm_repo_input = gr.Textbox(value=callbacks.DEFAULT_LLM_REPO, label="Repo ID")
                        llm_file_input = gr.Textbox(value=callbacks.DEFAULT_LLM_FILE, label="Filename")
                        llm_prompt_input = gr.TextArea(value=callbacks.DEFAULT_PROMPT, label="Prompt Template", lines=6)
                        btn_reset_ai = gr.Button("Default Settings", size="sm")

            # RIGHT COLUMN: PREVIEW & SETTINGS
            with gr.Column(scale=4):
                preview_img = gr.Image(label="AI Preview", height=200)

                with gr.Accordion("OCR Settings", open=True):
                    preset_selector = gr.Dropdown(choices=get_preset_choices(), value="⚖️ Balance", label="Preset Mode")

                    langs = gr.Dropdown(
                        choices=[("English", "en"), ("Russian", "ru"), ("Japanese", "japan"), ("Chinese", "ch")],
                        value="en", label="OCR Language"
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

                # Progress and Output
                progress_bar = gr.HTML(label="Progress", value="")

                # Replaced File output with Download Button
                btn_download = gr.DownloadButton(label="💾 Download .SRT", visible=False, variant="primary")

                log_out = gr.TextArea(label="Log", lines=5, autoscroll=True)

        gr.Markdown("### 📝 Recognized Subtitles")
        subs_table = gr.Dataframe(
            headers=["#", "Original", "Accuracy", "AI Edit"],
            datatype=["str", "str", "markdown", "markdown"],
            row_count=(5, "dynamic"),
            column_count=(4, "fixed"),
            interactive=False
        )

        # Event Wiring
        video_input.change(callbacks.on_video_upload, inputs=video_input,
                           outputs=[roi_editor, total_frames_state, frame_slider])
        frame_slider.change(callbacks.on_frame_change, inputs=[video_input, frame_slider], outputs=roi_editor)

        preset_selector.change(
            fn=callbacks.on_preset_change,
            inputs=preset_selector,
            outputs=[step, conf_slider, clahe_slider, chk_smart_skip, chk_visual_cutoff]
        )

        btn_reset_ai.click(fn=callbacks.on_reset_ai, outputs=[llm_repo_input, llm_file_input, llm_prompt_input])

        gr.on(
            triggers=[roi_editor.change, frame_slider.change, clahe_slider.change],
            fn=callbacks.on_preview_update,
            inputs=[video_input, frame_slider, roi_editor, clahe_slider],
            outputs=preview_img,
            show_progress="hidden"
        )

        btn_run.click(
            callbacks.on_run_click,
            inputs=[video_input, roi_editor, langs, step, conf_slider, use_llm, clahe_slider,
                    chk_smart_skip, chk_visual_cutoff, llm_repo_input, llm_file_input, llm_prompt_input],
            outputs=[log_out, btn_download, subs_table, progress_bar]
        )
        btn_stop.click(callbacks.on_stop_click, outputs=log_out)

    return app
