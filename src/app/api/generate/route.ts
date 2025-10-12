import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-image";

interface OpenRouterChoice {
  message?: {
    images?: Array<{
      image_url?: {
        url?: string;
      } | null;
    }> | null;
    content?: Array<{
      type?: string;
      image_url?: {
        url?: string;
      } | null;
      [key: string]: unknown;
    }> | null;
  } | null;
}

interface OpenRouterImageResponse {
  choices?: OpenRouterChoice[] | null;
}

function extractImageUrl(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const choices = (payload as OpenRouterImageResponse).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const firstChoice = choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null) {
    return undefined;
  }

  const message = firstChoice.message;
  if (typeof message !== "object" || message === null) {
    return undefined;
  }

  const { images, content } = message;

  if (Array.isArray(images)) {
    for (const imageEntry of images) {
      if (typeof imageEntry !== "object" || imageEntry === null) {
        continue;
      }
      const imageUrlContainer = imageEntry.image_url;
      if (typeof imageUrlContainer === "object" && imageUrlContainer !== null) {
        const url = imageUrlContainer.url;
        if (typeof url === "string" && url.length > 0) {
          return url;
        }
      }
    }
  }

  if (Array.isArray(content)) {
    for (const entry of content) {
      if (typeof entry !== "object" || entry === null) {
        continue;
      }

      if (entry.type === "image_url") {
        const imageUrlContainer = entry.image_url;
        if (typeof imageUrlContainer === "object" && imageUrlContainer !== null) {
          const url = imageUrlContainer.url;
          if (typeof url === "string" && url.length > 0) {
            return url;
          }
        }
      }
    }
  }

  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "Missing OpenRouter API key. Add OPENROUTER_API_KEY to your environment." },
        { status: 500 },
      );
    }

    const { prompt, sourceImage } = await request.json();

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const content: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [];

    if (typeof sourceImage === "string" && sourceImage.startsWith("data:image")) {
      content.push({ type: "image_url", image_url: { url: sourceImage } });
    }

    content.push({ type: "text", text: prompt.trim() });

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_TITLE ?? "EditPic",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are Nano Banana, an image editing assistant. Apply the user's requested changes to the provided image while preserving its context and quality.",
          },
          { role: "user", content },
        ],
        modalities: ["text", "image"],
      }),
    });

    const raw = await response.text();

    if (!response.ok) {
      let errorMessage = "Failed to generate an image.";
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error?.message) {
          errorMessage = parsed.error.message;
        }
      } catch {
        if (raw) {
          errorMessage = raw;
        }
      }
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Unexpected response from OpenRouter." }, { status: 502 });
    }

    const imageUrl = extractImageUrl(data);

    if (typeof imageUrl !== "string") {
      return NextResponse.json(
        { error: "The model response did not include an image. Try refining your instructions." },
        { status: 502 },
      );
    }

    return NextResponse.json({ imageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
