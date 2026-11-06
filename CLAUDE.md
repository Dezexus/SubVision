# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SubVision detects, extracts, and removes hardcoded subtitles from video: PaddleOCR for extraction, OpenCV for blur/inpaint rendering, and GigaAM for an optional per-cue emotion JSON export.

## Commands

Run backend commands from `backend/`. `StaticFiles(directory="uploads")` and `cache_dir` are relative to the working directory.

```bash
# Backend
pip install -r requirements.txt -r requirements-dev.txt
pytest -v                                   # no Redis or GPU needed
pytest tests/test_jobs_cancel.py::test_parse_client_id_from_job_id  # single test
ruff check subvision tests
ruff format subvision tests
uvicorn subvision.main:app --reload --port 8000
pip install -r requirements-worker.txt      # worker only, needs the GPU stack
arq subvision.worker.WorkerSettings

# Frontend (from frontend/)
npm run dev                                 # proxies /api and /ws to localhost:8000
npm test                                    # vitest
npx vitest run src/shared/lib/textGeometry.test.ts
npm run lint
npx tsc -b                                  # typecheck
npm run build

# Full stack (from repo root), served at http://localhost:7860
docker compose up --build
```

- Typecheck with `npx tsc -b`, not `tsc --noEmit`. The root `tsconfig.json` only holds project references, so `--noEmit` checks zero files, including in the pre-commit hook.
- Settings read `.env` from the working directory, so the repo-root `.env` is not loaded when running from `backend/`. Outside Docker, set `REDIS_URL=redis://localhost:6379/0`; the default host `redis` only resolves inside Compose.
- The first worker image build compiles OpenCV with CUDA (45–90 min). Avoid rebuilding it casually. Compose mounts `./backend` into both `api` and `worker`, so Python changes only need a container restart.
- GigaAM is only in the worker image when built with `INSTALL_EMOTION_DEPS=1`.
- Pinned deps: edit `requirements*.in` or `pyproject.toml`, and keep `requirements*.txt` in sync.

## Architecture

```
nginx:7860 → api (FastAPI) → Valkey/Redis ← worker (ARQ, GPU)
                    └── uploads/ shared volume ──┘
```

**Two runtimes, one package.** `subvision.main` (API) and `subvision.worker` (ARQ) share `backend/subvision/`, but the `api` image has no CUDA, Paddle, or torch. Anything the API imports must work on CPU, including `rendering/blur_preview.py`, which runs in the API process. Keep GPU-only imports in worker-side paths or inside functions. `core/gpu_utils.py` falls back to CPU when CUDA is unavailable.

**Packages.** `api/` holds routers and schemas, `core/` holds shared infrastructure, `domain/` holds pydantic models, `processing/` holds OCR and emotion, and `rendering/` holds blur/inpaint output. Pipelines depend only on the `Protocol`s in `processing/interfaces.py` and `rendering/interfaces.py`. The concrete `RedisEventBus`, `TaskReporter`, and `RedisCancellationToken` live in `worker.py`.

### Job lifecycle

This flow spans `api/routers/processing.py`, `core/jobs.py`, `worker.py`, and `frontend/src/hooks/useProcessingSocket.ts`.

1. A router enqueues a job with ID `{ocr|blur|emotion}_{client_id}_{8hex}`. This format is a contract: `parse_client_id_from_job_id`, `job_kind`, and the frontend's `bindActiveJobId` all parse it.
2. `_register_active_job` records the job and cancels the client's previous one, so each client has one active job. The worker runs `max_jobs = 1` because all jobs share one GPU.
3. Worker events go through Redis pub/sub on `ws_{client_id}`. The API relays them to `/ws/{client_id}`.
4. Events are also persisted for reconnects: `job_status:{job_id}` and `client_last_state:{client_id}`. Progress must never overwrite a terminal `finish`/`error` state.
5. The frontend recovers through `GET /api/session/status/{client_id}`, then calls `POST /api/session/ack` so a terminal state is delivered once.

Clears of `active_job` and acks of `client_last_state` are compare-and-delete Lua scripts in `core/jobs.py`, because a replaced job's late cleanup must not clobber its successor.

Cancellation sets the Redis key `job:{id}:cancel`, which the worker polls at most once per second through `RedisCancellationToken`. `TaskReporter` methods raise `TaskCancelledError`, so reporter calls are also cancellation points. The user-facing error string is exactly `"Task Cancelled"`.

To add a job kind, update `WorkerSettings.functions`, `job_kind`, and `bindActiveJobId`. To add a WebSocket event, also update `WebSocketMessage` in `frontend/src/types/index.ts`.

### Pipelines

- **OCR** (`processing/pipeline.py`): sample every `step` frames → crop ROI → skip unchanged frames by motion → denoise → Paddle → `SubtitleAggregator` → `edge_refine` re-OCRs around each boundary for frame-accurate timing. Every OCR call runs detection plus recognition: recognition alone on the full ROI misreads text at confidence above the threshold. Presets in `processing/presets.py` are keyed by emoji strings such as `"⚖️ Balance"`, which the frontend also uses as IDs.
- **Render** (`rendering/pipeline.py`): `RenderTaskConfig.build_effects()` picks `BlurEffect`, or `InpaintEffect` alone for `hybrid` mode. Do not stack them: `InpaintEffect` applies its own ring blur, and a full-ROI blur would smear the reconstructed background. Frames go through `AsyncVideoWriter` (NVENC with libx264 fallback), then `FFmpegTranscoder` muxes audio and restores aspect ratio. Paddle GPU memory is released before rendering.
- **Emotion** (`processing/emotion_export.py`): for each cue, extract audio → GigaAM → fuse with text sentiment (`emotion_fusion.py`) → write the JSON sidecar. Results are cached in Redis under `emotion:cache:*`. The JSON format is schema v3, and `merge_emotion_settings` upgrades older versions.

Emotion settings merge in the order env defaults < admin Redis patch < request (`core/config_merge.py`). The worker receives them already merged in the job payload. `/api/admin/*` requires `ADMIN_ENABLED` and the `X-Admin-Key` header.

GigaAM checkpoints need `weights_only=False` on torch 2.6+. See `core/ml_compat.py`, which `worker.py` applies before other imports, and `processing/gigaam_loader.py`.

### Frontend

React 19, Zustand, TanStack Query, Tailwind 4. `src/features/<domain>/` holds `components/`, `hooks/`, `queries/`, and `mutations/`, and `src/shared/` holds the API client, utilities, and UI. Stores in `src/store/` are split by domain; `processingStore` owns subtitles, undo/redo, and job state. `/admin` is a separate route rendered from `main.tsx`.

- UI strings go through i18n. `ru.ts` is typed as `TranslationDict` from `en.ts`, so add every key to both locales.
- API URLs are same-origin by default, through the Vite proxy in dev and nginx in Docker (`VITE_API_URL` overrides this).
- Vitest runs in the `node` environment and only picks up `src/**/*.test.ts`, so `.test.tsx` files will not run.
- New WebSocket paths outside `/ws/` and `/api/video/ws/stream/` need an nginx upgrade block. The 4 GB upload limit is set in both `nginx.conf` and `MAX_UPLOAD_SIZE`, so change them together.
