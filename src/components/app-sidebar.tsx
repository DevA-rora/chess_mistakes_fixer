"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, UserButton } from "@clerk/nextjs";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Home, Gamepad2, BookOpen, GraduationCap, User, Flame } from "lucide-react";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { useStreakStore } from "@/hooks/use-streak-store";
import { AuthModal } from "./auth-modal";

const navItems = [
  { title: "Home", href: "/", icon: Home },
  { title: "Games", href: "/games", icon: Gamepad2 },
  { title: "Review", href: "/review", icon: BookOpen },
  { title: "Practice", href: "/drill", icon: GraduationCap },
  { title: "Profile", href: "/profile", icon: User },
];

function UserButtonWithSidebarControl() {
  const { setOpen } = useSidebar();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    
    let observer: MutationObserver | null = null;
    
    const setupObserver = () => {
      const button = ref.current?.querySelector('button');
      if (button) {
        observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'aria-expanded') {
              const isExpanded = button.getAttribute('aria-expanded') === 'true';
              if (isExpanded) {
                setOpen(false);
              } else {
                setOpen(true);
              }
            }
          }
        });
        observer.observe(button, { attributes: true, attributeFilter: ['aria-expanded'] });
        return true;
      }
      return false;
    };

    if (!setupObserver()) {
      const containerObserver = new MutationObserver(() => {
        if (setupObserver()) {
          containerObserver.disconnect();
        }
      });
      containerObserver.observe(ref.current, { childList: true, subtree: true });
      return () => {
        containerObserver.disconnect();
        if (observer) observer.disconnect();
      };
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [setOpen]);

  return (
    <div ref={ref}>
      <UserButton />
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { streak, isActive } = useStreakStore();
  const { isSignedIn } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState<"signin" | "signup" | null>(null);

  useEffect(() => {
    if (isSignedIn) {
      setAuthModalOpen(null);
    }
  }, [isSignedIn]);

  const [lottieError, setLottieError] = useState(false);
  const dotLottieRefCb = useCallback((dotLottie: DotLottie | null) => {
    if (!dotLottie) return;
    dotLottie.addEventListener("loadError", () => setLottieError(true));
    dotLottie.addEventListener("complete", () => dotLottie.pause());
  }, []);

  const StreakDisplay = () => (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      {isActive && !lottieError ? (
        <div className="h-8 w-8 -ml-1 -mt-3 flex items-center justify-center shrink-0">
          <DotLottieReact
            src="https://lottie.host/f7619fc0-61e0-4cd2-8943-22736b0949ff/UCgpGs4pCK.lottie"
            autoplay
            dotLottieRefCallback={dotLottieRefCb}
          />
        </div>
      ) : (
        <Flame className="h-5 w-5 text-muted-foreground" />
      )}
      <span>{streak > 0 ? `${streak} day streak` : "No streak"}</span>
    </div>
  );

  return (
    <>
      <Sidebar>
        <SidebarHeader className="p-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Flame className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold leading-tight">Chess Fixer</span>
              <span className="text-xs text-muted-foreground">Spaced Repetition Coach</span>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname === item.href}>
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4">
          {isSignedIn ? (
            <div className="flex items-center gap-4 justify-between w-full">
              <UserButtonWithSidebarControl />
              <StreakDisplay />
            </div>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAuthModalOpen("signin")}
                className="w-full"
              >
                Sign In
              </Button>
              <Button
                size="sm"
                onClick={() => setAuthModalOpen("signup")}
                className="w-full"
              >
                Sign Up
              </Button>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
      <AuthModal open={isSignedIn ? null : authModalOpen} onOpenChange={setAuthModalOpen} />
    </>
  );
}

