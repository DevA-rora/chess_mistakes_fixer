"use client";

import { useState, useEffect, useCallback } from "react";
import type { GameAnalysis } from "@/lib/mock-data";
import { getCachedAnalysis, saveCachedAnalysis, clearCachedAnalysis } from "@/lib/analysis-cache";

interface UseGameAnalysisOptions {
  gameId: string;
  pgn: string;
  depth?: number;
  autoAnalyze?: boolean;
}

interface UseGameAnalysisReturn {
  analysis: GameAnalysis | null;
  isAnalyzing: boolean;
  error: string | null;
  progress: string;
  startAnalysis: () => void;
  forceReanalyze: () => void;
  isCached: boolean;
}

export function useGameAnalysis({
  gameId,
  pgn,
  depth = 14,
  autoAnalyze = false,
}: UseGameAnalysisOptions): UseGameAnalysisReturn {
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [isCached, setIsCached] = useState(false);

  // Check cache on mount
  useEffect(() => {
    const cached = getCachedAnalysis(gameId);
    if (cached) {
      setAnalysis(cached);
      setIsCached(true);
    }
  }, [gameId]);

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);
    setProgress("Initializing Stockfish engine...");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, pgn, depth }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Analysis failed");
      }

      const result: GameAnalysis = await response.json();
      saveCachedAnalysis(result);
      setAnalysis(result);
      setIsCached(true);
      setProgress("");
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        setError("Analysis timed out. Try again or use a shorter game.");
      } else {
        setError(err instanceof Error ? err.message : "Analysis failed");
      }
      setProgress("");
    } finally {
      setIsAnalyzing(false);
    }
  }, [gameId, pgn, depth]);

  const startAnalysis = useCallback(async () => {
    // Check cache first
    const cached = getCachedAnalysis(gameId);
    if (cached) {
      setAnalysis(cached);
      setIsCached(true);
      return;
    }

    return runAnalysis();
  }, [gameId, runAnalysis]);

  const forceReanalyze = useCallback(() => {
    clearCachedAnalysis(gameId);
    setAnalysis(null);
    setIsCached(false);
    setError(null);
    runAnalysis();
  }, [gameId, runAnalysis]);

  // Auto-analyze if requested and not cached
  useEffect(() => {
    if (autoAnalyze && !analysis && !isAnalyzing) {
      startAnalysis();
    }
  }, [autoAnalyze, analysis, isAnalyzing, startAnalysis]);

  return {
    analysis,
    isAnalyzing,
    error,
    progress,
    startAnalysis,
    forceReanalyze,
    isCached,
  };
}
