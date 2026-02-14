# ==========================================
# Stage 1: Build Frontend (Node.js)
# ==========================================
FROM node:20-alpine as frontend-builder

WORKDIR /app_front
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source code
COPY frontend/ .
# API URL is empty because Nginx proxies requests on the same domain
ENV VITE_API_URL=""
RUN npm run build

# ==========================================
# Stage 2: Final Image (GPU + Python + Nginx)
# ==========================================
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 1. Install System Dependencies + Nginx + Supervisor
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    nginx \
    supervisor \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libgeos-dev \
    wget \
    && ln -s /usr/bin/python3.10 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# 2. Fix LibSSL 1.1 (Ubuntu 22.04 Compatibility)
RUN wget http://nz.archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
    && dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
    && rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb

WORKDIR /app

# 3. Install PaddlePaddle GPU (Stable 2.6.1 for CUDA 11.8)
RUN python -m pip install --no-cache-dir --upgrade pip && \
    python -m pip install --no-cache-dir paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/

# 4. Install Python Dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# 5. Copy Application Code & Configs
COPY backend/ ./backend
COPY --from=frontend-builder /app_front/dist ./frontend_dist
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Ensure upload directory exists and is writable
RUN mkdir -p /app/backend/uploads && chmod 777 /app/backend/uploads

# Expose the Nginx port
EXPOSE 7860

# Start Supervisor (Orchestrates Nginx & Python)
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
