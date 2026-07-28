import threading
import queue
import av
import numpy as np
import logging
from typing import Tuple
from fractions import Fraction

logger = logging.getLogger(__name__)

class AsyncVideoWriter:
    """Writes video frames asynchronously."""
    def __init__(self, path: str, fps: float, size: Tuple[int, int], encoder: str = "auto"):
        self.path = path
        self._queue = queue.Queue(maxsize=100)
        self._running = True
        self.container = av.open(path, 'w')
        
        selected_encoder = "h264_nvenc" if encoder in ["auto", "nvenc"] else "libx264"
        safe_fps = Fraction(fps).limit_denominator(100000)
        self.stream = self.container.add_stream(selected_encoder, rate=safe_fps)
        self.stream.width = size[0]
        self.stream.height = size[1]
        self.stream.pix_fmt = 'yuv420p'
        
        if selected_encoder == "h264_nvenc":
            self.stream.options = {'preset': 'p6', 'tune': 'hq', 'cq': '23'}
        else:
            self.stream.options = {'preset': 'medium', 'crf': '21'}
            
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        """Background thread for encoding."""
        while self._running or not self._queue.empty():
            try:
                frame = self._queue.get(timeout=0.1)
                if frame is None:
                    break
                av_frame = av.VideoFrame.from_ndarray(frame, format='bgr24')
                for packet in self.stream.encode(av_frame):
                    self.container.mux(packet)
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Encoding error: {e}")
                break
        
        try:
            for packet in self.stream.encode():
                self.container.mux(packet)
        except Exception:
            pass

        self.container.close()

    def write(self, frame: np.ndarray):
        """Queues a new frame for encoding."""
        if not self._running:
            raise RuntimeError("Writer is closed")
        self._queue.put(frame)

    def close(self):
        """Safely closes the writer stream."""
        self._running = False
        self._queue.put(None)
        self._thread.join()