"use client";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Prediction } from "@/lib/types";
import { getLabelColor, getLabelIcon, getLabelDisplayName } from "@/lib/label-config";
import { Gauge, Eye, Layers } from "lucide-react";

interface ControlPanelProps {
  confidence: number;
  onConfidenceChange: (value: number) => void;
  showConfidence: boolean;
  onShowConfidenceChange: (show: boolean) => void;
  prediction: Prediction | null;
  confidenceThreshold: number;
}

export function ControlPanel({
  confidence,
  onConfidenceChange,
  showConfidence,
  onShowConfidenceChange,
  prediction,
  confidenceThreshold,
}: ControlPanelProps) {
  const labelCounts: Record<string, number> = {};
  if (prediction) {
    prediction.labels.forEach((label, i) => {
      if (prediction.scores[i] >= confidenceThreshold) {
        labelCounts[label] = (labelCounts[label] || 0) + 1;
      }
    });
  }

  return (
    <div className="w-72 flex flex-col gap-5 shrink-0">
      <div className="bg-card border rounded-lg p-4 space-y-5 shadow-sm">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              Confidence
            </label>
            <span className="text-sm font-mono font-semibold text-primary">
              {(confidence * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            value={[confidence]}
            onValueChange={(v) => onConfidenceChange(Array.isArray(v) ? v[0] : v)}
            min={0.05}
            max={0.95}
            step={0.05}
            className="w-full"
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Show Scores
          </label>
          <Switch
            checked={showConfidence}
            onCheckedChange={onShowConfidenceChange}
          />
        </div>
      </div>

      {prediction && Object.keys(labelCounts).length > 0 && (
        <div className="bg-card border rounded-lg p-4 space-y-3 shadow-sm animate-fade-in">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Detections
          </h3>

          <div className="flex flex-wrap gap-1.5">
            {Object.entries(labelCounts).map(([label, count]) => {
              const Icon = getLabelIcon(label);
              return (
                <Badge
                  key={label}
                  variant="secondary"
                  className="text-xs gap-1 pl-1.5"
                >
                  <Icon className="w-3 h-3" />
                  {getLabelDisplayName(label)}
                  {count > 1 && (
                    <span
                      className="ml-0.5 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center text-white"
                      style={{ backgroundColor: getLabelColor(label) }}
                    >
                      {count}
                    </span>
                  )}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
