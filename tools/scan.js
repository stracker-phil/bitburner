import * as Common from "lib/common.js";
import * as Server from "lib/server.js";

export async function main(ns) {
	const args = ns.flags([
		["help", false],
		["hacked", false],
		["own", false],
		["analyze", false],
	]);

	if (args.help) {
		ns.tprint("This script displays all known servers you have access to.");
		ns.tprint(
			`Usage: run ${ns.getScriptName()} [--hacked|--own] [--analyze]`
		);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()} --hacked`);
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

		return true;
	};

	const addChildren = (parent, level) => {
		const server = Server.get(parent);

		if (includeResult(server)) {
			const prefix = " -".repeat(level);
			const infos = [];

			const minSecurity = server.minDifficulty.toFixed(2);
			const curSecurity = server.hackDifficulty.toFixed(2);
			const maxMoney = Common.formatMoney(ns, server.moneyMax);
			const curMoney = Common.formatMoney(ns, server.moneyAvailable);
			const percentMoney =
				server.moneyMax > 0
					? Math.ceil(
							(server.moneyAvailable / server.moneyMax) * 100
					  ) + "%"
					: "-    ";
			const requiredSkill = server.requiredHackingSkill.toString();

			if (server.purchasedByPlayer) {
				infos.push(`${server.ramTotalMaxFormatted}`);
				infos.push(
					`${server.cpuCores} core${server.cpuCores > 1 ? "s" : ""}`
				);
			} else {
				if (server.hasAdminRights) {
					infos.push(
						`${server.backdoorInstalled ? "◼︎" : "◻︎"} HACKED`
					);
				} else {
					infos.push(
						`lvl ${" ".repeat(
							4 - requiredSkill.length
						)}${requiredSkill}`
					);
				}
			}

			if (!args.analyze && !server.purchasedByPlayer) {
				infos.push(server.profitRating);
				infos.push(server.securityRating);
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
				infos.push(
					`[${server.securityRating}] ${curSecurity} / ${minSecurity}`
				);
				infos.push(
					`[${" ".repeat(
						Math.max(0, 5 - percentMoney.length)
					)}${percentMoney}] ${curMoney} / ${maxMoney}`
				);
				infos.push(server.cmdConnect());
			}

			let icon = ">";
			if (config.target === server.hostname) {
				icon = "►";
			}

			list.push({
				prefix,
				name: `${prefix} ${icon} ${parent}`,
				infos,
			});
		}

		for (const i in server.children) {
			const child = server.children[i];

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
