"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, X, Check } from "lucide-react";
import { useSettingsStore } from "@/hooks/use-settings-store";

type Platform = "chesscom" | "lichess";
type Step = "pick" | "connect";

// ─── Platform SVG graphics ────────────────────────────────────────────────

function ChessComIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 50 50" className={className} fill="none">
      {/* Green background circle */}
      <circle cx="25" cy="25" r="24" fill="#769656" />
      {/* White pawn shape */}
      <path
        d="M25 10c-2.5 0-4.5 2-4.5 4.5 0 1.2.5 2.3 1.3 3.1-2.1 1.2-3.5 3.5-3.5 6.1 0 1.5.5 2.9 1.3 4.1C16.9 29.5 15 32.5 15 36h20c0-3.5-1.9-6.5-4.6-8.2.8-1.2 1.3-2.6 1.3-4.1 0-2.6-1.4-4.9-3.5-6.1.8-.8 1.3-1.9 1.3-3.1 0-2.5-2-4.5-4.5-4.5z"
        fill="white"
      />
      <rect x="14" y="37" width="22" height="3" rx="1" fill="white" />
    </svg>
  );
}

function LichessIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 50 50" className={className} fill="none">
      {/* Dark background circle */}
      <circle cx="25" cy="25" r="24" fill="#312e2b" />
      {/* White knight/horse silhouette */}
      <path
        d="M31.5 12c-2-1-4.5-.5-5 .5-.5 1 .5 1.5-.5 3-1 1-2 1-2 1l-1-2s-4 3-4.5 7c-.5 4 1.5 6 1 8-.5 2-1.5 3-1.5 3l-2 2v3h18v-3l-3-3c0-2 1-4 1-6s-.5-4-1.5-6c0 0-1-2.5 0-4 .5-1 2-1 2-1l-1.5-2.5z"
        fill="white"
        stroke="white"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      {/* Eye dot */}
      <circle cx="24" cy="17.5" r="1" fill="#312e2b" />
    </svg>
  );
}

// ─── Connected account badge ───────────────────────────────────────────────

function ConnectedBadge({
  platform,
  username,
  onDisconnect,
}: {
  platform: Platform;
  username: string;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
      {platform === "chesscom" ? (
        <ChessComIcon className="h-8 w-8 shrink-0" />
      ) : (
        <LichessIcon className="h-8 w-8 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {platform === "chesscom" ? "Chess.com" : "Lichess"}
        </p>
        <p className="text-xs text-muted-foreground truncate">{username}</p>
      </div>
      <Check className="h-4 w-4 text-primary shrink-0" />
      <button
        type="button"
        onClick={onDisconnect}
        className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
        title="Disconnect"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────

export function ConnectAccountModal({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
}) {
  const { settings, updateSettings } = useSettingsStore();
  const [step, setStep] = useState<Step>("pick");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);

  const hasChessCom = !!settings.chessComUsername;
  const hasLichess = !!settings.lichessUsername;

  function resetAndClose() {
    setStep("pick");
    setSelectedPlatform(null);
    setUsernameInput("");
    setError("");
    setValidating(false);
    onOpenChange(false);
  }

  function handleSelectPlatform(p: Platform) {
    setSelectedPlatform(p);
    setUsernameInput("");
    setError("");
    setStep("connect");
  }

  async function handleConnect() {
    if (!selectedPlatform || !usernameInput.trim()) return;

    setError("");
    setValidating(true);

    try {
      const res = await fetch("/api/sync/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameInput.trim(),
          platform: selectedPlatform,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to validate username");
        return;
      }

      if (!data.valid) {
        setError(
          `Username "${usernameInput.trim()}" not found on ${
            selectedPlatform === "chesscom" ? "Chess.com" : "Lichess"
          }`
        );
        return;
      }

      // Save to settings
      if (selectedPlatform === "chesscom") {
        updateSettings({ chessComUsername: data.username });
      } else {
        updateSettings({ lichessUsername: data.username });
      }

      // Go back to pick view to show connected state
      setStep("pick");
      setSelectedPlatform(null);
      setUsernameInput("");
      onConnected?.();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setValidating(false);
    }
  }

  function handleDisconnect(platform: Platform) {
    if (platform === "chesscom") {
      updateSettings({ chessComUsername: null, lastChessComSync: null });
    } else {
      updateSettings({ lichessUsername: null, lastLichessSync: null });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetAndClose();
        else onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "pick" ? "Connect Chess Account" : `Connect ${selectedPlatform === "chesscom" ? "Chess.com" : "Lichess"}`}
          </DialogTitle>
          <DialogDescription>
            {step === "pick"
              ? "Link your account to sync games automatically."
              : "Enter your username to connect."}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === "pick" ? (
            <motion.div
              key="pick"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Connected accounts */}
              {hasChessCom && (
                <ConnectedBadge
                  platform="chesscom"
                  username={settings.chessComUsername!}
                  onDisconnect={() => handleDisconnect("chesscom")}
                />
              )}
              {hasLichess && (
                <ConnectedBadge
                  platform="lichess"
                  username={settings.lichessUsername!}
                  onDisconnect={() => handleDisconnect("lichess")}
                />
              )}

              {/* Platform buttons for unconnected platforms */}
              {(!hasChessCom || !hasLichess) && (
                <div className="grid grid-cols-2 gap-3">
                  {!hasChessCom && (
                    <button
                      type="button"
                      onClick={() => handleSelectPlatform("chesscom")}
                      className="group flex flex-col items-center gap-3 rounded-xl border-2 border-border
                        bg-card p-6 transition-all hover:border-[#769656] hover:bg-[#769656]/5 cursor-pointer"
                    >
                      <ChessComIcon className="h-16 w-16 transition-transform group-hover:scale-110" />
                      <span className="text-sm font-semibold">Chess.com</span>
                    </button>
                  )}
                  {!hasLichess && (
                    <button
                      type="button"
                      onClick={() => handleSelectPlatform("lichess")}
                      className="group flex flex-col items-center gap-3 rounded-xl border-2 border-border
                        bg-card p-6 transition-all hover:border-foreground/50 hover:bg-foreground/5 cursor-pointer"
                    >
                      <LichessIcon className="h-16 w-16 transition-transform group-hover:scale-110" />
                      <span className="text-sm font-semibold">Lichess</span>
                    </button>
                  )}
                </div>
              )}

              {/* If both connected, show a done message */}
              {hasChessCom && hasLichess && (
                <p className="text-center text-sm text-muted-foreground">
                  Both accounts connected! Close to start syncing.
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="connect"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <button
                type="button"
                onClick={() => {
                  setStep("pick");
                  setError("");
                }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>

              <div className="flex items-center justify-center py-2">
                {selectedPlatform === "chesscom" ? (
                  <ChessComIcon className="h-20 w-20" />
                ) : (
                  <LichessIcon className="h-20 w-20" />
                )}
              </div>

              <div className="space-y-2">
                <Input
                  placeholder={
                    selectedPlatform === "chesscom"
                      ? "Your Chess.com username"
                      : "Your Lichess username"
                  }
                  value={usernameInput}
                  onChange={(e) => {
                    setUsernameInput(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConnect();
                  }}
                  autoFocus
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>

              <Button
                onClick={handleConnect}
                disabled={!usernameInput.trim() || validating}
                className="w-full cursor-pointer"
              >
                {validating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
