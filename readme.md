# SubVision

Detect, extract, and blur hardcoded subtitles using **PaddleOCR** and **OpenCV**.

![SubVision Interface](docs/screenshot_editor.png)

## Features

- **GPU-accelerated OCR** – PaddleOCR with smart frame skipping and multi-language support.
- **Smart blur & inpaint** – Hybrid mode restores background texture inside the text area, then applies smooth blur around it.
- **Real-time preview** – See blur/inpaint results instantly while adjusting parameters.
- **Modular architecture** – Independent OCR and rendering pipelines, domain stores on the frontend.
- **Live progress** – WebSocket updates during processing and rendering.

## Quick Start (Docker)

```bash
git clone https://github.com/Dezexus/SubVision.git
cd SubVision
docker-compose up --build
```
Open http://localhost:7860.

## Manual Setup (Development)

### 1. Redis
```bash
docker run -p 6379:6379 -d redis:7-alpine
```

### 2. API
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Worker
```bash
cd backend
source venv/bin/activate
pip install -r requirements-worker.txt
python -m arq worker.WorkerSettings
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```

## Usage

1. Upload a video.
2. Draw a bounding box around the subtitle area.
3. Configure OCR language, preset, and confidence threshold → **Start Processing**.
4. Edit or merge detected subtitles in the right panel.
5. Switch to **Blur Mode**, adjust bounding box, padding, sigma, feather → **Start Render**.
6. Download the rendered video.