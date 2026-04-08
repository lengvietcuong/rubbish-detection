# Roadside Rubbish Detector

Detects and classifies dumped roadside rubbish in images using a two-stage deep learning pipeline: a binary YOLO detector followed by an EfficientNetV2 classifier.

## Project Structure

```
├── backend/          # FastAPI inference server
├── frontend/         # Next.js web application
├── multiclass_detection/           # Notebook: Pipeline A training
├── binary_detection_and_classifier/  # Notebook: Pipeline B training
├── auto_label_v0.ipynb  # Initial auto-labelling (YOLOv8-X + Grounding DINO)
├── auto_label_v1.ipynb  # Self-training auto-labelling
└── detection_viewer.py  # Web tool for reviewing and correcting labels
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- NVIDIA GPU (CUDA required for inference)
- A `.env` file in the project root with your Supabase credentials

## Running the Backend

Place model weights in `backend/models/`:
- `yolo11m_binary.pt`
- `effnetv2_m.pt`

Then run the deployment script from the `backend/` directory:

```bash
bash deploy.sh
```

The API will be available at `http://localhost:8731`. Logs are written to `backend/backend.log`.

## Running the Frontend

```bash
cd frontend
npm install
npm run dev      # development
# or
npm run build && npm start   # production
```

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to point to the backend.

## Running the Detection Viewer

```bash
python detection_viewer.py
```

Opens a local web interface for reviewing and correcting auto-generated bounding box labels.
