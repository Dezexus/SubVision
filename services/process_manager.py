import os
from core.worker import OCRWorker
from core.image_ops import calculate_roi_from_mask


class ProcessManager:
    def __init__(self):
        self.workers_registry = {}

    def start_process(self, session_id, video_file, editor_data,
                      langs, step, conf_threshold, use_llm, clahe_val,
                      smart_skip, visual_cutoff,
                      llm_repo, llm_file, llm_prompt, callbacks):

        if session_id in self.workers_registry:
            self.stop_process(session_id)

        roi_state = calculate_roi_from_mask(editor_data)
        output_srt = video_file.replace(os.path.splitext(video_file)[1], ".srt")
        if os.path.exists(output_srt):
            os.remove(output_srt)

        params = {
            'video_path': video_file,
            'output_path': output_srt,
            'langs': langs,
            'step': int(step),
            'conf': 0.5,
            'min_conf': conf_threshold / 100.0,
            'roi': roi_state,
            'use_llm': use_llm,
            'clip_limit': clahe_val,
            'smart_skip': smart_skip,
            'visual_cutoff': visual_cutoff,
            'llm_repo': llm_repo,
            'llm_filename': llm_file,
            'llm_prompt': llm_prompt
        }

        worker = OCRWorker(params, callbacks)
        self.workers_registry[session_id] = worker
        worker.start()
        return output_srt

    def stop_process(self, session_id):
        if session_id in self.workers_registry:
            self.workers_registry[session_id].stop()
            del self.workers_registry[session_id]
            return True
        return False
