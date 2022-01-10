import * as Common from "lib/common.js";
import * as Server from "lib/server.js";

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
 * Attack log details.
 */
let log = [];

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
	const header = ["Target", "Security", "Money", "Weaken", "Grow", "Hack"];
	await Server.initialize(ns);

	ns.disableLog("ALL");
	ns.clearLog();

	attacker = ns.getHostname();

	while (true) {
		config = Common.getConfig(ns);

		if (!config.started) {
			return ns.exit();
		}
		if (!config.skillThreads) {
			await ns.sleep(10000);
		}

		log = [];
		selectTargets(ns);

		for (let i = 0; i < targets.length; i++) {
			const target = targets[i];

			attackTarget(ns, target, config.skillThreads);
		}

		ns.clearLog();
		ns.print(Common.printF(log, header));

		await ns.sleep(1000);
	}
}

/**
 * Selects the attacked target server, either by using
 * the fixed target from the config file, or by
 * calculating the most profitable server.
 */
function selectTargets(ns) {
	targets = Server.getLowSecurity(ns, 10);
}

/**
 * Attacks the given target.
 *
 * @param {NS} ns
 */
function attackTarget(ns, target, maxThreads) {
	const args = [target.hostname, 0, "skill-grow"];
	let thrHack;
	let thrGrow;
	let thrWeak;

	target.refreshStats(ns);

	const maxSec = target.minDifficulty + 1;
	const minMoney = parseInt(target.moneyMax * 0.95);

	if (target.hackDifficulty > maxSec) {
		// Weaken
		thrWeak = Math.max(0, Math.ceil(maxThreads / 2));
		thrHack = Math.max(0, Math.floor((maxThreads - thrWeak) / 2));
		thrGrow = maxThreads - thrWeak - thrHack;
	} else if (target.moneyAvailable < minMoney) {
		// Grow
		thrGrow = Math.max(0, Math.ceil(maxThreads / 2));
		thrHack = Math.max(0, Math.floor((maxThreads - thrGrow) / 2));
		thrWeak = maxThreads - thrHack - thrGrow;
	} else {
		// Hack
		thrGrow = thrHack = Math.max(0, Math.ceil(maxThreads / 3));
		thrWeak = maxThreads - thrHack - thrGrow;
	}

	log.push([
		target.hostname,
		`${target.hackDifficulty.toFixed(2)} / ${target.minDifficulty}`,
		`${Common.formatMoney(
			ns,
			target.moneyAvailable
		)} / ${Common.formatMoney(ns, target.moneyMax)}`,
		thrWeak,
		thrGrow,
		thrHack,
	]);

	// Constantly keep all scripts running.
	if (thrWeak && !ns.isRunning("run-weaken.js", attacker, ...args)) {
		ns.exec("run-weaken.js", attacker, thrWeak, ...args);
	}
	if (thrGrow && !ns.isRunning("run-grow.js", attacker, ...args)) {
		ns.exec("run-grow.js", attacker, thrGrow, ...args);
	}
	if (thrHack && !ns.isRunning("run-hack.js", attacker, ...args)) {
		ns.exec("run-hack.js", attacker, thrHack, ...args);
	}
}
