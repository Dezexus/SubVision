# =========================================================================
# ЭТАП 1: Builder (Сборка и компиляция зависимостей)
#
# На этом этапе устанавливаются все необходимые инструменты для сборки
# и компилируются "тяжелые" Python-библиотеки, такие как PaddlePaddle
# и llama-cpp-python с поддержкой CUDA. Это позволяет уменьшить
# размер финального образа, исключив из него сборочные зависимости.
# =========================================================================
FROM nvidia/cuda:12.1.1-devel-ubuntu22.04 AS builder

# Установка переменных окружения для автоматизации сборки.
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Включает сборку GGML с поддержкой CUDA.
    CMAKE_ARGS="-DGGML_CUDA=on" \
    # Принудительно использует CMake для сборки, что необходимо для llama-cpp-python.
    FORCE_CMAKE=1

# Установка системных зависимостей, необходимых для компиляции Python-пакетов.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip python3-dev python3-venv \
    git build-essential cmake wget ccache \
    && rm -rf /var/lib/apt/lists/*

# Создание и активация виртуального окружения для изоляции зависимостей.
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Обновление pip и установка базовых сборочных утилит.
RUN pip install --no-cache-dir --upgrade pip setuptools wheel cmake scikit-build-core

# Установка OpenCV без графического интерфейса (headless).
RUN pip install --no-cache-dir opencv-python-headless

# Установка PaddlePaddle с поддержкой GPU (CUDA 11.8).
RUN pip install --no-cache-dir paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/

# Установка PaddleOCR со всеми дополнительными компонентами.
RUN pip install --no-cache-dir "paddleocr[all]"

# Установка llama-cpp-python, которая будет скомпилирована с поддержкой CUDA
# благодаря ранее установленным переменным окружения.
RUN pip install --no-cache-dir llama-cpp-python

# Установка остальных, "легких" зависимостей из файла requirements.txt.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# =========================================================================
# ЭТАП 2: Runtime (Создание финального образа для запуска)
#
# На этом этапе создается легковесный образ, содержащий только
# необходимые для запуска приложения файлы и скомпилированные
# зависимости из этапа "builder".
# =========================================================================
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

# Установка переменных окружения для работы приложения.
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    # Путь для кэширования моделей Hugging Face.
    HF_HOME="/app/hf_cache" \
    PATH="/opt/venv/bin:$PATH"

# Установка минимально необходимых системных библиотек для работы OpenCV и других пакетов.
# libgl1-mesa-glx и libglib2.0-0 необходимы для корректной работы OpenCV в контейнере.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 libgomp1 ccache libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копирование виртуального окружения со скомпилированными зависимостями из образа "builder".
COPY --from=builder /opt/venv /opt/venv

# Очистка кэша и временных файлов для уменьшения размера образа.
RUN find /opt/venv -name "*.pyc" -delete && \
    find /opt/venv -name "__pycache__" -delete

# Создание директорий для кэша моделей и создание символической ссылки
# для PaddleOCR, чтобы кэш сохранялся в определенном месте.
RUN mkdir -p /app/hf_cache /app/paddle_cache && \
    ln -sf /app/paddle_cache /root/.paddleocr

# Создание томов для сохранения кэша моделей между перезапусками контейнера.
VOLUME ["/app/hf_cache", "/app/paddle_cache"]

# Копирование кода приложения в рабочую директорию.
COPY . .

# Открытие порта, на котором будет работать Gradio-интерфейс.
EXPOSE 7860

# Команда для запуска приложения при старте контейнера.
CMD ["python3", "main.py"]
