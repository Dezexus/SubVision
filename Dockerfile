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
CMD ["uvicorn", "subvision.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

FROM nvidia/cuda:12.6.2-cudnn-devel-ubuntu22.04 AS opencv-cuda-builder
ARG CUDA_ARCH_BIN=7.5
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends software-properties-common gpg-agent \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    wget unzip cmake build-essential pkg-config \
    python3.12 python3.12-dev \
    libavcodec-dev libavformat-dev libswscale-dev \
    libgstreamer-plugins-base1.0-dev libgstreamer1.0-dev libpng-dev libjpeg-dev \
    && ln -sf /usr/bin/python3.12 /usr/bin/python3 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /opencv-src
RUN wget -q -O opencv.zip https://github.com/opencv/opencv/archive/4.10.0.zip \
 && wget -q -O opencv_contrib.zip https://github.com/opencv/opencv_contrib/archive/4.10.0.zip \
 && unzip -q opencv.zip && unzip -q opencv_contrib.zip

WORKDIR /opencv-src/build
RUN cmake -D CMAKE_BUILD_TYPE=RELEASE \
          -D CMAKE_INSTALL_PREFIX=/usr/local \
          -D OPENCV_EXTRA_MODULES_PATH=/opencv-src/opencv_contrib-4.10.0/modules \
          -D WITH_CUDA=ON \
          -D CUDA_ARCH_BIN=${CUDA_ARCH_BIN} \
          -D WITH_CUDNN=ON \
          -D OPENCV_DNN_CUDA=ON \
          -D BUILD_opencv_python3=ON \
          -D PYTHON3_EXECUTABLE=/usr/bin/python3.12 \
          /opencv-src/opencv-4.10.0 \
 && make -j6 \
 && make install \
 && ldconfig

FROM nvidia/cuda:12.6.2-cudnn-devel-ubuntu22.04 AS worker
ARG CUDA_ARCH_BIN=7.5
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/usr/local/bin:$PATH"

COPY --from=opencv-cuda-builder /usr/local /usr/local

RUN apt-get update && apt-get install -y --no-install-recommends software-properties-common gpg-agent \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    python3.12 python3.12-dev python3.12-venv \
    gcc g++ patchelf ffmpeg libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 wget git tzdata libdav1d5 \
    && ln -sf /usr/bin/python3.12 /usr/bin/python \
    && ln -sf /usr/bin/python3.12 /usr/bin/python3 \
    && wget -q https://bootstrap.pypa.io/get-pip.py && python3.12 get-pip.py \
    && ldconfig \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
COPY backend/requirements-worker.txt .

RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --upgrade pip \
 && python -m pip install paddlepaddle-gpu==3.3.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/ \
 && python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126 \
 && python -m pip install -r requirements.txt \
 && python -m pip install -r requirements-worker.txt

COPY backend ./backend
RUN git clone --depth 1 https://github.com/sczhou/ProPainter.git /app/backend/third_party/ProPainter || true
ENV PYTHONPATH="/app/backend/third_party/ProPainter"
RUN python /app/backend/scripts/download_propainter_weights.py || true
WORKDIR /app/backend

CMD ["arq", "subvision.worker.WorkerSettings"]

FROM nginx:alpine AS web
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /frontend/dist /app/frontend_dist
RUN mkdir -p /app/backend/uploads
EXPOSE 7860
