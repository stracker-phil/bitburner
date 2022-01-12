import * as Common from "lib/common.js";

/**
 * Monitors the stats of a single server.
 *
 * @param {NS} ns
 */
export async function main(ns) {
	const host = ns.args[0];
	let log = [];
	let currTarget = host;

	const header = [
		"Time",
		"Security",
		"Money",
		"Money",
		"Time Weaken",
		"Time Grow",
		"Time Hack",
	];
	const format = [
		"right",
		"right",
		"right",
		"right",
		"right",
		"right",
		"right",
	];

	ns.disableLog("ALL");

	while (true) {
		const config = Common.getConfig(ns);
		const target = host ? host : config.target;

		if (currTarget !== target) {
			currTarget = target;
			log = [];
		} else {
			while (log.length > 50) {
				log.shift();
			}
		}

		const minSecurity = ns.getServerMinSecurityLevel(target);
		const currSecurity = ns.getServerSecurityLevel(target);
		const diffSecurity = currSecurity - minSecurity;
		const diffSecurityFmt =
			(diffSecurity > 0 ? "+" : "") + diffSecurity.toFixed(2);
		const maxMoney = ns.getServerMaxMoney(target);
		const currMoney = ns.getServerMoneyAvailable(target);
		const maxMoneyFmt = Common.formatMoney(ns, maxMoney);
		const currMoneyFmt = Common.formatMoney(ns, currMoney);
		const pctMoney = ((currMoney / maxMoney) * 100).toFixed(0);
		const timeWeaken = Common.formatTime(ns.getWeakenTime(target));
		const timeGrow = Common.formatTime(ns.getGrowTime(target));
		const timeHack = Common.formatTime(ns.getHackTime(target));

		const item = [
			"",
			`${diffSecurityFmt} | ${minSecurity}`,
			`${currMoneyFmt} / ${maxMoneyFmt}`,
			`${pctMoney}%`,
			timeWeaken,
			timeGrow,
			timeHack,
		];

		const prev = log.length ? [...log[log.length - 1]] : [];
		prev[0] = "";

		if (item.join(":") !== prev.join(":")) {
			item[0] = Common.timestamp();
			log.push(item);
		}

		ns.clearLog();
		ns.print(`Monitoring: ${target}\n`);
		ns.print(Common.printF(log, header, format));

		await ns.sleep(1000);
	}
}
