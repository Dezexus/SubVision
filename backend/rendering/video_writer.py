import queue
import threading
import subprocess
import numpy as np

class AsyncVideoWriter:
    """Writes video frames asynchronously using an FFmpeg pipe to preserve high quality."""
    def __init__(self, path: str, fps: float, size: tuple[int, int], encoder: str = "auto"):
        self._queue = queue.Queue(maxsize=50)
        self._running = True
        
        cmd = [
            "ffmpeg", "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{size[0]}x{size[1]}",
            "-pix_fmt", "bgr24",
            "-r", str(fps),
            "-i", "-",
            "-an"
        ]
        
        if encoder == "nvenc":
            cmd.extend(["-c:v", "h264_nvenc", "-preset", "p6", "-cq", "23", "-pix_fmt", "yuv420p"])
        else:
            cmd.extend(["-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p"])
            
        cmd.append(path)
        
        self._process = subprocess.Popen(
            cmd, 
            stdin=subprocess.PIPE, 
            stdout=subprocess.DEVNULL, 
            stderr=subprocess.DEVNULL
        )
        
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        while self._running or not self._queue.empty():
            try:
                frame = self._queue.get(timeout=0.1)
                if self._process.stdin:
                    self._process.stdin.write(frame.tobytes())
            except queue.Empty:
                continue

    def write(self, frame: np.ndarray):
        """Queues a new frame for FFmpeg processing."""
        if self._process.returncode is not None:
            raise RuntimeError("FFmpeg process died unexpectedly")
        if self._running:
            self._queue.put(frame)

    def close(self):
        """Safely closes the writer stream and waits for the FFmpeg process to finish."""
        self._running = False
        self._thread.join()
        if self._process.stdin:
            self._process.stdin.close()
        self._process.wait()