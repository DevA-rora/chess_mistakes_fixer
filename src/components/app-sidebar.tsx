"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "@/components/ui/sidebar";
import { Home, Gamepad2, BookOpen, GraduationCap, User, Flame } from "lucide-react";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { useStreakStore } from "@/hooks/use-streak-store";

const navItems = [
  { title: "Home", href: "/", icon: Home },
  { title: "Games", href: "/games", icon: Gamepad2 },
  { title: "Review", href: "/review", icon: BookOpen },
  { title: "Practice", href: "/drill", icon: GraduationCap },
  { title: "Profile", href: "/profile", icon: User },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { streak, isActive } = useStreakStore();

  const [lottieError, setLottieError] = useState(false);
  const dotLottieRefCb = useCallback((dotLottie: DotLottie | null) => {
    if (!dotLottie) return;
    dotLottie.addEventListener("loadError", () => setLottieError(true));
    dotLottie.addEventListener("complete", () => dotLottie.pause());
  }, []);

  return (
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
      </SidebarFooter>
    </Sidebar>
  );
}
