export interface Prediction {
  id?: string;
  boxes: number[][]; // [x1, y1, x2, y2] normalized 0-1
  labels: string[];
  scores: number[];
  inference_ms: number;
  image_url?: string;
}

export interface BatchPrediction {
  prediction: Prediction;
  imageDataUrl: string;
  filename: string;
  rating: "like" | "dislike" | "unrated";
}

export interface TestImagesResponse {
  images: string[];
  total: number;
  page: number;
  per_page: number;
}
