"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted ? theme ?? "system" : "system";

  const next = (t: string) => {
    if (t === "light") return "dark";
    if (t === "dark") return "system";
    return "light";
  };

  const handle = () => {
    setTheme(next(current));
  };

  const renderIcon = () => {
    if (!mounted) return <Monitor size={16} />;
    if (current === "light") return <Sun size={16} />;
    if (current === "dark") return <Moon size={16} />;
    return <Monitor size={16} />;
  };

  return (
    <button
      type="button"
      className={cn("btn btn-outline p-2", className)}
      aria-label={`theme:${current}`}
      title={undefined}
      onClick={handle}
    >
      {renderIcon()}
    </button>
  );
}
