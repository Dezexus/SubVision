# SubVision

Automated hardsub detection and blurring tool powered by **PaddleOCR** (GPU) and **OpenCV**.

## ⚡ Features
- **GPU OCR:** CUDA-accelerated text detection.
- **Smart Skip V5:** "Absolute Pixel Trigger" algorithm for precise, noise-resistant frame analysis.
- **H.264 Export:** Browser/Mobile compatible video rendering with audio merge.
- **Interactive UI:** React-based editor with real-time blur preview and timeline.
- **Dockerized:** Nginx + Uvicorn + Supervisor in a single container.

## 🛠 Stack
- **Backend:** Python 3.10, FastAPI, OpenCV, PaddlePaddle-GPU, FFmpeg.
- **Frontend:** React 19, Vite, TailwindCSS, Zustand.

## 🚀 Quick Start (Docker)
*Prerequisites: Docker Desktop + NVIDIA Drivers.*

```bash
git clone https://github.com/your-repo/SubVision.git
cd SubVision
docker-compose up --build
```
Open **[http://localhost:7860](http://localhost:7860)**.

## ⚙️ Manual Setup (Dev)

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
pip install paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install && npm run dev
```

## 🔧 Configuration
*   **GPU Memory:** Adjust `FLAGS_fraction_of_gpu_memory_to_use` in `docker-compose.yml` (default `0.9`). Reduce to `0.5` if OOM errors occur during render.
*   **Upload Limits:** Adjust `client_max_body_size` in `nginx.conf` for files > 2GB.

## 📖 Usage workflow
1.  **Upload** video (Drag & Drop).
2.  **Crop** the subtitle area (ROI) on the preview.
3.  Click **Start Processing** to scan for text.
4.  Review/Edit detected subtitles in the right panel.
5.  Switch to **Blur Mode**, adjust position, Sigma, and Feather.
6.  **Render** and Download the result.