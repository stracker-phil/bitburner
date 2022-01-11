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
 * @param {int} delay
 * @param {int} maxRam
 * @returns {object} Attack details.
 */
export function run(ns, attacker, target, delay, maxRam) {
	const info = getInfos(ns, target);

	// Include details about RAM limitation with the attack info.
	info.limitRam = maxRam;

	// Start with the weaken attack. It will automatically
	// cascade into a grow-, and then a hack-attack.
	return weaken(ns, attacker, info, delay);
}

/**
 * Collects relevant details about the target server.
 *
 * @param {NS} ns
 * @param {string|object} target - Hostname, or the return value of getInfos()
 * @return {object} Details about the target server.
 */
function getInfos(ns, target) {
	let info;

	if ("object" === typeof target && target.host) {
		info = target;
	} else {
		info = {
			host: target,
			duration: 20,
			delay: 0,
		};
	}

	if (!ns.serverExists(info.host)) {
		throw new Error("Invalid target host: " + JSON.stringify(info.host));
	}

	// Percentage of money is deducted from the AVAILABLE money on hack.
	//   stolen = floor(currMoney * changeMoneyHack)
	const changeMoneyHack = ns.hackAnalyze(info.host);

	const minSecurity = ns.getServerMinSecurityLevel(info.host);
	const currSecurity = ns.getServerSecurityLevel(info.host);
	const maxMoney = ns.getServerMaxMoney(info.host);
	const currMoney = ns.getServerMoneyAvailable(info.host);
	const diffMoney = maxMoney - currMoney;
	const timeWeaken = ns.getWeakenTime(info.host);
	const timeGrow = ns.getGrowTime(info.host);
	const timeHack = ns.getHackTime(info.host);
	const ramWeaken = 1.75;
	const ramGrow = 1.75;
	const ramHack = 1.7;

	const defaults = {
		// Security details.
		securityMin: minSecurity,
		securityCurr: currSecurity,
		securityDiff: 0,
		// Funding details.
		moneyMax: maxMoney,
		moneyCurr: currMoney,
		moneyDiff: diffMoney,
		// Weaken command effects.
		weakenTime: timeWeaken,
		weakenSecurity: changeSecWeaken,
		weakenMaxThreads: 0,
		weakenRam: ramWeaken,
		// Grow command effects.
		growTime: timeGrow,
		growSecurity: changeSecGrow,
		growMaxThreads: 0,
		growRam: ramGrow,
		// Hack command effects.
		hackTime: timeHack,
		hackSecurity: changeSecHack,
		hackMoney: changeMoneyHack,
		hackRam: ramHack,
		// Dynamic details, populated by attack functions.
		jobsWeaken: [],
		jobsGrow: [],
		jobsHack: [],
		threadsWeaken: 0,
		threadsGrow: 0,
		threadsHack: 0,
		attackRam: 0,
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

	// Calculate the number of grow threads that are required to
	// max out the servers money.
	const growFactor = Math.max(1, info.moneyMax / info.moneyCurr);
	info.growMaxThreads = Math.ceil(ns.growthAnalyze(info.host, growFactor));

	return info;
}

/**
 * Calculates the "ramFree" attribute of the attack info object.
 *
 * @param {NS} ns
 * @param {object} info - The attack info object.
 * @return {object}
 */
function setRamInfos(ns, attacker, info) {
	const ramMax = ns.getServerMaxRam(attacker);
	const ramUsed = ns.getServerUsedRam(attacker);
	info.ramFree = ramMax - ramUsed;

	if (!isNaN(info.limitRam) && info.limitRam > 0) {
		if (info.attackRam >= info.limitRam) {
			info.ramFree = 0;
		} else {
			info.ramFree = Math.min(info.limitRam, info.ramFree);
		}
	}

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
	const moneyLeft = info.moneyCurr - stolen;
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
function adjustInfoAfterWeaken(info, pid, start, threads) {
	// When the attack was started successfully, update the
	// details of the target info object.
	if (pid) {
		const attackTime = start + info.weakenTime;
		const attackRam = threads * info.weakenRam;

		info.jobsWeaken.push(pid);
		info.threadsWeaken += threads;
		info.attackRam += attackRam;

		// Find the total duration of the current attack.
		info.duration = Math.max(info.duration, attackTime);

		// Update the expected target servers security level.
		info.securityCurr -= threads * info.weakenSecurity;

		// Reduce the required weaken threads, so the next
		// attacking server can optimize available RAM.
		info.weakenMaxThreads -= threads;

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
function adjustInfoAfterGrow(info, pid, start, threads) {
	// When the attack was started successfully, update the
	// details of the target info object.
	if (pid) {
		const attackTime = start + info.growTime;
		const attackRam = threads * info.growRam;

		info.jobsGrow.push(pid);
		info.threadsGrow += threads;
		info.attackRam += attackRam;

		// Find the total duration of the current attack.
		info.duration = Math.max(info.duration, attackTime);

		// This is a very rough approximation of the money
		// change. The real change is logarithmic and not
		// documented. However, this change is enough here.
		if (info.growMaxThreads > threads) {
			info.moneyCurr += info.moneyDiff / info.growMaxThreads;
		} else {
			info.moneyCurr = info.moneyMax;
		}

		// Reduce the required grow threads, so the next
		// attacking server can optimize available RAM.
		info.growMaxThreads -= threads;

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
function adjustInfoAfterHack(info, pid, start, threads) {
	// When the attack was started successfully, update the
	// details of the target info object.
	if (pid) {
		const attackTime = start + info.hackTime;
		const attackRam = threads * info.hackRam;

		info.jobsHack.push(pid);
		info.threadsHack += threads;
		info.attackRam += attackRam;

		// Find the total duration of the current attack.
		info.duration = Math.max(info.duration, attackTime);

		// Reduce the available money.
		const stolen = Math.floor(info.moneyCurr * info.hackMoney * threads);
		info.moneyCurr = Math.max(1, info.moneyCurr - stolen);
		info.moneyDiff = info.moneyMax - info.moneyCurr;

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
 * @param {string|object} target - hostname or attack details object.
 * @param {int} delay
 * @returns {object} Attack details.
 */
export function weaken(ns, attacker, target, delay) {
	// Get/sanitize details about the attacked server.
	let info = getInfos(ns, target);

	// Refresh the RAM details of the attacking server.
	info = setRamInfos(ns, attacker, info);

	// Maximum number of weaken-threads possible on the sever.
	const tMax = Math.floor(info.ramFree / info.weakenRam);

	// Only plan the weaken attack, when the server is not
	// already at minimum security.
	if (info.weakenMaxThreads > 0 && tMax > 0) {
		// We want to end the grow attack right before the
		// counter-weaken attack finishes.
		let startWeaken = delay;

		// Decide on how many weaken threads to run on the server:
		// If number of required threads is lower than max possible
		// threads, then only run the required threads, saving the
		// remaining RAM for other attacks.
		const tActual = Math.min(tMax, info.weakenMaxThreads);

		// Start the attack script to reduce the target security.
		const pidWeaken = ns.exec(
			"run-weaken.js",
			attacker,
			tActual,
			info.host,
			startWeaken
		);

		info = adjustInfoAfterWeaken(info, pidWeaken, startWeaken, tActual);
	}

	// In case there is RAM left after weakening the target
	// to minimum security, then continue with a growth attack.
	if (info.ramFree >= info.growRam) {
		info = grow(ns, attacker, info, 20 + delay);
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
 * @param {string|object} target - hostname or attack details object.
 * @param {int} delay
 * @returns {object} Attack details.
 */
export function grow(ns, attacker, target, delay) {
	// Get/sanitize details about the attacked server.
	let info = getInfos(ns, target);

	// Refresh the RAM details of the attacking server.
	info = setRamInfos(ns, attacker, info);

	// Maximum number of grow-threads possible on the sever.
	const tGrowMax = Math.floor(info.ramFree / info.growRam);

	// Only plan the grow attack, when the servers funding
	// is not already maxed out.
	if (info.growMaxThreads > 0 && tGrowMax > 0) {
		// We want to end the grow attack right before the
		// counter-weaken attack finishes.
		let startGrow = delay + info.weakenTime - info.growTime;

		// Maximum number of grow threads we run on this server
		// is determined by the required threads and max possible
		// threads.
		const tGrowActual = Math.min(tGrowMax, info.growMaxThreads);

		// Start the attack script to increase the targets funds.
		const pidGrow = ns.exec(
			"run-grow.js",
			attacker,
			tGrowActual,
			info.host,
			startGrow
		);

		info = adjustInfoAfterGrow(info, pidGrow, startGrow, tGrowActual);
	}

	// In case there is RAM left after maximizing the funds on
	// the target server, then recurse back to weaken, to
	// compensate the security increase.
	if (info.ramFree >= info.weakenRam && info.securityDiff) {
		info = weaken(ns, attacker, info, 40 + delay);
	}

	// When the funds are maxed, and security minimized, we can
	// cascade into the hack phase of the attack.
	else if (info.ramFree >= info.hackRam) {
		info = hack(ns, attacker, info, 60 + delay);
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
 * @param {string|object} target - hostname or attack details object.
 * @param {int} delay
 * @returns {int} Duration of the slowest cycle.
 */
export function hack(ns, attacker, target, delay) {
	// Get/sanitize details about the attacked server.
	let info = getInfos(ns, target);

	// Refresh the RAM details of the attacking server.
	info = setRamInfos(ns, attacker, info);

	// Maximum number of hack-threads possible on the sever.
	let tHack = Math.floor(info.ramFree / info.hackRam);

	// How many "grow" events are needed to counter the
	// reduction in server funds?
	const tGrow = growCyclesForHack(ns, tHack, info);

	// How many "weaken" events are needed to counter the
	// security increase?
	const tWeakHack = weakenCyclesForHack(tHack, info);
	const tWeakGrow = weakenCyclesForGrow(tGrow, info);
	const tWeak = tWeakHack + tWeakGrow;

	// Adjust number of available hack threads.
	const tGrowAdj = (tGrow / info.hackRam) * info.growRam;
	const tWeakAdj = (tWeak / info.hackRam) * info.weakenRam;
	tHack -= Math.ceil(tGrowAdj + tWeakAdj);

	// We want to time the three attacks, so they end in the
	// correct order:
	//
	//  1. hack     |     ---->| | |
	//  2. grow     |   -------->| |
	//  3. weaken   |------------->|
	let startHack = delay + info.weakenTime - info.hackTime;
	let startGrow = 20 + delay + info.weakenTime - info.growTime;
	let startWeak = 40 + delay + info.weakenTime - info.weakenTime;

	if (tHack > 0) {
		const pidHack = ns.exec(
			"run-hack.js",
			attacker,
			tHack,
			info.host,
			startHack
		);

		info = adjustInfoAfterHack(info, pidHack, startHack, tHack);
	}

	if (tGrow > 0) {
		const pidGrow = ns.exec(
			"run-grow.js",
			attacker,
			tGrow,
			info.host,
			startGrow
		);

		info = adjustInfoAfterGrow(info, pidGrow, startGrow, tGrow);
	}

	if (tWeak > 0) {
		const pidWeaken = ns.exec(
			"run-weaken.js",
			attacker,
			tWeak,
			info.host,
			startWeak
		);

		info = adjustInfoAfterWeaken(info, pidWeaken, startWeak, tWeak);
	}

	// Return the current attack state, because it contains
	// details that the next attacking server requires.
	return info;
}
