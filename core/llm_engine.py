import gc
import re
from difflib import SequenceMatcher
from .utils import clean_llm_text

try:
    from huggingface_hub import hf_hub_download
    from llama_cpp import Llama

    HAS_LLM = True
except ImportError:
    HAS_LLM = False


class LLMFixer:
    """
    Class for correcting subtitles using a GGUF LLM model.
    """

    def __init__(self, log_func):
        self.log = log_func
        self.model_path = None
        self.llm = None

    def load_model(self, repo_id, filename):
        """
        Loads a GGUF model from Hugging Face.
        """
        if not HAS_LLM:
            self.log("❌ Llama-cpp not installed. AI unavailable.")
            return False

        self.log(f"Loading AI model: {filename} from {repo_id}...")

        try:
            self.model_path = hf_hub_download(repo_id=repo_id, filename=filename)
            self.llm = Llama(
                model_path=self.model_path,
                n_gpu_layers=-1,
                n_ctx=4096,
                verbose=False
            )
            return True
        except Exception as e:
            self.log(f"❌ LLM Load Error: {e}")
            return False

    def fix_subtitles(self, all_subtitles, lang='en', prompt_template=None):
        """
        Corrects subtitles using the provided prompt template.
        """
        if not self.llm or not all_subtitles:
            return

        self.log("🤖 Forming LLM request...")

        # Prepare data block
        lines_block = "\n".join([f"{item['id']}. {item['text']}" for item in all_subtitles])

        lang_map = {
            'ru': 'Russian', 'en': 'English',
            'de': 'German', 'fr': 'French',
            'japan': 'Japanese', 'ch': 'Chinese'
        }
        target_lang = lang_map.get(lang, 'the target language')

        # Use default prompt if none provided
        if not prompt_template:
            prompt_template = (
                "<start_of_turn>user\n"
                "Fix grammar in {language}:\n"
                "{subtitles}\n"
                "Output only corrected lines with IDs.<end_of_turn>\n"
                "<start_of_turn>model\n"
            )

        # Inject data into template
        try:
            prompt = prompt_template.replace("{language}", target_lang).replace("{subtitles}", lines_block)
        except Exception as e:
            self.log(f"❌ Prompt formatting error: {e}")
            return

        try:
            self.log("🧠 Sending text to AI...")
            output = self.llm(prompt, max_tokens=2048, stop=["<end_of_turn>"], echo=False, temperature=0.1)
            raw_response = output['choices'][0]['text'].strip()
            fixed_lines = raw_response.split('\n')

            self.log("✅ AI processing complete. Applying fixes...")
            pattern = re.compile(r'^(\d+)[\.\)]\s*(.*)')
            subs_by_id = {str(sub['id']): sub for sub in all_subtitles}
            correction_count = 0

            for line in fixed_lines:
                match = pattern.match(line.strip())
                if match:
                    id_str, raw_text = match.groups()
                    clean_text = clean_llm_text(raw_text)

                    if not clean_text or id_str not in subs_by_id:
                        continue

                    original_text = subs_by_id[id_str]['text']
                    # Apply if text changed significantly
                    if original_text.strip().lower() != clean_text.strip().lower():
                        similarity = SequenceMatcher(None, original_text.lower(), clean_text.lower()).ratio()
                        if similarity > 0.5:
                            subs_by_id[id_str]['text'] = clean_text
                            correction_count += 1

            self.log(f"✨ Fixes applied: {correction_count}")

        except Exception as e:
            self.log(f"CRITICAL: LLM Error: {e}")
            return

    def unload(self):
        if self.llm:
            del self.llm
            self.llm = None
            gc.collect()
