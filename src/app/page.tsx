"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import Header from "@/components/Header";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasSketch, setHasSketch] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<"freehand" | "line" | "rectangle" | "circle">("freehand");
  const historyRef = useRef<{ imageData: ImageData; hasSketch: boolean }[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isSavingCreation, setIsSavingCreation] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [guestGenerationCount, setGuestGenerationCount] = useState(0);

  const supabase = useMemo(() => {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_DATABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment configuration.");
    }

    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (isMounted) {
        setUser(currentUser);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((
      _event: AuthChangeEvent,
      session: Session | null,
    ) => {
      setUser(session?.user ?? null);
    });

    initAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    // Load guest generation count from localStorage
    const stored = localStorage.getItem("guestGenerationCount");
    if (stored) {
      setGuestGenerationCount(parseInt(stored, 10) || 0);
    }
  }, []);

  const toolOptions = [
    { value: "freehand", label: "Freehand" },
    { value: "line", label: "Line" },
    { value: "rectangle", label: "Rectangle" },
    { value: "circle", label: "Circle" },
  ] as const;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(
        "--color-foreground"
      ).trim() || "#f6f7ff";

      historyRef.current = [];
      setCanUndo(false);
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let drawing = false;
    const pointer = { x: 0, y: 0 };
    const startPoint = { x: 0, y: 0 };
    let snapshot: ImageData | null = null;

    const getPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const handlePointerDown = (event: PointerEvent) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const point = getPoint(event);
      pointer.x = point.x;
      pointer.y = point.y;
      startPoint.x = point.x;
      startPoint.y = point.y;

      try {
        const snapshotImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        historyRef.current.push({ imageData: snapshotImage, hasSketch });
        if (historyRef.current.length > 20) {
          historyRef.current.shift();
        }
        setCanUndo(historyRef.current.length > 0);
      } catch (error) {
        console.error("Failed to snapshot canvas for undo", error);
      }

      if (selectedTool === "freehand") {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        snapshot = null;
      } else {
        snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drawing) {
        return;
      }

      const point = getPoint(event);
      pointer.x = point.x;
      pointer.y = point.y;

      if (selectedTool === "freehand") {
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        setHasSketch(true);
        return;
      }

      if (!snapshot) {
        return;
      }

      ctx.putImageData(snapshot, 0, 0);

      switch (selectedTool) {
        case "line": {
          ctx.beginPath();
          ctx.moveTo(startPoint.x, startPoint.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
          break;
        }
        case "rectangle": {
          ctx.beginPath();
          ctx.rect(startPoint.x, startPoint.y, point.x - startPoint.x, point.y - startPoint.y);
          ctx.stroke();
          break;
        }
        case "circle": {
          const radius = Math.hypot(point.x - startPoint.x, point.y - startPoint.y);
          ctx.beginPath();
          ctx.arc(startPoint.x, startPoint.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
    };

    const finalizeDrawing = (event?: PointerEvent) => {
      if (!drawing) {
        return;
      }

      drawing = false;

      if (event) {
        const point = getPoint(event);
        pointer.x = point.x;
        pointer.y = point.y;
      }

      if (selectedTool === "freehand") {
        ctx.closePath();
        setHasSketch(true);
        return;
      }

      if (!snapshot) {
        return;
      }

      ctx.putImageData(snapshot, 0, 0);

      switch (selectedTool) {
        case "line": {
          ctx.beginPath();
          ctx.moveTo(startPoint.x, startPoint.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
          break;
        }
        case "rectangle": {
          ctx.beginPath();
          ctx.rect(startPoint.x, startPoint.y, pointer.x - startPoint.x, pointer.y - startPoint.y);
          ctx.stroke();
          break;
        }
        case "circle": {
          const radius = Math.hypot(pointer.x - startPoint.x, pointer.y - startPoint.y);
          if (radius > 0) {
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        }
      }

      snapshot = null;
      if (pointer.x !== startPoint.x || pointer.y !== startPoint.y) {
        setHasSketch(true);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      finalizeDrawing(event);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const handlePointerLeave = (event: PointerEvent) => {
      finalizeDrawing(event);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      finalizeDrawing(event);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [selectedTool, hasSketch]);

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    try {
      const snapshotImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
      historyRef.current.push({ imageData: snapshotImage, hasSketch });
      if (historyRef.current.length > 20) {
        historyRef.current.shift();
      }
      setCanUndo(historyRef.current.length > 0);
    } catch (error) {
      console.error("Failed to snapshot canvas for undo", error);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSketch(false);
    setErrorMessage(null);
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    const previous = historyRef.current.pop();
    if (!previous) {
      setCanUndo(false);
      return;
    }

    ctx.putImageData(previous.imageData, 0, 0);
    setHasSketch(previous.hasSketch);
    setCanUndo(historyRef.current.length > 0);
    setErrorMessage(null);
  };

  const handleGenerate = async () => {
    const canvas = canvasRef.current;
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      setErrorMessage("Add a short description before generating.");
      return;
    }

    if (!hasSketch && !canvas) {
      setErrorMessage("Add a quick sketch to guide the model.");
      return;
    }

    // Check if user needs to login (non-authenticated users can only generate once)
    if (!user && guestGenerationCount >= 1) {
      setShowLoginPrompt(true);
      setErrorMessage("Sign in with Google to continue generating images.");
      return;
    }

    const sketchDataUrl = hasSketch && canvas ? canvas.toDataURL("image/png") : null;

    setIsGenerating(true);
    setErrorMessage(null);
    setStatusMessage("Generating with Nano Banana…");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          sketch: sketchDataUrl,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof result?.error === "string" ? result.error : "Failed to generate an image.";
        throw new Error(message);
      }

      if (typeof result?.imageUrl !== "string") {
        throw new Error("The model did not return an image. Try refining your prompt or sketch.");
      }

      setGeneratedImage(result.imageUrl);
      setStatusMessage("Image generated! Adjust your sketch or prompt to iterate.");

      // Increment guest generation count if not logged in
      if (!user) {
        const newCount = guestGenerationCount + 1;
        setGuestGenerationCount(newCount);
        localStorage.setItem("guestGenerationCount", newCount.toString());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while generating the image.";
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start Google sign-in.";
      setErrorMessage(message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsAuthLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign out failed.";
      setErrorMessage(message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSaveToGallery = async () => {
    if (!user) {
      setErrorMessage("Sign in with Google to save your creations.");
      return;
    }

    if (!generatedImage) {
      setErrorMessage("Generate an image before saving to your gallery.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setErrorMessage("Canvas not available. Try generating again.");
      return;
    }

    const sketchDataUrl = hasSketch ? canvas.toDataURL("image/png") : null;
    const trimmedPrompt = prompt.trim();

    setIsSavingCreation(true);
    setErrorMessage(null);

    const { error } = await supabase.from("creations").insert({
      user_id: user.id,
      prompt: trimmedPrompt.length > 0 ? trimmedPrompt : null,
      image_url: generatedImage,
      sketch_data_url: sketchDataUrl,
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setStatusMessage("Saved to your gallery!");
    }

    setIsSavingCreation(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
      <Header
        user={user}
        isAuthLoading={isAuthLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {/* Login Prompt Modal */}
      {showLoginPrompt && !user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowLoginPrompt(false)}
              className="absolute right-4 top-4 text-[#9ea0c9] transition hover:text-[var(--color-foreground)]"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 rounded-full bg-indigo-500/20 p-3">
                <svg className="h-8 w-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[var(--color-foreground)]">Sign in to continue</h3>
              <p className="mt-2 text-sm text-[#a4a6d0]">
                You&apos;ve used your free generation! Sign in with Google to create unlimited images and save them to your gallery.
              </p>
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="mt-6 w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAuthLoading ? "Signing in…" : "Sign in with Google"}
              </button>
              <button
                type="button"
                onClick={() => setShowLoginPrompt(false)}
                className="mt-3 text-xs text-[#9ea0c9] transition hover:text-[var(--color-foreground)]"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 lg:flex-row">
        <section className="flex w-full max-w-sm flex-col gap-4">
          <div className="rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-4 shadow-lg shadow-black/30">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-[#d0d2ff]">Your sketch</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="rounded-full border border-[#2f2f4a] px-3 py-1 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#2f2f4a] px-3 py-1 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                  onClick={handleClear}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {toolOptions.map((tool) => (
                <button
                  key={tool.value}
                  type="button"
                  onClick={() => setSelectedTool(tool.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    selectedTool === tool.value
                      ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                      : "border-[#2f2f4a] text-[#9ea0c9] hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                  }`}
                >
                  {tool.label}
                </button>
              ))}
            </div>
            <div
              ref={containerRef}
              className="relative mt-4 aspect-square w-full overflow-hidden rounded-xl border border-dashed border-[#3a3a54] bg-[#11111a]"
            >
              {!hasSketch && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[#6f739b]">
                  Tap or click to start sketching
                </span>
              )}
              <canvas ref={canvasRef} className="h-full w-full touch-none" />
            </div>
          </div>

          <div className="rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-4 shadow-lg shadow-black/30">
            <h2 className="text-sm font-medium text-[#d0d2ff]">Describe your image</h2>
            <textarea
              placeholder="Modern home, tree, road..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="mt-3 h-28 w-full resize-none rounded-xl border border-[#2c2c44] bg-[#0e0e16] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="mt-4 w-full rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Generating…" : "Generate"}
            </button>
            <button
              type="button"
              onClick={handleSaveToGallery}
              disabled={isSavingCreation || !generatedImage || !user}
              className="mt-2 w-full rounded-xl border border-[#2f2f4a] px-4 py-2 text-sm text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {user ? (isSavingCreation ? "Saving…" : "Save to gallery") : "Sign in to save"}
            </button>
            {errorMessage && (
              <p className="mt-2 text-xs text-rose-400">{errorMessage}</p>
            )}
          </div>
        </section>

        <section className="flex flex-1 flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#d0d2ff]">Generated image</h2>
            <span className="text-xs text-[#8e91bd]">Waiting for your prompt</span>
          </div>
          <div className="mt-4 flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[#3c3c60] bg-[#151523] text-sm">
            {generatedImage ? (
              <div className="relative h-full w-full">
                <Image
                  src={generatedImage}
                  alt="Generated from your sketch"
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-6 text-center text-[#8e91bd]">
                <span>{isGenerating ? "Generating with Nano Banana…" : "Your image will appear here once it's ready."}</span>
                {!isGenerating && statusMessage && (
                  <span className="text-xs text-[#8e91bd]">{statusMessage}</span>
                )}
                {errorMessage && (
                  <span className="text-xs text-rose-400">{errorMessage}</span>
                )}
              </div>
            )}
          </div>
          {generatedImage && statusMessage && (
            <p className="mt-3 text-xs text-[#8e91bd]">{statusMessage}</p>
          )}
        </section>
      </main>
    </div>
  );
}
