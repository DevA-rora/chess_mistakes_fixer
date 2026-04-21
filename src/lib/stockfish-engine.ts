/**
 * Server-side Stockfish engine wrapper.
 * Runs stockfish WASM in a child process to isolate it from Next.js's
 * Turbopack bundler (which corrupts the WASM memory context).
 * Communicates via IPC messages.
 */

import { fork, type ChildProcess } from "child_process";
import path from "path";

export interface PositionEval {
  /** Centipawns from the side-to-move's perspective */
  score: number;
  /** Is it a mate score? */
  isMate: boolean;
  /** Mate in N (positive = side to move wins, negative = losing) */
  mateIn: number | null;
  /** Best move in UCI notation (e.g., "e2e4") */
  bestMove: string;
  /** Depth reached */
  depth: number;
}

export interface StockfishEngine {
  analyze: (fen: string, depth?: number, movetime?: number) => Promise<PositionEval>;
  quit: () => void;
}

// Singleton: reuse the same engine across requests
let cachedEngine: StockfishEngine | null = null;
let engineInitPromise: Promise<StockfishEngine> | null = null;

export async function createEngine(): Promise<StockfishEngine> {
  if (cachedEngine) return cachedEngine;
  if (engineInitPromise) return engineInitPromise;

  engineInitPromise = initEngineInternal();
  try {
    cachedEngine = await engineInitPromise;
    return cachedEngine;
  } catch (err) {
    // Reset so next call retries
    cachedEngine = null;
    throw err;
  } finally {
    engineInitPromise = null;
  }
}

async function initEngineInternal(): Promise<StockfishEngine> {
  // Resolve to the plain JS worker file (not bundled by Turbopack)
  const workerPath = path.resolve(process.cwd(), "src/lib/stockfish-worker.js");

  let child: ChildProcess | null = null;
  let requestId = 0;
  const pending = new Map<number, { resolve: (val: PositionEval) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  function spawnChild(): Promise<void> {
    return new Promise((resolve, reject) => {
      child = fork(workerPath, [], {
        // Clean Node.js flags — Turbopack's execArgv corrupts WASM loading
        execArgv: [],
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });

      const initTimer = setTimeout(() => {
        reject(new Error("Stockfish worker init timeout"));
      }, 15000);

      child.on("message", (msg: { type: string; id?: number; message?: string; score?: number; isMate?: boolean; mateIn?: number | null; bestMove?: string; depth?: number }) => {
        if (msg.type === "ready") {
          clearTimeout(initTimer);
          resolve();
          return;
        }
        if (msg.type === "error" && msg.id == null) {
          clearTimeout(initTimer);
          reject(new Error(msg.message || "Worker init error"));
          return;
        }
        if (msg.type === "result" && msg.id != null) {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            clearTimeout(p.timer);
            p.resolve({
              score: msg.score ?? 0,
              isMate: msg.isMate ?? false,
              mateIn: msg.mateIn ?? null,
              bestMove: msg.bestMove ?? "",
              depth: msg.depth ?? 0,
            });
          }
          return;
        }
        if (msg.type === "error" && msg.id != null) {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            clearTimeout(p.timer);
            p.reject(new Error(msg.message || "Analysis error"));
          }
        }
      });

      child.on("exit", (code) => {
        // If child crashes, reject all pending requests
        for (const [, p] of pending) {
          clearTimeout(p.timer);
          p.reject(new Error(`Stockfish worker exited with code ${code}`));
        }
        pending.clear();
        child = null;
        cachedEngine = null; // Force re-init on next call
      });

      child.on("error", (err) => {
        clearTimeout(initTimer);
        reject(err);
      });
    });
  }

  await spawnChild();

  async function analyze(fen: string, depth: number = 16, movetime?: number): Promise<PositionEval> {
    if (!child) {
      throw new Error("Stockfish worker is not running");
    }

    const id = ++requestId;
    return new Promise((resolve, reject) => {
      const timeoutMs = movetime ? movetime + 5000 : 15000;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ score: 0, isMate: false, mateIn: null, bestMove: "", depth: 0 });
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      child!.send({ type: "analyze", id, fen, depth, movetime });
    });
  }

  function quit() {
    // No-op: engine is cached as a singleton and reused across requests
  }

  return { analyze, quit };
}
