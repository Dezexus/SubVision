FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm install --silent
COPY frontend .
ENV VITE_API_URL=""
RUN npm run build

FROM python:3.12-slim-bookworm AS api
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/usr/local/bin:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    tzdata \
    libdav1d6 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt
COPY backend ./backend
RUN mkdir -p /app/backend/uploads
EXPOSE 8000
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

FROM nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04 AS worker
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/usr/local/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends software-properties-common gpg-agent \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    python3.12 python3.12-dev python3.12-venv \
    gcc g++ patchelf ffmpeg libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 wget tzdata libdav1d5 \
    && ln -sf /usr/bin/python3.12 /usr/bin/python \
    && ln -sf /usr/bin/python3.12 /usr/bin/python3 \
    && wget https://bootstrap.pypa.io/get-pip.py && python3.12 get-pip.py \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
 && dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
 && rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb

WORKDIR /app
COPY backend/requirements.txt .
COPY backend/requirements-worker.txt .

RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --upgrade pip nuitka \
 && python -m pip install paddlepaddle-gpu==3.3.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu123/ \
 && python -m pip install -r requirements.txt \
 && python -m pip install -r requirements-worker.txt

COPY backend ./backend
WORKDIR /app/backend

RUN python -m nuitka --module --remove-output core/motion.py \
 && python -m nuitka --module --remove-output processing/aggregator.py

CMD ["arq", "worker.WorkerSettings"]

FROM nginx:alpine AS web
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /frontend/dist /app/frontend_dist
RUN mkdir -p /app/backend/uploads
EXPOSE 7860