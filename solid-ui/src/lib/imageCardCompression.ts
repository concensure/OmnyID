// @locs-version: 1.0
/** Keep local image cards small enough that the rest of a view stays responsive. */
export const IMAGE_CARD_UPLOAD_LIMIT_BYTES = 3 * 1024 * 1024;
export const IMAGE_CARD_STORAGE_TARGET_BYTES = 2_200_000;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode this image.")), type, quality);
  });
}

export async function compressImageCardUpload(file: File): Promise<Blob> {
  if (file.size <= IMAGE_CARD_UPLOAD_LIMIT_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 2400 / Math.max(1, bitmap.width, bitmap.height));
    let quality = 0.86;
    let latest: Blob | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("The browser could not prepare this image.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      latest = await canvasBlob(canvas, "image/webp", quality);
      if (latest.size <= IMAGE_CARD_STORAGE_TARGET_BYTES) return latest;
      if (quality > 0.58) quality -= 0.1;
      else scale *= 0.78;
    }
    if (latest && latest.size < IMAGE_CARD_UPLOAD_LIMIT_BYTES) return latest;
    throw new Error("The image could not be reduced enough for a responsive card.");
  } finally {
    bitmap.close();
  }
}

export function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The image could not be read."));
    reader.onerror = () => reject(new Error("The image could not be read from this device."));
    reader.readAsDataURL(blob);
  });
}
