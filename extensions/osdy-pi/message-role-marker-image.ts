import { readFileSync, statSync } from "node:fs";
import { inflateSync } from "node:zlib";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Image, Text, getCapabilities, getCellDimensions, getImageDimensions, type Component, type ImageDimensions } from "@earendil-works/pi-tui";

const ASSET = new URL("./assets/assistant-mascot.png", import.meta.url);
const MAX_BYTES = 128 * 1024;
type MarkerImage = { base64: string; dimensions: ImageDimensions };

function crc32(bytes: Buffer): number {
 let crc = 0xffffffff;
 for (const byte of bytes) {
  crc ^= byte;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
 }
 return (crc ^ 0xffffffff) >>> 0;
}

/** Accept only bounded, intact RGBA PNGs, not just a plausible dimension header. */
export function decodeMarkerPng(bytes: Buffer): MarkerImage | undefined {
 try {
  if (bytes.length < 45 || bytes.length > MAX_BYTES ||
   !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return undefined;
  const base64 = bytes.toString("base64");
  const dimensions = getImageDimensions(base64, "image/png");
  if (!dimensions || dimensions.widthPx < 1 || dimensions.heightPx < 1 ||
   dimensions.widthPx > 512 || dimensions.heightPx > 512) return undefined;
  const data: Buffer[] = [];
  let ended = false;
  for (let offset = 8; offset < bytes.length;) {
   const length = bytes.readUInt32BE(offset);
   const end = offset + 12 + length;
   if (end > bytes.length) return undefined;
   const kind = bytes.toString("ascii", offset + 4, offset + 8);
   if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return undefined;
   if (offset === 8 && (kind !== "IHDR" || length !== 13 || bytes[offset + 16] !== 8 ||
    bytes[offset + 17] !== 6 || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0)) return undefined;
   if (kind === "IDAT") data.push(bytes.subarray(offset + 8, end - 4));
   if (kind === "IEND") { ended = length === 0 && end === bytes.length; break; }
   offset = end;
  }
  if (!ended || data.length === 0) return undefined;
  const stride = dimensions.widthPx * 4 + 1;
  const pixels = inflateSync(Buffer.concat(data), { maxOutputLength: stride * dimensions.heightPx });
  if (pixels.length !== stride * dimensions.heightPx) return undefined;
  for (let row = 0; row < dimensions.heightPx; row++) if (pixels[row * stride]! > 4) return undefined;
  return { base64, dimensions };
 } catch { return undefined; }
}

let loaded = false;
let packagedImage: MarkerImage | undefined;
function readPackagedImage(): MarkerImage | undefined {
 if (!loaded) {
  loaded = true;
  try {
   if (statSync(ASSET).size <= MAX_BYTES) packagedImage = decodeMarkerPng(readFileSync(ASSET));
  } catch { /* Missing assets retain the emoji. */ }
 }
 return packagedImage;
}

export function createAssistantMarker(
 theme: Pick<Theme, "fg">,
 imagesEnabled: () => boolean,
 read?: () => Buffer,
): Component {
 let asset: MarkerImage | undefined;
 try { asset = read ? decodeMarkerPng(read()) : readPackagedImage(); } catch { /* Optional image. */ }
 const image = asset ? new Image(asset.base64, "image/png", { fallbackColor: text => theme.fg("muted", text) },
  { maxWidthCells: 3, maxHeightCells: 2 }, asset.dimensions) : undefined;
 let geometry = "";
 return {
  render(width) {
   if (!Number.isInteger(width) || width < 2) return [""];
   const fallback = (): string[] => new Text(theme.fg("muted", "🦝"), 0, 0).render(width);
   try {
    const protocol = getCapabilities().images;
    if (!image || !imagesEnabled() || !protocol) return fallback();
    const cell = getCellDimensions();
    if (!Number.isFinite(cell.widthPx) || !Number.isFinite(cell.heightPx) || cell.widthPx <= 0 || cell.heightPx <= 0 || !asset) return fallback();
    // iTerm2 emits height=auto: cap width before Pi rounds the cell reservation.
    const columns = Math.min(3, width, Math.floor(2 * cell.heightPx * asset.dimensions.widthPx / (cell.widthPx * asset.dimensions.heightPx)));
    if (columns < 1) return fallback();
    const current = `${protocol}:${cell.widthPx}:${cell.heightPx}`;
    if (geometry !== current) { image.invalidate(); geometry = current; }
    // Pi Image reserves two horizontal cells internally. The marker has no padding.
    const lines = image.render(columns + 2);
    const prefix = protocol === "kitty" ? "\x1b_G" : "\x1b]1337;File=";
    if (lines.length < 1 || lines.length > 2 || !lines.some(line => line.includes(prefix)) ||
     lines.some(line => line !== "" && !line.includes(prefix))) return fallback();
    return lines;
   } catch { return fallback(); }
  },
  invalidate() { image?.invalidate(); geometry = ""; },
 };
}
