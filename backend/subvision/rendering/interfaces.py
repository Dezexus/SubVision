from typing import Protocol, Callable

from subvision.core.cancellation import CancellationToken

__all__ = ["Reporter", "Storage", "CancellationToken", "CancelCheck"]


class Reporter(Protocol):
    def log(self, message: str) -> None: ...
    def progress(self, current: int, total: int, eta: str) -> None: ...
    def done(self, total: int) -> None: ...


class Storage(Protocol):
    async def copy_from(self, key: str, dest: str) -> bool: ...
    async def copy_to(self, src: str, key: str) -> bool: ...


CancelCheck = Callable[[], bool]
