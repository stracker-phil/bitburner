import * as Common from "lib/common.js";
import * as Server from "lib/server.js";
import * as Attack from "lib/attack.js";

/**
 * List of target servers
 */
let targets = [];

/**
 * Config instance.
 */
let config;

/**
 * The attacking server. Only a single server will
 * initiate attacks against all targets.
 */
let attacker = "home";

/**
 * Centralized attack script that runs a configurable number
 * of attacks against the weakest servers.
 *
 * The goal of this script is a constant skill growth, and
 * not profit maximization.
 *
 * @param {NS} ns
 */
export async function main(ns) {
	const numTargets = parseInt(ns.args[0] || 5);
	const header = [
		"Target",
		"Security",
		"Money",
		"Weaken",
		"Grow",
		"Hack",
		"RAM",
	];
	await Server.initialize(ns);

	ns.disableLog("ALL");
	ns.clearLog();

	attacker = ns.getHostname();

	while (true) {
		config = Common.getConfig(ns);

		if (!config.started) {
			return ns.exit();
		}
		if (config.skillRam < 52) {
			await ns.sleep(10000);
		}

		selectTargets(ns, numTargets);

		const log = [];
		const maxRam = config.skillRam / targets.length;
		let duration = 1000;

		for (let i = 0; i < targets.length; i++) {
			const target = targets[i];

			const info = Attack.run(ns, attacker, target.hostname, 0, maxRam);
			duration = Math.max(duration, info.duration);

			log.push([
				target.hostname,
				`${target.hackDifficulty.toFixed(2)} / ${target.minDifficulty}`,
				`${Common.formatMoney(
					ns,
					target.moneyAvailable
				)} / ${Common.formatMoney(ns, target.moneyMax)}`,
				info.threadsWeaken,
				info.threadsGrow,
				info.threadsHack,
				Common.formatRam(info.attackRam),
			]);
		}

		ns.clearLog();
		ns.print(Common.printF(log, header));

		await ns.sleep(duration);
	}
}

/**
 * Selects the best attack targets for gaining experience.
 */
function selectTargets(ns, limit) {
	targets = Server.getLowSecurity(ns, limit);
}
