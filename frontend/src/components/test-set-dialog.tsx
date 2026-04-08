"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, GalleryHorizontalEnd } from "lucide-react";
import { fetchTestImages, getTestImageUrl } from "@/lib/api";

interface TestSetDialogProps {
  disabled: boolean;
  onSelect: (filename: string) => void;
}

export function TestSetDialog({ disabled, onSelect }: TestSetDialogProps) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [rubbishOnly, setRubbishOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchTestImages(1, 1000, rubbishOnly)
      .then((data) => setImages(data.images))
      .catch((err) => console.error("Failed to load test images:", err))
      .finally(() => setLoading(false));
  }, [open, rubbishOnly]);

  const handleSelect = (filename: string) => {
    onSelect(filename);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" disabled={disabled} className="gap-1.5" />
        }
      >
        <GalleryHorizontalEnd className="w-4 h-4" />
        Select from Test Set
      </DialogTrigger>
      <DialogContent className="!max-w-5xl w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Test Set Images</span>
            <label className="flex items-center gap-2 cursor-pointer font-normal">
              <Switch
                checked={rubbishOnly}
                onCheckedChange={setRubbishOnly}
                size="sm"
              />
              <span className="text-sm text-muted-foreground">Rubbish only</span>
            </label>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {images.map((filename) => (
                <button
                  key={filename}
                  onClick={() => handleSelect(filename)}
                  className="aspect-square rounded-md overflow-hidden border border-border hover:border-primary hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer group min-h-32"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getTestImageUrl(filename)}
                    alt={filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
