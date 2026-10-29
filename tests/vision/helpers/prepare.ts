import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RECEIPTS_DIR = path.resolve(__dirname, "../../fixtures/receipts");

/**
 * Mirrors the client's preprocessing (see Scanner/upload): longest side 1600px,
 * JPEG q85. Keeps the test faithful to what production actually sends, and
 * keeps vision cost bounded.
 */
export async function prepareImage(file: string): Promise<{
  dataUrl: string;
  base64: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
}> {
  const abs = path.join(RECEIPTS_DIR, file);
  const src = await readFile(abs);
  const pipeline = sharp(src).resize({
    width: 1600,
    height: 1600,
    fit: "inside",
    withoutEnlargement: true,
  });
  const out = await pipeline.jpeg({ quality: 85 }).toBuffer();
  const meta = await sharp(out).metadata();
  const base64 = out.toString("base64");
  return {
    dataUrl: `data:image/jpeg;base64,${base64}`,
    base64,
    mimeType: "image/jpeg",
    bytes: out.length,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

export function fixtureAbsPath(file: string): string {
  return path.join(RECEIPTS_DIR, file);
}
