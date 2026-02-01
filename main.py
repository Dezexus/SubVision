from ui.layout import create_app

if __name__ == "__main__":
    app = create_app()
    app.queue().launch(server_name="0.0.0.0", server_port=7860)
