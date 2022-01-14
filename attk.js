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

	const attStartTime = Common.timestamp();
	const attEndTime = Common.timestamp(target.timeWeaken + 300);
	const attDuration = Common.formatTime(target.timeWeaken + 300, true, true);

	const minSecurity = target.minDifficulty.toFixed(2);
	const curSecurity = target.hackDifficulty.toFixed(2);
	const maxMoney = Common.formatMoney(ns, target.moneyMax);
	const curMoney = Common.formatMoney(ns, target.moneyAvailable);
	const pctMoney = ((target.moneyAvailable / target.moneyMax) * 100).toFixed(
		0
	);
	const timeHack = Common.formatTime(target.timeHack, true);
	const timeWeaken = Common.formatTime(target.timeWeaken, true);
	const timeGrow = Common.formatTime(target.timeGrow, true);
	const delayHack = Common.formatTime(target.delayHack, true);
	const delayGrow = Common.formatTime(target.delayGrow, true);

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
		"",
		`  - Starts at: ${attStartTime}`,
		`  - Ends at:   ${attEndTime}`,
		`  - Duration:  ${attDuration}`,
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
		const delay = 20 + duration - target.timeWeaken;
		duration = getDuration(duration, await doAttackGrow(ns, delay));
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

	let startWeak = attDelay + 20;
	let startGrow = attDelay + timeWeaken - timeGrow;
	const minStart = Math.min(startWeak, startGrow);

	let unusedResources = false;

	startGrow = startGrow - minStart;
	startWeak = startWeak - minStart;
	duration = attDelay + timeWeaken + 40;

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
			const thrWeak = Math.ceil(threads / 5);
			const thrGrow = threads - thrWeak;

			if (runGrowWeaken(server, thrGrow, thrWeak)) {
				threadsGrow -= threads;
				maxThreads -= threads;

				duration += 40;
				startGrow += 20;
				startWeak += 20;
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
		const delay = 40 + duration - target.timeWeaken;
		duration = getDuration(duration, await doAttackHack(ns, delay));
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
	let duration = 0;

	attDelay = parseInt(attDelay) || 0;

	const timeWeaken = target.timeWeaken;
	const timeGrow = target.timeGrow;
	const timeHack = target.timeHack;

	let delay = attDelay;
	let startHack, startGrow, startWeak;

	function nextBatch() {
		startHack = delay + timeWeaken - timeHack;
		startGrow = delay + 20 + timeWeaken - timeGrow;
		startWeak = delay + 40;
		duration = getDuration(duration, 20 + startWeak + timeWeaken);

		// Delay the next batch by 60ms, so the first step of the next
		// cycle finishes directly after the last step of the current cycle.
		delay += 60;
	}

	/**
	 * One cycle consists of:
	 *   5 hacks
	 *   3 grows
	 *   1 weaken
	 *
	 * Total RAM usage: 13.75 GB
	 */
	const numHack = 5;
	const numGrow = 3;
	const batchRam = numHack * 1.7 + numGrow * 1.75 + 2 * 1.75;

	// Number of threads that are needed to reduce the targets
	// money to 50%.
	const limitThreads = 0.5 / (target.hackAnalyze * numHack);

	console.log('Hack threads needed to reduce the servers money by 50%:', limitThreads, ':', target.hackAnalyze)
	

	function nextStep(server, threads, step) {
		let fnLog, script, ramNeeded, startAfter;

		if (isNaN(threads) || threads < 1) {
			threads = 1;
		}

		switch (step) {
			case "H":
				script = "hack";
				startAfter = startHack;
				threads *= numHack;
				ramNeeded = 1.7;
				fnLog = logJobHack;
				break;

			case "G":
				script = "grow";
				startAfter = startGrow;
				threads *= numGrow;
				ramNeeded = 1.75;
				fnLog = logJobGrow;
				break;

			case "W":
				script = "weaken";
				startAfter = startWeak;
				ramNeeded = 1.75;
				fnLog = logJobWeaken;
				break;
		}

		ramNeeded *= threads;

		server.refreshRam(ns);

		if (server.ramFree < ramNeeded) {
			return false;
		}

		const pid = server.attack(
			ns,
			script,
			threads,
			target.hostname,
			startAfter
		);

		if (pid) {
			fnLog(pid, "hack", server, threads, startAfter);

			if ("W" === step) {
				nextBatch();
			}

			return true;
		} else {
			return false;
		}
	}

	function runHackSimple(server, threads) {
		const pid = server.attack(
			ns,
			"hack",
			threads,
			target.hostname,
			startHack
		);

		logJobHack(pid, "hack", server, threads, startHack);
	}

	nextBatch();
	
	// Run 1: Start batches with max-threads on every server.
	await Server.allAttackers(async (server) => {
		// Number of batches that are possible by the server RAM.
		const maxThreads = Math.floor(server.ramFree / batchRam);

		const threads = maxThreads;

		if (threads > 0) {
			nextStep(server, threads, "H");
			nextStep(server, threads, "G");
			nextStep(server, threads, "W");
		} else {
			// Fall back to a plain hack attack when server is too small
			// for a full HGW cycle.
			const threads = Math.floor(server.ramFree / 1.7);
			runHackSimple(server, threads);
		}
	});

	return duration;
}
