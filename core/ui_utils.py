def generate_progress_html(current: int, total: int, eta: str) -> str:
    """Generates HTML code for a custom progress bar component."""
    if total == 0:
        pct = 0
    else:
        pct = int((current / total) * 100)

    color = "#4caf50" if pct < 100 else "#2e7d32"

    return (
        f'<div style="margin-top: 10px; font-family: sans-serif;">'
        f'<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">'
        f'<span style="font-weight: bold; font-size: 14px;">Progress: {pct}%</span>'
        f'<span style="color: #666; font-size: 14px;">ETA: {eta}</span>'
        f"</div>"
        f'<div style="width: 100%; background-color: #e0e0e0; border-radius: 8px; '
        f'height: 16px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">'
        f'<div style="width: {pct}%; background-color: {color}; height: 100%; '
        f'transition: width 0.3s ease;"></div>'
        f"</div>"
        f"</div>"
    )
