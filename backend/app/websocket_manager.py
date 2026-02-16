"""
This module provides a singleton manager for handling WebSocket connections.
"""
from typing import Dict
from fastapi import WebSocket

class ConnectionManager:
    """
    Manages active WebSocket connections, allowing for messages to be sent
    to specific clients.
    """
    def __init__(self):
        """Initializes the manager with a dictionary to track connections."""
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        """Accepts and stores a new client connection."""
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        """Removes a client connection from the active pool."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def send_json(self, client_id: str, message: dict):
        """
        Sends a JSON message to a specific client. If sending fails,
        the client is disconnected.
        """
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception:
                self.disconnect(client_id)

manager = ConnectionManager()
