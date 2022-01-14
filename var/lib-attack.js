import * as Server from "lib/server.js";

/**
 * A library of attack functions to hack/grow/weaken a target server.
 * This library does not depend on other libraries or files, so it
 * can be distributed and used on other servers as well.
 */

const changeSecWeaken = 0.05;
const changeSecGrow = 0.004;
const changeSecHack = 0.002;

/**
 * Coordinates a complete Weaken-Grow-Hack attack against the target
 * server.
 *
 * @param {NS} ns
 * @param {string} attacker
 * @param {string|object} target - hostname or attack details object.
 * @param {int} maxRam
 * @returns {object} Attack details.
 */
export async function run(ns, attacker, target, maxRam) {
	await Server.initialize(ns);

	// Include details about RAM limitation with the attack info.
	const config = {
		ramMax: maxRam,
	};

	let info = getInfos(ns, attacker, target, config);

	// Start with the weaken attack. It will automatically
	// cascade into a grow-, and then a hack-attack.
	info = weaken(ns, attacker, info);

	delete info.ramFree;

	return info;
}

/**
 * Collects relevant details about the target server.
 *
 * @param {NS} ns
 * @param {string} attacker
 * @param {string|object} hostOrTarget - Hostname, or the return value of getInfos()
 * @param {object} config - Custom default configuration values
 * @return {object} Details about the target server.
 */
function getInfos(ns, attacker, hostOrTarget, config = {}) {
	let info;

	if ("object" === typeof hostOrTarget && hostOrTarget.host) {
		info = hostOrTarget;
	} else {
		info = { ...config, host: hostOrTarget };
	}

	if (!ns.serverExists(info.host)) {
		throw new Error(
			`Invalid target host:\n\n${JSON.stringify(info.host)}\n`
		);
	}

	const target = Server.get(info.host);
	const self = Server.get(attacker);

	self.refreshRam(ns);

	// If no RAM limitation is defined by the run() command, then
	// limit to the servers capacity.
	if ("undefined" === typeof info.ramMax || isNaN(info.ramMax)) {
		info.ramMax = self.ramMax;
	}

	const ramWeaken = 1.75;
	const ramGrow = 1.75;
	const ramHack = 1.7;

	// Percentage of money is deducted from the AVAILABLE money on hack.
	//   stolen = floor(currMoney * changeMoneyHack)
	const changeMoneyHack = ns.hackAnalyze(info.host);

	// Calculate the number of grow threads that are required to
	// max out the servers money.
	const growFactor = Math.max(1, target.moneyMax / target.moneyAvailable);

	const defaults = {
		duration: 0,
		ramMax: info.ramMax,
		ramFree: Math.min(info.ramMax, self.ramFree),
		ramUsed: 0,
		// Security details.
		securityMin: target.minDifficulty,
		securityCurr: target.hackDifficulty,
		securityDiff: 0,
		// Funding details.
		moneyMax: target.moneyMax,
		moneyCurr: target.moneyAvailable,
		moneyDiff: target.moneyMax - target.moneyAvailable,
		// Weaken command effects.
		weakenTime: target.timeWeaken,
		weakenSecurity: changeSecWeaken,
		weakenMaxThreads: 0,
		weakenRam: ramWeaken,
		// Grow command effects.
		growTime: target.timeGrow,
		growSecurity: changeSecGrow,
		growMaxThreads: Math.ceil(ns.growthAnalyze(info.host, growFactor)),
		growRam: ramGrow,
		// Hack command effects.
		hackTime: target.timeHack,
		hackSecurity: changeSecHack,
		hackMoney: changeMoneyHack / 100,
		hackRam: ramHack,
		hackMaxPercent: 0.1, // Only steal 10% of max money.
		hackMaxThreads: 0,
		hgwStep: "H",
		// Dynamic details, populated by attack functions.
		stage: "weaken",
		delay: 50, // Delay in ms between hack/grow/weaken calls.
		jobs: [],
		threadsWeaken: 0,
		threadsGrow: 0,
		threadsHack: 0,
		// Apply custom defaults
		...config,
	};

	for (const key in defaults) {
		if ("undefined" === typeof info[key]) {
			info[key] = defaults[key];
		}
	}

	// Prevent division-by-zero issues when no money left.
	info.moneyCurr = Math.max(1, info.moneyCurr);

	// Calculate the possible security reduction we can achieve
	// by applying weaken attacks.
	info.securityDiff = Math.max(0, info.securityCurr - info.securityMin);

	// Number of weaken threads that are needed to lower the security
	// level to the servers minimum value.
	info.weakenMaxThreads = Math.ceil(info.securityDiff / info.weakenSecurity);

	return info;
}

/**
 * How many "weaken" threads are needed to compensate the security increase
 * that's caused by the given amount of "grow" threads?
 *
 * @param {int} tGrow - Hack threads
 * @param {object} info - The attack info object.
 * @return {int}
 */
function weakenCyclesForGrow(tGrow, info) {
	return Math.max(
		0,
		Math.ceil(tGrow * (info.growSecurity / info.weakenSecurity))
	);
}

/**
 * How many "weaken" threads are needed to compensate the security increase
 * that's caused by the given amount of "hack" threads?
 *
 * @param {int} tHack
 * @param {object} info - The attack info object.
 * @return {int}
 */
function weakenCyclesForHack(tHack, info) {
	return Math.max(
		0,
		Math.ceil(tHack * (info.hackSecurity / info.weakenSecurity))
	);
}

/**
 * How many "weaken" threads are needed to compensate the security increase
 * that's caused by the given amount of "hack" threads?
 *
 * @param {int} tHack
 * @param {object} info - The attack info object.
 * @return {int}
 */
function growCyclesForHack(ns, tHack, info) {
	const stolen = Math.floor(info.moneyCurr * info.hackMoney * tHack);
	const moneyLeft = Math.max(1, info.moneyCurr - stolen);
	const growFactor = Math.max(1, info.moneyMax / moneyLeft);

	return Math.ceil(ns.growthAnalyze(info.host, growFactor));
}

/**
 * Process the expected changes after a weaken attack into
 * the attack info object.
 *
 * Weaken affects the following attributes:
 * 1. Server Security is lowered
 *
 * @param {object} info - The attack info object.
 * @return {object}
 */
function adjustInfoAfterWeaken(info, pid, start, threads, attacker) {
	// When the attack was started successfully, update the
	// details of the target info object.
	if (pid) {
		const attackTime = start + info.weakenTime;
		const attackRam = threads * info.weakenRam;

		info.jobs.push({
			pid,
			source: attacker,
			stage: info.stage,
			type: "weaken",
			threads,
			start,
			duration: attackTime,
			ram: attackRam,
		});
		info.threadsWeaken += threads;
		info.ramUsed += attackRam;

		// Find the total duration of the current attack.
		info.duration = info.delay + Math.max(info.duration, attackTime);

		// Update the expected target servers security level.
		info.securityCurr -= threads * info.weakenSecurity;

		// Reduce the scheduled weaken threads, so the next
		// attacking server/cycle know where to continue.
		info.weakenMaxThreads -= Math.min(info.weakenMaxThreads, threads);

		// Reduce the used RAM from the available ram to see
		// if we can perform another attack on this server.
		info.ramFree -= attackRam;
	}

	return info;
}

/**
 * Process the expected changes after a grow attack into
 * the attack info object.
 *
 * Grow affects the following attributes:
 * 1. Available money is increased
 * 2. Server Security is raised
 *
 * @param {object} info - The attack info object.
 * @return {object}
 */
function adjustInfoAfterGrow(info, pid, start, threads, attacker) {
	// When the attack was started successfully, update the
	// details of the target info object.
	if (pid) {
		const attackTime = start + info.growTime;
		const attackRam = threads * info.growRam;

		info.jobs.push({
			pid,
			source: attacker,
			stage: info.stage,
			type: "grow",
			threads,
			start,
			duration: attackTime,
			ram: attackRam,
		});
		info.threadsGrow += threads;
		info.ramUsed += attackRam;

		// Find the total duration of the current attack.
		info.duration = info.delay + Math.max(info.duration, attackTime);

		// This is a very rough approximation of the money
		// change. The real change is logarithmic and not
		// documented. However, this change is enough here.
		if (info.growMaxThreads > threads) {
			info.moneyCurr += info.moneyDiff / info.growMaxThreads;
		} else {
			info.moneyCurr = info.moneyMax;
		}

		// Reduce the scheduled grow threads, so the next
		// attacking server/cycle know where to continue.
		info.growMaxThreads -= Math.min(info.growMaxThreads, threads);

		// Update the security level by the expected amount.
		info.securityCurr += threads * info.growSecurity;
		info.securityDiff = Math.max(0, info.securityCurr - info.securityMin);

		// Reduce the used RAM from the available ram to see
		// if we can perform another attack on this server.
		info.ramFree -= attackRam;
	}

	return info;
}

/**
 * Process the expected changes after a grow attack into
 * the attack info object.
 *
 * Hack affects the following attributes:
 * 1. Available money is decreased
 * 2. Server Security is raised
 *
 * @param {object} info - The attack info object.
 * @return {object}
 */
function adjustInfoAfterHack(info, pid, start, threads, attacker) {
	// When the attack was started successfully, update the
	// details of the target info object.
	if (pid) {
		const attackTime = start + info.hackTime;
		const attackRam = threads * info.hackRam;

		info.jobs.push({
			pid,
			source: attacker,
			stage: info.stage,
			type: "hack",
			threads,
			start,
			duration: attackTime,
			ram: attackRam,
		});
		info.threadsHack += threads;
		info.ramUsed += attackRam;

		// Find the total duration of the current attack.
		info.duration = info.delay + Math.max(info.duration, attackTime);

		// Reduce the available money.
		const stolen = Math.floor(info.moneyCurr * info.hackMoney * threads);
		info.moneyCurr = Math.max(1, info.moneyCurr - stolen);
		info.moneyDiff = info.moneyMax - info.moneyCurr;

		// Reduce the scheduled hack threads, so the next
		// attacking server/cycle know where to continue.
		info.hackMaxThreads -= Math.min(info.hackMaxThreads, threads);

		// Update the security level by the expected amount.
		info.securityCurr += threads * info.hackSecurity;
		info.securityDiff = Math.max(0, info.securityCurr - info.securityMin);

		// Reduce the used RAM from the available ram to see
		// if we can perform another attack on this server.
		info.ramFree -= attackRam;
	}

	return info;
}

/**
 * Weakens the target server to the minimum security level.
 *
 * The weaken attack is the most simple one: We can allocate
 * all available resources to run weaken commands, because
 * "weaken" only reduces the targets security and does not
 * affect anything else that needs to be countered.
 *
 * @param {NS} ns
 * @param {string} attacker
 * @param {object} info - hostname or attack details object.
 * @returns {object} Attack details.
 */
function weaken(ns, attacker, info) {
	const self = Server.get(attacker);

	// Maximum number of weaken-threads possible on the sever.
	const tMax = Math.floor(info.ramFree / info.weakenRam);

	// Only plan the weaken attack, when the server is not
	// already at minimum security.
	if ("weaken" === info.stage && info.weakenMaxThreads > 0) {
		let startWeaken = 0;

		if (info.duration > 0) {
			info.duration = Math.max(info.duration, info.weakenTime);
			startWeaken = info.duration - info.weakenTime;
		}

		// Decide on how many weaken threads to run on the server:
		// If number of required threads is lower than max possible
		// threads, then only run the required threads, saving the
		// remaining RAM for other attacks.
		const tActual = Math.min(tMax, info.weakenMaxThreads);

		if (tActual > 0) {
			// Start the attack script to reduce the target security.
			const pidWeaken = self.attack(
				ns,
				"weaken",
				tActual,
				info.host,
				startWeaken
			);

			info = adjustInfoAfterWeaken(
				info,
				pidWeaken,
				startWeaken,
				tActual,
				attacker
			);
		}
	}

	if ("weaken" === info.stage && info.weakenMaxThreads < 1) {
		info.stage = "grow";
	}

	// Cascade into the grow stage when finished weakening the
	// target server.
	if ("grow" === info.stage) {
		info = grow(ns, attacker, info);
	}

	// In case grow completed, continue with the final hacking
	// stage with all free resources.
	if ("hack" === info.stage) {
		info = hack(ns, attacker, info);
	}

	// Return the current attack state, because it contains
	// details that the next attacking server requires.
	return info;
}

/**
 * Grows the funds on the target server to the maximum, without increasing
 * the security level.
 *
 * This attack consists of two components: First, the grow command is
 * used to increase the targets funds. This command increases the security
 * level of the target, so we need to counter this with a weaken command.
 *
 * One grow attack increases the servers security by 0.04.
 * This means, we have to apply one weaken for 12.5 grow attacks.
 *
 * @param {NS} ns
 * @param {string} attacker
 * @param {object} info - hostname or attack details object.
 * @returns {object} Attack details.
 */
function grow(ns, attacker, info) {
	const self = Server.get(attacker);

	// Maximum number of grow-threads possible on the sever.
	const tGrowMax = Math.floor(info.ramFree / info.growRam);

	// Only plan the grow attack, when the servers funding
	// is not already maxed out.
	if ("grow" === info.stage && info.growMaxThreads > 0) {
		// Maximum number of grow threads we run on this server
		// is determined by the required threads and max possible
		// threads.
		const tGrow = Math.min(tGrowMax, info.growMaxThreads);

		// How many weaken calls do we need to compensate for the
		// security increase caused by grow?
		const tWeak = weakenCyclesForGrow(tGrow, info);

		// Re-assign threads so we have enough resources to apply
		// the weaken calls in the same batch.
		const tGrowActual = Math.min(tGrow, tGrowMax - tWeak);

		if (tGrowActual > 0) {
			info.duration = Math.max(info.duration, info.growTime);

			// We want to end the grow attack right before the
			// counter-weaken attack finishes.
			const startGrow = info.duration - info.growTime;

			// Start the attack script to increase the targets funds.
			const pidGrow = self.attack(
				ns,
				"grow",
				tGrowActual,
				info.host,
				startGrow
			);

			info = adjustInfoAfterGrow(
				info,
				pidGrow,
				startGrow,
				tGrowActual,
				attacker
			);
		}

		if (tWeak > 0) {
			info.duration = Math.max(info.duration, info.weakenTime);

			// The weaken attack should end right after the grow process
			// finishes. Note that info.duration was increased by the
			// adjustInfoAfterGrow() call above.
			const startWeak = info.duration - info.weakenTime;

			// Start the attack script to reduce the targets security.
			const pidWeak = self.attack(
				ns,
				"weaken",
				tWeak,
				info.host,
				startWeak
			);

			info = adjustInfoAfterWeaken(
				info,
				pidWeak,
				startWeak,
				tWeak,
				attacker
			);
		}
	}

	if ("grow" === info.stage && info.growMaxThreads < 1) {
		info.stage = "hack";
	}

	// When the grow state is finished, enter the hacking stage
	// which is the most complex stage, as it tries to balance
	// security and funding while hacking the target.
	if ("hack" === info.stage) {
		info = hack(ns, attacker, info);
	}

	// Return the current attack state, because it contains
	// details that the next attacking server requires.
	return info;
}

/**
 * The hack attack finally steals money and brings us profit.
 * This stage is entered when the servers funding is at a maximum
 * and the security at a minimum level.
 *
 * Every hack process reduces the servers funding and increases
 * the security. So we need to track both, the money reduction
 * and the increase of the security level, so we can counter
 * both effects.
 *
 * @param {NS} ns
 * @param {string} attacker
 * @param {object} info - hostname or attack details object.
 * @returns {int} Duration of the slowest cycle.
 */
function hack(ns, attacker, info) {
	const self = Server.get(attacker);

	// How many hack threads will empty the entire server funds
	const tEmpty = Math.ceil(info.moneyMax * info.hackMoney);

	// Number of tasks in one batch. Might need some tweaking
	const numHack = 25;
	const numGrow = 20;
	const numWeak = 3;

	// Repeat the cycle as long as there is enough RAM to perform
	// a hack attack; there is also an exit condition at the end
	// of the loop, to stop when no action is possible anymore.
	//
	// Each iteration is called a "cycle" and can start up to three
	// process: one hack, grow and weaken process (in that order).
	//
	// Those three attacks are timed to END in the correct order:
	//
	//  1. hack     |     ---->|  |  |  (steal up to 10% of the money)
	//  2. grow     |   -------+->|  |  (restore funds to maximum)
	//  3. weaken   |----------+--+->|  (reduce security to minimum)
	//  - cycle -   |<-------------->|
	while (info.ramFree > info.hackRam) {
		// When no hack-attacks are scheduled, calculate the number
		// of possible attacks (hack/grow/weaken) before proceeding.
		// If hack-attacks are scheduled, then first complete the
		// pending batch before scheduling new threads.
		if (info.hackMaxThreads < 1) {
			// Steal at most x% of the max money on one batch, so we
			// do not lower the servers money too far.
			info.hackMaxThreads = Math.ceil(tEmpty * info.hackMaxPercent);

			// Schedule the number of "grow" events that are needed to
			// counter the reduction in server funds.
			info.growMaxThreads += growCyclesForHack(
				ns,
				info.hackMaxThreads,
				info
			);

			// Schedule the required number of "weaken" events are
			// needed to counter security increase by hack and grow.
			info.weakenMaxThreads += weakenCyclesForHack(
				info.hackMaxThreads,
				info
			);
			info.weakenMaxThreads += weakenCyclesForGrow(
				info.growMaxThreads,
				info
			);
		}

		// Hypothetical memory usage of one optimized batch.
		const ramBatch =
			numHack * info.hackRam +
			numGrow * info.growRam +
			numWeak * info.weakRam;

		const maxBatches = Math.floor(info.ramFree / ramBatch);

		const maxThreadsHack = numHack * maxBatches;
		const maxThreadsGrow = numGrow * maxBatches;
		const maxThreadsWeak = numWeak * maxBatches;

		// Actual number of hack-threads to start in this cycle.
		const tHack = Math.min(info.hackMaxThreads, maxThreadsHack);

		// Actual number of grow-threads to start in this cycle.
		const tGrow = Math.min(info.growMaxThreads, maxThreadsGrow);

		// Actual number of weaken-threads to start in this cycle.
		const tWeak = Math.min(info.weakenMaxThreads, maxThreadsWeak);

		// Collect PIDs of the attack threads to find out, which
		// attacks were started successfully.
		let pidHack = 0;
		let pidGrow = 0;
		let pidWeaken = 0;

		if (tHack > 0) {
			info.duration = Math.max(info.duration, info.hackTime);

			const startHack = info.duration - info.hackTime;

			pidHack = self.attack(ns, "hack", thack, info.host, startHack);

			info = adjustInfoAfterHack(
				info,
				pidHack,
				startHack,
				tHack,
				attacker
			);
		}

		if (tGrow > 0) {
			info.duration = Math.max(info.duration, info.growTime);

			// Note that info.duration was increased by the
			// adjustInfoAfterHack() call above.
			const startGrow = info.duration - info.growTime;

			pidGrow = self.attack(ns, "grow", tGrow, info.host, startGrow);

			info = adjustInfoAfterGrow(
				info,
				pidGrow,
				startGrow,
				tGrow,
				attacker
			);
		}

		if (tWeak > 0) {
			info.duration = Math.max(info.duration, info.weakenTime);

			// Note that info.duration was increased by the
			// adjustInfoAfterWeaken() call above.
			const startWeak = info.duration - info.weakenTime;

			pidWeaken = self.attack(ns, "weaken", tWeak, info.host, startWeak);

			info = adjustInfoAfterWeaken(
				info,
				pidWeaken,
				startWeak,
				tWeak,
				attacker
			);
		}

		// When no attacks were launched during this cycle, then
		// we've possibly exhausted the attackers RAM.
		if (!pidHack && !pidGrow && !pidWeaken) {
			break;
		}
	}

	// See if hack2 algorithm can fit in some additional jobs.
	info = hack2(ns, attacker, info);

	// Return the current attack state, because it contains
	// details that the next attacking server requires.
	return info;
}

/**
 * An alternate hack algorithm that uses less RAM but also has a
 * little lower quality results.
 *
 * When the default hack algorithm finishes, we try to apply this
 * logic to fill the servers remaining RAM.
 *
 * @param {NS} ns
 * @param {string} attacker
 * @param {object} info - hostname or attack details object.
 * @returns {int} Duration of the slowest cycle.
 */
function hack2(ns, attacker, info) {
	const self = Server.get(attacker);
	const batchRam = info.hackRam + info.growRam + info.weakenRam;

	let counter = 1;
	let startHack, startWeak, startGrow;

	function nextBatch() {
		info.hgwStep = "H";

		info.duration = Math.max(
			info.duration,
			2 * info.delay + info.weakenTime
		);

		startHack = info.duration - info.hackTime;
		startGrow = info.delay + info.duration - info.growTime;
		startWeak = 2 * info.delay + info.duration - info.weakenTime;

		info.duration += 3 * info.delay;
	}

	function nextStep(threads, runStep) {
		const manualStep = !!runStep;
		let nextStep, script, ramNeeded, startTime, adjustFn;
		counter++;

		if (isNaN(threads) || threads < 1) {
			threads = 1;
		}
		if (!manualStep) {
			runStep = info.hgwStep;
		}

		switch (runStep) {
			case "H":
				script = "hack";
				startTime = startHack;
				ramNeeded = info.ramHack;
				nextStep = "G";
				adjustFn = adjustInfoAfterHack;
				break;

			case "G":
				script = "grow";
				startTime = startGrow;
				ramNeeded = info.ramGrow;
				nextStep = "W";
				adjustFn = adjustInfoAfterGrow;
				break;

			case "W":
				script = "weaken";
				startTime = startWeak;
				ramNeeded = info.ramWeaken;
				adjustFn = adjustInfoAfterWeaken;
				nextStep = "H";
				break;
		}

		ramNeeded *= threads;

		if (info.ramFree < ramNeeded) {
			return false;
		}

		// When no more RAM available on this server,
		// we'll continue the batch on the next server.
		const uId = info.hgwStep + counter;
		const pid = self.attack(
			ns,
			script,
			threads,
			info.host,
			startTime,
			`${script}-${uId}`
		);

		if (pid) {
			info = adjustFn(info, pid, startTime, threads, attacker);

			info.hgwStep = nextStep;
			if (!info.hgwStep || "H" === nextStep) {
				nextBatch();
			}

			return true;
		} else {
			return false;
		}
	}

	if (info.ramFree > batchRam) {
		nextBatch();

		// Run 1: Start batches with max-threads on every server.
		const threads = Math.floor(info.ramFree / batchRam);

		if (threads > 0) {
			nextStep(threads, "H");
			nextStep(threads, "G");
			nextStep(threads, "W");
		}

		// Run 2: Start distributed, single-thread batches to use all resources.
		let success = true;

		while (success && info.ramFree >= batchRam) {
			const threads = info.ramFree / batchRam;
			success = nextStep(threads);
		}
	}

	return info;
}
