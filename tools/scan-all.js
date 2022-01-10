import { formatMoney } from "lib/common.js";
import * as Server from "lib/server.js";

export async function main(ns) {
	const args = ns.flags([
		["help", false],
		["hacked", false],
		["analyze", false],
	]);

	if (args.help) {
		ns.tprint("This script displays all known servers you have access to.");
		ns.tprint(`Usage: run ${ns.getScriptName()} [--hacked] [--analyze]`);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()} --hacked`);
		return;
	}

	const list = [];

	const filterChild = (host) => {
		if (!host) {
			return false;
		}

		const server = Server.get(host);

		if (args.hacked) {
			if (!server.hasAdminRights || server.purchasedByPlayer) {
				return false;
			}
		}

		return true;
	};

	const addChildren = (parent, level) => {
		const server = Server.get(parent);
		const prefix = " -".repeat(level);
		const infos = [];

		if (server.purchasedByPlayer) {
			infos.push(`${server.ramTotalMax} GB`);
			infos.push(
				`${server.cpuCores} core${server.cpuCores > 1 ? "s" : ""}`
			);
		} else {
			if (server.hasAdminRights) {
				infos.push(`${server.backdoorInstalled ? "◼︎" : "◻︎"} HACKED`);
			} else {
				infos.push(`lvl ${server.requiredHackingSkill}`);
			}
		}

		if (!args.analyze) {
			infos.push(server.profitRating);
		}
		if (server.organizationName) {
			infos.push(server.organizationName);
		}

		if (args.analyze) {
			infos.push(
				`[${
					server.profitRating
				}] ${server.profitValue.toLocaleString()}`
			);
			infos.push(server.cmdConnect());
		}

		list.push({
			prefix,
			name: `${prefix} > ${parent}`,
			infos,
		});

		for (const i in server.children) {
			const child = server.children[i];

			if (!filterChild(child)) {
				continue;
			}
			addChildren(child, level + 1);
		}
	};

	await Server.initialize(ns);

	addChildren("home", 0);

	const lines = [];
	const nameLen = Math.max(...list.map((item) => item.name.length));

	for (let i = 0; i < list.length; i++) {
		const item = list[i];

		if (args.analyze) {
			const ident = " ".repeat(item.name.length + 2);
			lines.push(`${item.name}  ${item.infos.join(`\n${ident}`)}\n`);
		} else {
			const space = " ".repeat(nameLen - item.name.length);
			lines.push(`${item.name} ${space} ${item.infos.join(" | ")}`);
		}
	}

	ns.tprint(`\n\n${lines.join("\n")}\n\n`);
}
