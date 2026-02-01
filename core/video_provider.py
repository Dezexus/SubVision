import cv2


class VideoProvider:
    def __init__(self, video_path, step=1):
        self.path = video_path
        self.step = step
        # Принудительно используем FFMPEG без HW ускорения для точности
        self.cap = cv2.VideoCapture(
            video_path,
            cv2.CAP_FFMPEG,
            [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE]
        )
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 25.0
        self.frame_idx = 0

    def __iter__(self):
        while self.cap.isOpened():
            ok, frame = self.cap.read()
            if not ok:
                break

            # Обрабатываем только каждый N-й кадр
            if self.frame_idx % self.step == 0:
                # Расчет точного времени
                msec = self.cap.get(cv2.CAP_PROP_POS_MSEC)
                timestamp = (msec / 1000.0) if msec > 0 else (self.frame_idx / self.fps)

                yield self.frame_idx, timestamp, frame

            self.frame_idx += 1

    def release(self):
        self.cap.release()
