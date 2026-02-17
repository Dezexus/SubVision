# syntax=docker/dockerfile:1.7

############################
# FRONTEND BUILD STAGE
############################
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# копируем только зависимости (максимальный cache hit)
COPY frontend/package.json frontend/package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --silent

# копируем исходники
COPY frontend .

ENV VITE_API_URL=""

RUN npm run build


############################
# PYTHON BASE STAGE (HEAVY LAYERS)
############################
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04 AS python-base

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Установка системных зависимостей
# Добавлены библиотеки для стабильной работы OpenCV (libsm6, libxext6)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    wget \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && ln -s /usr/bin/python3.10 /usr/bin/python \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# libssl1.1 required for paddle
# Используем надежное зеркало security.ubuntu.com вместо nz.archive
RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
 && dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
 && rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb

WORKDIR /install

# копируем только requirements
COPY backend/requirements.txt .

# install dependencies with cache mount
# Версия Paddle оставлена 3.2.0 по требованию
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip \
 && pip install paddlepaddle-gpu==3.2.0 \
    -i https://www.paddlepaddle.org.cn/packages/stable/cu118/ \
 && pip install -r requirements.txt


############################
# FINAL STAGE
############################
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    nginx \
    supervisor \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    wget \
    && ln -s /usr/bin/python3.10 /usr/bin/python \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# libssl again (runtime dependency)
RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
 && dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
 && rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb

WORKDIR /app

# копируем python packages из python-base
COPY --from=python-base /usr/local/lib/python3.10/dist-packages /usr/local/lib/python3.10/dist-packages
COPY --from=python-base /usr/local/bin /usr/local/bin

# копируем backend
COPY backend ./backend

# копируем frontend build
COPY --from=frontend-builder /frontend/dist ./frontend_dist

# configs
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN mkdir -p /app/backend/uploads

EXPOSE 7860

CMD ["/usr/bin/supervisord","-c","/etc/supervisor/conf.d/supervisord.conf"]
