"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Prediction } from "@/lib/types";
import { getLabelColor, getLabelIcon, getLabelDisplayName } from "@/lib/label-config";
import { submitFeedback } from "@/lib/api";

interface ImageAreaProps {
  imageUrl: string | null;
  prediction: Prediction | null;
  showConfidence: boolean;
  confidenceThreshold: number;
  isLiveMode: boolean;
  onFilesDropped: (files: File[]) => void;
}

export function ImageArea({
  imageUrl,
  prediction,
  showConfidence,
  confidenceThreshold,
  isLiveMode,
  onFilesDropped,
}: ImageAreaProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [rating, setRating] = useState<"like" | "dislike" | null>(null);
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const prevPredictionId = useRef<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length > 0) onFilesDropped(files.slice(0, 100));
    },
    [onFilesDropped]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) onFilesDropped(files.slice(0, 100));
      e.target.value = "";
    },
    [onFilesDropped]
  );

  // Reset rating when prediction changes
  useEffect(() => {
    if (prediction?.id !== prevPredictionId.current) {
      prevPredictionId.current = prediction?.id;
      setRating(null);
    }
  }, [prediction?.id]);

  const handleFeedback = async (type: "like" | "dislike") => {
    if (!prediction?.id) return;
    const next = rating === type ? null : type;
    setRating(next);
    if (next) {
      try {
        await submitFeedback(prediction.id, next);
      } catch (err) {
        console.error("Feedback failed:", err);
        setRating(rating); // revert on error
      }
    }
  };

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setImgAspect(img.naturalWidth / img.naturalHeight);
    },
    []
  );

  const showFeedback = !isLiveMode && prediction?.id;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div
        className={`
          relative w-full aspect-[960/540] rounded-lg overflow-hidden
          border-2 transition-all duration-200
          flex items-center justify-center bg-black/5
          ${isDragOver
            ? "border-primary bg-primary/5 border-dashed cursor-pointer"
            : imageUrl
              ? "border-border"
              : "border-dashed border-muted-foreground/30 hover:border-primary/40 cursor-pointer"
          }
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={!imageUrl ? handleClick : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {!imageUrl && (
          <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <Upload className="w-7 h-7" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Drop images here</p>
              <p className="text-xs mt-1">or click to browse</p>
            </div>
          </div>
        )}

        {imageUrl && (
          <div
            className="relative"
            style={{
              aspectRatio: imgAspect ?? 16 / 10,
              maxWidth: "100%",
              maxHeight: "100%",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Detection target"
              className="w-full h-full object-fill"
              onLoad={handleImageLoad}
            />

            {prediction && (
              <BoundingBoxOverlay
                prediction={prediction}
                showConfidence={showConfidence}
                confidenceThreshold={confidenceThreshold}
              />
            )}

            {showFeedback && (
              <div className="absolute bottom-3 right-3 flex gap-1.5 animate-fade-in">
                <Button
                  size="sm"
                  variant={rating === "like" ? "default" : "secondary"}
                  className="h-8 w-8 p-0 shadow-md"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFeedback("like");
                  }}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant={rating === "dislike" ? "destructive" : "secondary"}
                  className="h-8 w-8 p-0 shadow-md"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFeedback("dislike");
                  }}
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BoundingBoxOverlay({
  prediction,
  showConfidence,
  confidenceThreshold,
}: {
  prediction: Prediction;
  showConfidence: boolean;
  confidenceThreshold: number;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {prediction.boxes.map((box, i) => {
        if (prediction.scores[i] < confidenceThreshold) return null;

        const [x1, y1, x2, y2] = box;
        const color = getLabelColor(prediction.labels[i]);
        const Icon = getLabelIcon(prediction.labels[i]);
        const displayName = getLabelDisplayName(prediction.labels[i]);
        const score = prediction.scores[i];

        return (
          <div
            key={i}
            className="absolute animate-scale-in"
            style={{
              left: `${x1 * 100}%`,
              top: `${y1 * 100}%`,
              width: `${(x2 - x1) * 100}%`,
              height: `${(y2 - y1) * 100}%`,
              border: `2px solid ${color}`,
              animationDelay: `${i * 50}ms`,
              animationFillMode: "both",
            }}
          >
            <span
              className="absolute -top-5 left-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap rounded-sm"
              style={{ backgroundColor: color }}
            >
              <Icon className="w-2.5 h-2.5" />
              {displayName}
              {showConfidence && (
                <span className="opacity-80 ml-0.5">
                  {(score * 100).toFixed(0)}%
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
