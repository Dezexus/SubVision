from .utils import is_similar

class SubtitleEvent:
    def __init__(self, text, start, conf):
        self.text = text
        self.start = start
        self.end = start
        self.max_conf = conf
        self.gap_frames = 0

    def extend(self, text, time, conf):
        self.end = time
        self.gap_frames = 0
        # Если новый текст увереннее или длиннее при той же уверенности — берем его
        if conf > self.max_conf or (conf == self.max_conf and len(text) > len(self.text)):
            self.text = text
            self.max_conf = conf

class SubtitleAggregator:
    def __init__(self, min_conf, gap_tolerance=5):
        self.srt_data = []
        self.active_event = None
        self.min_conf = min_conf
        self.gap_tolerance = gap_tolerance
        self.on_new_subtitle = None # Callback

    def add_result(self, text, conf, timestamp):
        is_valid = (text and conf >= self.min_conf)

        if is_valid:
            if self.active_event:
                # Если текст похож на текущий — продлеваем
                if is_similar(self.active_event.text, text, 0.6):
                    self.active_event.extend(text, timestamp, conf)
                else:
                    # Текст изменился — закрываем старый, начинаем новый
                    self._commit_event()
                    self.active_event = SubtitleEvent(text, timestamp, conf)
            else:
                # Новое событие
                self.active_event = SubtitleEvent(text, timestamp, conf)
        else:
            # Текста нет (или он плохой)
            if self.active_event:
                self.active_event.gap_frames += 1
                if self.active_event.gap_frames > self.gap_tolerance:
                    self._commit_event()

    def _commit_event(self):
        if self.active_event:
            item = {
                'id': len(self.srt_data) + 1,
                'start': self.active_event.start,
                'end': self.active_event.end,
                'text': self.active_event.text,
                'conf': self.active_event.max_conf
            }
            self.srt_data.append(item)
            if self.on_new_subtitle:
                self.on_new_subtitle(item)
            self.active_event = None

    def finalize(self):
        self._commit_event()
        return self.srt_data
