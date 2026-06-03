// Downscale + recompress an image File in-browser so upload payloads stay small
// and uploads are fast (phone photos are multi-MB). Falls back to the raw file
// if the canvas path fails (e.g. HEIC a browser can't decode). Browser-only —
// import from client components.
export async function fileToUploadDataUrl(
  file: File,
  max = 1280,
  quality = 0.82,
): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
