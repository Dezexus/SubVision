"""
Module providing a singleton manager for handling WebSocket connections.
"""
from typing import Dict
from fastapi import WebSocket

class ConnectionManager:
    """
    Manages active WebSocket connections to route messages to specific clients.
    """
    def __init__(self) -> None:
        """
        Initializes the manager with an empty connection pool.
        """
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        """
        Accepts and stores a new client connection.
        """
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str) -> None:
        """
        Removes a client connection from the active pool.
        """
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def send_json(self, client_id: str, message: dict) -> None:
        """
        Sends a JSON message to a specific client, disconnecting them on failure.
        """
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception:
                self.disconnect(client_id)

connection_manager = ConnectionManager()
