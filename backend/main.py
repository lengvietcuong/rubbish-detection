from __future__ import annotations

import hashlib
import os
import random
import time
import uuid
from pathlib import Path
from io import BytesIO
from typing import Optional, List, Dict

import numpy as np
import torch
import timm
import albumentations as A
from albumentations.pytorch import ToTensorV2
from PIL import Image

import requests as http_requests
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from dotenv import load_dotenv

# Load env from project root
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

app = FastAPI(title="Rubbish Detector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration ---
MODELS_DIR = Path("models")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
TEST_IMAGES_BUCKET = "test_images"
TEST_IMAGES_LOCAL_DIR = Path(__file__).resolve().parent.parent / "test_images"

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY", "")

DETECTOR_PATH = MODELS_DIR / "yolo11m_binary.pt"
CLASSIFIER_PATH = MODELS_DIR / "effnetv2_m.pt"
CLASSIFIER_IMG_SIZE = 320
NUM_CLASSES = 10
CLASS_NAMES = [
    "rubbish", "bottle", "carton", "mattress", "chair",
    "couch", "furniture", "clothes", "electrical_goods", "rug",
]

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def get_hardware_info() -> str:
    if torch.cuda.is_available():
        return torch.cuda.get_device_name(0)
    return "CPU"

HARDWARE = get_hardware_info()

# Models (loaded at startup)
detector = None
classifier = None
val_transform = None
supabase_client: Optional[object] = None


def get_supabase():
    global supabase_client
    if supabase_client is None and SUPABASE_URL and SUPABASE_KEY:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return supabase_client


def build_val_transform() -> A.Compose:
    return A.Compose([
        A.Resize(CLASSIFIER_IMG_SIZE, CLASSIFIER_IMG_SIZE),
        A.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ToTensorV2(),
    ])


@app.on_event("startup")
def load_models():
    global detector, classifier, val_transform
    from ultralytics import YOLO

    print(f"Using device: {DEVICE}")

    if not DETECTOR_PATH.exists():
        print(f"ERROR: Detector not found at {DETECTOR_PATH}")
        return
    if not CLASSIFIER_PATH.exists():
        print(f"ERROR: Classifier not found at {CLASSIFIER_PATH}")
        return

    print(f"Loading detector: {DETECTOR_PATH}")
    detector = YOLO(str(DETECTOR_PATH))
    if DEVICE.type == "cuda":
        detector.to("cuda")

    print(f"Loading classifier: {CLASSIFIER_PATH}")
    classifier = timm.create_model(
        "tf_efficientnetv2_m", pretrained=False, num_classes=NUM_CLASSES
    )
    state = torch.load(str(CLASSIFIER_PATH), map_location=DEVICE)
    classifier.load_state_dict(state)
    classifier.to(DEVICE)
    classifier.eval()

    val_transform = build_val_transform()
    print("Models loaded successfully.")


# --- Test images cache ---
_test_images_cache: Optional[List[str]] = None


def get_test_images() -> List[str]:
    global _test_images_cache
    if _test_images_cache is None:
        if TEST_IMAGES_LOCAL_DIR.exists():
            _test_images_cache = sorted(
                f.name for f in TEST_IMAGES_LOCAL_DIR.iterdir()
                if f.suffix.lower() in IMAGE_EXTENSIONS
            )
            print(f"Loaded {len(_test_images_cache)} test images from local disk.")
        else:
            sb = get_supabase()
            if sb:
                try:
                    all_items = []
                    offset = 0
                    page_size = 1000
                    while True:
                        page = sb.storage.from_(TEST_IMAGES_BUCKET).list(
                            options={"limit": page_size, "offset": offset}
                        )
                        if not page:
                            break
                        all_items.extend(page)
                        if len(page) < page_size:
                            break
                        offset += page_size
                    _test_images_cache = sorted(
                        item["name"] for item in all_items
                        if Path(item["name"]).suffix.lower() in IMAGE_EXTENSIONS
                    )
                    print(f"Loaded {len(_test_images_cache)} test images from Supabase.")
                except Exception as e:
                    print(f"Failed to list test images from Supabase: {e}")
                    _test_images_cache = []
            else:
                _test_images_cache = []
    return _test_images_cache


# --- Inference ---

@torch.no_grad()
def classify_crops(crops_pil: List[Image.Image]) -> tuple[List[int], List[float]]:
    """Classify a batch of PIL crops. Returns (class_ids, confidences)."""
    if not crops_pil:
        return [], []
    tensors = []
    for crop in crops_pil:
        img_np = np.array(crop.convert("RGB"))
        transformed = val_transform(image=img_np)
        tensors.append(transformed["image"])
    batch = torch.stack(tensors).to(DEVICE)
    outputs = classifier(batch)
    probs = torch.softmax(outputs, dim=1)
    confs, preds = probs.max(1)
    return preds.cpu().numpy().tolist(), confs.cpu().numpy().tolist()


def run_pipeline(img: Image.Image, conf_threshold: float, binary: bool = False) -> Dict:
    """Run detection pipeline. If binary=True, skip classifier and label all as 'rubbish'."""
    W, H = img.size

    # Stage 1: binary detection at 960x960
    start = time.time()
    results = detector.predict(img, imgsz=960, conf=conf_threshold, verbose=False)
    detect_ms = (time.time() - start) * 1000

    raw_boxes: List[List[float]] = []
    raw_scores: List[float] = []

    if results and len(results[0].boxes) > 0:
        for box in results[0].boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            raw_boxes.append([float(x1), float(y1), float(x2), float(y2)])
            raw_scores.append(float(box.conf[0].cpu()))

    # Stage 2: classify each crop (skipped in binary mode)
    class_ids: List[int] = []
    class_confs: List[float] = []

    if raw_boxes and not binary:
        crops = []
        for x1, y1, x2, y2 in raw_boxes:
            bw, bh = x2 - x1, y2 - y1
            x1e = max(0, x1 - bw * 0.075)
            y1e = max(0, y1 - bh * 0.075)
            x2e = min(W, x2 + bw * 0.075)
            y2e = min(H, y2 + bh * 0.075)
            crop = img.crop((int(x1e), int(y1e), int(x2e), int(y2e)))
            crops.append(crop)

        clf_start = time.time()
        class_ids, class_confs = classify_crops(crops)
        detect_ms += (time.time() - clf_start) * 1000

    # Build output with normalized boxes and combined scores
    boxes_out = []
    labels_out = []
    scores_out = []

    for i, (box, det_score) in enumerate(zip(raw_boxes, raw_scores)):
        x1, y1, x2, y2 = box
        boxes_out.append([
            round(x1 / W, 6), round(y1 / H, 6),
            round(x2 / W, 6), round(y2 / H, 6),
        ])
        if binary:
            labels_out.append("rubbish")
            scores_out.append(round(det_score, 4))
        else:
            labels_out.append(CLASS_NAMES[class_ids[i]] if class_ids else "rubbish")
            combined_score = det_score * (class_confs[i] if class_confs else 1.0)
            scores_out.append(round(combined_score, 4))

    return {
        "boxes": boxes_out,
        "labels": labels_out,
        "scores": scores_out,
        "inference_ms": round(detect_ms, 1),
    }


# --- API Endpoints ---

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "device": str(DEVICE),
        "detector_loaded": detector is not None,
        "classifier_loaded": classifier is not None,
    }


@app.get("/api/test-images")
def list_test_images(page: int = 1, per_page: int = 50, rubbish_only: bool = False):
    images = get_test_images()
    if rubbish_only:
        rubbish_dir = Path(__file__).resolve().parent.parent / "rubbish"
        images = [
            name for name in images
            if (rubbish_dir / (Path(name).stem + ".txt")).exists()
        ]
    total = len(images)
    start = (page - 1) * per_page
    return {
        "images": images[start:start + per_page],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@app.get("/api/test-images/random")
def random_test_image(rubbish_only: bool = False):
    images = get_test_images()
    if not images:
        raise HTTPException(404, "No test images available")
    if rubbish_only:
        rubbish_dir = Path(__file__).resolve().parent.parent / "rubbish"
        images = [
            name for name in images
            if (rubbish_dir / (Path(name).stem + ".txt")).exists()
        ]
        if not images:
            raise HTTPException(404, "No rubbish-only test images available")
    return {"filename": random.choice(images)}


@app.get("/api/test-images/{filename}")
def serve_test_image(filename: str):
    safe_name = Path(filename).name
    local_path = TEST_IMAGES_LOCAL_DIR / safe_name
    if local_path.exists():
        return FileResponse(str(local_path))
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{TEST_IMAGES_BUCKET}/{safe_name}"
    return RedirectResponse(url=public_url)


def _record_to_supabase(
    image_bytes: bytes,
    filename: str,
    content_type: str,
    prediction: Dict,
    allow_upload: bool = True,
) -> None:
    """Upload image and insert prediction record in the background."""
    sb = get_supabase()
    if not sb:
        return
    try:
        image_hash = hashlib.sha256(image_bytes).hexdigest()
        ext = Path(filename).suffix or ".jpg"
        storage_filename = f"{image_hash}{ext}"
        image_url = f"{SUPABASE_URL}/storage/v1/object/public/user_images/{storage_filename}"
        if allow_upload:
            try:
                sb.storage.from_("user_images").upload(
                    storage_filename, image_bytes, {"content-type": content_type}
                )
            except Exception:
                pass  # Already exists
        sb.table("predictions").insert({
            "image_url": image_url,
            "image_filename": filename,
            "image_hash": image_hash,
            "model_name": "yolo11m_binary+effnetv2_m",
            "labels": prediction["labels"],
            "confidence_scores": prediction["scores"],
            "inference_speed_ms": prediction["inference_ms"],
            "like_count": 0,
            "dislike_count": 0,
            "hardware": HARDWARE,
        }).execute()
    except Exception as e:
        print(f"Supabase background error: {e}")


@app.post("/api/predict")
async def run_prediction(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    confidence: float = Form(0.25),
    is_live: bool = Form(False),
    binary: bool = Form(False),
):
    if detector is None or classifier is None:
        raise HTTPException(503, "Models not loaded")

    image_bytes = await image.read()
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    prediction = run_pipeline(img, confidence, binary=binary)

    if not is_live:
        background_tasks.add_task(
            _record_to_supabase,
            image_bytes,
            image.filename or "image.jpg",
            image.content_type or "image/jpeg",
            prediction,
        )

    return prediction


@app.post("/api/predict/test-image")
def predict_test_image(background_tasks: BackgroundTasks, body: dict = Body(...)):
    if detector is None or classifier is None:
        raise HTTPException(503, "Models not loaded")

    filename = body.get("filename", "")
    confidence = body.get("confidence", 0.25)
    binary = body.get("binary", False)

    safe_name = Path(filename).name
    local_path = TEST_IMAGES_LOCAL_DIR / safe_name
    try:
        if local_path.exists():
            image_bytes = local_path.read_bytes()
        else:
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{TEST_IMAGES_BUCKET}/{safe_name}"
            response = http_requests.get(public_url, timeout=15)
            response.raise_for_status()
            image_bytes = response.content
        img = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(404, f"Test image not found: {e}")

    prediction = run_pipeline(img, confidence, binary=binary)

    background_tasks.add_task(
        _record_to_supabase,
        image_bytes,
        safe_name,
        f"image/{Path(safe_name).suffix.lstrip('.') or 'jpeg'}",
        prediction,
    )

    return prediction


@app.post("/api/predict/live")
async def predict_live(
    image: UploadFile = File(...),
    confidence: float = Form(0.25),
    binary: bool = Form(False),
):
    if detector is None or classifier is None:
        raise HTTPException(503, "Models not loaded")
    image_bytes = await image.read()
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    return run_pipeline(img, confidence, binary=binary)


@app.post("/api/feedback/{prediction_id}")
def update_feedback(prediction_id: str, body: dict = Body(...)):
    rating = body.get("rating")
    if rating not in ("like", "dislike"):
        raise HTTPException(400, "Rating must be 'like' or 'dislike'")
    sb = get_supabase()
    if not sb:
        raise HTTPException(500, "Supabase not configured")
    col = "like_count" if rating == "like" else "dislike_count"
    row = sb.table("predictions").select(col).eq("id", prediction_id).single().execute()
    if not row.data:
        raise HTTPException(404, "Prediction not found")
    new_val = (row.data.get(col) or 0) + 1
    sb.table("predictions").update({col: new_val}).eq("id", prediction_id).execute()
    return {"success": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8731)
