def generate_progress_html(current, total, eta):
    """
    Generates HTML code for a custom progress bar component.

    Args:
        current (int): Current frame index.
        total (int): Total number of frames.
        eta (str): Estimated time remaining string (MM:SS).
    """
    if total == 0:
        pct = 0
    else:
        pct = int((current / total) * 100)

    # Bar color: green if done (100%), otherwise standard material green
    color = "#4caf50" if pct < 100 else "#2e7d32"

    return f"""
    <div style="margin-top: 10px; font-family: sans-serif;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: bold; font-size: 14px;">Progress: {pct}%</span>
            <span style="color: #666; font-size: 14px;">ETA: {eta}</span>
        </div>
        <div style="width: 100%; background-color: #e0e0e0; border-radius: 8px; height: 16px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">
            <div style="width: {pct}%; background-color: {color}; height: 100%; transition: width 0.3s ease;"></div>
        </div>
    </div>
    """
