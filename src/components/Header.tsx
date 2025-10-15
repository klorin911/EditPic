"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useMemo, useState, useRef, useEffect } from "react";

const NAV_LINKS = [
  { href: "/", label: "Edit" },
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const normalizedPath = useMemo(() => {
    if (!pathname) {
      return "/";
    }
    if (pathname === "/gallery") {
      return "/gallery";
    }
    return "/";
  }, [pathname]);

  const activeIndex = useMemo(
    () => NAV_LINKS.findIndex((link) => link.href === normalizedPath),
    [normalizedPath],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const getUserInitials = (email: string | undefined) => {
    if (!email) return "U";
    return email.charAt(0).toUpperCase();
  };

  return (
    <header className="border-b border-[#24243a] bg-[#161622]">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4 sm:py-4">
        <div className="flex min-w-[160px] flex-col">
          <h1 className="text-base font-semibold text-[var(--color-foreground)] sm:text-lg">EditPic</h1>
          <p className="text-[11px] text-[#a4a6d0] sm:text-sm">Photo editing, reimagined</p>
        </div>
        <nav className="order-3 flex w-full flex-col gap-2 sm:order-none sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <div className="relative mx-auto flex w-full max-w-[220px] overflow-hidden rounded-full border border-[#2f2f4a] bg-[#11111a] p-0.5 sm:hidden">
            <span
              className={`absolute inset-y-0.5 w-1/2 rounded-full bg-indigo-500/25 transition-transform duration-300 ease-out ${activeIndex === 1 ? "translate-x-full" : "translate-x-0"}`}
            />
            {NAV_LINKS.map((link) => {
              const isActive = normalizedPath === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative z-10 flex-1 rounded-full px-2.5 py-1.5 text-center text-xs font-medium transition-colors ${
                    isActive ? "text-indigo-100" : "text-[#9ea0c9] hover:text-[var(--color-foreground)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {NAV_LINKS.map((link) => {
              const isActive = normalizedPath === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full border px-3 py-1.5 text-center text-xs transition sm:px-4 sm:py-2 sm:text-sm ${
                    isActive
                      ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                      : "border-[#2f2f4a] text-[#9ea0c9] hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {user ? (
          <div className="relative order-2 sm:order-none" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/30 sm:h-9 sm:w-9"
              aria-label="User menu"
            >
              {getUserInitials(user.email)}
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[#2f2f4a] bg-[#1b1b2b] shadow-lg shadow-black/30">
                <div className="border-b border-[#2f2f4a] px-4 py-3">
                  <p className="truncate text-xs text-[#a4a6d0]">Signed in as</p>
                  <p className="truncate text-sm font-medium text-[var(--color-foreground)]">
                    {user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onSignOut();
                  }}
                  disabled={isAuthLoading}
                  className="w-full px-4 py-3 text-left text-sm text-[#9ea0c9] transition hover:bg-[#26263d] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAuthLoading ? "Signing out..." : "Sign out"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            disabled={isAuthLoading}
            className="order-2 flex-shrink-0 rounded-full border border-[#2f2f4a] px-3 py-1.5 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60 sm:order-none sm:px-4 sm:py-2"
          >
            {isAuthLoading ? "Signing in..." : "Sign in"}
          </button>
        )}
      </div>
    </header>
  );
}
