import { MAX_PHOTO_EDGE, type DetectedPhotoMime, type SupportedPhotoMime } from "./constants";
import { detectImageMimeType, readJpegDimensions, readSafeJpegExif } from "./exif";
import { getOrientationTransform, orientationSwapsDimensions } from "./orientation";
import type { ExifTakenAtCandidate } from "@/types/photos";

export type PhotoPreparationStage = "reading_metadata" | "compressing";

export interface PreparedVisitPhoto {
  blob: Blob;
  mimeType: SupportedPhotoMime;
  width: number;
  height: number;
  originalName: string;
  originalBytes: number;
  takenAtCandidate: ExifTakenAtCandidate | null;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
  browserAppliedOrientation: boolean;
}

function isSupportedDeclaredMime(value: string): value is DetectedPhotoMime {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp" ||
    value === "image/heic" || value === "image/heif";
}

function isHeicMime(value: DetectedPhotoMime): value is "image/heic" | "image/heif" {
  return value === "image/heic" || value === "image/heif";
}

function imageToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob?.size
      ? resolve(blob)
      : reject(new Error("The browser could not encode this image.")), "image/jpeg", 0.88);
  });
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "none" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
        browserAppliedOrientation: false,
      };
    } catch {
      // Fall through to the broadly supported HTMLImageElement decoder.
    }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This image could not be decoded. It may be damaged or use an unsupported variant.");
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
    browserAppliedOrientation: true,
  };
}

function validateDeclaredMime(declared: string, detected: DetectedPhotoMime) {
  if (!declared || declared === "application/octet-stream") return;
  if (!isSupportedDeclaredMime(declared)) {
    throw new Error("Only JPEG, PNG, WebP, HEIC, and HEIF images are supported.");
  }
  if (isHeicMime(detected) && isHeicMime(declared)) return;
  if (declared !== detected) throw new Error("The file contents do not match its declared image MIME type.");
}

export async function prepareVisitPhoto(
  file: File,
  onStage?: (stage: PhotoPreparationStage) => void,
): Promise<PreparedVisitPhoto> {
  if (file.size <= 0) throw new Error("This file is empty.");
  onStage?.("reading_metadata");
  const header = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const detectedMime = detectImageMimeType(header);
  if (!detectedMime) throw new Error("This file is not a supported JPEG, PNG, WebP, HEIC, or HEIF image.");
  validateDeclaredMime(file.type, detectedMime);

  let source: Blob = file;
  let orientation = 1;
  let takenAtCandidate: ExifTakenAtCandidate | null = null;
  let encodedDimensions: { width: number; height: number } | null = null;
  const heic = isHeicMime(detectedMime);
  if (heic) {
    const heicTools = await import("./heic-processing");
    takenAtCandidate = await heicTools.readHeicTakenAt(file);
    onStage?.("compressing");
    source = await heicTools.convertHeicToJpeg(file);
  } else if (detectedMime === "image/jpeg") {
    const exif = readSafeJpegExif(header);
    orientation = exif.orientation;
    takenAtCandidate = exif.takenAt;
    encodedDimensions = readJpegDimensions(header);
  }

  onStage?.("compressing");
  const decoded = await decodeImage(source);
  let canvas: HTMLCanvasElement | null = null;
  let outputWidth = decoded.width;
  let outputHeight = decoded.height;
  try {
    if (
      !decoded.browserAppliedOrientation && encodedDimensions && orientationSwapsDimensions(orientation) &&
      decoded.width === encodedDimensions.height && decoded.height === encodedDimensions.width
    ) orientation = 1;
    if (decoded.browserAppliedOrientation || heic) orientation = 1;

    const orientedWidth = orientationSwapsDimensions(orientation) ? decoded.height : decoded.width;
    const orientedHeight = orientationSwapsDimensions(orientation) ? decoded.width : decoded.height;
    outputWidth = orientedWidth;
    outputHeight = orientedHeight;
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(orientedWidth, orientedHeight));
    const scaledWidth = Math.max(1, Math.round(decoded.width * scale));
    const scaledHeight = Math.max(1, Math.round(decoded.height * scale));
    const transform = getOrientationTransform(orientation, scaledWidth, scaledHeight);
    canvas = document.createElement("canvas");
    canvas.width = transform.outputWidth;
    canvas.height = transform.outputHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser cannot create an image compression canvas.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(...transform.matrix);
    context.drawImage(decoded.source, 0, 0, scaledWidth, scaledHeight);
    const blob = await imageToBlob(canvas);
    return {
      blob,
      mimeType: "image/jpeg",
      width: canvas.width,
      height: canvas.height,
      originalName: file.name,
      originalBytes: file.size,
      takenAtCandidate,
    };
  } catch (error) {
    if (!heic) {
      return {
        blob: file,
        mimeType: detectedMime,
        width: Math.max(1, outputWidth),
        height: Math.max(1, outputHeight),
        originalName: file.name,
        originalBytes: file.size,
        takenAtCandidate,
      };
    }
    if (error instanceof Error) throw error;
    throw new Error("The image could not be compressed.");
  } finally {
    decoded.cleanup();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
