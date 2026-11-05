// @locs-version: 1.0

const ACCEPTED_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_AVATAR_BYTES = 128 * 1024;
const AVATAR_EDGE = 160;

export function personaAvatarFileError(file: Pick<File, "type" | "size">): string | null {
  if (!ACCEPTED_TYPES.has(file.type.toLowerCase())) return "Choose a WebP, JPEG, or PNG image.";
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) return "Choose an image smaller than 8 MB.";
  return null;
}

export function personaAvatarDataUrlByteLength(dataUrl: string): number {
  const encoded = dataUrl.split(",", 2)[1] ?? "";
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(encoded.length * 3 / 4) - padding);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be opened."));
    image.src = dataUrl;
  });
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("That image could not be read."));
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.readAsDataURL(file);
  });
}

export async function preparePersonaAvatar(file: File): Promise<string> {
  const validationError = personaAvatarFileError(file);
  if (validationError) throw new Error(validationError);
  const image = await loadImage(await readFile(file));
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_EDGE;
  canvas.height = AVATAR_EDGE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the image.");
  const scale = Math.max(AVATAR_EDGE / image.naturalWidth, AVATAR_EDGE / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (AVATAR_EDGE - width) / 2, (AVATAR_EDGE - height) / 2, width, height);
  const webp = canvas.toDataURL("image/webp", 0.78);
  const result = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.78);
  if (personaAvatarDataUrlByteLength(result) > MAX_AVATAR_BYTES) {
    throw new Error("The prepared image is still too large. Choose a simpler or smaller image.");
  }
  return result;
}
