/**
 * Stockfish child-process worker.
 * 
 * Runs in a plain Node.js context (NOT bundled by Turbopack/webpack) to avoid
 * WASM compatibility issues with Next.js's module system.
 * 
 * Protocol (IPC via process.send / process.on("message")):
 *   Parent → Worker: { type: "analyze", id, fen, depth, movetime }
 *   Worker → Parent: { type: "result", id, score, isMate, mateIn, bestMove, depth }
 *   Worker → Parent: { type: "ready" }
 *   Worker → Parent: { type: "error", id?, message }
 */

const initEngine = require("stockfish");

let engine = null;
const lineListeners = [];

function initStockfish() {
  return initEngine("lite-single").then((sf) => {
    engine = sf;

    engine.listener = (line) => {
      const trimmed = typeof line === "string" ? line.trim() : "";
      if (trimmed) {
        for (const listener of lineListeners) {
          listener(trimmed);
        }
      }
    };

    // Wait for UCI init
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("UCI init timeout")), 10000);
      const listener = (line) => {
        if (line === "uciok") {
          clearTimeout(timer);
          removeListener(listener);
          resolve();
        }
      };
      lineListeners.push(listener);
      engine.sendCommand("uci");
    });
  }).then(() => {
    // Set hash and wait for ready
    engine.sendCommand("setoption name Hash value 32");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("isready timeout")), 10000);
      const listener = (line) => {
        if (line === "readyok") {
          clearTimeout(timer);
          removeListener(listener);
          resolve();
        }
      };
      lineListeners.push(listener);
      engine.sendCommand("isready");
    });
  });
}

function removeListener(listener) {
  const idx = lineListeners.indexOf(listener);
  if (idx >= 0) lineListeners.splice(idx, 1);
}

function parseInfoLine(info) {
  let score = 0;
  let isMate = false;
  let mateIn = null;
  let reachedDepth = 0;

  const scoreMatch = info.match(/score (cp|mate) (-?\d+)/);
  if (scoreMatch) {
    if (scoreMatch[1] === "cp") {
      score = parseInt(scoreMatch[2]);
    } else if (scoreMatch[1] === "mate") {
      isMate = true;
      mateIn = parseInt(scoreMatch[2]);
      score = mateIn > 0 ? 10000 - mateIn * 10 : -10000 + Math.abs(mateIn) * 10;
    }
  }

  const depthMatch = info.match(/depth (\d+)/);
  if (depthMatch) reachedDepth = parseInt(depthMatch[1]);

  return { score, isMate, mateIn, bestMove: "", depth: reachedDepth };
}

function analyze(id, fen, depth, movetime) {
  return new Promise((resolve) => {
    let lastInfo = "";
    let settled = false;

    const timeoutMs = movetime ? movetime + 2000 : 10000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      removeListener(listener);
      try { engine.sendCommand("stop"); } catch (_) { /* ignore */ }
      if (lastInfo) {
        resolve(parseInfoLine(lastInfo));
      } else {
        resolve({ score: 0, isMate: false, mateIn: null, bestMove: "", depth: 0 });
      }
    }, timeoutMs);

    const listener = (line) => {
      if (settled) return;

      if (line.startsWith("info") && line.includes(" score ")) {
        lastInfo = line;
      }

      if (line.startsWith("bestmove")) {
        settled = true;
        clearTimeout(timer);
        removeListener(listener);

        const bestMove = (line.match(/bestmove (\S+)/) || [])[1] || "";
        const parsed = lastInfo ? parseInfoLine(lastInfo) : { score: 0, isMate: false, mateIn: null, bestMove: "", depth: 0 };
        resolve({ ...parsed, bestMove });
      }
    };

    lineListeners.push(listener);
    engine.sendCommand("position fen " + fen);
    const goCmd = movetime
      ? "go depth " + depth + " movetime " + movetime
      : "go depth " + depth;
    engine.sendCommand(goCmd);
  });
}

// --- Main ---
initStockfish()
  .then(() => {
    process.send({ type: "ready" });
  })
  .catch((err) => {
    process.send({ type: "error", message: "Init failed: " + err.message });
    process.exit(1);
  });

process.on("message", async (msg) => {
  if (msg.type === "analyze") {
    try {
      const result = await analyze(msg.id, msg.fen, msg.depth, msg.movetime);
      process.send({ type: "result", id: msg.id, ...result });
    } catch (err) {
      process.send({ type: "error", id: msg.id, message: err.message });
    }
  }
});
