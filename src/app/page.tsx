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
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
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
  const trimmedPromptValue = prompt.trim();
  const canGenerate = Boolean(uploadedImage && trimmedPromptValue && !isGenerating);
  const canDownload = Boolean(generatedImage);
  const canSaveToGallery = Boolean(user && generatedImage && !isSavingCreation);

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

  const handlePasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
      setErrorMessage("Clipboard access is not supported in this browser.");
      window.setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith("image/")) {
            const blob = await clipboardItem.getType(type);
            const file = new File([blob], "pasted-image.png", { type });
            await handleImageSelection(file);
            return;
          }
        }
      }

      setErrorMessage("No image found in your clipboard.");
      window.setTimeout(() => setErrorMessage(null), 3000);
    } catch {
      setErrorMessage("Please use Cmd+V (or Ctrl+V) to paste an image from your clipboard.");
      window.setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [handleImageSelection]);


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
    if (!uploadedImage) {
      setErrorMessage("Upload an image you want to edit first.");
      return;
    }

    if (!trimmedPromptValue) {
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
          prompt: trimmedPromptValue,
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

  const handleDownload = async () => {
    if (!generatedImage) {
      return;
    }

    try {
      const response = await fetch(generatedImage);
      if (!response.ok) {
        throw new Error("Download failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fallbackName = uploadedImageName ? `edit-${uploadedImageName}` : "editpic-edited.png";

      link.href = url;
      link.download = fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[EditPic] download:error", error);
      setErrorMessage("Unable to download the edited image. Try again.");
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

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 sm:py-8 sm:pb-8">
        <div className="flex flex-col gap-4 sm:hidden">
          {generatedImage ? (
            <>
              <div className="overflow-hidden rounded-2xl border border-[#26263d] bg-[#1b1b2b] shadow-lg shadow-black/30">
                <div className="relative aspect-square w-full">
                  <Image
                    src={generatedImage}
                    alt="Edited with EditPic"
                    fill
                    sizes="100vw"
                    className="object-contain"
                    unoptimized={!shouldOptimizeImage(generatedImage)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!canDownload}
                  className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Download edited image
                </button>
                <button
                  type="button"
                  onClick={handleSaveToGallery}
                  disabled={!canSaveToGallery}
                  className="w-full rounded-xl border border-[#2f2f4a] px-4 py-3 text-sm text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {user ? (isSavingCreation ? "Saving…" : "Save to gallery") : "Sign in to save"}
                </button>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="w-full rounded-xl border border-[#2f2f4a] px-4 py-3 text-sm text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                >
                  Edit another photo
                </button>
              </div>
              {statusMessage && (
                <p className="text-xs text-[#8e91bd]" role="status" aria-live="polite">{statusMessage}</p>
              )}
              {errorMessage && (
                <p className="text-xs text-rose-400" role="alert" aria-live="assertive">{errorMessage}</p>
              )}
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-[#26263d] bg-[#1b1b2b] shadow-lg shadow-black/30">
                {uploadedImage ? (
                  <>
                    <div className="relative aspect-square w-3/4 mx-auto overflow-hidden rounded-t-2xl">
                      <Image
                        src={uploadedImage}
                        alt="Uploaded image"
                        fill
                        sizes="100vw"
                        className="object-cover"
                        unoptimized={!shouldOptimizeImage(uploadedImage)}
                      />
                    </div>
                    <div className="flex flex-col gap-3 border-t border-[#2c2c44] bg-[#11111a] p-3 text-xs text-[#a4a6d0]">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate text-[#d0d2ff]">{uploadedImageName ?? "Uploaded image"}</span>
                        {typeof uploadedImageSize === "number" && (
                          <span>{formatFileSize(uploadedImageSize)}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-1 rounded-full border border-[#2f2f4a] px-3 py-2 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="flex-1 rounded-full border border-[#2f2f4a] px-3 py-2 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-6 px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <h2 className="text-xl font-semibold text-white">Add a photo</h2>
                      <p className="text-sm text-[#a4a6d0]">Choose how you&apos;d like to add your image</p>
                    </div>
                    
                    <div className="w-full max-w-xs space-y-1 rounded-2xl bg-[#2a2a3e] p-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-[#3a3a54] active:bg-[#3a3a54]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1b1b2b]">
                            <svg className="h-5 w-5 text-[#d0d2ff]" viewBox="0 0 15 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_1545_11873)">
                                <path d="M4.5 12.5L13 12.5C13.5523 12.5 14 12.0523 14 11.5L14 5C14 4.44771 13.5523 4 13 4L4.5 4C3.94771 4 3.5 4.44771 3.5 5L3.5 11.5C3.5 12.0523 3.94771 12.5 4.5 12.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M1 10V2.5C1 2.23478 1.10536 1.98043 1.29289 1.79289C1.48043 1.60536 1.73478 1.5 2 1.5H11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M4.1 12.4201L8.03 8.27008C8.12295 8.16794 8.23605 8.08615 8.36217 8.02988C8.4883 7.97361 8.62471 7.94408 8.76281 7.94314C8.90091 7.9422 9.03771 7.96988 9.16459 8.02442C9.29147 8.07897 9.40567 8.15921 9.5 8.26008L13.45 12.4001" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                              </g>
                              <defs>
                                <clipPath id="clip0_1545_11873">
                                  <rect width="14" height="14" fill="white" transform="translate(0.5)"/>
                                </clipPath>
                              </defs>
                            </svg>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-base font-medium text-white">Photo Library</span>
                            <span className="text-xs text-[#8e91bd]">Choose from your photos</span>
                          </div>
                        </div>
                        <svg className="h-4 w-4 text-[#6f739b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      
                      <div className="mx-4 h-px bg-[#3a3a54]"></div>
                      
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-[#3a3a54] active:bg-[#3a3a54]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1b1b2b]">
                            <svg className="h-5 w-5 text-[#d0d2ff]" viewBox="0 0 15 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_1545_11923)">
                                <path d="M14 5C14 4.73478 13.8946 4.48043 13.7071 4.29289C13.5196 4.10536 13.2652 4 13 4H11L9.5 2H5.5L4 4H2C1.73478 4 1.48043 4.10536 1.29289 4.29289C1.10536 4.48043 1 4.73478 1 5V11C1 11.2652 1.10536 11.5196 1.29289 11.7071C1.48043 11.8946 1.73478 12 2 12H13C13.2652 12 13.5196 11.8946 13.7071 11.7071C13.8946 11.5196 14 11.2652 14 11V5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M7.5 9.75C8.74264 9.75 9.75 8.74264 9.75 7.5C9.75 6.25736 8.74264 5.25 7.5 5.25C6.25736 5.25 5.25 6.25736 5.25 7.5C5.25 8.74264 6.25736 9.75 7.5 9.75Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                              </g>
                              <defs>
                                <clipPath id="clip0_1545_11923">
                                  <rect width="14" height="14" fill="white" transform="translate(0.5)"/>
                                </clipPath>
                              </defs>
                            </svg>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-base font-medium text-white">Take Photo</span>
                            <span className="text-xs text-[#8e91bd]">Use your camera</span>
                          </div>
                        </div>
                        <svg className="h-4 w-4 text-[#6f739b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    
                    <p className="text-xs text-[#6f739b]">Supports JPG, PNG, WebP up to {formatFileSize(MAX_FILE_SIZE_BYTES)}</p>
                  </div>
                )}
              </div>
              {!uploadedImage && errorMessage && (
                <p className="text-xs text-rose-400" role="alert" aria-live="assertive">{errorMessage}</p>
              )}
              {uploadedImage && (
                <div className="rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-3 shadow-lg shadow-black/30 sm:p-4">
                  <h2 id="prompt-label-mobile" className="text-sm font-medium text-[#d0d2ff]">Describe your edit</h2>
                  <textarea
                    id="prompt-input-mobile"
                    aria-labelledby="prompt-label-mobile"
                    placeholder="Replace the sky with a vibrant sunset..."
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="mt-3 h-32 w-full resize-none rounded-xl border border-[#2c2c44] bg-[#0e0e16] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                  />
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="mt-4 w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGenerating ? "Editing…" : "Edit image"}
                  </button>
                  {statusMessage && (
                    <p className="mt-2 text-xs text-[#8e91bd]" role="status" aria-live="polite">{statusMessage}</p>
                  )}
                  {errorMessage && (
                    <p className="mt-2 text-xs text-rose-400" role="alert" aria-live="assertive">{errorMessage}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="hidden w-full flex-1 flex-col gap-2 sm:flex sm:gap-4 lg:flex-row">
          <section className="flex w-full flex-col gap-4 lg:max-w-sm">
            <div
              ref={dropZoneRef}
              className={`flex flex-col gap-4 rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-3 shadow-lg shadow-black/30 sm:p-5 ${
                isDragging ? "border-indigo-400 bg-indigo-500/10" : ""
              }`}
            >
              {uploadedImage ? (
                <div className="flex flex-col gap-3">
                  <div className="overflow-hidden rounded-2xl border border-dashed border-[#3a3a54] bg-[#11111a]">
                    <div className="relative aspect-square w-full">
                      <Image
                        src={uploadedImage}
                        alt="Uploaded image"
                        fill
                        sizes="(min-width: 1024px) 24rem, 100vw"
                        className="object-cover"
                        unoptimized={!shouldOptimizeImage(uploadedImage)}
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute right-3 top-3 rounded-full border border-red-500 bg-red-500 px-3 py-1 text-xs text-white transition hover:border-red-600 hover:bg-red-600 hover:text-white"
                      >
                        Remove
                      </button>
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 text-xs text-[#d0d2ff]">
                        <p className="truncate font-medium">{uploadedImageName ?? "Uploaded image"}</p>
                        {typeof uploadedImageSize === "number" && (
                          <p className="text-[11px] text-[#a4a6d0]">{formatFileSize(uploadedImageSize)}</p>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3 text-center">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-base font-semibold text-white">Add a photo</h2>
                      <p className="text-xs text-[#a4a6d0]">Choose how you&apos;d like to add your image</p>
                    </div>

                    <div className="w-full rounded-2xl bg-[#2a2a3e] p-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-[#3a3a54] active:bg-[#3a3a54]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1b1b2b]">
                            <svg className="h-5 w-5 text-[#d0d2ff]" viewBox="0 0 15 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_desktop_photolibrary)">
                                <path d="M4.5 12.5L13 12.5C13.5523 12.5 14 12.0523 14 11.5L14 5C14 4.44771 13.5523 4 13 4L4.5 4C3.94771 4 3.5 4.44771 3.5 5L3.5 11.5C3.5 12.0523 3.94771 12.5 4.5 12.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M1 10V2.5C1 2.23478 1.10536 1.98043 1.29289 1.79289C1.48043 1.60536 1.73478 1.5 2 1.5H11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M4.1 12.4201L8.03 8.27008C8.12295 8.16794 8.23605 8.08615 8.36217 8.02988C8.4883 7.97361 8.62471 7.94408 8.76281 7.94314C8.90091 7.9422 9.03771 7.96988 9.16459 8.02442C9.29147 8.07897 9.40567 8.15921 9.5 8.26008L13.45 12.4001" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                              </g>
                              <defs>
                                <clipPath id="clip0_desktop_photolibrary">
                                  <rect width="14" height="14" fill="white" transform="translate(0.5)" />
                                </clipPath>
                              </defs>
                            </svg>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-base font-medium text-white">Photo Library</span>
                            <span className="text-xs text-[#8e91bd]">Choose from your photos</span>
                          </div>
                        </div>
                        <svg className="h-4 w-4 text-[#6f739b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      <div className="mx-4 h-px bg-[#3a3a54]" />

                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-[#3a3a54] active:bg-[#3a3a54]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1b1b2b]">
                            <svg className="h-5 w-5 text-[#d0d2ff]" viewBox="0 0 15 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_desktop_takephoto)">
                                <path d="M14 5C14 4.73478 13.8946 4.48043 13.7071 4.29289C13.5196 4.10536 13.2652 4 13 4H11L9.5 2H5.5L4 4H2C1.73478 4 1.48043 4.10536 1.29289 4.29289C1.10536 4.48043 1 4.73478 1 5V11C1 11.2652 1.10536 11.5196 1.29289 11.7071C1.48043 11.8946 1.73478 12 2 12H13C13.2652 12 13.5196 11.8946 13.7071 11.7071C13.8946 11.5196 14 11.2652 14 11V5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M7.5 9.75C8.74264 9.75 9.75 8.74264 9.75 7.5C9.75 6.25736 8.74264 5.25 7.5 5.25C6.25736 5.25 5.25 6.25736 5.25 7.5C5.25 8.74264 6.25736 9.75 7.5 9.75Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                              </g>
                              <defs>
                                <clipPath id="clip0_desktop_takephoto">
                                  <rect width="14" height="14" fill="white" transform="translate(0.5)" />
                                </clipPath>
                              </defs>
                            </svg>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-base font-medium text-white">Take Photo</span>
                            <span className="text-xs text-[#8e91bd]">Use your camera</span>
                          </div>
                        </div>
                        <svg className="h-4 w-4 text-[#6f739b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>

                    <p className="text-xs text-[#6f739b]">Supports JPG, PNG, WebP up to {formatFileSize(MAX_FILE_SIZE_BYTES)}</p>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-[#2f2f4a] bg-[#11111a] px-3 py-2 text-left text-xs text-[#9ea0c9]">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1b1b2b] text-[#d0d2ff]">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15V6a2 2 0 00-2-2h-4.5" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9v9a2 2 0 002 2h4.5" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-[#a4a6d0]">Paste an image from your clipboard</p>
                      <button
                        type="button"
                        onClick={handlePasteFromClipboard}
                        className="mt-1 inline-flex items-center gap-1 rounded-lg bg-[#2a2a3e] px-3 py-1 text-[11px] font-medium text-[#d0d2ff] transition hover:bg-[#3a3a54]"
                      >
                        Paste from clipboard
                        <span className="rounded bg-[#1b1b2b] px-1.5 py-0.5 text-[10px] text-[#8e91bd]">Cmd/Ctrl + V</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-3 shadow-lg shadow-black/30 sm:p-4">
              <h2 id="prompt-label-desktop" className="text-sm font-medium text-[#d0d2ff]">Describe your edit</h2>
              <textarea
                id="prompt-input-desktop"
                aria-labelledby="prompt-label-desktop"
                placeholder="Replace the sky with a vibrant sunset..."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="mt-3 h-28 w-full resize-none rounded-xl border border-[#2c2c44] bg-[#0e0e16] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="mt-4 w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? "Editing…" : "Edit image"}
              </button>
              {generatedImage && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="mt-2 w-full rounded-xl border border-[#2f2f4a] px-4 py-2.5 text-sm text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                >
                  Download edited image
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveToGallery}
                disabled={!canSaveToGallery}
                className="mt-2 w-full rounded-xl border border-[#2f2f4a] px-4 py-2.5 text-sm text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {user ? (isSavingCreation ? "Saving…" : "Save to gallery") : "Sign in to save"}
              </button>
              {errorMessage && (
                <p className="mt-2 text-xs text-rose-400" role="alert" aria-live="assertive">{errorMessage}</p>
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
                    <span className="text-xs text-[#8e91bd]" role="status" aria-live="polite">{statusMessage}</span>
                  )}
                  {errorMessage && (
                    <span className="text-xs text-rose-400" role="alert" aria-live="assertive">{errorMessage}</span>
                  )}
                </div>
              )}
            </div>
            {generatedImage && statusMessage && (
              <p className="mt-3 text-xs text-[#8e91bd]" role="status" aria-live="polite">{statusMessage}</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
