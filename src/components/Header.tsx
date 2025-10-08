"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useMemo } from "react";

const NAV_LINKS = [
  { href: "/", label: "Create" },
  { href: "/gallery", label: "Gallery" },
] as const;

type HeaderProps = {
  user: User | null;
  isAuthLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
};

export default function Header({
  user,
  isAuthLoading,
  onSignIn,
  onSignOut,
}: HeaderProps) {
  const pathname = usePathname();

  const normalizedPath = useMemo(() => {
    if (!pathname) {
      return "/";
    }
    if (pathname === "/gallery") {
      return "/gallery";
    }
    return "/";
  }, [pathname]);

  return (
    <header className="border-b border-[#24243a] bg-[#161622]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-foreground)]">SketchPic</h1>
          <p className="text-sm text-[#a4a6d0]">You sketch it. We create it.</p>
        </div>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <nav className="flex items-center gap-2">
            {NAV_LINKS.map((link) => {
              const isActive = normalizedPath === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full border px-3 py-1 text-xs transition sm:text-sm ${
                    isActive
                      ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                      : "border-[#2f2f4a] text-[#9ea0c9] hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-xs text-[#a4a6d0]">
                Signed in as
                {" "}
                <span className="font-medium text-[var(--color-foreground)]">
                  {user.email}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={user ? onSignOut : onSignIn}
              disabled={isAuthLoading}
              className="rounded-full border border-[#2f2f4a] px-3 py-1 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {user ? "Sign out" : "Sign in with Google"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
