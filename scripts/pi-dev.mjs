import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const devAgentDir = resolve(process.cwd(), ".pi-dev");

await mkdir(devAgentDir, { recursive: true });

const child = spawn("pi", ["-e", "."], {
	stdio: "inherit",
	env: {
		...process.env,
		PI_CODING_AGENT_DIR: devAgentDir,
	},
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});

child.on("error", (error) => {
	console.error(`Failed to start pi: ${error.message}`);
	process.exit(1);
});
