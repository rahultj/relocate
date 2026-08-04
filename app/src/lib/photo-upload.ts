// Client-side photo upload: downscale, get a signed Storage URL from the
// server, and PUT the bytes straight to Storage. Returns the public URL.
// Keeps image data out of server-action request bodies (which Vercel caps at
// ~4.5MB), so bulk photo adds can't hang.

import { signPhotoUploads } from "@/app/seller/photo-actions";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fileToUploadBlob } from "@/lib/image";

const BUCKET = "item-photos";

export async function uploadPhoto(file: File): Promise<string> {
  const [url] = await uploadPhotos([file]);
  return url;
}

// Upload several photos at once — one signed-URL batch, parallel PUTs. Returns
// public URLs in the same order as the input files.
export async function uploadPhotos(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const blobs = await Promise.all(files.map((f) => fileToUploadBlob(f)));
  const signed = await signPhotoUploads(files.length);
  const client = supabaseBrowser();
  return Promise.all(
    blobs.map(async (blob, i) => {
      const s = signed[i];
      const { error } = await client.storage
        .from(BUCKET)
        .uploadToSignedUrl(s.path, s.token, blob, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);
      return s.publicUrl;
    }),
  );
}
