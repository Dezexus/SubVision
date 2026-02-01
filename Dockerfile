# =========================================================================
# ЭТАП 1: Builder
# =========================================================================
FROM nvidia/cuda:11.8.0-cudnn8-devel-ubuntu22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CMAKE_ARGS="-DGGML_CUDA=on" \
    FORCE_CMAKE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip python3-dev python3-venv \
    git build-essential cmake wget ccache \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir --upgrade pip setuptools wheel cmake scikit-build-core
RUN pip install --no-cache-dir opencv-python-headless

RUN pip install --no-cache-dir paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/
RUN pip install --no-cache-dir "paddleocr>=2.9.1"
RUN pip install --no-cache-dir llama-cpp-python

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# =========================================================================
# ЭТАП 2: Runtime
# =========================================================================
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME="/app/hf_cache" \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 libgomp1 ccache libgl1-mesa-glx libglib2.0-0 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv

RUN find /opt/venv -name "*.pyc" -delete && \
    find /opt/venv -name "__pycache__" -delete

RUN mkdir -p /app/hf_cache /app/paddle_cache && \
    ln -sf /app/paddle_cache /root/.paddleocr

VOLUME ["/app/hf_cache", "/app/paddle_cache"]

COPY . .

EXPOSE 7860

CMD ["python3", "main.py"]
