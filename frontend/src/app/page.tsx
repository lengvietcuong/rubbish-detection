"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Shuffle, ScanSearch, Monitor, Video, Loader2, CheckCircle2, X } from "lucide-react";
import { ImageArea } from "@/components/image-area";
import { ControlPanel } from "@/components/control-panel";
import { TestSetDialog } from "@/components/test-set-dialog";
import { WebcamView } from "@/components/webcam-view";
import { Prediction } from "@/lib/types";
import {
  fetchRandomTestImage,
  getTestImageUrl,
  predict,
  predictTestImage,
} from "@/lib/api";
import { initBatchResults, pushBatchResult, signalBatchDone } from "@/lib/store";

export default function Home() {
  const router = useRouter();

  const [confidence, setConfidence] = useState(0.25);
  const [showConfidence, setShowConfidence] = useState(true);
  const [mode, setMode] = useState<"standard" | "live">("standard");
  const [pipeline, setPipeline] = useState<"multiclass" | "binary">("multiclass");
  const [rubbishOnly, setRubbishOnly] = useState(false);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isBinary = pipeline === "binary";

  const runPrediction = useCallback(
    async (file: File | Blob, url: string, filename?: string) => {
      setImageUrl(url);
      setPrediction(null);
      setIsLoading(true);
      try {
        const result = await predict(file, 0.05, false, filename, isBinary);
        setPrediction(result);
      } catch (err) {
        console.error("Prediction failed:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [isBinary]
  );

  const handleFilesDropped = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      if (files.length === 1) {
        const file = files[0];
        const url = URL.createObjectURL(file);
        runPrediction(file, url, file.name);
        return;
      }

      initBatchResults();
      router.push("/batch");

      const fileData: { file: File; dataUrl: string }[] = await Promise.all(
        files.map(
          (file) =>
            new Promise<{ file: File; dataUrl: string }>((resolve) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({ file, dataUrl: reader.result as string });
              reader.readAsDataURL(file);
            })
        )
      );

      const CONCURRENCY = 8;
      for (let i = 0; i < fileData.length; i += CONCURRENCY) {
        const chunk = fileData.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async ({ file, dataUrl }) => {
            try {
              const result = await predict(file, 0.05, false, file.name, isBinary);
              pushBatchResult({
                prediction: result,
                imageDataUrl: dataUrl,
                filename: file.name,
                rating: "unrated",
              });
            } catch (err) {
              console.error(`Prediction failed for ${file.name}:`, err);
            }
          })
        );
      }
      signalBatchDone();
    },
    [router, runPrediction, isBinary]
  );

  const handleRandomize = useCallback(async () => {
    setIsLoading(true);
    setPrediction(null);
    try {
      const filename = await fetchRandomTestImage(rubbishOnly);
      setImageUrl(getTestImageUrl(filename));
      const result = await predictTestImage(filename, 0.05, isBinary);
      setPrediction(result);
    } catch (err) {
      console.error("Random image failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [rubbishOnly, isBinary]);

  const handleTestSetSelect = useCallback(async (filename: string) => {
    setIsLoading(true);
    setPrediction(null);
    try {
      setImageUrl(getTestImageUrl(filename));
      const result = await predictTestImage(filename, 0.05, isBinary);
      setPrediction(result);
    } catch (err) {
      console.error("Test set prediction failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isBinary]);

  const isLive = mode === "live";
  const visibleCount = prediction
    ? prediction.scores.filter((s) => s >= confidence).length
    : 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ScanSearch className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-mono font-bold tracking-tight">
              Rubbish Detector
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Pipeline selector */}
            <Tabs
              value={pipeline}
              onValueChange={(v) => {
                setPipeline(v as "multiclass" | "binary");
                setPrediction(null);
              }}
            >
              <TabsList>
                <TabsTrigger value="multiclass">Multiclass</TabsTrigger>
                <TabsTrigger value="binary">Binary</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Mode selector */}
            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v as "standard" | "live")}
            >
              <TabsList>
                <TabsTrigger value="standard" className="gap-1.5">
                  <Monitor className="w-3.5 h-3.5" />
                  Standard
                </TabsTrigger>
                <TabsTrigger value="live" className="gap-1.5">
                  <Video className="w-3.5 h-3.5" />
                  Live
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        <div className="flex gap-6 items-start">
          {/* Left: Image area */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {isLive ? (
              <WebcamView
                confidence={confidence}
                showConfidence={showConfidence}
                binary={isBinary}
                onPrediction={setPrediction}
              />
            ) : (
              <ImageArea
                imageUrl={imageUrl}
                prediction={prediction}
                showConfidence={showConfidence}
                confidenceThreshold={confidence}
                isLiveMode={false}
                onFilesDropped={handleFilesDropped}
              />
            )}

            {/* Buttons + status below image */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    disabled={isLive || isLoading}
                    onClick={handleRandomize}
                    className="gap-1.5"
                  >
                    <Shuffle className="w-4 h-4" />
                    Randomize
                  </Button>
                  <TestSetDialog
                    disabled={isLive || isLoading}
                    onSelect={handleTestSetSelect}
                  />
                  <Button
                    variant="ghost"
                    disabled={isLive || isLoading || (!imageUrl && !prediction)}
                    onClick={() => { setImageUrl(null); setPrediction(null); }}
                    className="gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </Button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <Switch
                    checked={rubbishOnly}
                    onCheckedChange={setRubbishOnly}
                    disabled={isLive}
                    size="sm"
                  />
                  <span className="text-sm text-muted-foreground">Rubbish only</span>
                </label>
              </div>

              {/* Processing status */}
              {!isLive && (
                <div className="text-xs text-muted-foreground">
                  {isLoading ? (
                    <span className="flex items-center gap-1.5 text-primary animate-fade-in">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Running detection...
                    </span>
                  ) : prediction ? (
                    <span className="flex items-center gap-1.5 animate-fade-in">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      {visibleCount} object{visibleCount !== 1 ? "s" : ""} detected in {prediction.inference_ms.toFixed(0)}ms
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Right: Control panel */}
          <ControlPanel
            confidence={confidence}
            onConfidenceChange={setConfidence}
            showConfidence={showConfidence}
            onShowConfidenceChange={setShowConfidence}
            prediction={prediction}
            confidenceThreshold={confidence}
          />
        </div>
      </main>
    </div>
  );
}
