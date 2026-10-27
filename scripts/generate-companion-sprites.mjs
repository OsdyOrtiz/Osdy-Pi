#!/usr/bin/env node
// Generates the OpenPets "Pi" raccoon pixel art used for visual parity with the assets:
// - the "pi" header mascot, from the neutral pose, at several heights;
// - the header mascot's startup wave: the sheet's four "waving" frames, one set per size;
// - the Original-style editor companion animations, from the spritesheet
//   (8 x 9 cells of 192 x 208; convert WebP first, e.g. dwebp spritesheet.webp -o sheet.png).
// (The Hand-drawn companion style lives in extensions/osdy-pi/companion-sprite.ts.)
//
// The assets are resampled pixel art drawn with five flat colors. Every source pixel
// is first snapped to the nearest flat color, which removes the resampling noise.
// Each grid pixel then takes a weighted vote over the classes in the source area it
// covers (8 x 8 samples): outlines, light fur, and the cyan zipper weigh more, so thin
// lines and the zipper survive the reduction. Eye highlights are smaller than a grid
// pixel and lose the vote to the dark mask, so they are found in the source instead:
// small light fur spots mostly enclosed by dark in the eye band of the character (below
// the ears, above the muzzle), at most two per image, each lighting the one grid pixel
// that holds it. A final pass replaces isolated
// noise pixels whose four neighbors agree, keeping highlights and the zipper.
//
// Usage: node scripts/generate-companion-sprites.mjs <pi-base-neutral.png> <sheet.png> <out.ts> [preview.png] [wave-preview.png]
import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import process from "node:process";
import console from "node:console";
import { deflateSync, inflateSync } from "node:zlib";

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
/** Sheet crop per cell: 168 / 24 = 7 source pixels per grid pixel. Jump peaks clip their ear tips. */
const SHEET_CROP = { x: 12, y: 34, size: 168 };
const COMPANION_SIZE = 24;
/** The assets' flat colors, keyed for readable grids, with their vote weights. */
const FLAT_COLORS = [
	{ key: "O", rgb: [30, 30, 42], weight: 1.6, label: "outline and mask" },
	{ key: "H", rgb: [42, 48, 78], weight: 1, label: "hoodie" },
	{ key: "G", rgb: [144, 156, 168], weight: 1, label: "fur" },
	{ key: "L", rgb: [204, 210, 246], weight: 1.3, label: "light fur and eye highlights" },
	{ key: "Z", rgb: [90, 210, 245], weight: 4, label: "zipper" },
];
/** Despeckling never removes these small but meaningful details. */
const PROTECTED_KEYS = new Set(["L", "Z"]);
/** A grid pixel is opaque when at least this share of its area is opaque. */
const OPAQUE_SHARE = 0.4;
/**
 * Eye highlights: light spots sized relative to the crop area, searched between these
 * shares of the character's opaque height, measured from its top (so jumps still work).
 */
const EYE = { bandTop: 0.22, bandBottom: 0.55, minArea: 0.0002, maxArea: 0.0028, minDarkBorder: 0.6, perImage: 2 };
/** Row order of the OpenPets sheet and how many frames each row holds. */
const ROWS = [
	["idle", 6], ["runRight", 8], ["runLeft", 8], ["waving", 4], ["jumping", 5],
	["failed", 8], ["waiting", 6], ["running", 6], ["review", 6],
];
/** Opaque bounds of the neutral base pose. */
const BASE_CROP = { x: 96, y: 274, width: 912, height: 1018 };
/**
 * Wave crop in a sheet cell: bottom-aligned on the feet (opaque rows end at 200) and
 * centered on the cell, tall enough that the raised paw and ears stay inside. The
 * character is within about 1% of its size than in the neutral pose, so the hand-off barely moves.
 */
const WAVE_CROP = { bottom: 201, centerX: 96, height: 160 };
/** Header heights in pixels; the header picks the largest that fits (two pixels per row). */
const MASCOT_HEIGHTS = [64, 56, 48, 40, 32, 24, 16];
const SAMPLES = 8;
const TRANSPARENT = ".";

function decodePng(bytes) {
	if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Not a PNG file");
	let width = 0; let height = 0; const data = [];
	for (let offset = 8; offset < bytes.length;) {
		const length = bytes.readUInt32BE(offset);
		const kind = bytes.toString("ascii", offset + 4, offset + 8);
		const body = bytes.subarray(offset + 8, offset + 8 + length);
		if (kind === "IHDR") {
			width = body.readUInt32BE(0); height = body.readUInt32BE(4);
			if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error("Expected 8-bit RGBA, non-interlaced PNG");
		}
		if (kind === "IDAT") data.push(body);
		offset += 12 + length;
	}
	const raw = inflateSync(Buffer.concat(data));
	const stride = width * 4;
	const pixels = Buffer.alloc(height * stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		for (let i = 0; i < stride; i++) {
			const value = raw[y * (stride + 1) + 1 + i];
			const left = i >= 4 ? pixels[y * stride + i - 4] : 0;
			const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
			const upLeft = y > 0 && i >= 4 ? pixels[(y - 1) * stride + i - 4] : 0;
			let predictor = 0;
			if (filter === 1) predictor = left;
			else if (filter === 2) predictor = up;
			else if (filter === 3) predictor = (left + up) >> 1;
			else if (filter === 4) {
				const p = left + up - upLeft;
				const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft);
				predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
			}
			pixels[y * stride + i] = (value + predictor) & 255;
		}
	}
	return { width, height, pixels };
}

function encodePng(width, height, rgb) {
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (buffer) => {
		let c = 0xffffffff;
		for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (kind, body) => {
		const head = Buffer.alloc(4); head.writeUInt32BE(body.length);
		const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(kind), body])));
		return Buffer.concat([head, Buffer.from(kind), body, tail]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
	const raw = Buffer.alloc(height * (width * 3 + 1));
	for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Snaps every opaque source pixel to its nearest flat color index; -1 is transparent. */
function classify(image) {
	const classes = new Int8Array(image.width * image.height);
	const cache = new Map();
	for (let i = 0; i < classes.length; i++) {
		const [r, g, b, a] = image.pixels.subarray(i * 4, i * 4 + 4);
		if (a < 128) { classes[i] = -1; continue; }
		const cacheKey = (r >> 2) * 4096 + (g >> 2) * 64 + (b >> 2);
		let index = cache.get(cacheKey);
		if (index === undefined) {
			index = 0;
			for (let k = 1; k < FLAT_COLORS.length; k++) {
				if (distance(FLAT_COLORS[k].rgb, [r, g, b]) < distance(FLAT_COLORS[index].rgb, [r, g, b])) index = k;
			}
			cache.set(cacheKey, index);
		}
		classes[i] = index;
	}
	return { width: image.width, height: image.height, classes };
}

/** Weighted class vote over a source rectangle into a `gridWidth` x `gridHeight` key grid. */
function reduce(classified, area, gridWidth, gridHeight) {
	const scaleX = area.width / gridWidth;
	const scaleY = area.height / gridHeight;
	return Array.from({ length: gridHeight }, (_, gy) => Array.from({ length: gridWidth }, (_, gx) => {
		const votes = new Array(FLAT_COLORS.length).fill(0);
		let transparent = 0;
		for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) {
			const x = Math.floor(area.x + (gx + (sx + 0.5) / SAMPLES) * scaleX);
			const y = Math.floor(area.y + (gy + (sy + 0.5) / SAMPLES) * scaleY);
			const inside = x >= 0 && y >= 0 && x < classified.width && y < classified.height;
			const value = inside ? classified.classes[y * classified.width + x] : -1;
			if (value < 0) transparent++;
			else votes[value]++;
		}
		if (transparent > SAMPLES * SAMPLES * (1 - OPAQUE_SHARE)) return TRANSPARENT;
		let best = 0;
		for (let k = 1; k < votes.length; k++) {
			if (votes[k] * FLAT_COLORS[k].weight > votes[best] * FLAT_COLORS[best].weight) best = k;
		}
		return FLAT_COLORS[best].key;
	}).join(""));
}

const LIGHT = FLAT_COLORS.findIndex(flat => flat.key === "L");
const DARK = new Set([FLAT_COLORS.findIndex(flat => flat.key === "O"), FLAT_COLORS.findIndex(flat => flat.key === "H")]);

/** Centers of the light spots enclosed by dark in the head part of `area`, most enclosed first. */
function findEyeHighlights(classified, area) {
	const { width, classes } = classified;
	const cropArea = area.width * area.height;
	const maxArea = cropArea * EYE.maxArea;
	let opaqueTop = -1; let opaqueBottom = -1;
	for (let y = area.y; y < area.y + area.height; y++) {
		for (let x = area.x; x < area.x + area.width; x++) {
			if (classes[y * width + x] >= 0) {
				if (opaqueTop < 0) opaqueTop = y;
				opaqueBottom = y;
				break;
			}
		}
	}
	if (opaqueTop < 0) return [];
	const characterHeight = opaqueBottom - opaqueTop + 1;
	const top = opaqueTop + Math.floor(characterHeight * EYE.bandTop);
	const bottom = opaqueTop + Math.floor(characterHeight * EYE.bandBottom);
	const seen = new Set();
	const spots = [];
	for (let y = top; y < bottom; y++) for (let x = area.x; x < area.x + area.width; x++) {
		const start = y * width + x;
		if (classes[start] !== LIGHT || seen.has(start)) continue;
		const stack = [start];
		seen.add(start);
		let size = 0; let sumX = 0; let sumY = 0; let border = 0; let dark = 0;
		// Walk the whole spot: stopping early would leave fragments of large areas,
		// such as the light muzzle, to be found again as small spots.
		while (stack.length) {
			const index = stack.pop();
			const px = index % width; const py = Math.floor(index / width);
			size++; sumX += px; sumY += py;
			for (const next of [index - 1, index + 1, index - width, index + width]) {
				if (classes[next] === LIGHT) {
					if (!seen.has(next)) { seen.add(next); stack.push(next); }
				} else {
					border++;
					if (DARK.has(classes[next])) dark++;
				}
			}
		}
		if (size > maxArea || size < cropArea * EYE.minArea || dark < border * EYE.minDarkBorder) continue;
		spots.push({ enclosure: dark / border, x: sumX / size - area.x, y: sumY / size - area.y });
	}
	return spots.sort((a, b) => b.enclosure - a.enclosure).slice(0, EYE.perImage);
}

/** Lights the dark grid pixel holding each eye highlight found in the source. */
function restoreEyeHighlights(grid, classified, area) {
	const rows = grid.map(line => [...line]);
	for (const spot of findEyeHighlights(classified, area)) {
		const gx = Math.floor(spot.x / area.width * rows[0].length);
		const gy = Math.floor(spot.y / area.height * rows.length);
		if (rows[gy]?.[gx] === "O" || rows[gy]?.[gx] === "H") rows[gy][gx] = "L";
	}
	return rows.map(row => row.join(""));
}

/** Replaces an isolated pixel whose four neighbors share one other value. */
function despeckle(grid) {
	return grid.map((line, y) => [...line].map((cell, x) => {
		if (PROTECTED_KEYS.has(cell)) return cell;
		const neighbors = [grid[y - 1]?.[x], grid[y + 1]?.[x], line[x - 1], line[x + 1]];
		if (neighbors.some(neighbor => neighbor === undefined)) return cell;
		return neighbors.every(neighbor => neighbor === neighbors[0]) && neighbors[0] !== cell ? neighbors[0] : cell;
	}).join(""));
}

function renderTs(source, mascots, waves, animations) {
	const gridSource = (grid, indent) =>
		`${indent}[\n${grid.map(line => `${indent}\t"${line}",`).join("\n")}\n${indent}],`;
	const paletteSource = FLAT_COLORS.map(({ key, rgb, label }) => `\t/** ${label} */\n\t${key}: [${rgb.join(", ")}],`).join("\n");
	const mascotSource = mascots.map(grid => gridSource(grid, "\t")).join("\n");
	const waveSource = waves.map(frames =>
		`\t[\n${frames.map(frame => gridSource(frame, "\t\t")).join("\n")}\n\t],`).join("\n");
	const animationSource = animations.map(([name, frames]) =>
		`\t${name}: [\n${frames.map(frame => gridSource(frame, "\t\t")).join("\n")}\n\t],`).join("\n");
	return `// Generated by scripts/generate-companion-sprites.mjs from ${source}. Do not edit by hand.
// Grids hold palette keys, "${TRANSPARENT}" for transparent; each terminal row shows two grid rows.

export type PixelRgb = readonly [number, number, number];
export type PixelGrid = readonly string[];

export const PI_RACCOON_PALETTE: Readonly<Record<string, PixelRgb>> = {
${paletteSource}
};

/** Original-style editor companion animations, ${COMPANION_SIZE} x ${COMPANION_SIZE} pixels each. */
export const PI_RACCOON_COMPANION = {
${animationSource}
} as const satisfies Record<string, readonly PixelGrid[]>;

/** Neutral pose for the header mascot, tallest first. */
export const PI_RACCOON_MASCOT_SIZES: readonly PixelGrid[] = [
${mascotSource}
];

/**
 * Startup wave for the header mascot: four frames per size, in the same order as
 * PI_RACCOON_MASCOT_SIZES and with exactly the same grid dimensions.
 */
export const PI_RACCOON_MASCOT_WAVE: readonly (readonly PixelGrid[])[] = [
${waveSource}
];
`;
}

function writePreview(path, grids) {
	const scale = 6; const gap = 2;
	const width = grids.reduce((total, grid) => total + (grid[0].length + gap) * scale, 0);
	const height = Math.max(...grids.map(grid => grid.length)) * scale;
	const rgb = Buffer.alloc(width * height * 3);
	let left = 0;
	for (const grid of grids) {
		for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
			const key = grid[y][x];
			const color = FLAT_COLORS.find(flat => flat.key === key)?.rgb ?? [40, 36, 56];
			for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
				const index = ((y * scale + sy) * width + left + x * scale + sx) * 3;
				rgb[index] = color[0]; rgb[index + 1] = color[1]; rgb[index + 2] = color[2];
			}
		}
		left += (grid[0].length + gap) * scale;
	}
	writeFileSync(path, encodePng(width, height, rgb));
}

/** Draws rows of grids, one row per size, to a PNG. */
function writePreviewRows(path, rows, scale) {
	const gap = 2;
	const rowWidth = row => row.reduce((total, grid) => total + (grid[0].length + gap) * scale, 0);
	const rowHeight = row => Math.max(...row.map(grid => grid.length)) * scale + gap * scale;
	const width = Math.max(...rows.map(rowWidth));
	const height = rows.reduce((total, row) => total + rowHeight(row), 0);
	const rgb = Buffer.alloc(width * height * 3);
	for (let i = 0; i < rgb.length; i += 3) { rgb[i] = 40; rgb[i + 1] = 36; rgb[i + 2] = 56; }
	let top = 0;
	for (const row of rows) {
		let left = 0;
		for (const grid of row) {
			for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
				const color = FLAT_COLORS.find(flat => flat.key === grid[y][x])?.rgb;
				if (!color) continue;
				for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
					const index = ((top + y * scale + sy) * width + left + x * scale + sx) * 3;
					rgb[index] = color[0]; rgb[index + 1] = color[1]; rgb[index + 2] = color[2];
				}
			}
			left += (grid[0].length + gap) * scale;
		}
		top += rowHeight(row);
	}
	writeFileSync(path, encodePng(width, height, rgb));
}

/** Wave frames reduced to exactly the neutral grid's size, cropped with its aspect ratio. */
function waveFrames(sheet, gridWidth, gridHeight) {
	const waveRow = ROWS.findIndex(([name]) => name === "waving");
	const frameCount = ROWS[waveRow][1];
	const width = Math.round(WAVE_CROP.height * gridWidth / gridHeight);
	return Array.from({ length: frameCount }, (_, column) => {
		const area = { x: column * CELL_WIDTH + WAVE_CROP.centerX - Math.round(width / 2),
			y: waveRow * CELL_HEIGHT + WAVE_CROP.bottom - WAVE_CROP.height, width, height: WAVE_CROP.height };
		return despeckle(restoreEyeHighlights(reduce(sheet, area, gridWidth, gridHeight), sheet, area));
	});
}

function main() {
	const [basePath, sheetPath, output, preview, wavePreview] = process.argv.slice(2);
	if (!basePath || !sheetPath || !output) {
		console.error("Usage: node scripts/generate-companion-sprites.mjs <pi-base-neutral.png> <sheet.png> <out.ts> [preview.png] [wave-preview.png]");
		process.exit(1);
	}
	const base = classify(decodePng(readFileSync(basePath)));
	const sheet = classify(decodePng(readFileSync(sheetPath)));
	if (sheet.width !== CELL_WIDTH * 8 || sheet.height !== CELL_HEIGHT * ROWS.length) {
		throw new Error(`Expected a ${CELL_WIDTH * 8}x${CELL_HEIGHT * ROWS.length} sheet, got ${sheet.width}x${sheet.height}`);
	}
	const mascots = MASCOT_HEIGHTS.map(height => despeckle(restoreEyeHighlights(
		reduce(base, BASE_CROP, Math.round(height * BASE_CROP.width / BASE_CROP.height), height), base, BASE_CROP)));
	const waves = mascots.map(grid => waveFrames(sheet, grid[0].length, grid.length));
	const animations = ROWS.map(([name, count], row) => [name, Array.from({ length: count }, (_, column) => {
		const area = { x: column * CELL_WIDTH + SHEET_CROP.x, y: row * CELL_HEIGHT + SHEET_CROP.y,
			width: SHEET_CROP.size, height: SHEET_CROP.size };
		return despeckle(restoreEyeHighlights(reduce(sheet, area, COMPANION_SIZE, COMPANION_SIZE), sheet, area));
	})]);

	writeFileSync(output, renderTs(`${basename(basePath)} and ${basename(sheetPath)}`, mascots, waves, animations));
	if (preview) writePreview(preview, [...animations.map(([, frames]) => frames[0]), mascots[0], mascots.at(-1)]);
	if (wavePreview) writePreviewRows(wavePreview, mascots.map((grid, i) => [grid, ...waves[i]]), 5);
	console.log(`Wrote ${mascots.length} mascot sizes, ${waves.length} wave sets and ${animations.reduce((total, [, frames]) => total + frames.length, 0)} companion frames in ${FLAT_COLORS.length} flat colors`);
}

main();
