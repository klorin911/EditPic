import type { NextConfig } from "next";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_DATABASE_URL;

if (supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl);
    remotePatterns.push({
      protocol: parsed.protocol.replace(":", "") as "http" | "https",
      hostname: parsed.hostname,
      pathname: "/storage/v1/object/public/**",
    });
  } catch {
    // Ignore invalid URLs. Build will continue without remote patterns.
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
};

export default nextConfig;
