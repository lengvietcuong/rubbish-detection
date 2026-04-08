import { BatchPrediction } from "./types";

let batchResults: BatchPrediction[] = [];
let listener: ((results: BatchPrediction[]) => void) | null = null;
let doneListener: (() => void) | null = null;

export function initBatchResults() {
  batchResults = [];
}

export function pushBatchResult(item: BatchPrediction) {
  batchResults = [...batchResults, item];
  listener?.(batchResults);
}

export function signalBatchDone() {
  doneListener?.();
}

export function getBatchResults(): BatchPrediction[] {
  return batchResults;
}

export function subscribeBatchResults(
  onUpdate: (results: BatchPrediction[]) => void,
  onDone?: () => void
) {
  listener = onUpdate;
  doneListener = onDone ?? null;
  return () => {
    listener = null;
    doneListener = null;
  };
}
