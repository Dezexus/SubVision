# --- Сборка Frontend (React) ---
FROM node:20-alpine as frontend-builder

WORKDIR /app_front
COPY frontend/package*.json ./
RUN npm install --silent
COPY frontend/ .
ENV VITE_API_URL=""
RUN npm run build

# --- Сборка Production образа (GPU + Python) ---
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 1. Установка системных зависимостей (Python, Nginx, FFmpeg) и чистка кэша
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    nginx \
    supervisor \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    wget \
    && ln -s /usr/bin/python3.10 /usr/bin/python \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. Установка libssl1.1 (требуется для PaddlePaddle)
RUN wget http://nz.archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
    && dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
    && rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb

WORKDIR /app

# 3. Установка PaddlePaddle GPU (самый тяжелый слой)
RUN python -m pip install --no-cache-dir --upgrade pip && \
    python -m pip install --no-cache-dir paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/

# 4. Установка зависимостей Python
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# 5. Копирование кода бэкенда и сборки фронтенда
COPY backend/ ./backend
COPY --from=frontend-builder /app_front/dist ./frontend_dist
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN mkdir -p /app/backend/uploads

EXPOSE 7860

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
