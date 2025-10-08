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
  sketch_data_url: string | null;
  created_at: string;
};

export default function GalleryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [creations, setCreations] = useState<Creation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        .select("id,prompt,image_url,sketch_data_url,created_at")
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
                    .select("id,prompt,image_url,sketch_data_url,created_at")
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
            <ul className={`mt-6 grid gap-5 ${GRID_COLUMNS}`}>
              {creations.map((creation) => (
                <li
                  key={creation.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-[#2f2f4a] bg-[#161622]"
                >
                  <div className="relative h-48 w-full">
                    <Image
                      src={creation.image_url}
                      alt={creation.prompt ?? "Generated image"}
                      fill
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="space-y-3 p-4">
                    {creation.prompt && (
                      <p className="text-sm text-[#d0d2ff]">{creation.prompt}</p>
                    )}
                    {creation.sketch_data_url && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-[#6f739b]">
                          Original sketch
                        </p>
                        <div className="mt-2 overflow-hidden rounded-xl border border-[#2f2f4a] bg-[#11111a]">
                          <Image
                            src={creation.sketch_data_url}
                            alt="Original sketch"
                            width={420}
                            height={420}
                            className="h-auto w-full object-contain"
                          />
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] uppercase tracking-wide text-[#6f739b]">
                      {new Date(creation.created_at).toLocaleString()}
                    </p>
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
    </div>
  );
}
