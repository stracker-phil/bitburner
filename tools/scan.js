import * as Common from "lib/common.js";
import * as Server from "lib/server.js";

export async function main(ns) {
	const args = ns.flags([
		["help", false],
		["hacked", false],
		["own", false],
		["tree", false],
	]);

	if (args.help) {
		ns.tprint("This script displays all known servers you have access to.");
		ns.tprint(`Usage: run ${ns.getScriptName()} [--hacked|--own] [--tree] KEYWORD`);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()} --hacked`);
		ns.tprint(`> run ${ns.getScriptName()} --tree`);
		ns.tprint(`> run ${ns.getScriptName()} corp`);
		return;
	}

	const list = [];
	const config = Common.getConfig(ns);

	if (args.hacked) {
		args.own = false;
	}

	const includeResult = (server) => {
		if (args.hacked) {
			if (!server.hasAdminRights || server.purchasedByPlayer) {
				return false;
			}
		} else if (args.own) {
			return server.purchasedByPlayer;
		}

		if (args._.length) {
			const host = server.hostname.toLowerCase();

			for (let i = 0; i < args._.length; i++) {
				const term = args._[i].toLowerCase();

				if (-1 !== host.indexOf(term)) {
					return true;
				}
			}

			return false;
		}

		return true;
	};

	const addChildren = (parent, level) => {
		const server = Server.get(parent);

		if (includeResult(server)) {
			let icon = args.tree ? ">" : " ";
			let line = args.tree ? " -" : "";

			if (
				ns.isRunning("attk.js", "home") &&
				config.target === server.hostname
			) {
				icon = "▶";
				line = args.tree ? "⋯⋯" : "";
			}

			const prefix = line.repeat(level) + (args.tree ? " " : "");
			const infos = [];
			const portDiff = server.numOpenPortsRequired - server.openPortCount;
			const ports = "•".repeat(Math.max(0, portDiff));
			const requiredSkill = server.requiredHackingSkill.toString();

			infos.push(`${server.ramTotalMaxFormatted}`);

			if (!server.purchasedByPlayer) {
				if (server.hasAdminRights) {
					const state = server.ramFree >= 4 ? "IDLE" : "ACTIVE";
					const backdoor = server.backdoorInstalled ? "◼" : " ";

					infos.push(backdoor + " " + state);
				} else if (ports.length) {
					infos.push(ports);
				} else {
					infos.push(requiredSkill);
				}

				infos.push(server.moneyRating);
				infos.push(server.securityRating);

				if (!args.tree) {
					infos.push(server.profitRating);
				}
			} else {
				infos.push("");
				infos.push("");
				infos.push("");

				if (!args.tree) {
					infos.push("");
				}
			}
			infos.push(server.organizationName);

			list.push([`${prefix}${icon} ${parent}`, ...infos]);
		}

		for (const i in server.children) {
			const child = server.children[i];

			addChildren(child, level + 1);
		}
	};

	await Server.initialize(ns);

	addChildren("home", 0);
	const format = ["left", "right", "right"];
	const header = args.tree
		? []
		: ["Server", "RAM", "Status", "Money", "Sec", "Profit", "Owner"];

	ns.tprint(`\n\n${Common.printF(list, header, format)}\n\n`);
}
