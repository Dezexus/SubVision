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


class GemmaBatchFixer:
    """
    Class for batch correction of subtitles using the Gemma model.
    """

    def __init__(self, log_func):
        self.log = log_func
        self.model_path = None
        self.llm = None

    def load_model(self):
        """
        Loads the Gemma GGUF model from Hugging Face Hub.
        """
        if not HAS_LLM:
            self.log("❌ Llama-cpp not installed. AI unavailable.")
            return False

        repo_id = "bartowski/google_gemma-3-4b-it-GGUF"
        filename = "google_gemma-3-4b-it-Q4_K_M.gguf"
        self.log(f"Loading AI model: {filename}...")

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

    def fix_all_in_one_go(self, all_subtitles, lang='en'):
        """
        Corrects a list of subtitles in a single LLM query.
        """
        if not self.llm or not all_subtitles:
            return

        self.log("🤖 Forming single LLM request...")
        lines_block = "\\n".join([f"{item['id']}. {item['text']}" for item in all_subtitles])
        lang_map = {
            'ru': 'Russian',
            'en': 'English',
            'de': 'German',
            'fr': 'French',
            'japan': 'Japanese',
            'ch': 'Chinese'
        }
        target_lang = lang_map.get(lang, 'the target language')

        prompt = (
            f"<start_of_turn>user\\n"
            f"You are a professional subtitle editor. Your task is to carefully read the entire subtitle text provided below and correct any grammatical, punctuation, or spelling errors.\\n\\n"
            f"KEY RULES:\\n"
            f"1. Preserve fictional names and terms (e.g., 'Exostrider') if they appear consistently. They are not mistakes.\\n"
            f"2. Do not rephrase sentences. Only fix clear errors.\\n"
            f"3. Preserve original punctuation.\\n"
            f"4. The input is a numbered list. Your output must be a numbered list matching the original line numbers.\\n"
            f"5. IMPORTANT: Only include lines that you have corrected in your output. If a line is perfect, do not include it.\\n\\n"
            f"Here is the full subtitle text for correction in {target_lang}:\\n"
            f"---\\n"
            f"{lines_block}\\n"
            f"---\\n\\n"
            f"OUTPUT (Corrected lines only, as a numbered list):<end_of_turn>\\n"
            f"<start_of_turn>model\\n"
        )

        try:
            self.log("🧠 Sending text to AI...")
            output = self.llm(prompt, max_tokens=2048, stop=["<end_of_turn>"], echo=False, temperature=0.1)
            raw_response = output['choices'][0]['text'].strip()
            fixed_lines = raw_response.split('\\n')

            self.log("✅ AI processing complete. Applying fixes...")
            pattern = re.compile(r'^(\\d+)[\\.\\)]\\s*(.*)')
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
                    if original_text.strip().lower() != clean_text.strip().lower():
                        similarity = SequenceMatcher(None, original_text.lower(), clean_text.lower()).ratio()
                        if similarity > 0.5:
                            subs_by_id[id_str]['text'] = clean_text
                            correction_count += 1
                        else:
                            self.log(f"⚠️ LLM suggestion too different for #{id_str}, ignored.")

            self.log(f"✨ Fixes applied: {correction_count}")

        except Exception as e:
            self.log(f"CRITICAL: LLM Error: {e}")
            return

    def unload(self):
        """
        Unloads model from memory and clears VRAM.
        """
        if self.llm:
            del self.llm
            self.llm = None
            gc.collect()
