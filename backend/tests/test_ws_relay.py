import asyncio
import json
from types import SimpleNamespace

from fastapi import WebSocketDisconnect

from subvision.main import websocket_endpoint


class FakePubSub:
    def __init__(self, release: asyncio.Event) -> None:
        self._release = release

    async def subscribe(self, _channel: str) -> None:
        pass

    async def unsubscribe(self, _channel: str) -> None:
        pass

    async def close(self) -> None:
        pass

    async def listen(self):
        await self._release.wait()
        yield {"type": "message", "data": json.dumps({"type": "subtitle_new", "item": {"id": 1}}).encode()}
        await asyncio.Event().wait()


class FakeWebSocket:
    def __init__(self, redis, stop: asyncio.Event) -> None:
        self.app = SimpleNamespace(state=SimpleNamespace(redis=redis))
        self.sent: list[dict] = []
        self._stop = stop

    async def accept(self) -> None:
        pass

    async def send_json(self, message: dict) -> None:
        self.sent.append(message)

    async def receive_text(self) -> str:
        await self._stop.wait()
        raise WebSocketDisconnect()


async def test_two_connections_of_one_client_each_get_an_event_once():
    release, stop = asyncio.Event(), asyncio.Event()
    redis = SimpleNamespace(pubsub=lambda: FakePubSub(release))
    first, second = FakeWebSocket(redis, stop), FakeWebSocket(redis, stop)

    tasks = [asyncio.create_task(websocket_endpoint(ws, "client")) for ws in (first, second)]
    await asyncio.sleep(0)
    release.set()
    await asyncio.sleep(0.01)
    stop.set()
    await asyncio.gather(*tasks)

    assert [m["type"] for m in first.sent] == ["subtitle_new"]
    assert [m["type"] for m in second.sent] == ["subtitle_new"]
