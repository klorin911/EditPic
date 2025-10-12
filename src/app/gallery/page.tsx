"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import Header from "@/components/Header";

const GRID_COLUMNS = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

type Creation = {
  id: string;
  prompt: string | null;
  image_url: string;
  source_image_url: string | null;
  created_at: string;
};

const isRemoteImage = (value: string | null | undefined) =>
  typeof value === "string" && /^https?:\/\//.test(value);

export default function GalleryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [creations, setCreations] = useState<Creation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedCreation, setSelectedCreation] = useState<Creation | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
      if (isMounted) {
        setUser(session?.user ?? null);
      }
    });

    initAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user) {
      setCreations([]);
      return;
    }

    let isCancelled = false;

    const fetchCreations = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("creations")
        .select("id,prompt,image_url,source_image_url,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (isCancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setCreations([]);
      } else {
        setCreations(data ?? []);
      }

      setIsLoading(false);
    };

    fetchCreations();

    return () => {
      isCancelled = true;
    };
  }, [supabase, user]);

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
      setCreations([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign out failed.";
      setErrorMessage(message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleDownload = async (creation: Creation) => {
    setErrorMessage(null);
    setDownloadingId(creation.id);
    try {
      const response = await fetch(creation.image_url);
      if (!response.ok) {
        throw new Error("Unable to download image.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${creation.prompt ?? "editpic-creation"}-${creation.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Download failed. Please try again.";
      setErrorMessage(message);
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (!selectedCreation) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedCreation(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCreation]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
      <Header
        user={user}
        isAuthLoading={isAuthLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <section className="rounded-2xl border border-[#26263d] bg-[#1b1b2b] p-6 shadow-lg shadow-black/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-[#d0d2ff]">Your gallery</h2>
              <p className="text-sm text-[#8e91bd]">
                View every image you have saved from the creator.
              </p>
            </div>
            {user && (
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  supabase
                    .from("creations")
                    .select("id,prompt,image_url,source_image_url,created_at")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false })
                    .then(({ data, error }) => {
                      setIsLoading(false);
                      if (error) {
                        setErrorMessage(error.message);
                        return;
                      }
                      setCreations(data ?? []);
                    });
                }}
                disabled={isLoading}
                className="self-start rounded-full border border-[#2f2f4a] px-3 py-1 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing…" : "Refresh"}
              </button>
            )}
          </div>

          {!user ? (
            <p className="mt-6 text-sm text-[#8e91bd]">
              Sign in with Google to start building your gallery.
            </p>
          ) : isLoading ? (
            <p className="mt-6 text-sm text-[#8e91bd]">Loading your creations…</p>
          ) : creations.length === 0 ? (
            <p className="mt-6 text-sm text-[#8e91bd]">
              No creations yet. Head back to the creator and save your first masterpiece!
            </p>
          ) : (
            <ul
              className={`mt-6 grid justify-items-center gap-5 sm:justify-items-stretch ${GRID_COLUMNS}`}
            >
              {creations.map((creation) => (
                <li
                  key={creation.id}
                  className="flex w-full max-w-xs flex-col overflow-hidden rounded-2xl border border-[#2f2f4a] bg-[#161622] sm:max-w-none"
                >
                  <div className="relative h-32 w-full sm:h-48">
                    <button
                      type="button"
                      onClick={() => setSelectedCreation(creation)}
                      className="relative block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]"
                      aria-label={`Open preview for ${creation.prompt ?? "generated image"}`}
                    >
                      <Image
                        src={creation.image_url}
                        alt={creation.prompt ?? "Generated image"}
                        fill
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 40vw, 60vw"
                        className="object-cover transition duration-200 hover:scale-[1.02]"
                        unoptimized={!isRemoteImage(creation.image_url)}
                      />
                    </button>
                  </div>
                  <div className="space-y-3 p-4">
                    {creation.prompt && (
                      <p className="text-sm text-[#d0d2ff]">{creation.prompt}</p>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[11px] uppercase tracking-wide text-[#6f739b]">
                        {new Date(creation.created_at).toLocaleString()}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDownload(creation)}
                        disabled={downloadingId === creation.id}
                        className="self-start rounded-full border border-[#2f2f4a] px-3 py-1 text-xs text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
                      >
                        {downloadingId === creation.id ? "Downloading…" : "Download"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {errorMessage && (
            <p className="mt-6 text-sm text-rose-400">{errorMessage}</p>
          )}
        </section>
      </main>

      {selectedCreation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setSelectedCreation(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#2f2f4a] bg-[#11111a] p-6 shadow-lg shadow-black/40 max-h-[calc(100vh-4rem)]">
            <div className="absolute right-4 top-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownload(selectedCreation)}
                disabled={downloadingId === selectedCreation.id}
                className="rounded-full bg-[#2b2b44] px-4 py-1.5 text-xs uppercase tracking-wide text-[#d0d2ff] transition hover:bg-[#34345a] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloadingId === selectedCreation.id ? "Downloading…" : "Download"}
              </button>
              <button
                type="button"
                onClick={() => setSelectedCreation(null)}
                className="rounded-full border border-[#2f2f4a] px-3 py-1 text-xs uppercase tracking-wide text-[#9ea0c9] transition hover:border-[#3b3b58] hover:text-[var(--color-foreground)]"
                aria-label="Close image preview"
              >
                Close
              </button>
            </div>
            <div className="space-y-6 pt-10">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] uppercase tracking-wide text-[#6f739b]">
                  {new Date(selectedCreation.created_at).toLocaleString()}
                </p>
              </div>
              
              {/* Created Image */}
              <div className="relative aspect-[4/3] w-full max-h-[60vh] overflow-hidden rounded-xl border border-[#2f2f4a] bg-[#161622]">
                <Image
                  src={selectedCreation.image_url}
                  alt={selectedCreation.prompt ?? "Generated image"}
                  fill
                  sizes="(min-width: 1024px) 800px, 100vw"
                  className="object-contain"
                  unoptimized={!isRemoteImage(selectedCreation.image_url)}
                  priority
                />
              </div>

              {selectedCreation.prompt && (
                <p className="text-base text-[#d0d2ff]">{selectedCreation.prompt}</p>
              )}

              {/* Original Image - shown underneath, smaller */}
              {selectedCreation.source_image_url && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-[#6f739b]">
                    Original image
                  </p>
                  <div className="flex justify-center">
                    <div className="relative w-full max-w-[300px] aspect-[4/3] overflow-hidden rounded-xl border border-[#2f2f4a] bg-[#11111a]">
                      <Image
                        src={selectedCreation.source_image_url}
                        alt="Original image"
                        fill
                        sizes="300px"
                        className="object-contain"
                        unoptimized={!isRemoteImage(selectedCreation.source_image_url)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
