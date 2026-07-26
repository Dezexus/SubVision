import queue
import threading
import subprocess
import shutil
import numpy as np
import logging

logger = logging.getLogger(__name__)

def get_encoder_args() -> list[str]:
    """Auto-detect optimal hardware encoder. Tailored for Turing architecture (RTX 2060)."""
    if shutil.which("nvidia-smi"):
        try:
            out = subprocess.check_output(["nvidia-smi", "-L"], text=True)
            if "RTX" in out or "GTX" in out:
                logger.info("NVIDIA GPU detected. Using NVENC with Turing presets.")
                return ["-c:v", "h264_nvenc", "-preset", "p6", "-tune", "hq", "-cq", "23", "-pix_fmt", "yuv420p"]
        except Exception:
            pass
            
    try:
        out = subprocess.check_output(["ffmpeg", "-encoders"], stderr=subprocess.DEVNULL, text=True)
        if "h264_nvenc" in out:
            return ["-c:v", "h264_nvenc", "-preset", "p6", "-cq", "23", "-pix_fmt", "yuv420p"]
        if "h264_amf" in out:
            return ["-c:v", "h264_amf", "-quality", "quality"]
        if "h264_qsv" in out:
            return ["-c:v", "h264_qsv", "-preset", "veryslow"]
    except Exception:
        pass
        
    logger.info("Hardware encoder not found. Falling back to CPU.")
    return ["-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p"]

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
        
        if encoder == "auto":
            cmd.extend(get_encoder_args())
        elif encoder == "nvenc":
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
                if self._process.poll() is not None:
                    self._running = False
                continue

    def write(self, frame: np.ndarray):
        """Queues a new frame for FFmpeg processing."""
        if self._process.poll() is not None:
            raise RuntimeError("FFmpeg process died unexpectedly")
        if self._running:
            while True:
                try:
                    self._queue.put(frame, timeout=1.0)
                    break
                except queue.Full:
                    if self._process.poll() is not None:
                        raise RuntimeError("FFmpeg process died unexpectedly during write")
                    if not self._running:
                        break

    def close(self):
        """Safely closes the writer stream and waits for the FFmpeg process to finish."""
        self._running = False
        self._thread.join()
        if self._process.stdin:
            self._process.stdin.close()
        self._process.wait()