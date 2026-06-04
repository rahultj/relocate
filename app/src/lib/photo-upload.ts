// Client-side photo upload: downscale, get a signed Storage URL from the
// server, and PUT the bytes straight to Storage. Returns the public URL.
// Keeps image data out of server-action request bodies (which Vercel caps at
// ~4.5MB), so bulk photo adds can't hang.

import { signPhotoUploads } from "@/app/seller/photo-actions";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fileToUploadBlob } from "@/lib/image";

const BUCKET = "item-photos";

export async function uploadPhoto(file: File): Promise<string> {
  const blob = await fileToUploadBlob(file);
  const [signed] = await signPhotoUploads(1);
  const { error } = await supabaseBrowser()
    .storage.from(BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, blob, {
      contentType: "image/jpeg",
    });
  if (error) throw new Error(error.message);
  return signed.publicUrl;
}
