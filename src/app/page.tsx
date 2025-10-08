"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasSketch, setHasSketch] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      ctx.beginPath();
      ctx.moveTo(pointer.x, pointer.y);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drawing) {
        return;
      }
      const point = getPoint(event);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      pointer.x = point.x;
      pointer.y = point.y;
      setHasSketch(true);
    };

    const endDrawing = () => {
      drawing = false;
      ctx.closePath();
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", endDrawing);
    canvas.addEventListener("pointerleave", endDrawing);
    canvas.addEventListener("pointercancel", endDrawing);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", endDrawing);
      canvas.removeEventListener("pointerleave", endDrawing);
      canvas.removeEventListener("pointercancel", endDrawing);
    };
  }, []);

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSketch(false);
    setErrorMessage(null);
  };

  const handleGenerate = async () => {
    const canvas = canvasRef.current;
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      setErrorMessage("Add a short description before generating.");
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while generating the image.";
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
      <header className="border-b border-[#24243a] bg-[#161622]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-semibold text-[var(--color-foreground)]">SketchPic</h1>
          <p className="text-sm text-[#a4a6d0]">You sketch it. We create it.</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 lg:flex-row">
        <section className="flex w-full max-w-sm flex-col gap-4">
          <div className="rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-4 shadow-lg shadow-black/30">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-[#d0d2ff]">Your sketch</h2>
              <button
                type="button"
                className="rounded-full border border-[#2f2f4a] px-3 py-1 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                onClick={handleClear}
              >
                Clear
              </button>
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
                <span>{isGenerating ? "Generating with Nano Banana…" : "Your image will appear here once it&apos;s ready."}</span>
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
