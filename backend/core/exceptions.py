class TaskCancelledError(Exception):
    """Raised when a task is cancelled by the user."""
    pass

class StorageError(Exception):
    """Raised when a storage operation fails."""
    pass