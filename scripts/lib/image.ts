// Turns an arbitrary Google Drive upload into a safe, small, EXIF-stripped
// WebP profile photo — or rejects it. Never exposes an original upload
// directly (spec section 17): SVG, HTML-as-image, executables, oversized
// files, and malformed images are all rejected before sharp ever decodes
// pixel data into a rendered output.
import sharp, { type Metadata } from "sharp";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12MB raw upload cap
export const MAX_INPUT_PIXELS = 40_000_000; // ~40MP decompression-bomb guard
export const OUTPUT_SIZE = 512; // square profile photo, px

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

/** Magic-byte allowlist, checked before any decoding is attempted. */
function sniffRasterFormat(buf: Buffer): "jpeg" | "png" | "webp" | undefined {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return undefined;
}

export class UnsafeImageError extends Error {}

export interface ProcessedImage {
  buffer: Buffer;
  format: "webp";
  width: number;
  height: number;
}

/**
 * Validates and re-encodes an uploaded photo. Throws UnsafeImageError with a
 * human-readable reason for any file that fails validation — callers should
 * catch this per-person so one bad photo never aborts the whole sync.
 */
export async function processProfileImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw new UnsafeImageError("Empty file");
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new UnsafeImageError(`File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit`);
  }

  const sniffed = sniffRasterFormat(input);
  if (!sniffed) {
    throw new UnsafeImageError(
      "File is not a recognized JPEG/PNG/WebP (magic-byte check failed) — SVG, HTML, and other formats are rejected",
    );
  }

  const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false });

  let metadata: Metadata;
  try {
    metadata = await image.metadata();
  } catch (err) {
    throw new UnsafeImageError(`Image could not be decoded: ${(err as Error).message}`);
  }

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new UnsafeImageError(`Decoded format "${metadata.format}" is not an allowed raster type`);
  }
  if (!metadata.width || !metadata.height) {
    throw new UnsafeImageError("Image has no readable dimensions");
  }
  if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw new UnsafeImageError("Image dimensions exceed the maximum allowed pixel count");
  }

  // No .withMetadata() call: sharp strips EXIF/IPTC/XMP by default on output.
  const buffer = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate() // apply EXIF orientation before it's stripped
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();

  return { buffer, format: "webp", width: OUTPUT_SIZE, height: OUTPUT_SIZE };
}
