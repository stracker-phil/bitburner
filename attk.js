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

/**
 * List of attack threads.
 */
let jobs = [];

/**
 * Predicted changes in target server security after an attack.
 */
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

		const duration = Math.max(3000, await coordinateAttack(ns));

		await ns.sleep(duration + 100);

		// Hack servers that became available since last attack.
		await Server.all((server) => server.setup(ns));
	}
}

/**
 * Output some details about the current attack.
 *
 * @param {NS} ns
 * @param {array} jobs - List of attack threads
 */
function explainAttack(ns, info) {
	target.refreshStats(ns);

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

	let table = "";
	let totalWeaken = 0;
	let totalGrow = 0;
	let totalHack = 0;

	if (jobs && jobs.length) {
		const tableHead = [
			"Source",
			"PID",
			"Type",
			"Threads",
			"RAM",
			"Start",
			"Duration",
		];
		const tableFormat = ["left", "left", "left", "right", "right", "right"];
		const tableRows = [];

		for (let i = 0; i < jobs.length; i++) {
			const job = jobs[i];

			tableRows.push([
				job.source,
				`${job.stage[0].toUpperCase()}-${job.pid}`,
				job.type,
				parseInt(job.threads).toLocaleString(),
				Common.formatRam(job.ram),
				Common.formatTime(job.start, false, true),
				Common.formatTime(job.duration, false, true),
			]);

			if ("weaken" === job.type) {
				totalWeaken += job.threads;
			} else if ("grow" === job.type) {
				totalGrow += job.threads;
			} else if ("hack" === job.type) {
				totalHack += job.threads;
			}
		}

		table = Common.printF(tableRows, tableHead, tableFormat);
	}

	let totalThreads = totalWeaken + totalGrow + totalHack;
	let totalWeakenPct = 0;
	let totalGrowPct = 0;
	let totalHackPct = 0;

	if (totalThreads > 0) {
		totalWeakenPct = Math.round((totalWeaken / totalThreads) * 100);
		totalGrowPct = Math.round((totalGrow / totalThreads) * 100);
		totalHackPct = Math.round((totalHack / totalThreads) * 100);
	}

	let totalWeakenFmt = totalWeaken.toLocaleString();
	let totalGrowFmt = totalGrow.toLocaleString();
	let totalHackFmt = totalHack.toLocaleString();
	let totalLength = Math.max(
		totalWeakenFmt.length,
		totalGrowFmt.length,
		totalHackFmt.length
	);
	totalWeakenFmt =
		" ".repeat(totalLength - totalWeakenFmt.length) + totalWeakenFmt;
	totalGrowFmt = " ".repeat(totalLength - totalGrowFmt.length) + totalGrowFmt;
	totalHackFmt = " ".repeat(totalLength - totalHackFmt.length) + totalHackFmt;

	const lines = [
		"Attack details:",
		`  - Target server:   ${target.hostname}`,
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
		`  - Next attack at:  ${wakeUpTime}`,
		"",
		`  - Weaken:    ${totalWeakenFmt} (${totalWeakenPct}%)`,
		`  - Grow:      ${totalGrowFmt} (${totalGrowPct}%)`,
		`  - Hack:      ${totalHackFmt} (${totalHackPct}%)`,
		"",
		table,
	];

	ns.clearLog();
	ns.print(lines.join("\n"));
}

function _logJob(pid, stage, server, threads, start, duration, ram, type) {
	if (pid) {
		jobs.push({
			pid,
			source: server.hostname,
			stage: stage,
			type,
			threads,
			ram: threads * ram,
			start,
			duration: start + duration,
		});
	}
}

function logJobHack(pid, stage, server, threads, start) {
	_logJob(pid, stage, server, threads, start, target.timeHack, 1.7, "hack");
}

function logJobGrow(pid, stage, server, threads, start) {
	_logJob(pid, stage, server, threads, start, target.timeGrow, 1.75, "grow");
}

function logJobWeaken(pid, stage, server, threads, start) {
	_logJob(
		pid,
		stage,
		server,
		threads,
		start,
		target.timeWeaken,
		1.75,
		"weaken"
	);
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
 * Performs the prepared attack against the target server.
 *
 * @param {NS} ns
 */
async function coordinateAttack(ns) {
	target.refreshStats(ns);
	let duration = 1000;

	jobs = [];

	const maxSec = parseFloat(
		(target.minDifficulty + config.boundSec).toFixed(4)
	);
	const minMoney = parseInt(target.moneyMax * config.boundMoney);

	if (target.hackDifficulty > maxSec) {
		duration = await doAttackWeaken(ns);
	} else if (target.moneyAvailable < minMoney) {
		duration = await doAttackGrow(ns);
	} else {
		duration = await doAttackHack(ns);
	}

	explainAttack(ns);

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
	let unusedResources = false;

	duration = target.timeWeaken + 20;

	function runWeaken(server, threads) {
		const pid = server.attack(ns, "weaken", threads, target.hostname, 0);

		logJobWeaken(pid, "weaken", server, threads, 0);

		return pid;
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
				threadsWeaken -= threads;
				maxThreads -= threads;
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
	const maxGrowRate = target.moneyMax / 1 + target.moneyAvailable;
	let threadsGrow = Math.ceil(ns.growthAnalyze(target.hostname, maxGrowRate));

	const timeWeaken = target.timeWeaken;
	const timeGrow = target.timeGrow;
	const maxTime = Math.max(timeWeaken, timeGrow);

	let startGrow = attDelay + maxTime - timeGrow;
	let startWeak = attDelay + 20 + maxTime - timeWeaken;
	const minStart = Math.min(startWeak, startGrow);

	let unusedResources = false;

	startGrow = startGrow - minStart;
	startWeak = startWeak - minStart;
	duration = attDelay + maxTime + 40;

	function runGrowWeaken(server, thrGrow, thrWeak) {
		const pidGrow = server.attack(
			ns,
			"grow",
			thrGrow,
			target.hostname,
			startGrow
		);
		const pidWeak = server.attack(
			ns,
			"weaken",
			thrWeak,
			target.hostname,
			startWeak
		);

		logJobGrow(pidGrow, "grow", server, thrGrow, startGrow);
		logJobWeaken(pidWeak, "grow", server, thrWeak, startWeak);

		return pidWeak && pidGrow;
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
			const thrWeak = Math.ceil(threads / 12.5);
			const thrGrow = threads - thrWeak;

			if (runGrowWeaken(server, thrGrow, thrWeak)) {
				threadsGrow -= threads;
				maxThreads -= threads;
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
	let batchesInCycle = 0;
	let totalCycles = 1;
	let duration = 0;

	let step, startHack, startGrow, startWeak, minStart;

	function nextCycle() {
		totalCycles++;
		batchesInCycle = 0;
		delay = attDelay + totalCycles;
	}

	function nextBatch() {
		batchesInCycle++;
		step = "H";

		startHack = maxTime - timeHack;
		startGrow = 20 + maxTime - timeGrow;
		startWeak = 40 + maxTime - timeWeaken;
		minStart = Math.min(startHack, startWeak, startGrow);
		startHack = delay + startHack - minStart;
		startGrow = delay + startGrow - minStart;
		startWeak = delay + startWeak - minStart;

		duration = getDuration(duration, 80 + delay + maxTime);

		// Delay the next batch by 20ms.
		delay += 20;

		if (batchesInCycle > hwgwPerCycle) {
			nextCycle();
		}
	}

	/**
	 * 25 hacks need 1 weaken
	 * 12.5 grows need 1 weaken
	 */
	const numHack = 5; // 25;
	const numGrow = 2; // 12;
	const batchRam = numHack * 1.7 + numGrow * 1.75 + 2 * 1.75;

	function nextStep(server, threads, runStep) {
		const manualStep = !!runStep;
		let fnLog, nextStep, script, ramNeeded, startAfter;

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
				threads *= numHack;
				ramNeeded = 1.7;
				nextStep = "G";
				fnLog = logJobHack;
				break;
			case "G":
				script = "grow";
				startAfter = startGrow;
				threads *= numGrow;
				ramNeeded = 1.75;
				nextStep = "W";
				fnLog = logJobGrow;
				break;
			case "W":
				script = "weaken";
				startAfter = startWeak;
				ramNeeded = 1.75;
				nextStep = "H";
				fnLog = logJobWeaken;
				break;
		}

		ramNeeded *= threads;

		server.refreshRam(ns);

		if (server.ramFree < ramNeeded) {
			return false;
			Ì;
		}

		const pid = server.attack(
			ns,
			script,
			threads,
			target.hostname,
			startAfter
		);

		// When no more RAM available on this server,
		// we'll continue the batch on the next server.
		if (pid) {
			fnLog(pid, "hack", server, threads, startAfter);
			step = nextStep;

			if (!step || "H" === nextStep) {
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
		const threads = Math.floor(server.ramFree / batchRam);

		if (threads < 1) {
			return;
		}

		nextStep(server, threads, "H");
		nextStep(server, threads, "G");
		nextStep(server, threads, "W");
	});

	return duration;
}
