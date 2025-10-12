"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[EditPic] global-error", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-[#0e0e16] px-6 text-center text-[#d0d2ff]">
        <div className="max-w-md space-y-4">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-[#9ea0c9]">
            We ran into an unexpected problem while rendering this page. Try again or return to the home screen.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-lg border border-[#2f2f4a] px-4 py-2 text-sm text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[#d0d2ff]"
            >
              Go home
            </Link>
          </div>
          {error?.digest && (
            <p className="text-xs text-[#6f739b]">Error code: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}

