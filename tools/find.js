import * as Server from "lib/server.js";

export async function main(ns) {
	const args = ns.flags([["help", false]]);
	const details = [];

	if (!ns.args.length || args.help) {
		ns.tprint(
			"This script helps you find a server on the network and shows you the path to get to it."
		);
		ns.tprint(`Usage: run ${ns.getScriptName()} SERVER [SERVER2 ...]`);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()} n00dles`);
		return;
	}

	await Server.initialize(ns);

	const locateServer = (host) => {
		const server = Server.get(host);

		details.push(`\nLocating ${host} ...\n`);
		details.push(`${server.formatRoute()}`);
		details.push("\nConnection command:");
		details.push(server.cmdConnect());
	};

	for (let i = 0; i < ns.args.length; i++) {
		const host = ns.args[i];
		locateServer(host);
	}

	ns.tprint(`${details.join("\n")}\n\n`);
}

export function autocomplete(data, args) {
	return data.servers;
}
