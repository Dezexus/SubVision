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

FROM nvidia/cuda:12.9.1-cudnn-devel-ubuntu22.04 AS opencv-cuda-builder
ARG CUDA_ARCH_BIN=12.0
# Parallel compile jobs. Each needs ~1-1.5 GB RAM; the single cv2 bindings file needs ~4 GB.
ARG OPENCV_BUILD_JOBS=8
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends software-properties-common gpg-agent \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    wget unzip cmake build-essential pkg-config ccache \
    python3.12 python3.12-dev \
    libavcodec-dev libavformat-dev libswscale-dev \
    libgstreamer-plugins-base1.0-dev libgstreamer1.0-dev libpng-dev libjpeg-dev \
    && ln -sf /usr/bin/python3.12 /usr/bin/python3 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Without numpy, CMake silently skips the cv2 Python bindings.
RUN wget -q https://bootstrap.pypa.io/get-pip.py && python3.12 get-pip.py && rm get-pip.py \
    && python3.12 -m pip install --no-cache-dir numpy==2.2.1

WORKDIR /opencv-src
RUN wget -q -O opencv.zip https://github.com/opencv/opencv/archive/4.12.0.zip \
 && wget -q -O opencv_contrib.zip https://github.com/opencv/opencv_contrib/archive/4.12.0.zip \
 && unzip -q opencv.zip && unzip -q opencv_contrib.zip

WORKDIR /opencv-src/build
# Build only the modules SubVision and PaddleX use (checked with grep over
# subvision/ and site-packages). Everything else, DNN with CUDA above all, was
# most of the compile time. Add a module here before calling a new cv2 API.
# ccache keeps host-compiled objects across cmake changes (nvcc objects are not cached).
RUN --mount=type=cache,target=/root/.ccache \
    cmake -D CMAKE_BUILD_TYPE=RELEASE \
          -D CMAKE_INSTALL_PREFIX=/usr/local \
          -D OPENCV_EXTRA_MODULES_PATH=/opencv-src/opencv_contrib-4.12.0/modules \
          -D WITH_CUDA=ON \
          -D CUDA_ARCH_BIN=${CUDA_ARCH_BIN} \
          -D CUDA_ARCH_PTX=${CUDA_ARCH_BIN} \
          -D WITH_CUDNN=OFF \
          -D OPENCV_DNN_CUDA=OFF \
          -D BUILD_LIST=core,imgproc,imgcodecs,videoio,photo,cudev,cudaarithm,cudaimgproc,cudafilters,python3 \
          -D ENABLE_CCACHE=ON \
          -D BUILD_opencv_python3=ON \
          -D PYTHON3_EXECUTABLE=/usr/bin/python3.12 \
          -D PYTHON3_PACKAGES_PATH=/opt/opencv-python \
          -D BUILD_TESTS=OFF \
          -D BUILD_PERF_TESTS=OFF \
          -D BUILD_EXAMPLES=OFF \
          /opencv-src/opencv-4.12.0 \
 && make -j${OPENCV_BUILD_JOBS} \
 && make install \
 && ldconfig \
 && test -d /opt/opencv-python/cv2

# Only the OpenCV libs go to the worker: the builder's /usr/local also holds its
# own pip and numpy, which would clobber the worker's packages.
RUN mkdir -p /opt/opencv-libs && cp -a /usr/local/lib/libopencv_* /opt/opencv-libs/

FROM nvidia/cuda:12.9.1-cudnn-devel-ubuntu22.04 AS worker
ARG CUDA_ARCH_BIN=12.0
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
    && wget -q https://bootstrap.pypa.io/get-pip.py && python3.12 get-pip.py \
    && ldconfig \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Paddle is a separate layer ahead of the requirements COPY: it is the largest
# download and its index is flaky, so a requirements edit does not refetch it.
# Paddle comes straight from its wheel storage: the paddlepaddle.org.cn index
# in front of it goes down (502) while the files stay reachable.
ENV PIP_DEFAULT_TIMEOUT=120 PIP_RETRIES=10
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --upgrade pip \
 && python -m pip install "paddlepaddle-gpu @ https://paddle-whl.bj.bcebos.com/stable/cu129/paddlepaddle-gpu/paddlepaddle_gpu-3.3.0-cp312-cp312-linux_x86_64.whl"
COPY backend/requirements.txt .
COPY backend/requirements-worker.txt .

# Fail the build if a dependency drags the nvidia-*-cu12 libs back to an older
# CUDA without Blackwell (sm_120) kernels. Without torch these libs may be
# absent, which is fine.
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install -r requirements.txt \
 && python -m pip install -r requirements-worker.txt \
 && python -c "import importlib.metadata as m; \
names = {d.metadata['Name'] for d in m.distributions()}; \
cublas = m.version('nvidia-cublas-cu12') if 'nvidia-cublas-cu12' in names else None; \
assert cublas is None or cublas.startswith('12.9'), 'CUDA libs downgraded: cublas ' + str(cublas); \
print('cublas', cublas)"

# The pip OpenCV wheels (CPU-only, needed by the api image) overwrite cv2/ and
# shadow the CUDA build. Replace their files with the bindings built above, but
# keep the opencv-contrib-python metadata: PaddleX checks for that distribution
# via importlib.metadata and disables OCR result handling without it.
# The CUDA build links GStreamer (its dev packages are in the builder), so the
# runtime libs are installed here.
# OpenCV is copied this late so that rebuilding it keeps the Paddle and
# requirements layers above cached.
COPY --from=opencv-cuda-builder /opt/opencv-libs /usr/local/lib
COPY --from=opencv-cuda-builder /opt/opencv-python /opt/opencv-python
RUN apt-get update && apt-get install -y --no-install-recommends libgstreamer-plugins-base1.0-0 \
 && apt-get clean && rm -rf /var/lib/apt/lists/* \
 && ldconfig \
 && python -m pip uninstall -y opencv-python opencv-python-headless opencv-contrib-python-headless \
 && python -m pip install --no-deps opencv-contrib-python==4.10.0.84 \
 && rm -rf /usr/local/lib/python3.12/dist-packages/cv2 /usr/local/lib/python3.12/dist-packages/opencv_contrib_python.libs \
 && cp -a /opt/opencv-python/cv2 /usr/local/lib/python3.12/dist-packages/cv2 \
 && python -c "import cv2, re; assert re.search(r'NVIDIA CUDA:\s+YES', cv2.getBuildInformation()), 'cv2 built without CUDA'; [getattr(cv2.cuda, f) for f in ('cvtColor', 'createGaussianFilter', 'createBoxFilter', 'absdiff', 'calcSum', 'merge', 'fastNlMeansDenoisingColored')]; [getattr(cv2, f) for f in ('inpaint', 'imencode', 'fastNlMeansDenoisingColored', 'VideoCapture')]; print('cv2', cv2.__version__, cv2.__file__)"

# Refresh CA roots late in the build so earlier heavy layers stay cached.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY backend ./backend
WORKDIR /app/backend

CMD ["arq", "subvision.worker.WorkerSettings"]

FROM nginx:alpine AS web
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /frontend/dist /app/frontend_dist
RUN mkdir -p /app/backend/uploads
EXPOSE 7860
