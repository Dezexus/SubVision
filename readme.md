# ⚡ SubVision

**AI-Powered Video OCR & Subtitle Extractor**

SubVision is a professional tool for extracting hardcoded subtitles from video files. It combines high-performance OCR (PaddleOCR) with advanced computer vision algorithms and LLM-based post-processing (Google Gemma) to generate frame-perfect `.srt` files.

## 🚀 Key Features

*   **Video OCR**: Extract text directly from `.mp4`, `.mkv`, `.avi`, `.mov`.
*   **Smart Pipeline**:
    *   **Denoise & Sharpen**: Pre-processing filters for clear text.
    *   **CLAHE**: Adaptive contrast for difficult backgrounds.
    *   **Smart Skip**: Skips static frames to boost speed by 300%.
    *   **Visual Cutoff**: Instantly detects subtitle disappearance.
*   **AI Correction (Gemma)**: Automatically fixes spelling and grammar errors.
*   **Advanced UI**: Dark mode, frame-by-frame ROI selection, real-time preview.
*   **GPU Accelerated**: Full CUDA support for OCR and LLM inference.

## 🛠️ Technology Stack

*   **OCR**: PaddleOCR (v2.9+)
*   **LLM**: Google Gemma 4B (via `llama-cpp-python`)
*   **Vision**: OpenCV (NumPy processing)
*   **UI**: Gradio 4
*   **Container**: Docker & Docker Compose

## 📦 Installation & Run

**Prerequisites:**
*   Docker & Docker Compose installed.
*   NVIDIA Drivers (for GPU acceleration).

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/subvision.git
    cd subvision
    ```

2.  **Start with Docker:**
    ```bash
    docker-compose up --build
    ```
    *First run will take time to download AI models.*

3.  **Open Interface:**
    Go to `http://localhost:7860` in your browser.

## 📖 How to Use

1.  **Upload Video**: Drag & drop your file.
2.  **Select Region**: Use the slider to find a subtitle frame, then draw a box around the text area.
3.  **Choose Preset**:
    *   ⚖️ **Balance**: Best for movies (recommended).
    *   🏎️ **Speed**: Fast draft extraction.
    *   🎯 **Quality**: Frame-perfect timing (slow).
4.  **Start**: Click "Start Processing".
5.  **Download**: Get your `.srt` file when done.

## ⚙️ Advanced Configuration

*   **AI Editing**: Enable to fix grammar. You can customize the prompt or use your own GGUF model in "Advanced Config".
*   **Scan Step**: How many frames to skip (lower = better timing, higher = faster).
*   **Min Accuracy**: Confidence threshold to accept text.

---
*Powered by open-source technologies.*
