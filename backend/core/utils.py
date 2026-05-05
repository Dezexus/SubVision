import os
import re

def validate_filename(filename: str) -> str:
    safe = os.path.basename(filename)
    if not safe or safe.startswith('.') or '..' in safe:
        raise ValueError("Invalid filename")
    if not re.match(r'^[a-zA-Z0-9._\- ]+$', safe):
        raise ValueError("Filename contains forbidden characters")
    if len(safe) > 255:
        raise ValueError("Filename too long")
    return safe