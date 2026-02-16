# ⚡ SubVision

**Subtitle Extractor**

SubVision is a professional tool for extracting hardcoded subtitles from video files. It combines a high-performance OCR engine (PaddleOCR) with a modern web interface to generate frame-perfect `.srt` files.

## 🚀 Key Features

*   **High-Performance OCR**: Extract text directly from `.mp4`, `.mkv`, `.avi`, `.mov`, and other common video formats.
*   **Smart Processing Pipeline**:
    *   **Image Pre-processing**: Denoise, Sharpen, and CLAHE (Adaptive Contrast) filters for clear text recognition.
    *   **Smart Skip**: Intelligently skips static frames to boost processing speed significantly.
*   **Advanced Web UI**:
    *   Modern, dark-themed interface built with React.
    *   Precise frame-by-frame ROI (Region of Interest) selection.
    *   Real-time preview of how filters affect the image.
    *   Live subtitle editing and timeline visualization.
*   **GPU Accelerated**: Full CUDA support for the OCR pipeline.
*   **All-in-One Deployment**: Packaged with Docker for simple, one-command startup.

## 🛠️ Technology Stack

*   **Backend**: Python, **FastAPI**, Uvicorn
*   **Frontend**: **React**, TypeScript, Vite
*   **OCR Engine**: PaddleOCR
*   **Computer Vision**: OpenCV
*   **Web Server**: Nginx
*   **Containerization**: Docker & Docker Compose

## 📦 Installation & Run

**Prerequisites:**
*   Docker & Docker Compose installed.
*   NVIDIA Drivers installed on the host machine (for GPU acceleration).

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Dezexus/subvision.git
    cd subvision
    ```

2.  **Start with Docker Compose:**
    ```bash
    docker-compose up --build
    ```
    *The first run will take some time to download the base Docker image and AI models.*

3.  **Open the Interface:**
    Navigate to `http://localhost:7860` in your browser.

## 📖 How to Use

1.  **Upload Video**: Drag and drop your video file onto the main screen.
2.  **Select Region**: Use the frame slider to find a subtitle, then draw a box around the text area. You'll see a live preview of what the OCR engine will "see".
3.  **Choose a Preset**:
    *   ⚖️ **Balance**: The recommended default for most movies and TV shows.
    *   🏎️ **Speed**: A faster option for quick drafts or very clean video.
    *   🎯 **Quality**: Slower, frame-by-frame analysis for perfect timing.
4.  **Start Processing**: Click the "Start Processing" button.
5.  **Edit & Download**: Review the generated subtitles in the results panel, make any necessary edits, and download the final `.srt` file.

## ⚙️ Advanced Configuration

All settings can be adjusted in the "Fine Tuning" section of the settings panel:

*   **Min Confidence**: The minimum OCR confidence score required to accept a piece of text.
*   **Scan Step**: How many frames to skip between OCR scans (e.g., a step of `2` analyzes every other frame). Lower is slower but more accurate.
*   **Contrast Boost (CLAHE)**: Helps make text more readable on complex backgrounds.
*   **Upscale**: Increases the resolution of the cropped text area before OCR, which can improve accuracy on small text.

---
*Powered by open-source technologies.*
