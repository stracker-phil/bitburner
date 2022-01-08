import * as Common from "lib/common.js";
import * as Server from "lib/server.js";
import * as Player from "lib/player.js";

/**
 * Player instance.
 */
let player;

/**
 * Target of our attack.
 */
let target;

/**
 * Config instance.
 */
let config;

let attack = "weaken";

let targetSecurity = 0;

let targetMinSecurity = 0;

let fullHackCycles = 0;

let hackCycles = 0;

let growCycles = 0;

let weakenCycles = 0;

/**
 * Predicted changes in target server security after an attack.
 */
const changeHack = 0.002;
const changeGrow = 0.004;
const changeWeaken = 0.05;

/**
 * Centralized monitoring script, that runs in a
 * single thread on the "home" server.
 *
 * It monitors the attacked servers' stats in
 * an interval and decides on whether to hack,
 * weaken or grow the target server during the
 * next interval.
 *
 * The decision is transported to the
 * distributed worker nodes via the ctrl.js
 * mechanism.
 *
 * @param {NS} ns
 */
export async function main(ns) {
	await Server.initialize(ns);
	player = Player.get(ns);

	while (true) {
		config = Common.getConfig(ns);
		player.refresh(ns);

		selectTarget(ns);
		chooseAction(ns);
		await calcMaxCycles(ns);

		explainAttack(ns);

		await coordinateAttack(ns);

		await ns.sleep(target.timeWeaken + 300);
	}
}

/**
 * Output some details about the current attack.
 *
 * @param {NS} ns
 */
function explainAttack(ns) {
	const wakeUpTime = Common.timestamp(target.timeWeaken + 300);
	const wakeUpTimeSec = parseInt((target.timeWeaken + 300) / 1000);
	const minSecurity = target.minDifficulty.toFixed(2);
	const curSecurity = target.hackDifficulty.toFixed(2);
	const maxMoney = Common.formatMoney(target.moneyMax);
	const curMoney = Common.formatMoney(target.moneyAvailable);
	const timeHack = Common.formatTime(target.timeHack);
	const timeWeaken = Common.formatTime(target.timeWeaken);
	const timeGrow = Common.formatTime(target.timeGrow);
	const timeHackSec = parseInt(target.timeHack / 1000);
	const timeWeakenSec = parseInt(target.timeWeaken / 1000);
	const timeGrowSec = parseInt(target.timeGrow / 1000);
	const delayHack = Common.formatTime(target.delayHack);
	const delayGrow = Common.formatTime(target.delayGrow);
	const delayHackSec = parseInt(target.delayHack / 1000);
	const delayGrowSec = parseInt(target.delayGrow / 1000);

	const lines = [
		"Attack details:",
		`  - Target server:   ${target.hostname}`,
		`  - Attack mode:     ${attack}`,
		`  - Target security: ${curSecurity} / ${minSecurity}`,
		`  - Target money:    ${curMoney} / ${maxMoney}`,
		`  - Time to hack:    ${timeHack} [${timeHackSec} sec]`,
		`  - Time to weaken:  ${timeWeaken} [${timeWeakenSec} sec]`,
		`  - Time to grow:    ${timeGrow} [${timeGrowSec} sec]`,
		`  - Hack delay:      ${delayHack} [${delayHackSec} sec]`,
		`  - Grow delay:      ${delayGrow} [${delayGrowSec} sec]`,
		`  - Wake up time     ${wakeUpTime} [${wakeUpTimeSec} sec]`,
	];

	Common.say(ns, lines.join("\n"));
}

/**
 * Selects the attacked target server, either by using
 * the fixed target from the config file, or by
 * calculating the most profitable server.
 */
function selectTarget(ns) {
	const prevTarget = config.target;

	if (config.autoPick) {
		target = Server.byProfit(ns);
		config.target = target.hostname;
	}

	if (prevTarget !== config.target) {
		Common.say(ns, "New target selected", config.target);
	}
}

/**
 * Decide on the attack focus (hack, grow, weaken).
 * @param {NS} ns
 */
function chooseAction(ns) {
	target.refreshStats(ns);

	targetSecurity = target.hackDifficulty;
	targetMinSecurity = target.minDifficulty;

	const maxSec = parseFloat((targetMinSecurity + config.boundSec).toFixed(4));
	const minMoney = parseInt(target.moneyMax * config.boundMoney);

	if (targetSecurity > maxSec) {
		attack = "weaken";
	} else if (target.moneyAvailable < minMoney) {
		attack = "grow";
	} else {
		attack = "hack";
	}
}

/**
 * Re-calculates the total attack threads we can run.
 *
 * @param {NS} ns
 */
async function calcMaxCycles(ns) {
	hackCycles = 0;
	growCycles = 0;
	weakenCycles = 0;

	await Server.allAttackers((server) => {
		hackCycles += Math.floor(server.ramMax / 1.7);
		growCycles += Math.floor(server.ramMax / 1.75);
		weakenCycles += Math.floor(server.ramMax / 1.75);
	});

	// How many threads will completely empty the targets money?
	fullHackCycles = 100 / Math.max(0.00000001, target.hackAnalyze);
	fullHackCycles = Math.ceil(fullHackCycles);
}

/**
 * How many "weaken" threads are needed to compensate the security increase
 * that's caused by the given amount of "grow" threads?
 *
 * @param {int} growCycles
 * @return {int}
 */
function weakenCyclesForGrow(growCycles) {
	return Math.max(0, Math.ceil(growCycles * (changeGrow / changeWeaken)));
}

/**
 * How many "weaken" threads are needed to compensate the security increase
 * that's caused by the given amount of "hack" threads?
 *
 * @param {int} growCycles
 * @return {int}
 */
function weakenCyclesForHack(hackCycles) {
	return Math.max(0, Math.ceil(hackCycles * (changeHack / changeWeaken)));
}

/**
 * Performs the prepared attack against the target server.
 *
 * @param {NS} ns
 */
async function coordinateAttack(ns) {
	switch (attack) {
		case "weaken":
			await doAttackWeaken(ns);
			break;
		case "grow":
			await doAttackGrow(ns);
			break;
		default:
			await doAttackHack(ns);
			break;
	}
}

/**
 * Coordinate a "weaken" attack against the target server.
 *
 * @param {NS} ns
 */
async function doAttackWeaken(ns) {
	if (changeWeaken * weakenCycles > targetSecurity - targetMinSecurity) {
		/**
		 * Target server will reach the minimum security during this attack.
		 * See if we have spare resources that we can use to grow the target.
		 */
		weakenCycles = (targetSecurity - targetMinSecurity) / changeWeaken;
		weakenCycles = Math.ceil(weakenCycles);
		growCycles -= weakenCycles;
		growCycles = Math.max(0, growCycles);

		weakenCycles += weakenCyclesForGrow(growCycles);
		growCycles -= weakenCyclesForGrow(growCycles);
		growCycles = Math.max(0, growCycles);
	} else {
		/**
		 * Target server does not reach minimum security during this attack.
		 * Focus all available resources on the weaken attack.
		 */
		growCycles = 0;
	}

	// Explain what will happen.
	const lines = [
		"Weaken attack threads:",
		`Grow:     ${growCycles}`,
		`Weaken:   ${weakenCycles}`,
		`Security: -${(changeWeaken * weakenCycles).toFixed(2)}`,
	];
	Common.say(ns, lines.join("\n"));

	await Server.allAttackers(async (server) => {
		server.refreshRam(ns);

		let cyclesFittable = Math.floor(server.ramFree / 1.75);
		cyclesFittable = Math.max(0, cyclesFittable);

		const cyclesToRun = Math.max(0, Math.min(cyclesFittable, growCycles));

		if (cyclesToRun) {
			await server.attack(
				ns,
				"grow",
				cyclesToRun,
				target.hostname,
				target.delayGrow
			);

			growCycles -= cyclesToRun;
			cyclesFittable -= cyclesToRun;
		}

		if (cyclesFittable) {
			await server.attack(
				ns,
				"weaken",
				cyclesFittable,
				target.hostname,
				0
			);

			weakenCycles -= cyclesFittable;
		}
	});
}

/**
 * Coordinate a "grow" attack against the target server.
 *
 * @param {NS} ns
 */
async function doAttackGrow(ns) {
	weakenCycles = weakenCyclesForGrow(growCycles);
	growCycles -= weakenCycles;

	// Explain what will happen.
	const lines = [
		"Grow attack threads:",
		`Grow:     ${growCycles}`,
		`Weaken:   ${weakenCycles}`,
	];
	Common.say(ns, lines.join("\n"));

	await Server.allAttackers(async (server) => {
		server.refreshRam(ns);

		let cyclesFittable = Math.floor(server.ramFree / 1.75);
		cyclesFittable = Math.max(0, cyclesFittable);

		const cyclesToRun = Math.max(0, Math.min(cyclesFittable, growCycles));

		if (cyclesToRun) {
			await server.attack(
				ns,
				"grow",
				cyclesToRun,
				target.hostname,
				target.delayGrow
			);

			growCycles -= cyclesToRun;
			cyclesFittable -= cyclesToRun;
		}

		if (cyclesFittable) {
			await server.attack(
				ns,
				"weaken",
				cyclesFittable,
				target.hostname,
				0
			);

			weakenCycles -= cyclesFittable;
		}
	});
}

/**
 * Coordinate a "hack" attack against the target server.
 *
 * @param {NS} ns
 */
async function doAttackHack(ns) {
	if (hackCycles > fullHackCycles) {
		hackCycles = fullHackCycles;

		if (hackCycles * 100 < growCycles) {
			hackCycles *= 10;
		}

		growCycles = growCycles - Math.ceil((hackCycles * 1.7) / 1.75);
		growCycles = Math.max(0, growCycles);

		weakenCycles =
			weakenCyclesForGrow(growCycles) + weakenCyclesForHack(hackCycles);
		growCycles -= weakenCycles;
		hackCycles -= Math.ceil((weakenCyclesForHack(hackCycles) * 1.75) / 1.7);

		growCycles = Math.max(0, growCycles);
	} else {
		growCycles = 0;
		weakenCycles = weakenCyclesForHack(hackCycles);
		hackCycles -= Math.ceil((weakenCycles * 1.75) / 1.7);
	}

	// Explain what will happen.
	const lines = [
		"Hack attack threads:",
		`Hack:     ${hackCycles}`,
		`Grow:     ${growCycles}`,
		`Weaken:   ${weakenCycles}`,
	];
	Common.say(ns, lines.JOIN("\n"));

	await Server.allAttackers(async (server) => {
		server.refreshRam(ns);

		let cyclesFittable = Math.floor(server.ramFree / 1.7);
		cyclesFittable = Math.max(0, cyclesFittable);

		const cyclesToRun = Math.max(0, Math.min(cyclesFittable, hackCycles));

		if (cyclesToRun) {
			await server.attack(
				ns,
				"hack",
				cyclesToRun,
				target.hostname,
				target.delayHack
			);

			hackCycles -= cyclesToRun;
			cyclesFittable -= cyclesToRun;
		}

		const freeRam = server.ramFree - cyclesToRun * 1.7;
		cyclesFittable = Math.max(0, Math.floor(freeRam / 1.75));

		if (cyclesFittable && growCycles) {
			await server.attack(
				ns,
				"grow",
				cyclesToRun,
				target.hostname,
				target.delayGrow
			);

			growCycles -= cyclesToRun;
			cyclesFittable -= cyclesToRun;
		}

		if (cyclesFittable) {
			await server.attack(
				ns,
				"weaken",
				cyclesFittable,
				target.hostname,
				0
			);

			weakenCycles -= cyclesFittable;
		}
	});
}
