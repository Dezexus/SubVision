import queue
import threading
import cv2

class AsyncVideoWriter:
    def __init__(self, path: str, fourcc: int, fps: float, size: tuple[int, int]):
        self._writer = cv2.VideoWriter(path, fourcc, fps, size)
        self._queue = queue.Queue(maxsize=50)
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        while self._running or not self._queue.empty():
            try:
                frame = self._queue.get(timeout=0.1)
                self._writer.write(frame)
            except queue.Empty:
                continue

    def write(self, frame):
        if self._running:
            self._queue.put(frame)

    def close(self):
        self._running = False
        self._thread.join()
        self._writer.release()