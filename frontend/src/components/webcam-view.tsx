"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { VideoOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Prediction } from "@/lib/types";
import { getLabelColor, getLabelIcon, getLabelDisplayName } from "@/lib/label-config";
import { predict } from "@/lib/api";

interface WebcamViewProps {
  confidence: number;
  showConfidence: boolean;
  binary: boolean;
  onPrediction: (prediction: Prediction | null) => void;
}

export function WebcamView({
  confidence,
  showConfidence,
  binary,
  onPrediction,
}: WebcamViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inferringRef = useRef(false);
  const inferLoopRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    inferLoopRef.current = false;
    inferringRef.current = false;
    setIsStreaming(false);
    setPrediction(null);
    onPrediction(null);
  }, [onPrediction]);

  // Auto-start webcam on mount
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        setError(null);
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Camera not available. This page must be served over HTTPS.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 960, height: 540, frameRate: 24 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setIsStreaming(true);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`Camera error: ${msg}`);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      inferLoopRef.current = false;
      inferringRef.current = false;
    };
  }, []);

  const captureBlob = useCallback((): Promise<Blob | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return Promise.resolve(null);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(video, 0, 0);
    return new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8)
    );
  }, []);

  // Continuous inference loop — runs as fast as the backend allows
  const startInferLoop = useCallback(() => {
    inferLoopRef.current = true;

    async function loop() {
      while (inferLoopRef.current) {
        if (!inferringRef.current) {
          inferringRef.current = true;
          try {
            const blob = await captureBlob();
            if (blob && inferLoopRef.current) {
              const result = await predict(blob, confidence, true, "webcam.jpg", binary);
              if (inferLoopRef.current) {
                setPrediction(result);
                onPrediction(result);
              }
            }
          } catch (err) {
            console.error("Live prediction error:", err);
          } finally {
            inferringRef.current = false;
          }
        }
        // Small yield to avoid tight-looping when inference is instant
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    loop();
  }, [captureBlob, confidence, binary, onPrediction]);

  useEffect(() => {
    if (!isStreaming) return;

    // 24 FPS RAF loop to keep video rendering smooth
    const FRAME_MS = 1000 / 24;
    let lastTime = 0;

    function frame(now: number) {
      if (now - lastTime >= FRAME_MS) {
        lastTime = now;
        // RAF itself drives the browser's video rendering; nothing extra needed
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    startInferLoop();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      inferLoopRef.current = false;
    };
  }, [isStreaming, startInferLoop]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="relative w-full aspect-[960/540] rounded-lg overflow-hidden border-2 border-border bg-black/5">
        <video
          ref={videoRef}
          className={`w-full h-full object-contain ${isStreaming ? "" : "hidden"}`}
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {!isStreaming && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
            <VideoOff className="w-10 h-10 text-destructive" />
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        )}

        {isStreaming && (
          <>
            {prediction && (
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
                        {showConfidence && (
                          <span className="opacity-80 ml-0.5">
                            {(prediction.scores[i] * 100).toFixed(0)}%
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="absolute top-3 left-3">
              <div className="flex items-center gap-1.5 bg-red-500/90 text-white text-[10px] font-medium px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </div>
            </div>

            <div className="absolute top-3 right-3">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs shadow-md"
                onClick={stopWebcam}
              >
                <VideoOff className="w-3 h-3 mr-1" />
                Stop
              </Button>
            </div>

            {!prediction && (
              <div className="absolute bottom-3 left-3">
                <div className="flex items-center gap-1.5 bg-card/80 backdrop-blur text-xs px-2 py-1 rounded-md shadow">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Detecting...
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
