/**
 * Images live inside the note's markdown as data: URLs — notes are plain
 * chrome.storage records with no file store beside them, and a downloaded
 * .md stays self-contained. Big photos and screenshots are scaled down and
 * re-encoded first so a note doesn't balloon to megabytes per image.
 */

const MAX_SIDE = 1600;
const KEEP_AS_IS_BYTES = 300_000;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function imageToDataUrl(file: Blob): Promise<string> {
  // Animated GIFs and SVGs would lose what makes them worth keeping.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return readAsDataUrl(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return readAsDataUrl(file);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) {
    bitmap.close();
    return readAsDataUrl(file);
  }
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
  return readAsDataUrl(out.size < file.size ? out : file);
}

export function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}
