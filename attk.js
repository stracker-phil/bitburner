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

	ns.clearLog();
	ns.disableLog("ALL");

	while (true) {
		config = Common.getConfig(ns);

		// Hack servers that became available since last attack.
		await Server.all((server) => server.setup(ns));

		if (!config.started) {
			return ns.exit();
		}

		player.refresh(ns);

		selectTarget(ns);

		if (!target) {
			ns.alert(
				'Invalid target. Please check your config with "master --info"'
			);
			return ns.exit();
		}

		chooseAction(ns);
		await calcMaxCycles(ns);

		explainAttack(ns);

		const duration = await coordinateAttack(ns);

		await ns.sleep(duration + 100);
	}
}

/**
 * Output some details about the current attack.
 *
 * @param {NS} ns
 */
function explainAttack(ns) {
	const wakeUpTime = Common.timestamp(target.timeWeaken + 300);
	const minSecurity = target.minDifficulty.toFixed(2);
	const curSecurity = target.hackDifficulty.toFixed(2);
	const maxMoney = Common.formatMoney(ns, target.moneyMax);
	const curMoney = Common.formatMoney(ns, target.moneyAvailable);
	const percentMoney = (target.moneyAvailable / target.moneyMax) * 100;
	const timeHack = ns.tFormat(target.timeHack);
	const timeWeaken = ns.tFormat(target.timeWeaken);
	const timeGrow = ns.tFormat(target.timeGrow);
	const delayHack = ns.tFormat(target.delayHack);
	const delayGrow = ns.tFormat(target.delayGrow);

	const lines = [
		"Attack details:",
		`  - Target server:   ${target.hostname}`,
		`  - Attack mode:     ${attack}`,
		`  - Target security: ${curSecurity} / ${minSecurity}`,
		`  - Target money:    ${curMoney} / ${maxMoney}  [${percentMoney.toFixed(
			2
		)}%]`,
		`  - Time to hack:    ${timeHack}`,
		`  - Time to weaken:  ${timeWeaken}`,
		`  - Time to grow:    ${timeGrow}`,
		`  - Hack delay:      ${delayHack}`,
		`  - Grow delay:      ${delayGrow}`,
		`  - Wake up time     ${wakeUpTime}`,
		"",
	];

	ns.clearLog();
	ns.print(lines.join("\n"));
}

/**
 * Selects the attacked target server, either by using
 * the fixed target from the config file, or by
 * calculating the most profitable server.
 */
function selectTarget(ns) {
	const prevTarget = config.target;

	if (config.autoTarget) {
		target = Server.byProfit(ns);
		config.target = target.hostname;
	} else {
		target = Server.get(config.target);
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
	let duration = 0;

	switch (attack) {
		case "weaken":
			duration = await doAttackWeaken(ns);
			break;
		case "grow":
			duration = await doAttackGrow(ns);
			break;
		default:
			if ("hwgw" === config.hackAlgo) {
				duration = await doAttackHackHwgw(ns);
			} else {
				duration = await doAttackHackDefault(ns);
			}
			break;
	}

	return Math.ceil(duration);
}

/**
 * Returns the largest duration value.
 *
 * @param {int} duration1
 * @param {int} duration2
 * @returns {int} The largest duration.
 */
function getDuration(duration1, duration2) {
	if (isNaN(duration1) || duration1 < duration2) {
		return duration2;
	}
	return duration1;
}

/**
 * Coordinate a "weaken" attack against the target server.
 *
 * @param {NS} ns
 * @returns {int} Duration of the slowest command.
 */
async function doAttackWeaken(ns) {
	let duration = 0;

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
	ns.print(lines.join("\n"));

	await Server.allAttackers(async (server) => {
		server.refreshRam(ns);

		let cyclesFittable = Math.floor(server.ramFree / 1.75);
		cyclesFittable = Math.max(0, cyclesFittable);

		const cyclesToRun = Math.max(0, Math.min(cyclesFittable, growCycles));

		if (cyclesToRun) {
			server.attack(
				ns,
				"grow",
				cyclesToRun,
				target.hostname,
				target.delayGrow
			);
			duration = getDuration(
				duration,
				target.timeGrow + target.delayGrow
			);

			growCycles -= cyclesToRun;
			cyclesFittable -= cyclesToRun;
		}

		if (cyclesFittable) {
			server.attack(ns, "weaken", cyclesFittable, target.hostname, 0);
			duration = getDuration(duration, target.timeWeaken);

			weakenCycles -= cyclesFittable;
		}
	});

	return duration;
}

/**
 * Coordinate a "grow" attack against the target server.
 *
 * @param {NS} ns
 * @returns {int} Duration of the slowest command.
 */
async function doAttackGrow(ns) {
	let duration = 0;

	weakenCycles = weakenCyclesForGrow(growCycles);
	growCycles -= weakenCycles;

	// Explain what will happen.
	const lines = [
		"Grow attack threads:",
		`Grow:     ${growCycles}`,
		`Weaken:   ${weakenCycles}`,
	];
	ns.print(lines.join("\n"));

	await Server.allAttackers(async (server) => {
		server.refreshRam(ns);

		let cyclesFittable = Math.floor(server.ramFree / 1.75);
		cyclesFittable = Math.max(0, cyclesFittable);

		const cyclesToRun = Math.max(0, Math.min(cyclesFittable, growCycles));

		if (cyclesToRun) {
			server.attack(
				ns,
				"grow",
				cyclesToRun,
				target.hostname,
				target.delayGrow
			);
			duration = getDuration(
				duration,
				target.timeGrow + target.delayGrow
			);

			growCycles -= cyclesToRun;
			cyclesFittable -= cyclesToRun;
		}

		if (cyclesFittable) {
			server.attack(ns, "weaken", cyclesFittable, target.hostname, 0);
			duration = getDuration(duration, target.timeWeaken);

			weakenCycles -= cyclesFittable;
		}
	});

	return duration;
}

/**
 * Coordinate a "hack" attack against the target server.
 *
 * @param {NS} ns
 * @returns {int} Duration of the slowest command.
 */
async function doAttackHackDefault(ns) {
	let duration = 0;

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
	ns.print(lines.join("\n"));

	await Server.allAttackers(async (server) => {
		server.refreshRam(ns);

		let cyclesFittable = Math.floor(server.ramFree / 1.7);
		cyclesFittable = Math.max(0, cyclesFittable);

		const cyclesToRun = Math.max(0, Math.min(cyclesFittable, hackCycles));

		if (cyclesToRun) {
			server.attack(
				ns,
				"hack",
				cyclesToRun,
				target.hostname,
				target.delayHack
			);
			duration = getDuration(
				duration,
				target.timeHack + target.delayHack
			);

			hackCycles -= cyclesToRun;
			cyclesFittable -= cyclesToRun;
		}

		const freeRam = server.ramFree - cyclesToRun * 1.7;
		cyclesFittable = Math.max(0, Math.floor(freeRam / 1.75));

		if (cyclesFittable && growCycles) {
			server.attack(
				ns,
				"grow",
				cyclesToRun,
				target.hostname,
				target.delayGrow
			);
			duration = getDuration(
				duration,
				target.timeGrow + target.delayGrow
			);

			growCycles -= cyclesToRun;
			cyclesFittable -= cyclesToRun;
		}

		if (cyclesFittable) {
			server.attack(ns, "weaken", cyclesFittable, target.hostname, 0);
			duration = getDuration(duration, target.timeWeaken);

			weakenCycles -= cyclesFittable;
		}
	});

	return duration;
}

/**
 * Hack the server using an advanced HWGW-batch algorithm.
 * Returns true, when the attack was launched, or false if the server
 * has insufficient RAM for such an attack.
 *
 * @param {NS} ns
 * @returns {int} Duration of the slowest cycle.
 */
async function doAttackHackHwgw(ns) {
	// Duration of one HWGW batch cycle.
	const hwgwDuration = Math.max(
		target.timeGrow,
		target.timeWeaken,
		target.timeHack
	);

	// Maximum batches that fit into one cycle.
	const hwgwPerCycle = Math.floor(hwgwDuration / 20);

	const timeWeaken = target.timeWeaken;
	const timeGrow = target.timeGrow;
	const timeHack = target.timeHack;
	const maxTime = Math.max(timeWeaken, timeGrow, timeHack);

	let delay = 0;
	let batches = 0;
	let batchesInCycle = 0;
	let cycles = 1;
	let threads = 0;
	let duration = 0;

	let step, startHack, startWeak1, startGrow, startWeak2, minStart;

	function nextCycle() {
		cycles++;
		batchesInCycle = 0;
		delay = cycles;
	}

	function nextBatch() {
		batches++;
		batchesInCycle++;
		step = 0;

		startHack = maxTime - timeHack;
		startWeak1 = 20 + maxTime - timeWeaken;
		startGrow = 40 + maxTime - timeGrow;
		startWeak2 = 60 + maxTime - timeWeaken;
		minStart = Math.min(startHack, startWeak1, startGrow, startWeak2);
		startHack = delay + startHack - minStart;
		startWeak1 = delay + startWeak1 - minStart;
		startGrow = delay + startGrow - minStart;
		startWeak2 = delay + startWeak2 - minStart;

		duration = getDuration(duration, 80 + delay + maxTime);

		// Delay the next batch by 20ms.
		delay += 20;

		if (batchesInCycle > hwgwPerCycle) {
			nextCycle();
		}
	}

	function nextStep(server) {
		let script, ramNeeded, startAfter;
		server.refreshRam(ns);

		switch (step) {
			case 1:
				script = "weaken";
				startAfter = startWeak2;
				ramNeeded = 1.75;
				break;
			case 2:
				script = "hack";
				startAfter = startHack;
				ramNeeded = 1.7;
				break;
			case 3:
				script = "grow";
				startAfter = startGrow;
				ramNeeded = 1.75;
				break;
			case 0:
			default:
				script = "weaken";
				startAfter = startWeak1;
				ramNeeded = 1.75;
				break;
		}

		// When no more RAM available on this server,
		// we'll continue the batch on the next server.
		if (
			server.ramFree >= ramNeeded &&
			server.attack(ns, script, 1, target.hostname, startAfter)
		) {
			step++;
			threads++;

			if (step > 3) {
				nextBatch();
			}

			return true;
		} else {
			return false;
		}
	}

	nextBatch();
	await Server.allAttackers(async (server) => {
		let success = true;

		do {
			success = nextStep(server);
		} while (success);
	});

	// Explain what will happen.
	const lines = [
		"HWGW attack:",
		`Threads:  ${threads}`,
		`Batches:  ${batches} (${(batches * 6.95).toFixed(2)} GB RAM)`,
		`Cycles:   ${cycles}`,
	];
	ns.print(lines.join("\n"));

	return duration;
}
