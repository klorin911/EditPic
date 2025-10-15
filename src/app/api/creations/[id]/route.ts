import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_DATABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Missing Supabase environment configuration." },
      { status: 500 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: async (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to fetch creations." }, { status: 401 });
  }

  const { id: creationId } = await params;

  if (!creationId || typeof creationId !== "string") {
    return NextResponse.json({ error: "Creation ID is required." }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("creations")
      .select("id, prompt, image_url, source_image_url, parent_creation_id, created_at")
      .eq("id", creationId)
      .eq("user_id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Creation not found." }, { status: 404 });
      }
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: "Creation not found." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[EditPic] creation:get:error", error);
    const message = error instanceof Error ? error.message : "Failed to fetch creation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
