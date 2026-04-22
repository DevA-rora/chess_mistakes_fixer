"use client";

import { useState } from "react";
import { SignIn, SignUp } from "@clerk/nextjs";
import { motion, AnimatePresence } from "motion/react";

type AuthMode = "signin" | "signup" | null;

interface AuthModalProps {
  open: AuthMode;
  onOpenChange: (mode: AuthMode) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const handleBackdropClick = () => {
    onOpenChange(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Blurred backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-md"
          />

          {/* Modal container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={handleBackdropClick}
          >
            {/* Modal content - prevent click propagation */}
            <div onClick={(e) => e.stopPropagation()}>
              {open === "signin" && <SignIn routing="hash" />}
              {open === "signup" && <SignUp routing="hash" />}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
