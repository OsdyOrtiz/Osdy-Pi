import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import ts from "typescript";
import {
	DEFAULT_EDITOR_MODE,
	EDITOR_MODES,
	resolveEffectiveEditorMode,
	type OsdyState,
	type WorkingTreeState,
	type WorkingWidgetState,
	// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
} from "./types.ts";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier.startsWith(".") &&
			specifier.endsWith(".js") &&
			context.parentURL?.endsWith(".ts")
		) {
			const sourceUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(sourceUrl))) {
				return { shortCircuit: true, url: sourceUrl.href };
			}
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) {
			const source = readFileSync(fileURLToPath(url), "utf8");
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(source, {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						target: ts.ScriptTarget.ES2022,
					},
				}).outputText,
			};
		}
		return nextLoad(url, context);
	},
});

const {
	disableOsdyPi,
	mountOsdyEditor,
	mountOsdyUi,
	syncWorkingTreeWidget,
	unmountOsdyEditor,
} = await import(
	// @ts-expect-error The test hook maps production .js specifiers to TypeScript sources.
	"./runtime-helpers.ts"
);

const WORKING_TREE_WIDGET_KEY = "osdy-pi-working-tree";

type WidgetCall = {
	key: string;
	factory: unknown;
	options: unknown;
};

function createState(overrides: Partial<OsdyState> = {}): OsdyState {
	return {
		codexUsage: { kind: "idle" },
		enabled: true,
		editorEffective: false,
		editorMode: EDITOR_MODES.SIMPLE,
		fallbackEditorFactory: undefined,
		headerVariant: "osdy-theme",
		smallMode: false,
		tui: undefined,
		workingTreeEnabled: true,
		workingTreePlacement: "aboveEditor",
		...overrides,
	};
}

function createWorkingTreeState(): WorkingTreeState {
	return {
		enabled: true,
		loading: false,
		visible: true,
		snapshot: null,
		error: undefined,
		tui: undefined,
	};
}

function createWorkingState(): WorkingWidgetState {
	return {
		active: false,
		label: "Working...",
		frame: 0,
		timer: undefined,
		tui: undefined,
	};
}

function createContext(widgetCalls: WidgetCall[], editorCalls: unknown[]) {
	return {
		hasUI: true,
		ui: {
			setEditorComponent(component: unknown): void {
				editorCalls.push(component);
			},
			notify(): void {},
			setFooter(): void {},
			setHeader(): void {},
			setWorkingVisible(): void {},
			setWidget(key: string, factory: unknown, options?: unknown): void {
				widgetCalls.push({ key, factory, options });
			},
		},
	} as unknown as ExtensionContext;
}

void test("auto editor mode is the default and small terminals use the native editor", () => {
	assert.equal(DEFAULT_EDITOR_MODE, EDITOR_MODES.AUTO);
	assert.equal(
		resolveEffectiveEditorMode(DEFAULT_EDITOR_MODE, false),
		"extended",
	);
	assert.equal(resolveEffectiveEditorMode(DEFAULT_EDITOR_MODE, true), "simple");
	assert.equal(resolveEffectiveEditorMode(EDITOR_MODES.SIMPLE, false), "simple");
	assert.equal(
		resolveEffectiveEditorMode(EDITOR_MODES.EXTENDED, false),
		"extended",
	);
	assert.equal(
		resolveEffectiveEditorMode(EDITOR_MODES.EXTENDED, true),
		"simple",
	);
});

void test("unmountOsdyEditor removes the custom editor without restoring the fallback", () => {
	const editorCalls: unknown[] = [];
	const ctx = createContext([], editorCalls);

	unmountOsdyEditor(ctx);

	assert.deepEqual(editorCalls, [undefined]);
});

void test("disableOsdyPi restores the captured editor and Osdy can reclaim it", () => {
	const editorCalls: unknown[] = [];
	const ctx = createContext([], editorCalls);
	const fallbackEditorFactory =
		(() => ({})) as unknown as OsdyState["fallbackEditorFactory"];
	const state = createState({ fallbackEditorFactory });

	disableOsdyPi(ctx, state);
	mountOsdyEditor({} as ExtensionAPI, ctx, state);

	assert.equal(editorCalls[0], fallbackEditorFactory);
	assert.equal(typeof editorCalls[1], "function");
	assert.notEqual(editorCalls[1], fallbackEditorFactory);
});

void test("syncWorkingTreeWidget unmounts a disabled widget", () => {
	const widgetCalls: WidgetCall[] = [];
	const ctx = createContext(widgetCalls, []);

	syncWorkingTreeWidget(
		ctx,
		createState({ workingTreeEnabled: false }),
		createWorkingState(),
		createWorkingTreeState(),
	);

	assert.deepEqual(widgetCalls, [
		{ key: WORKING_TREE_WIDGET_KEY, factory: undefined, options: undefined },
	]);
});

void test("syncWorkingTreeWidget remounts an enabled widget", () => {
	const widgetCalls: WidgetCall[] = [];
	const ctx = createContext(widgetCalls, []);

	syncWorkingTreeWidget(
		ctx,
		createState({ workingTreePlacement: "belowEditor" }),
		createWorkingState(),
		createWorkingTreeState(),
	);

	assert.equal(widgetCalls.length, 1);
	assert.equal(widgetCalls[0]?.key, WORKING_TREE_WIDGET_KEY);
	assert.equal(typeof widgetCalls[0]?.factory, "function");
	assert.deepEqual(widgetCalls[0]?.options, { placement: "belowEditor" });
});

void test("initial UI mount leaves a persisted disabled working tree unmounted", () => {
	const widgetCalls: WidgetCall[] = [];
	const editorCalls: unknown[] = [];
	const ctx = createContext(widgetCalls, editorCalls);

	mountOsdyUi(
		{} as ExtensionAPI,
		ctx,
		createState({ workingTreeEnabled: false }),
		createWorkingState(),
		createWorkingTreeState(),
	);

	const workingTreeCalls = widgetCalls.filter(
		(call) => call.key === WORKING_TREE_WIDGET_KEY,
	);
	assert.deepEqual(workingTreeCalls, [
		{ key: WORKING_TREE_WIDGET_KEY, factory: undefined, options: undefined },
	]);
	assert.deepEqual(editorCalls, []);
});
