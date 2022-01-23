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
		ns.tprint(
			`Usage: run ${ns.getScriptName()} [--hacked|--own] [--tree] KEYWORD`
		);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()} --hacked`);
		ns.tprint(`> run ${ns.getScriptName()} --tree`);
		ns.tprint(`> run ${ns.getScriptName()} corp`);
		return;
	}

	const list = [];
	const config = Common.getConfig(ns);
	const count = {
		own: 0,
		hacked: 0,
		locked: 0,
		total: 0,
	};

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
			const owner = server.organizationName.toLowerCase();

			for (let i = 0; i < args._.length; i++) {
				const term = args._[i].toLowerCase();

				if (-1 !== host.indexOf(term) || -1 !== owner.indexOf(term)) {
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
				ns.isRunning("/daemon/attk.js", "home") &&
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

			if (server.ramTotalMax > 0) {
				infos.push(server.ramTotalMaxFormatted);
			} else {
				infos.push("-");
			}

			if (!server.purchasedByPlayer) {
				if (server.hasAdminRights) {
					const state = server.ramFree >= 4 ? "-idle-" : "ACTIVE";
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

			count.total++;
			if (server.purchasedByPlayer) {
				count.own++;
			} else {
				if (server.hasAdminRights) {
					count.hacked++;
				} else {
					count.locked++;
				}
			}
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

	count.own = count.own ? count.own.toString() : "-";
	count.hacked = count.hacked ? count.hacked.toString() : "-";
	count.locked = count.locked ? count.locked.toString() : "-";
	count.total = count.total ? count.total.toString() : "-";

	const summary = [
		` Own:    ${" ".repeat(3 - count.own.length) + count.own}`,
		` Hacked: ${" ".repeat(3 - count.hacked.length) + count.hacked}`,
		` Locked: ${" ".repeat(3 - count.locked.length) + count.locked}`,
		` Total:  ${" ".repeat(3 - count.total.length) + count.total}`,
	];

	ns.tprint(
		`\n\n${Common.printF(list, header, format)}\n\n${summary.join(
			"\n"
		)}\n\n`
	);
}
