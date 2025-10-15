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
    return NextResponse.json({ error: "You must be signed in to fetch creation history." }, { status: 401 });
  }

  const { id: creationId } = await params;

  if (!creationId || typeof creationId !== "string") {
    return NextResponse.json({ error: "Creation ID is required." }, { status: 400 });
  }

  try {
    // First, get the root creation (the one with no parent)
    const { data: rootCreation, error: rootError } = await supabase
      .from("creations")
      .select("id, prompt, image_url, source_image_url, parent_creation_id, created_at")
      .eq("id", creationId)
      .eq("user_id", user.id)
      .single();

    if (rootError) {
      if (rootError.code === "PGRST116") {
        return NextResponse.json({ error: "Creation not found." }, { status: 404 });
      }
      throw rootError;
    }

    if (!rootCreation) {
      return NextResponse.json({ error: "Creation not found." }, { status: 404 });
    }

    // Find the root of the chain by traversing up the parent chain
    let currentId = creationId;
    const visited = new Set<string>();
    
    while (currentId) {
      if (visited.has(currentId)) {
        // Prevent infinite loops
        break;
      }
      visited.add(currentId);
      
      const { data: currentCreation } = await supabase
        .from("creations")
        .select("id, parent_creation_id")
        .eq("id", currentId)
        .eq("user_id", user.id)
        .single();
      
      if (!currentCreation || !currentCreation.parent_creation_id) {
        break;
      }
      
      currentId = currentCreation.parent_creation_id;
    }

    // Now get all creations in the chain starting from the root
    const { data: chainCreations, error: chainError } = await supabase
      .from("creations")
      .select("id, prompt, image_url, source_image_url, parent_creation_id, created_at")
      .eq("user_id", user.id)
      .or(`id.eq.${currentId},parent_creation_id.eq.${currentId}`)
      .order("created_at", { ascending: true });

    if (chainError) {
      throw chainError;
    }

    // Build the chain by following parent relationships
    const chain: typeof rootCreation[] = [];
    const creationMap = new Map(chainCreations?.map(c => [c.id, c]) || []);
    
    // Start from the root and build the chain
    let nextId: string | null = currentId;
    while (nextId && creationMap.has(nextId)) {
      const creation = creationMap.get(nextId)!;
      chain.push(creation);
      
      // Find the next creation in the chain
      nextId = null;
      for (const [id, c] of creationMap) {
        if (c.parent_creation_id === creation.id) {
          nextId = id;
          break;
        }
      }
    }

    return NextResponse.json({ chain });
  } catch (error) {
    console.error("[EditPic] creation-history:error", error);
    const message = error instanceof Error ? error.message : "Failed to fetch creation history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
