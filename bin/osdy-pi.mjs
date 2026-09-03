#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
	clearDefaultAccount,
	ensureProfileLayout,
	getSharedAgentDir,
	listProfiles,
	parseAccountCommand,
	planDefaultLaunch,
	planPiLaunch,
	readDefaultAccount,
	removeProfile,
	renameProfile,
	setDefaultAccount,
	validateExistingProfile,
} from "../scripts/osdy-pi-account-profiles.mjs";

function writeStdout(message) {
	process.stdout.write(`${message}\n`);
}

function writeStderr(message) {
	process.stderr.write(`${message}\n`);
}

function printUsage() {
	writeStderr(
		"Usage: osdy-pi account list | create <name> | add <name> | rename <old> <new> | remove <name> --confirm <name> [--replacement <other>] | use <name> [-- <pi args...] | default [<name> | --clear]",
	);
}

function boundedMessage(error) {
	const message =
		error instanceof Error ? error.message : "Unable to manage Osdy Pi accounts.";
	return message.slice(0, 240);
}

function sendLauncherMessage(message) {
	if (typeof process.send === "function") process.send(message);
}

function reportLauncherFailure(error) {
	const message = boundedMessage(error);
	sendLauncherMessage({ type: "osdy-pi-error", message });
	writeStderr(message);
}

function startPi(plan) {
	const child = spawn(plan.command, plan.args, {
		stdio: "inherit",
		env: { ...process.env, ...plan.env },
	});
	child.once("spawn", () => {
		sendLauncherMessage({ type: "osdy-pi-ready" });
	});
	child.on("error", (error) => {
		reportLauncherFailure(new Error(`Failed to start Pi: ${error.message}`));
		process.exitCode = 1;
	});
	child.on("exit", (code, signal) => {
		if (signal) process.kill(process.pid, signal);
		else process.exitCode = code ?? 1;
	});
}

try {
	const args = process.argv.slice(2);
	const sharedAgentDir = getSharedAgentDir();
	if (args.length === 0) {
		const result = await planDefaultLaunch(sharedAgentDir);
		if (result.defaultAccount.status === "invalid")
			writeStderr("Ignoring invalid Osdy Pi default account metadata.");
		startPi(result.plan);
	} else {
		const command = parseAccountCommand(args);
		if (command.action === "list") {
			const profiles = await listProfiles(sharedAgentDir);
			if (profiles.length === 0)
				writeStdout(
					"No Osdy Pi accounts. Add one with: osdy-pi account add <name>",
				);
			else writeStdout(profiles.join("\n"));
		} else if (command.action === "default") {
			if (command.operation === "query") {
				const account = await readDefaultAccount(sharedAgentDir);
				if (account.status === "valid") writeStdout(account.profile);
				else if (account.status === "unset") writeStdout("No default account.");
				else
					writeStdout("Default account metadata is invalid; no account selected.");
			} else if (command.operation === "clear") {
				await clearDefaultAccount(sharedAgentDir);
				writeStdout("Default account cleared.");
			} else {
				await setDefaultAccount(sharedAgentDir, command.name);
				writeStdout(`Default account set to ${command.name}.`);
			}
		} else if (command.action === "create") {
			await ensureProfileLayout(sharedAgentDir, command.name);
			writeStdout(
				"Account profile created. Use /osdy-account Switch, then run /login and select ChatGPT Plus/Pro (Codex).",
			);
		} else if (command.action === "add") {
			await ensureProfileLayout(sharedAgentDir, command.name);
			writeStdout(
				"Account profile is ready. In Pi, run /login and select ChatGPT Plus/Pro (Codex).",
			);
			startPi(planPiLaunch(sharedAgentDir, command.name));
		} else if (command.action === "rename") {
			await renameProfile(sharedAgentDir, command.oldName, command.newName);
			writeStdout(`Account profile renamed to ${command.newName}.`);
		} else if (command.action === "remove") {
			await removeProfile(sharedAgentDir, command.name, {
				confirmation: command.name,
				replacement: command.replacement,
			});
			writeStdout(`Account profile ${command.name} permanently removed.`);
		} else {
			await validateExistingProfile(sharedAgentDir, command.name);
			await setDefaultAccount(sharedAgentDir, command.name);
			startPi(planPiLaunch(sharedAgentDir, command.name, command.piArgs));
		}
	}
} catch (error) {
	reportLauncherFailure(error);
	printUsage();
	process.exitCode = 1;
}
