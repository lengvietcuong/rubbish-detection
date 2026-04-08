import { Prediction, TestImagesResponse } from "./types";

const API_BASE = "";

export async function fetchTestImages(
  page = 1,
  perPage = 50,
  rubbishOnly = false
): Promise<TestImagesResponse> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    ...(rubbishOnly && { rubbish_only: "true" }),
  });
  const res = await fetch(`${API_BASE}/api/test-images?${params}`);
  if (!res.ok) throw new Error("Failed to fetch test images");
  return res.json();
}

export async function fetchRandomTestImage(rubbishOnly = false): Promise<string> {
  const url = rubbishOnly
    ? `${API_BASE}/api/test-images/random?rubbish_only=true`
    : `${API_BASE}/api/test-images/random`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch random image");
  const data = await res.json();
  return data.filename;
}

export function getTestImageUrl(filename: string): string {
  return `${API_BASE}/api/test-images/${encodeURIComponent(filename)}`;
}

export async function predict(
  imageFile: File | Blob,
  confidenceThreshold: number,
  isLive = false,
  filename = "image.jpg",
  binary = false
): Promise<Prediction> {
  const formData = new FormData();
  formData.append("image", imageFile, filename);
  formData.append("confidence", confidenceThreshold.toString());
  formData.append("is_live", isLive.toString());
  formData.append("binary", binary.toString());

  const res = await fetch(`${API_BASE}/api/predict`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Prediction failed");
  return res.json();
}

export async function predictTestImage(
  filename: string,
  confidenceThreshold: number,
  binary = false
): Promise<Prediction> {
  const res = await fetch(`${API_BASE}/api/predict/test-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, confidence: confidenceThreshold, binary }),
  });
  if (!res.ok) throw new Error("Prediction failed");
  return res.json();
}

export async function submitFeedback(
  predictionId: string,
  rating: "like" | "dislike"
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/feedback/${predictionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) throw new Error("Failed to submit feedback");
}
