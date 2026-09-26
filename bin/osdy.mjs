#!/usr/bin/env node
/* global process, console */
import { spawn } from "node:child_process";
import { constants as osConstants, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setupOsdyProfile } from "../scripts/osdy-pi-profile-setup.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = homedir();
const officialDir = process.env.OSDY_PI_SOURCE_AGENT_DIR || join(home, ".pi", "agent");
const profileDir = process.env.OSDY_PI_AGENT_DIR || join(home, ".pi", "osdy-agent");
const osdyRoot = process.env.OSDY_PI_EXTENSION_ROOT || packageRoot;
const gentleRoot = process.env.GENTLE_PI_EXTENSION_ROOT || undefined;

try {
	if (process.argv[2] === "setup" && process.argv.length !== 3)
		throw new Error("Usage: osdy setup");
	const result = await setupOsdyProfile({ officialDir, profileDir, osdyRoot, gentleRoot });
	if (process.argv[2] === "setup") {
		console.log(`Isolated Osdy profile ${result.status}: ${result.profileDir}`);
	} else {
		const child = spawn("pi", process.argv.slice(2), {
			stdio: "inherit",
			env: {
			...process.env,
			PI_CODING_AGENT_DIR: result.profileDir,
			OSDY_PI_DEV_EXTENSION_ROOT: osdyRoot,
		},
		});
		child.on("error", (error) => {
			console.error(`osdy: Could not launch installed pi from PATH: ${error.message}`);
			process.exitCode = 1;
		});
		child.on("exit", (code, signal) => {
			if (signal) process.exitCode = 128 + (osConstants.signals[signal] ?? 1);
			else process.exitCode = code ?? 1;
		});
	}
} catch (error) {
	console.error(`osdy: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
