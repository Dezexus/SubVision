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
    Класс для пакетного исправления субтитров с помощью модели Gemma.
    """
    def __init__(self, log_func):
        """
        Инициализирует фиксер.

        Args:
            log_func (callable): Функция для логирования сообщений.
        """
        self.log = log_func
        self.model_path = None
        self.llm = None

    def load_model(self):
        """
        Загружает GGUF-модель Gemma из Hugging Face Hub.

        Returns:
            bool: True в случае успеха, иначе False.
        """
        if not HAS_LLM:
            self.log("❌ Llama-cpp не установлена. ИИ недоступен.")
            return False
        
        repo_id = "bartowski/google_gemma-3-4b-it-GGUF"
        filename = "google_gemma-3-4b-it-Q4_K_M.gguf"
        self.log(f"Загрузка AI модели: {filename}...")
        
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
            self.log(f"❌ Ошибка загрузки LLM: {e}")
            return False

    def fix_all_in_one_go(self, all_subtitles, lang='en'):
        """
        Исправляет список субтитров одним запросом к LLM.

        Args:
            all_subtitles (list): Список словарей с субтитрами.
            lang (str): Язык субтитров (например, 'en', 'ru').
        """
        if not self.llm or not all_subtitles:
            return

        self.log("🤖 Формирую единый запрос для LLM со всем текстом...")
        lines_block = "\\n".join([f"{item['id']}. {item['text']}" for item in all_subtitles])
        lang_map = {'ru': 'Russian', 'en': 'English', 'de': 'German', 'fr': 'French'}
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
            self.log("🧠 Отправляю текст нейросети... (Это может занять время)")
            output = self.llm(prompt, max_tokens=2048, stop=["<end_of_turn>"], echo=False, temperature=0.1)
            raw_response = output['choices'][0]['text'].strip()
            fixed_lines = raw_response.split('\\n')
            
            self.log("✅ Нейросеть завершила обработку. Применяю исправления...")
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
                            self.log(f"⚠️ LLM предложила слишком непохожее исправление для строки #{id_str}, игнорирую.")
            
            self.log(f"✨ Применено исправлений: {correction_count}")

        except Exception as e:
            self.log(f"CRITICAL: Ошибка при работе с LLM: {e}")
            return

    def unload(self):
        """
        Выгружает модель из памяти и очищает VRAM.
        """
        if self.llm:
            del self.llm
            self.llm = None
            gc.collect()

