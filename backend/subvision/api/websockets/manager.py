import logging
from typing import Dict
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, WebSocket] = {}
        self.stream_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        await websocket.accept()
        self.active_connections[client_id] = websocket

    async def connect_stream(self, websocket: WebSocket, client_id: str) -> None:
        await websocket.accept()
        self.stream_connections[client_id] = websocket

    def disconnect(self, client_id: str) -> None:
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    def disconnect_stream(self, client_id: str) -> None:
        if client_id in self.stream_connections:
            del self.stream_connections[client_id]

    async def send_json(self, client_id: str, message: dict) -> None:
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send message to {client_id}: {e}")

    async def send_bytes(self, client_id: str, data: bytes) -> None:
        if client_id in self.stream_connections:
            try:
                await self.stream_connections[client_id].send_bytes(data)
            except Exception as e:
                logger.warning(f"Failed to send binary data to {client_id}: {e}")


connection_manager = ConnectionManager()
