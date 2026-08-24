# SubVision Backend

Локальный бэкенд для распознавания и размытия вшитых субтитров.

## System Requirements (Docker)

| Компонент | Минимум |
|-----------|---------|
| GPU | NVIDIA с compute capability **7.5+** (RTX 2060 и новее) |
| VRAM | **6 GB** (рекомендуется запас для LaMa-режима) |
| RAM | **16 GB** |
| CPU | 6 ядер (сборка OpenCV использует `-j6`) |
| Driver | NVIDIA **≥ 550** + [Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) |
| Disk | ~15 GB под Docker-образы и модели Paddle |

### RTX 2060 (6 GB) — рекомендуемые настройки

Скопируйте [`.env.example`](../.env.example) в `.env`:

```env
PADDLE_GPU_MEMORY_FRACTION=0.35
SHM_SIZE=2gb
USE_NVDEC=true
MAX_UPLOAD_SIZE=4294967296
CUDA_ARCH_BIN=7.5
```

- Лимит загрузки видео: **4 GB** (nginx + backend синхронизированы)
- Первая сборка worker: **45–90 мин** (OpenCV CUDA); повторные сборки быстрее за счёт BuildKit cache
- При OOM в LaMa-режиме: уменьшите `PADDLE_GPU_MEMORY_FRACTION` до `0.30` или увеличьте `SHM_SIZE=3gb`

## Архитектура

```
nginx:7860 → api (FastAPI) → Valkey/Redis
                ↓ enqueue
             worker (ARQ + PaddleOCR + OpenCV CUDA + ONNX LaMa)
                ↓
           uploads/ (shared volume)
```

Пакет Python: `subvision` (`backend/subvision/`).

## Запуск (Docker Compose)

```bash
cp .env.example .env
docker compose up --build
```

## Разработка

```bash
cd backend
python -m venv venv
pip install -r requirements.txt -r requirements-dev.txt
uvicorn subvision.main:app --reload --port 8000

# отдельный терминал — worker (нужен GPU-стек)
pip install -r requirements-worker.txt
arq subvision.worker.WorkerSettings
```

### Тесты

```bash
cd backend
pytest -v
```

### Линтинг

```bash
cd backend
ruff check subvision tests
ruff format subvision tests
```

## Конфигурация

| Переменная | Default | Описание |
|------------|---------|----------|
| `REDIS_URL` | `redis://redis:6379/0` | Valkey/Redis |
| `LOG_LEVEL` | `INFO` | Уровень логов |
| `MAX_UPLOAD_SIZE` | 4 GB | Лимит размера файла |
| `PADDLE_GPU_MEMORY_FRACTION` | `0.35` | Доля VRAM для Paddle |
| `USE_NVDEC` | `true` | Hardware decode через CUDA (fallback CPU) |
| `SHM_SIZE` | `2gb` | Shared memory worker-контейнера |
| `CUDA_ARCH_BIN` | `7.5` | Архитектура GPU при сборке OpenCV |

## Зависимости

- **API**: FastAPI, PyAV, OpenCV headless (CPU), ONNX Runtime CPU
- **Worker**: PaddlePaddle GPU 3.3 (cu126), PaddleOCR, OpenCV CUDA (сборка), ONNX Runtime GPU

Версии закреплены в `requirements.txt` / `requirements-worker.txt`. Исходники для пересборки — `requirements.in`.
