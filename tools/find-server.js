import * as Server from "lib/server.js";

export async function main(ns) {
	const args = ns.flags([["help", false]]);
	let host = args._[0];

	if (!host || args.help) {
		ns.tprint(
			"This script helps you find a server on the network and shows you the path to get to it."
		);
		ns.tprint(`Usage: run ${ns.getScriptName()} SERVER`);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()} n00dles`);
		return;
	}

	const lines = ["", `Locating ${host} ...`];
	await Server.initialize(ns);
	const server = Server.get(host);

	for (const i in server.route) {
		const extra = i > 0 ? "└ " : "";
		lines.push(`  ${"  ".repeat(i)}${extra}${server.route[i]}`);
	}

	lines.push("\nConnection command:");
	lines.push(server.cmdConnect());

	ns.tprint(`${lines.join("\n")}\n\n`);
}

export function autocomplete(data, args) {
	return data.servers;
}
