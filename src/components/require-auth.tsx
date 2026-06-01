"use client";

import { useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { motion } from "motion/react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "./auth-modal";

interface RequireAuthProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

/**
 * Gate a page on Clerk auth. Renders a sign-in CTA when the user is
 * signed out, the children when signed in, and a brief loading state
 * while Clerk hydrates.
 */
export function RequireAuth({
  children,
  title = "Sign in to continue",
  description = "Your games, flashcards, and progress are saved to your account.",
}: RequireAuthProps) {
  const { isLoaded, isSignedIn } = useUser();
  const [authModal, setAuthModal] = useState<"signin" | "signup" | null>(null);

  if (!isLoaded) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="max-w-sm w-full space-y-6 text-center"
          >
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold font-serif">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setAuthModal("signup")} className="w-full">
                Create account
              </Button>
              <Button
                variant="outline"
                onClick={() => setAuthModal("signin")}
                className="w-full"
              >
                Sign in
              </Button>
            </div>
          </motion.div>
        </div>
        <AuthModal open={authModal} onOpenChange={setAuthModal} />
      </>
    );
  }

  return <>{children}</>;
}
