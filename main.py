from ui.layout import create_app


def main() -> None:
    """Initialize and launch the SubVision application."""
    app = create_app()
    app.queue().launch(server_name="0.0.0.0", server_port=7860)


if __name__ == "__main__":
    main()
