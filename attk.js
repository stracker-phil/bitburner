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

		if (!config.started) {
			return ns.exit();
		}

		player.refresh(ns);

		await selectTarget(ns);

		if (!target) {
			ns.alert(
				'Invalid target. Please check your config with "master --info"'
			);
			return ns.exit();
		}

		chooseAction(ns);

		explainAttack(ns);

		const duration = await coordinateAttack(ns);

		await ns.sleep(duration + 100);

		// Hack servers that became available since last attack.
		await Server.all((server) => server.setup(ns));
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
	const pctMoney = ((target.moneyAvailable / target.moneyMax) * 100).toFixed(
		0
	);
	const timeHack = ns.tFormat(target.timeHack);
	const timeWeaken = ns.tFormat(target.timeWeaken);
	const timeGrow = ns.tFormat(target.timeGrow);
	const delayHack = ns.tFormat(target.delayHack);
	const delayGrow = ns.tFormat(target.delayGrow);

	const lines = [
		"Attack details:",
		`  - Target server:   ${target.hostname}`,
		`  - Attack mode:     ${attack}`,
		`  - Profit rating:   [${
			target.profitRating
		}] ${target.profitValue.toLocaleString()}`,
		`  - Target money:    [${" ".repeat(
			4 - pctMoney.length
		)}${pctMoney}%] ${curMoney} / ${maxMoney}`,
		`  - Target security: [${target.securityRating}] ${curSecurity} / ${minSecurity}`,
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
async function selectTarget(ns) {
	const prevTarget = config.target;

	if (config.autoTarget) {
		target = Server.getHighProfit(ns, 1).shift();
		config.target = target.hostname;
	} else {
		target = Server.get(config.target);
	}

	if (prevTarget !== config.target) {
		Common.say(ns, "New target selected", config.target);
		await Common.setConfig(ns, config);
	}
}

/**
 * Decide on the attack focus (hack, grow, weaken).
 * @param {NS} ns
 */
function chooseAction(ns) {
	target.refreshStats(ns);

	const maxSec = parseFloat(
		(target.minDifficulty + config.boundSec).toFixed(4)
	);
	const minMoney = parseInt(target.moneyMax * config.boundMoney);

	if (target.hackDifficulty > maxSec) {
		attack = "weaken";
	} else if (target.moneyAvailable < minMoney) {
		attack = "grow";
	} else {
		attack = "hack";
	}
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
			duration = await doAttackHack(ns);
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

	const secDiff = target.hackDifficulty - target.minDifficulty;
	let threadsWeaken = Math.ceil(secDiff / changeWeaken);

	let weakenCycles = 0;
	let totalBatches = 0;
	let unusedResources = false;
	let totalRam = 0;

	duration = target.timeWeaken + 20;

	function runWeaken(server, threads) {
		return server.attack(ns, "weaken", threads, target.hostname, 0);
	}

	await Server.allAttackers(async (server) => {
		server.refreshRam(ns);

		let maxThreads = server.calcThreads(ns, "run-weaken.js");

		/**
		 * Focus all available RAM on the initial "weaken" attack
		 * to bring the server to minimum security.
		 */
		if (maxThreads && threadsWeaken > 0) {
			const threads = Math.min(maxThreads, threadsWeaken);
			if (runWeaken(server, threads)) {
				totalBatches++;
				threadsWeaken -= threads;
				maxThreads -= threads;
				weakenCycles += threads;
				totalRam += 1.75 * threads;
			}
		}

		/*
		 * If the server has unused RAM, remember it
		 * so we can cascade into a grow attack.
		 */
		if (maxThreads > 0) {
			unusedResources = true;
		}
	});

	// Explain what will happen.
	totalRam = parseInt(totalRam);
	const lines = [
		"Weaken attack threads:",
		`- Weaken:   ${weakenCycles.toLocaleString()}`,
		`- Batches:  ${totalBatches.toLocaleString()}`,
		`- RAM used: ${totalRam.toLocaleString()} GB RAM`,
	];
	ns.print(lines.join("\n"));

	/*
	 * When resources are left after weakening the server to minimum,
	 * then start a grow attack with the remaining RAM.
	 */
	if (unusedResources) {
		duration = getDuration(duration, await doAttackGrow(ns, 20));
	}

	return duration;
}

/**
 * Coordinate a "grow" attack against the target server.
 *
 * @param {NS} ns
 * @param {int} attDelay
 * @returns {int} Duration of the slowest command.
 */
async function doAttackGrow(ns, attDelay) {
	let duration = 0;

	attDelay = parseInt(attDelay) || 0;
	const maxGrowRate = target.moneyMax / target.moneyAvailable;
	let threadsGrow = Math.ceil(ns.growthAnalyze(target.hostname, maxGrowRate));

	const timeWeaken = target.timeWeaken;
	const timeGrow = target.timeGrow;
	const maxTime = Math.max(timeWeaken, timeGrow);

	let startGrow = attDelay + maxTime - timeGrow;
	let startWeak = attDelay + 20 + maxTime - timeWeaken;
	const minStart = Math.min(startWeak, startGrow);

	let growCycles = 0;
	let weakCycles = 0;
	let totalBatches = 0;
	let unusedResources = false;
	let totalRam = 0;

	startGrow = startGrow - minStart;
	startWeak = startWeak - minStart;
	duration = attDelay + maxTime + 40;

	function runGrowWeaken(server, thrGrow, thrWeak) {
		return (
			server.attack(ns, "weaken", thrWeak, target.hostname, startWeak) &&
			server.attack(ns, "grow", thrGrow, target.hostname, startGrow)
		);
	}

	await Server.allAttackers(async (server) => {
		server.refreshRam(ns);

		let maxThreads = server.calcThreads(ns, "run-weaken.js");

		/**
		 * Focus all available RAM on the initial "weaken-1" attack
		 * to bring the server to minimum security.
		 */
		if (maxThreads && threadsGrow > 0) {
			const threads = Math.min(maxThreads, threadsGrow);
			const thrGrow = Math.ceil(threads / 2);
			const thrWeak = Math.floor(threads / 2);

			if (runGrowWeaken(server, thrGrow, thrWeak)) {
				totalBatches++;
				threadsGrow -= threads;
				maxThreads -= threads;
				growCycles += thrGrow;
				weakCycles += thrWeak;
				totalRam += 2 * 1.75 * threads;
			}
		}

		/*
		 * If the server has unused RAM, remember it
		 * so we can cascade into a grow attack.
		 */
		if (maxThreads > 0) {
			unusedResources = true;
		}
	});

	// Explain what will happen.
	totalRam = parseInt(totalRam);
	const lines = [
		"Grow attack threads:",
		`- Grow:     ${growCycles.toLocaleString()}`,
		`- Weaken:   ${weakCycles.toLocaleString()}`,
		`- Batches:  ${totalBatches.toLocaleString()}`,
		`- RAM used: ${totalRam.toLocaleString()} GB RAM`,
	];
	ns.print(lines.join("\n"));

	/*
	 * When resources are left after growing the server to maximum,
	 * then directly spawn a HWGW attack.
	 */
	if (unusedResources) {
		duration = getDuration(duration, await doAttackHack(ns, attDelay + 40));
	}

	return duration;
}

/**
 * Hack the server using an advanced HWGW-batch algorithm.
 * Returns true, when the attack was launched, or false if the server
 * has insufficient RAM for such an attack.
 *
 * @param {NS} ns
 * @param {int} attDelay
 * @returns {int} Duration of the slowest cycle.
 */
async function doAttackHack(ns, attDelay) {
	attDelay = parseInt(attDelay) || 0;

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

	let delay = attDelay;
	let totalBatches = 0;
	let batchesInCycle = 0;
	let totalRam = 0;
	let totalCycles = 1;
	let duration = 0;

	let step, startHack, startWeak1, startGrow, startWeak2, minStart;

	const totalThreads = {
		H: 0,
		G: 0,
		W1: 0,
		W2: 0,
	};

	function nextCycle() {
		totalCycles++;
		batchesInCycle = 0;
		delay = attDelay + totalCycles;
	}

	function nextBatch() {
		totalBatches++;
		batchesInCycle++;
		step = "H";

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

	function nextStep(server, threads, runStep) {
		const manualStep = !!runStep;
		let nextStep, script, ramNeeded, startAfter;

		if (isNaN(threads) || threads < 1) {
			threads = 1;
		}
		if (!manualStep) {
			runStep = step;
		}

		switch (runStep) {
			case "H":
				script = "hack";
				startAfter = startHack;
				ramNeeded = 1.7;
				nextStep = "W1";
				break;
			case "W1":
				script = "weaken";
				startAfter = startWeak1;
				ramNeeded = 1.75;
				nextStep = "G";
				break;
			case "G":
				script = "grow";
				startAfter = startGrow;
				ramNeeded = 1.75;
				nextStep = "W2";
				break;
			case "W2":
				script = "weaken";
				startAfter = startWeak2;
				ramNeeded = 1.75;
				nextStep = "H";
				break;
		}

		ramNeeded *= threads;

		server.refreshRam(ns);
		// When no more RAM available on this server,
		// we'll continue the batch on the next server.
		if (
			server.ramFree >= ramNeeded &&
			server.attack(ns, script, threads, target.hostname, startAfter)
		) {
			totalThreads[step] += threads;
			step = nextStep;
			totalRam += ramNeeded;

			if (!step || "H" === step) {
				nextBatch();
			}

			return true;
		} else {
			return false;
		}
	}

	nextBatch();

	// Run 1: Start batches with max-threads on every server.
	await Server.allAttackers(async (server) => {
		const threads = Math.floor(server.ramFree / 6.95);

		if ("H" !== step) {
			console.error(
				`HWGW attack got out of sync! Starting with step ${step} on ${server.hostname}`
			);
		}

		if (threads < 1) {
			return;
		}

		nextStep(server, threads, "H");
		nextStep(server, threads, "W1");
		nextStep(server, threads, "G");
		nextStep(server, threads, "W2");
	});

	// Run 2: Start distributed, single-thread batches to use all resources.
	await Server.allAttackers(async (server) => {
		let success = true;

		while (success) {
			success = nextStep(server);
		}
	});

	// Explain what will happen.
	totalRam = parseInt(totalRam);
	const lines = [
		"HWGW attack details:",
		`- Hack:     ${totalThreads.H.toLocaleString()}`,
		`- Weaken:   ${totalThreads.W1.toLocaleString()}`,
		`- Grow:     ${totalThreads.G.toLocaleString()}`,
		`- Weaken:   ${totalThreads.W2.toLocaleString()}`,
		`- Batches:  ${totalBatches.toLocaleString()}`,
		`- RAM used: ${totalRam.toLocaleString()} GB RAM`,
	];
	ns.print(lines.join("\n"));

	return duration;
}
