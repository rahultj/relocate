import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase Storage client for item photos. Uses the SECRET key
// (new-style `sb_secret_...`, the service_role equivalent) — bypasses RLS, so
// this must never be imported into a client component.

const BUCKET = "item-photos";

let _sb: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase storage not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

/**
 * Upload a base64 data URL to the public item-photos bucket and return its
 * public URL. Path is random (the item slug isn't known until the publish
 * transaction runs). Throws on malformed input or upload failure.
 */
export async function uploadItemPhoto(dataUrl: string): Promise<string> {
  const m = /^data:(.+?);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error("Invalid image data.");
  const contentType = m[1];
  const bytes = Buffer.from(m[2], "base64");
  const ext = (contentType.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await client()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);

  return client().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export interface SignedUpload {
  path: string;
  token: string;
  publicUrl: string;
}

/**
 * Mint N short-lived signed upload URLs so the browser can upload images
 * straight to Storage (bypassing the serverless request-body limit). The
 * secret key signs here; the client only ever sees the per-file token.
 */
export async function signUploads(n: number): Promise<SignedUpload[]> {
  const sb = client();
  return Promise.all(
    Array.from({ length: n }, async () => {
      const path = `${crypto.randomUUID()}.jpg`;
      const { data, error } = await sb.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (error || !data) {
        throw new Error(`Could not sign upload: ${error?.message ?? "unknown"}`);
      }
      return {
        path: data.path,
        token: data.token,
        publicUrl: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
      };
    }),
  );
}
