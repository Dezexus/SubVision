from typing import Protocol


class CancellationToken(Protocol):
    def is_cancelled_sync(self) -> bool: ...

    async def is_cancelled(self) -> bool: ...
