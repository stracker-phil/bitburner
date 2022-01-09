import * as Server from "lib/server.js";

export async function main(ns) {
	const args = ns.flags([["help", false]]);
	const host = ns.args[0];

	if (args.help || !host) {
		ns.tprint("This script does a more detailed analysis of a server.");
		ns.tprint(`Usage: run ${ns.getScriptName()} SERVER`);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()} n00dles`);
		return;
	}

	await Server.initialize(ns);
	const server = Server.get(host);
	ns.tprint(`\n${server.analyze(ns)}\n`);
}
