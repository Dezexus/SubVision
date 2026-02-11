@echo off
TITLE SubVision Launcher

echo ==================================================
echo 🚀 Starting SubVision System...
echo ==================================================

:: 1. Запуск Backend
echo.
echo [1/2] Launching Backend (FastAPI)...
start "SubVision Backend" cmd /k "cd backend && call venv\Scripts\activate && set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True && uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 7860"

:: 2. Запуск Frontend
echo.
echo [2/2] Launching Frontend (React/Vite)...
start "SubVision Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ==================================================
echo ✅ System Started!
echo --------------------------------------------------
echo Frontend UI: http://localhost:5173
echo Backend API: http://localhost:7860/docs
echo ==================================================
echo.
echo Press any key to close this launcher window...
pause >nul
