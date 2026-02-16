# A multi-stage Dockerfile for building and running the SubVision application.
# It packages the frontend, backend, ML models, and servers into a single image.

# ===================================================================
# STAGE 1: Build the React Frontend
# ===================================================================
FROM node:20-alpine as frontend-builder

# Set the working directory for the frontend build
WORKDIR /app_front

# Install dependencies first to leverage Docker's layer caching
COPY frontend/package*.json ./
RUN npm ci

# Copy the rest of the frontend source code
COPY frontend/ .

# Build the static frontend assets.
# The API URL is set to an empty string because in the final setup,
# Nginx will proxy API requests on the same domain, so no absolute URL is needed.
ENV VITE_API_URL=""
RUN npm run build

# ===================================================================
# STAGE 2: Final Production Image (GPU + Python + Nginx)
# ===================================================================
# Use an official NVIDIA CUDA runtime image to enable GPU support.
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Set environment variables for non-interactive setup and Python best practices
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 1. Install system dependencies: Python, Nginx, Supervisor, FFmpeg, and required CV libraries.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    nginx \
    supervisor \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libgeos-dev \
    wget \
    # Create a symlink so `python` command defaults to `python3.10`
    && ln -s /usr/bin/python3.10 /usr/bin/python \
    # Clean up apt cache to reduce image size
    && rm -rf /var/lib/apt/lists/*

# 2. Compatibility fix: Manually install libssl1.1, which is required by a dependency
#    (likely an older version of PaddlePaddle or its dependencies) but was removed in Ubuntu 22.04.
RUN wget http://nz.archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
    && dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb \
    && rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb

# Set the final working directory for the application
WORKDIR /app

# 3. Install the specific GPU-enabled version of PaddlePaddle required for CUDA 11.8.
RUN python -m pip install --no-cache-dir --upgrade pip && \
    python -m pip install --no-cache-dir paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/

# 4. Install Python application dependencies from requirements.txt.
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# 5. Copy all necessary application code, built frontend assets, and service configurations.
COPY backend/ ./backend
COPY --from=frontend-builder /app_front/dist ./frontend_dist
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# 6. Ensure the directory for file uploads exists.
RUN mkdir -p /app/backend/uploads

# Expose the public port that Nginx will serve.
EXPOSE 7860

# The main command to start the application.
# It runs Supervisor, which in turn manages starting and monitoring
# both the Nginx server and the Python (Uvicorn) backend.
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

