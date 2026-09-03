import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { planPiDevLaunch } from "./pi-dev-plan.mjs";

const plan = await planPiDevLaunch(process.cwd(), process.argv.slice(2));
if (plan.warning) console.error(plan.warning);

await mkdir(plan.env.PI_CODING_AGENT_DIR, { recursive: true });

const child = spawn(plan.command, plan.args, {
	stdio: "inherit",
	env: { ...process.env, ...plan.env },
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
