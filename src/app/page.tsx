"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import Header from "@/components/Header";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("Unable to read image file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to load image file."));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImageName, setUploadedImageName] = useState<string | null>(null);
  const [uploadedImageSize, setUploadedImageSize] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isSavingCreation, setIsSavingCreation] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [guestGenerationCount, setGuestGenerationCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const shouldOptimizeImage = useCallback((value: string | null) => {
    if (!value) {
      return false;
    }

    return /^https?:\/\//.test(value);
  }, []);

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
    const stored = localStorage.getItem("guestGenerationCount");
    if (stored) {
      setGuestGenerationCount(parseInt(stored, 10) || 0);
    }
  }, []);

  const handleImageSelection = useCallback(
    async (file: File) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
        setErrorMessage("Please upload a JPG, PNG, or WebP image.");
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorMessage(`Image is too large. Max size is ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`);
        return;
      }

      try {
        setErrorMessage(null);
        const dataUrl = await readFileAsDataUrl(file);
        setUploadedImage(dataUrl);
        setUploadedImageName(file.name);
        setUploadedImageSize(file.size);
        setGeneratedImage(null);
        setStatusMessage(null);
      } catch (error) {
        console.error("[EditPic] upload:error", error);
        setErrorMessage("Failed to load the selected image. Try a different file.");
      }
    },
    [],
  );

  useEffect(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) {
      return;
    }

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        await handleImageSelection(file);
      }
    };

    dropZone.addEventListener("dragover", handleDragOver);
    dropZone.addEventListener("dragleave", handleDragLeave);
    dropZone.addEventListener("drop", handleDrop);

    return () => {
      dropZone.removeEventListener("dragover", handleDragOver);
      dropZone.removeEventListener("dragleave", handleDragLeave);
      dropZone.removeEventListener("drop", handleDrop);
    };
  }, [handleImageSelection]);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      await handleImageSelection(file);
    },
    [handleImageSelection],
  );

  const handleRemoveImage = () => {
    setUploadedImage(null);
    setUploadedImageName(null);
    setUploadedImageSize(null);
    setGeneratedImage(null);
    setStatusMessage(null);
  };

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            await handleImageSelection(file);
            break;
          }
        }
      }
    },
    [handleImageSelection],
  );

  useEffect(() => {
    if (user) {
      setShowLoginPrompt(false);
    }
  }, [user]);

  // Global paste event listener
  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      // Only handle paste if no input/textarea is focused
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement).contentEditable === 'true'
      );
      
      if (!isInputFocused) {
        handlePaste(event);
      }
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => {
      document.removeEventListener('paste', handleGlobalPaste);
    };
  }, [handlePaste]);

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();

    if (!uploadedImage) {
      setErrorMessage("Upload an image you want to edit first.");
      return;
    }

    if (!trimmedPrompt) {
      setErrorMessage("Describe the edit you want to make.");
      return;
    }

    if (!user && guestGenerationCount >= 1) {
      setShowLoginPrompt(true);
      setErrorMessage("Sign in with Google to continue editing images.");
      return;
    }

    setIsGenerating(true);
    setStatusMessage("Editing with Nano Banana…");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          sourceImage: uploadedImage,
        }),
      });

      const result = await response.json().catch((parseError) => {
        console.error("[EditPic] generate:parse-error", parseError);
        return {};
      });

      if (!response.ok) {
        const message = typeof result?.error === "string" ? result.error : "Failed to edit the image.";
        throw new Error(message);
      }

      if (typeof result?.imageUrl !== "string") {
        throw new Error("The model did not return an edited image. Try refining your instructions.");
      }

      setGeneratedImage(result.imageUrl);
      setStatusMessage("Edit complete! Adjust your prompt and try again if needed.");

      if (!user) {
        const newCount = guestGenerationCount + 1;
        setGuestGenerationCount(newCount);
        localStorage.setItem("guestGenerationCount", newCount.toString());
      }
    } catch (error) {
      console.error("[EditPic] generate:error", error);
      const message = error instanceof Error ? error.message : "Something went wrong while editing the image.";
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToGallery = async () => {
    if (!user) {
      setErrorMessage("Sign in with Google to save your edits.");
      return;
    }

    if (!generatedImage) {
      setErrorMessage("Edit an image before saving to your gallery.");
      return;
    }

    if (!uploadedImage) {
      setErrorMessage("Original image missing. Try uploading again.");
      return;
    }

    const trimmedPrompt = prompt.trim();

    setIsSavingCreation(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/creations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          prompt: trimmedPrompt.length > 0 ? trimmedPrompt : null,
          generatedImage,
          sourceImageDataUrl: uploadedImage,
        }),
      });

      const result: { error?: string } | undefined = await response.json().catch(() => undefined);

      if (!response.ok) {
        const message =
          typeof result?.error === "string"
            ? result.error
            : "Unable to save this edit. Please try again.";
        throw new Error(message);
      }

      setStatusMessage("Saved to your gallery!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save this edit. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSavingCreation(false);
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

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
      <Header
        user={user}
        isAuthLoading={isAuthLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {showLoginPrompt && !user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-5 shadow-2xl sm:p-6">
            <button
              type="button"
              onClick={() => setShowLoginPrompt(false)}
              className="absolute right-3 top-3 rounded-full p-1 text-[#9ea0c9] transition hover:bg-[#2f2f4a] hover:text-[var(--color-foreground)] sm:right-4 sm:top-4"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 rounded-full bg-indigo-500/20 p-3 sm:mb-4">
                <svg className="h-7 w-7 text-indigo-400 sm:h-8 sm:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[var(--color-foreground)] sm:text-lg">Sign in to continue</h3>
              <p className="mt-2 text-xs text-[#a4a6d0] sm:text-sm">
                You&apos;ve used your free edit! Sign in with Google to keep editing images and save them to your gallery.
              </p>
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="mt-5 w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-6"
              >
                {isAuthLoading ? "Signing in…" : "Sign in with Google"}
              </button>
              <button
                type="button"
                onClick={() => setShowLoginPrompt(false)}
                className="mt-3 rounded-lg px-3 py-2 text-xs text-[#9ea0c9] transition hover:bg-[#2f2f4a] hover:text-[var(--color-foreground)]"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 sm:gap-6 sm:py-8 lg:flex-row">
        <section className="flex w-full flex-col gap-4 lg:max-w-sm">
          <div
            ref={dropZoneRef}
            className={`rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-3 shadow-lg shadow-black/30 sm:p-4 ${
              isDragging ? "border-indigo-400 bg-indigo-500/10" : ""
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-medium text-[#d0d2ff]">Your image</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-full border border-[#2f2f4a] px-3 py-1.5 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] sm:flex-initial sm:py-1"
                >
                  {uploadedImage ? "Replace" : "Upload"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const clipboardItems = await navigator.clipboard.read();
                      for (const clipboardItem of clipboardItems) {
                        for (const type of clipboardItem.types) {
                          if (type.startsWith('image/')) {
                            const blob = await clipboardItem.getType(type);
                            const file = new File([blob], 'pasted-image.png', { type });
                            await handleImageSelection(file);
                            return;
                          }
                        }
                      }
                    } catch {
                      // Fallback: show a message that user should use Ctrl+V
                      setErrorMessage('Please use Ctrl+V (or Cmd+V on Mac) to paste an image from your clipboard.');
                      setTimeout(() => setErrorMessage(null), 3000);
                    }
                  }}
                  className="rounded-full border border-[#2f2f4a] px-3 py-1.5 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] sm:py-1"
                >
                  Paste
                </button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-dashed border-[#3a3a54] bg-[#11111a]">
              {uploadedImage ? (
                <div className="relative aspect-square w-full">
                  <Image
                    src={uploadedImage}
                    alt="Uploaded image"
                    fill
                    sizes="(min-width: 1024px) 24rem, 100vw"
                    className="object-cover"
                    unoptimized={!shouldOptimizeImage(uploadedImage)}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-xs text-[#d0d2ff]">
                    <p className="truncate font-medium">{uploadedImageName ?? "Uploaded image"}</p>
                    {typeof uploadedImageSize === "number" && (
                      <p className="text-[11px] text-[#a4a6d0]">{formatFileSize(uploadedImageSize)}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute right-3 top-3 rounded-full border border-[#2f2f4a] bg-[#1b1b2b]/80 px-3 py-1 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 px-6 text-center text-[#6f739b]">
                  <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5V7a2 2 0 012-2h4.5M21 16.5V7a2 2 0 00-2-2h-4.5M16.5 21H7a2 2 0 01-2-2v-4.5M16.5 3H7a2 2 0 00-2 2v4.5"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l2 2 4-4" />
                  </svg>
                  <p className="text-xs sm:text-sm">Drag and drop an image, click Upload, or paste with Ctrl+V.</p>
                  <p className="text-[11px] text-[#545679]">Supports JPG, PNG, WebP up to {formatFileSize(MAX_FILE_SIZE_BYTES)}.</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-3 shadow-lg shadow-black/30 sm:p-4">
            <h2 className="text-sm font-medium text-[#d0d2ff]">Describe your edit</h2>
            <textarea
              placeholder="Replace the sky with a vibrant sunset..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="mt-3 h-28 w-full resize-none rounded-xl border border-[#2c2c44] bg-[#0e0e16] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="mt-4 w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Editing…" : "Edit image"}
            </button>
            <button
              type="button"
              onClick={handleSaveToGallery}
              disabled={isSavingCreation || !generatedImage || !user}
              className="mt-2 w-full rounded-xl border border-[#2f2f4a] px-4 py-2.5 text-sm text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {user ? (isSavingCreation ? "Saving…" : "Save to gallery") : "Sign in to save"}
            </button>
            {errorMessage && (
              <p className="mt-2 text-xs text-rose-400">{errorMessage}</p>
            )}
          </div>
        </section>

        <section className="flex flex-1 flex-col">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-medium text-[#d0d2ff]">Edited image</h2>
            <span className="text-xs text-[#8e91bd]">
              {generatedImage
                ? "Ready to download"
                : uploadedImage
                ? "Waiting for your instructions"
                : "Upload an image to get started"}
            </span>
          </div>
          <div
            className={`mt-3 min-h-[300px] flex-1 overflow-hidden rounded-2xl border-2 border-dashed border-[#3c3c60] bg-[#151523] text-sm sm:mt-4 sm:min-h-[420px] ${
              generatedImage ? "relative" : "flex items-center justify-center"
            }`}
          >
            {generatedImage ? (
              <Image
                src={generatedImage}
                alt="Edited with EditPic"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-contain"
                unoptimized={!shouldOptimizeImage(generatedImage)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-6 text-center text-[#8e91bd]">
                <span>{isGenerating ? "Editing with Nano Banana…" : "Your edited image will appear here."}</span>
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
