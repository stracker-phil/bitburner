import * as Server from "lib/server.js";

export async function main(ns) {
	const args = ns.flags([["help", false]]);

	if (args.help) {
		ns.tprint("This script displays all known servers you have access to.");
		ns.tprint(`Usage: run ${ns.getScriptName()}`);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()}`);
		return;
	}

	const addChildren = (parent, output, level) => {
		const server = Server.get(parent);
		const prefix = "  ".repeat(level);
		const infos = [];

		if (server.purchasedByPlayer) {
			infos.push(`${server.ramTotalMax} GB`);
			infos.push(
				`${server.cpuCores} core${server.cpuCores > 1 ? "s" : ""}`
			);
		} else {
			if (server.hasAdminRights) {
				infos.push("HACKED");
			} else {
				infos.push(`lvl ${server.requiredHackingSkill}`);
			}
		}

		if (server.organizationName) {
			infos.push(server.organizationName);
		}

		output.push(`${prefix} > ${parent}  -  ${infos.join(" | ")}`);

		for (const i in server.children) {
			const child = server.children[i];

			if (child) {
				addChildren(child, output, level + 1);
			}
		}
	};

	await Server.initialize(ns);
	const lines = [];

	addChildren("home", lines, 0);

	ns.tprint(`\n\n${lines.join("\n")}\n\n`);
}
