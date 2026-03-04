# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm install --silent
COPY frontend .
ENV VITE_API_URL=""
RUN npm run build


FROM python:3.10-slim AS api
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/usr/local/bin:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    tzdata \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt
COPY backend ./backend
COPY --from=frontend-builder /frontend/dist ./frontend_dist
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
RUN mkdir -p /app/backend/uploads
EXPOSE 7860
CMD ["/usr/bin/supervisord","-c","/etc/supervisor/conf.d/supervisord.conf"]


FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04 AS worker
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/usr/local/bin:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    wget \
    tzdata \
    && ln -s /usr/bin/python3.10 /usr/bin/python \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
 && dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
 && rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb
WORKDIR /app
COPY backend/requirements.txt .
COPY backend/requirements-worker.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --upgrade pip \
 && python -m pip install paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/ \
 && python -m pip install -r requirements.txt \
 && python -m pip install -r requirements-worker.txt
COPY backend ./backend
WORKDIR /app/backend
CMD ["arq", "worker.WorkerSettings"]
