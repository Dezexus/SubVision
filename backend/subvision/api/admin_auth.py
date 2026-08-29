"""Admin API authentication."""

from __future__ import annotations

from fastapi import Header, HTTPException

from subvision.core.config import settings


async def require_admin(x_admin_key: str = Header(default="", alias="X-Admin-Key")) -> None:
    if not settings.admin_enabled:
        raise HTTPException(status_code=404, detail="Admin API disabled")
    if not settings.admin_api_key or x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid admin key")
