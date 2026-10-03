import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { Image, Text, calculateImageRows, getCapabilities, getCellDimensions, setCapabilities, setCellDimensions } from "@earendil-works/pi-tui";

registerHooks({
 resolve(specifier, context, nextResolve) {
  if (specifier === "./message-role-marker-image.js")
   return { shortCircuit: true, url: new URL("./message-role-marker-image.ts", context.parentURL).href };
  return nextResolve(specifier, context);
 },
});
const { createAssistantMarker, decodeMarkerPng } = await import("./message-role-marker-image.js");
const png = readFileSync(new URL("./assets/assistant-mascot.png", import.meta.url));
const isImageLine = (line: string): boolean => line.includes("\x1b_G") || line.includes("\x1b]1337;File=");
const theme = { fg: (_color: "muted", text: string) => `muted:${text}` };
const emoji = new Text("muted:🦝", 0, 0).render(40);

void test("real PNG is validated; truncated, corrupt, oversized and non-PNG data fail closed", () => {
 assert.deepEqual(decodeMarkerPng(png)?.dimensions, { widthPx: 360, heightPx: 350 });
 const oversizedDimensions = Buffer.from(png);
 oversizedDimensions.writeUInt32BE(513, 16);
 assert.equal(decodeMarkerPng(oversizedDimensions), undefined);
 const corrupt = Buffer.from(png);
 corrupt[50] = (corrupt[50] ?? 0) ^ 1;
 for (const data of [Buffer.alloc(0), Buffer.from("not a png"), png.subarray(0, 24), png.subarray(0, -1), corrupt, Buffer.alloc(131073)])
  assert.equal(decodeMarkerPng(data), undefined);
});

void test("real Pi Image stays within 3 columns and 2 rows across protocols, resize and cell sizes", () => {
 const caps = getCapabilities();
 const cells = getCellDimensions();
 try {
  for (const images of ["kitty", "iterm2"] as const) {
   setCapabilities({ ...caps, images });
   const marker = createAssistantMarker(theme, () => true);
   for (const cell of [{ widthPx: 9, heightPx: 18 }, { widthPx: 8, heightPx: 16 }, { widthPx: 12, heightPx: 12 }]) {
    setCellDimensions(cell);
    marker.invalidate();
    for (const width of [2, 3, 4, 5, 80, 5]) {
     const lines = marker.render(width);
     assert.ok(lines.length >= 1 && lines.length <= 2);
     assert.ok(lines.some(isImageLine));
     assert.ok(!lines.join("").includes("[Image:"));
     const sequence = lines.find(isImageLine)!;
     if (images === "kitty") {
      const columns = Number(sequence.match(/(?:,|G)c=(\d+)/)?.[1]);
      const rows = Number(sequence.match(/(?:,|G)r=(\d+)/)?.[1]);
      assert.ok(columns >= 1 && columns <= Math.min(3, width) && rows >= 1 && rows <= 2);
      assert.ok(sequence.includes("C=1"));
     } else {
      const columns = Number(sequence.match(/width=(\d+)/)?.[1]);
      assert.ok(sequence.includes("height=auto"));
      const rows = calculateImageRows({ widthPx: 360, heightPx: 350 }, columns, cell);
      assert.ok(columns >= 1 && columns <= Math.min(3, width));
      assert.ok(rows >= 1 && rows <= 2);
     }
    }
   }
  }
 } finally { setCapabilities(caps); setCellDimensions(cells); }
});

void test("capability and setting changes at the same width never leak cached images or placeholders", () => {
 const caps = getCapabilities();
 let enabled = true;
 const marker = createAssistantMarker(theme, () => enabled);
 try {
  setCapabilities({ ...caps, images: "kitty" });
  assert.ok(marker.render(40).some(isImageLine));
  enabled = false;
  assert.deepEqual(marker.render(40), emoji);
  enabled = true;
  setCapabilities({ ...caps, images: null });
  assert.deepEqual(marker.render(40), emoji);
  setCapabilities({ ...caps, images: "iterm2" });
  assert.ok(marker.render(40).some(line => line.includes("\x1b]1337;File=")));
  for (const width of [0, 1, -1, NaN, Infinity, -Infinity, 2.5]) assert.deepEqual(marker.render(width), [""]);
  marker.invalidate();
  assert.ok(marker.render(2).some(isImageLine));
 } finally { setCapabilities(caps); }
});

void test("invalid cell geometry falls back, and theme invalidation refreshes the emoji", () => {
 const caps = getCapabilities();
 const cells = getCellDimensions();
 let tint = "first";
 const marker = createAssistantMarker({ fg: (_color, text) => `${tint}:${text}` }, () => true);
 try {
  setCapabilities({ ...caps, images: "iterm2" });
  for (const cell of [{ widthPx: 0, heightPx: 18 }, { widthPx: NaN, heightPx: 18 }, { widthPx: 9, heightPx: Infinity }, { widthPx: 100, heightPx: 1 }]) {
   setCellDimensions(cell);
   assert.deepEqual(marker.render(40), new Text("first:🦝", 0, 0).render(40));
  }
  tint = "second";
  marker.invalidate();
  assert.deepEqual(marker.render(40), new Text("second:🦝", 0, 0).render(40));
 } finally { setCapabilities(caps); setCellDimensions(cells); }
});

void test("asset/read failures, render errors and Pi placeholders retain the exact muted emoji", (t) => {
 const caps = getCapabilities();
 try {
  setCapabilities({ ...caps, images: "kitty" });
  for (const read of [() => { throw new Error("missing"); }, () => Buffer.from("bad")])
   assert.deepEqual(createAssistantMarker(theme, () => true, read).render(40), emoji);
  const marker = createAssistantMarker(theme, () => true);
  const stub = t.mock.method(Image.prototype, "render", () => { throw new Error("render failed"); });
  assert.deepEqual(marker.render(40), emoji);
  stub.mock.mockImplementation(() => ["[Image: image/png 360x350]"]);
  assert.deepEqual(marker.render(40), emoji);
  stub.mock.mockImplementation(() => ["", "", ""]);
  assert.deepEqual(marker.render(40), emoji);
  assert.deepEqual(createAssistantMarker(theme, () => { throw new Error("settings failed"); }).render(40), emoji);
 } finally { setCapabilities(caps); }
});
