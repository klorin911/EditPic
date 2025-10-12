import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type UploadResult = {
  publicUrl: string;
  storagePath: string;
};

const DEFAULT_BUCKET = "creations";

function parseDataUrl(value: string) {
  const match = /^data:([\w/+.-]+);base64,(.+)$/u.exec(value);
  if (!match) {
    return null;
  }

  const [, mimeType, data] = match;
  if (!mimeType || !data) {
    return null;
  }

  const buffer = Buffer.from(data, "base64");
  return {
    buffer,
    mimeType,
    extension: mimeToExtension(mimeType),
  };
}

function mimeToExtension(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

async function fetchRemoteImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image (${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/png";
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: contentType,
    extension: mimeToExtension(contentType),
  };
}

type StorageApi = Pick<ReturnType<typeof createClient>, "storage">;

async function ensureBucketExists(serviceClient: StorageApi, bucketName: string) {
  const { data, error } = await serviceClient.storage.getBucket(bucketName);
  if (data) {
    return;
  }

  if (error && !/not found/i.test(error.message)) {
    throw error;
  }

  const { error: createError } = await serviceClient.storage.createBucket(bucketName, {
    public: true,
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw createError;
  }
}

async function uploadToStorage(
  serviceClient: StorageApi,
  bucketName: string,
  folder: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const path = `${folder}/${filename}`;

  const { error: uploadError } = await serviceClient.storage
    .from(bucketName)
    .upload(path, buffer, {
      cacheControl: "3600",
      contentType,
    });

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = serviceClient.storage.from(bucketName).getPublicUrl(path);

  return { publicUrl, storagePath: path };
}

function buildFileName(extension: string) {
  return `${Date.now()}-${randomUUID()}.${extension}`;
}

export async function POST(request: NextRequest) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_DATABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET ?? DEFAULT_BUCKET;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Missing Supabase environment configuration." },
      { status: 500 },
    );
  }

  if (!supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase service role key. Add SUPABASE_SERVICE_ROLE_KEY to the environment." },
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
    return NextResponse.json({ error: "You must be signed in to save creations." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { generatedImage?: unknown }).generatedImage !== "string"
  ) {
    return NextResponse.json(
      { error: "Generated image is required in the payload." },
      { status: 400 },
    );
  }

  const { prompt, generatedImage, sourceImageDataUrl } = payload as {
    prompt?: string | null;
    generatedImage: string;
    sourceImageDataUrl?: string | null;
  };

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  try {
    await ensureBucketExists(serviceClient, bucketName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare storage bucket.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let generatedImageBuffer: Buffer;
  let generatedImageMime: string;
  let generatedImageExtension: string;

  if (generatedImage.startsWith("data:")) {
    const parsed = parseDataUrl(generatedImage);
    if (!parsed) {
      return NextResponse.json({ error: "Generated image data URI is invalid." }, { status: 400 });
    }
    generatedImageBuffer = parsed.buffer;
    generatedImageMime = parsed.mimeType;
    generatedImageExtension = parsed.extension;
  } else if (generatedImage.startsWith("http://") || generatedImage.startsWith("https://")) {
    try {
      const parsed = await fetchRemoteImage(generatedImage);
      generatedImageBuffer = parsed.buffer;
      generatedImageMime = parsed.mimeType;
      generatedImageExtension = parsed.extension;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to download generated image.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } else {
    return NextResponse.json(
      { error: "Generated image format is not supported." },
      { status: 400 },
    );
  }

  const uploadFolder = `users/${user.id}`;
  let storedImage: UploadResult | null = null;
  let storedSource: UploadResult | null = null;

  try {
    storedImage = await uploadToStorage(
      serviceClient,
      bucketName,
      uploadFolder,
      buildFileName(generatedImageExtension),
      generatedImageBuffer,
      generatedImageMime,
    );

    if (sourceImageDataUrl && typeof sourceImageDataUrl === "string" && sourceImageDataUrl.startsWith("data:")) {
      const sourceParsed = parseDataUrl(sourceImageDataUrl);
      if (sourceParsed) {
        storedSource = await uploadToStorage(
          serviceClient,
          bucketName,
          uploadFolder,
          buildFileName(sourceParsed.extension),
          sourceParsed.buffer,
          sourceParsed.mimeType,
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload images to storage.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!storedImage || !storedImage.publicUrl) {
    return NextResponse.json(
      { error: "Failed to get the public URL for the generated image." },
      { status: 500 },
    );
  }

  try {
    const { error: insertError } = await supabase.from("creations").insert({
      user_id: user.id,
      prompt: prompt && prompt.trim().length > 0 ? prompt.trim() : null,
      image_url: storedImage.publicUrl,
      source_image_url: storedSource?.publicUrl ?? null,
    });

    if (insertError) {
      console.error("[EditPic] creations:insert", insertError);
      throw insertError;
    }
  } catch (error) {
    console.error("[EditPic] creations:error", error);
    const message = error instanceof Error ? error.message : "Failed to save creation.";

    // Attempt a best-effort cleanup of uploaded files if the database insert fails.
    const pathsToRemove = [storedImage?.storagePath, storedSource?.storagePath].filter(
      (value): value is string => Boolean(value),
    );
    if (pathsToRemove.length > 0) {
      void serviceClient.storage.from(bucketName).remove(pathsToRemove);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    imageUrl: storedImage?.publicUrl ?? null,
    sourceUrl: storedSource?.publicUrl ?? null,
  });
}
