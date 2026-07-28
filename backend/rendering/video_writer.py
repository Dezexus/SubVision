import threading
import queue
import av
import numpy as np
import logging
from typing import Tuple
from fractions import Fraction

logger = logging.getLogger(__name__)

class AsyncVideoWriter:
    """Writes video frames and muxes audio asynchronously."""
    def __init__(self, path: str, fps: float, size: Tuple[int, int], encoder: str = "auto", audio_source: str = ""):
        self.path = path
        self._queue = queue.Queue(maxsize=100)
        self._running = True
        self.audio_source = audio_source
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
            
        self.src_container = None
        self.src_audio = None
        self.out_audio = None
        self.audio_iter = None
        
        if self.audio_source:
            try:
                self.src_container = av.open(self.audio_source)
                audio_streams = [s for s in self.src_container.streams if s.type == 'audio']
                if audio_streams:
                    self.src_audio = audio_streams[0]
                    self.out_audio = self.container.add_stream(template=self.src_audio)
                    self.audio_iter = self.src_container.demux(self.src_audio)
            except Exception as e:
                logger.error(f"Failed to initialize audio source: {e}")
        
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _mux_audio_up_to(self, target_time: float):
        """Mux audio packets up to the target time."""
        if not self.audio_iter or not self.out_audio:
            return
        try:
            while True:
                packet = next(self.audio_iter)
                if packet.dts is None:
                    continue
                packet.stream = self.out_audio
                self.container.mux(packet)
                pkt_time = packet.dts * self.src_audio.time_base
                if pkt_time >= target_time:
                    break
        except StopIteration:
            self.audio_iter = None
        except Exception as e:
            logger.error(f"Error during audio muxing: {e}")
            self.audio_iter = None

    def _run(self):
        """Background thread for encoding and muxing."""
        while self._running or not self._queue.empty():
            try:
                frame = self._queue.get(timeout=0.1)
                if frame is None:
                    break
                av_frame = av.VideoFrame.from_ndarray(frame, format='bgr24')
                for packet in self.stream.encode(av_frame):
                    self.container.mux(packet)
                    if self.src_audio and packet.dts is not None:
                        self._mux_audio_up_to(float(packet.dts * packet.time_base))
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Encoding error: {e}")
                break
        
        try:
            for packet in self.stream.encode():
                self.container.mux(packet)
                if self.src_audio and packet.dts is not None:
                    self._mux_audio_up_to(float(packet.dts * packet.time_base))
        except Exception:
            pass

        if self.src_audio:
            self._mux_audio_up_to(float('inf'))
            self.src_container.close()

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