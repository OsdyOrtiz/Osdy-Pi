import { resolve } from "node:path";
import process from "node:process";
import { planDefaultLaunch } from "./osdy-pi-account-profiles.mjs";

export const DEV_EXTENSION_ROOT_ENV = "OSDY_PI_DEV_EXTENSION_ROOT";

export async function planPiDevLaunch(cwd, args) {
	const root = resolve(cwd);
	const env = {
		PI_CODING_AGENT_DIR: resolve(root, ".pi-dev"),
		[DEV_EXTENSION_ROOT_ENV]: root,
	};
	if (args[0] === "account") {
		return {
			command: process.execPath,
			args: [resolve(root, "bin/osdy-pi.mjs"), ...args],
			env,
		};
	}
	if (args.length > 0)
		return { command: "pi", args: ["-e", root, ...args], env };
	const result = await planDefaultLaunch(env.PI_CODING_AGENT_DIR, [], env);
	if (result.defaultAccount.status === "valid") {
		return {
			command: process.execPath,
			args: [
				resolve(root, "bin/osdy-pi.mjs"),
				"account",
				"use",
				result.defaultAccount.profile,
			],
			env,
		};
	}
	return {
		command: result.plan.command,
		args: ["-e", root, ...result.plan.args],
		env,
		warning:
			result.defaultAccount.status === "invalid"
				? "Ignoring invalid Osdy Pi default account metadata."
				: undefined,
	};
}
