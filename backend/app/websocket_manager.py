from typing import Dict
from fastapi import WebSocket

class ConnectionManager:
    """Manages active WebSocket connections for real-time updates."""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        """Accepts connection and stores it by client_id."""
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        """Removes a client from active connections."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def send_json(self, client_id: str, message: dict):
        """Sends a JSON message to a specific client."""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception:
                self.disconnect(client_id)

manager = ConnectionManager()
