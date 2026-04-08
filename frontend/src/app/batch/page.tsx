"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  Download,
  ThumbsUp,
  ThumbsDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getBatchResults, subscribeBatchResults } from "@/lib/store";
import { submitFeedback } from "@/lib/api";
import { BatchPrediction } from "@/lib/types";
import {
  getLabelColor,
  getLabelIcon,
  getLabelDisplayName,
} from "@/lib/label-config";
import JSZip from "jszip";

export default function BatchPage() {
  const router = useRouter();
  const [results, setResults] = useState<BatchPrediction[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [processing, setProcessing] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    const initial = getBatchResults();
    setResults(initial);
    setProcessing(true);

    const unsub = subscribeBatchResults(
      (updated) => setResults([...updated]),
      () => setProcessing(false)
    );

    // Redirect home if store is empty after a short grace period
    const timeout = setTimeout(() => {
      if (getBatchResults().length === 0) router.push("/");
    }, 500);

    initialized.current = true;

    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [router]);

  const handleFeedback = useCallback(
    async (index: number, rating: "like" | "dislike") => {
      const item = results[index];
      const newRating = item.rating === rating ? "unrated" : rating;

      // Optimistic update
      setResults((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], rating: newRating };
        return next;
      });

      if (!item.prediction.id) return;
      try {
        if (newRating === "unrated") {
          // No unrate endpoint — just update locally
          return;
        }
        await submitFeedback(item.prediction.id, newRating as "like" | "dislike");
      } catch (err) {
        console.error("Feedback failed:", err);
      }
    },
    [results]
  );

  const downloadLabels = useCallback(async () => {
    const zip = new JSZip();
    for (const item of results) {
      const { prediction, filename } = item;
      const labelFilename = filename.replace(/\.[^.]+$/, "") + ".txt";
      const lines = prediction.boxes
        .map((box, i) => {
          const [x1, y1, x2, y2] = box;
          const cx = ((x1 + x2) / 2).toFixed(6);
          const cy = ((y1 + y2) / 2).toFixed(6);
          const w = (x2 - x1).toFixed(6);
          const h = (y2 - y1).toFixed(6);
          const classId = getClassId(prediction.labels[i]);
          return `${classId} ${cx} ${cy} ${w} ${h}`;
        })
        .join("\n");
      zip.file(labelFilename, lines);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "labels.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const selectedItem = selectedIndex !== null ? results[selectedIndex] : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="gap-1.5"
            >
              <Home className="w-4 h-4" />
              Home
            </Button>
            <h1 className="text-lg font-mono font-bold tracking-tight">
              Batch Results
            </h1>
            <Badge variant="secondary" className="text-xs">
              {results.length} images
            </Badge>
            {processing && results.length === 0 && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Processing...
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadLabels}
            disabled={results.length === 0}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download Labels
          </Button>
        </div>
      </header>

      {/* Full-screen spinner while waiting for first result */}
      {processing && results.length === 0 && (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm z-40">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Running inference...</p>
        </div>
      )}

      {/* Grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.map((item, index) => (
            <BatchCard
              key={index}
              item={item}
              index={index}
              onSelect={() => setSelectedIndex(index)}
              onFeedback={handleFeedback}
            />
          ))}
        </div>
      </main>

      {/* Detail Modal */}
      <Dialog
        open={selectedIndex !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIndex(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span className="truncate">{selectedItem?.filename}</span>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={selectedIndex === 0}
                  onClick={() =>
                    setSelectedIndex((prev) => (prev !== null ? prev - 1 : null))
                  }
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedIndex !== null ? selectedIndex + 1 : 0} /{" "}
                  {results.length}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={selectedIndex === results.length - 1}
                  onClick={() =>
                    setSelectedIndex((prev) => (prev !== null ? prev + 1 : null))
                  }
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="relative rounded-lg overflow-hidden border bg-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedItem.imageDataUrl}
                  alt={selectedItem.filename}
                  className="w-full object-contain max-h-[60vh]"
                />
                <ModalBoundingBoxes prediction={selectedItem.prediction} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {selectedItem.prediction.labels.map((label, i) => {
                    const Icon = getLabelIcon(label);
                    return (
                      <Badge key={i} variant="secondary" className="text-xs gap-1 pl-1.5">
                        <Icon className="w-3 h-3" />
                        {getLabelDisplayName(label)}
                        <span className="opacity-60 ml-0.5">
                          {(selectedItem.prediction.scores[i] * 100).toFixed(0)}%
                        </span>
                      </Badge>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {selectedItem.prediction.inference_ms.toFixed(0)}ms
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BatchCard({
  item,
  index,
  onSelect,
  onFeedback,
}: {
  item: BatchPrediction;
  index: number;
  onSelect: () => void;
  onFeedback: (index: number, rating: "like" | "dislike") => void;
}) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  return (
    <div
      className="group bg-card border rounded-lg overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-md transition-all animate-fade-in"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: "both" }}
      onClick={onSelect}
    >
      {/* Image with bounding boxes */}
      <div className="relative flex items-center justify-center bg-black/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageDataUrl}
          alt={item.filename}
          className="w-full h-auto object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
        {imgSize && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ aspectRatio: `${imgSize.w}/${imgSize.h}`, margin: "auto" }}
          >
            {item.prediction.boxes.map((box, i) => {
              const [x1, y1, x2, y2] = box;
              const color = getLabelColor(item.prediction.labels[i]);
              const Icon = getLabelIcon(item.prediction.labels[i]);
              const displayName = getLabelDisplayName(item.prediction.labels[i]);
              return (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: `${x1 * 100}%`,
                    top: `${y1 * 100}%`,
                    width: `${(x2 - x1) * 100}%`,
                    height: `${(y2 - y1) * 100}%`,
                    border: `2px solid ${color}`,
                  }}
                >
                  <span
                    className="absolute -top-5 left-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap rounded-sm"
                    style={{ backgroundColor: color }}
                  >
                    <Icon className="w-2.5 h-2.5" />
                    {displayName}
                    <span className="opacity-80 ml-0.5">
                      {(item.prediction.scores[i] * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer: filename + inference time + like/dislike */}
      <div
        className="flex items-center justify-between px-3 py-2 border-t"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col min-w-0 flex-1 mr-2">
          <p className="text-xs text-muted-foreground truncate">{item.filename}</p>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <Clock className="w-2.5 h-2.5" />
            {item.prediction.inference_ms.toFixed(0)}ms
          </span>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            className={`w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-colors cursor-pointer ${
              item.rating === "like"
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-primary/10"
            }`}
            onClick={() => onFeedback(index, "like")}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button
            className={`w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-colors cursor-pointer ${
              item.rating === "dislike"
                ? "bg-destructive text-destructive-foreground"
                : "bg-muted hover:bg-destructive/10"
            }`}
            onClick={() => onFeedback(index, "dislike")}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalBoundingBoxes({ prediction }: { prediction: BatchPrediction["prediction"] }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {prediction.boxes.map((box, i) => {
        const [x1, y1, x2, y2] = box;
        const color = getLabelColor(prediction.labels[i]);
        const Icon = getLabelIcon(prediction.labels[i]);
        const displayName = getLabelDisplayName(prediction.labels[i]);
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${x1 * 100}%`,
              top: `${y1 * 100}%`,
              width: `${(x2 - x1) * 100}%`,
              height: `${(y2 - y1) * 100}%`,
              border: `2px solid ${color}`,
            }}
          >
            <span
              className="absolute -top-5 left-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap rounded-sm"
              style={{ backgroundColor: color }}
            >
              <Icon className="w-2.5 h-2.5" />
              {displayName}
              <span className="opacity-80 ml-0.5">
                {(prediction.scores[i] * 100).toFixed(0)}%
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const CLASS_MAP: Record<string, number> = {
  rubbish_pile: 0,
  bottle: 1,
  carton: 2,
  mattress: 3,
  chair: 4,
  couch: 5,
  furniture: 6,
  clothes: 7,
  electrical_goods: 8,
  rug: 9,
};

function getClassId(label: string): number {
  return CLASS_MAP[label] ?? 0;
}
