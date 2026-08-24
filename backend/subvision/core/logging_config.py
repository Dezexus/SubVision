import logging


def setup_logging(level: str = "INFO") -> None:
    """Configure root logging for API and worker processes."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
