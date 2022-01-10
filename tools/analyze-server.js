import * as Server from "lib/server.js";

export async function main(ns) {
	const args = ns.flags([["help", false]]);
	const details = [];

	if (args.help || !ns.args.length) {
		ns.tprint("This script does a more detailed analysis of a server.");
		ns.tprint(`Usage: run ${ns.getScriptName()} SERVER [SERVER2]`);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()} n00dles foodnstuff`);
		return;
	}

	await Server.initialize(ns);

	for (let i = 0; i < ns.args.length; i++) {
		const host = ns.args[i];
		const server = Server.get(host);
		details.push(server.analyze(ns));
	}
	ns.tprint(`\n${details.join("\n\n")}\n`);
}
