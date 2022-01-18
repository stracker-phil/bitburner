/*
    25 hack threads to every weaken thread
    12.5 grow threads to every weaken thread
    if waiting for a weaken call with every grow/hack call, can use a full 25 hack or 12 grow per weaken
*/

/**
 * Manual attack daemon.
 *
 * @param {NS} ns
 * @returns
 */
export async function main(ns) {
	let target = ns.args[0];
	let allowedRam = ns.args[1];

	// target argument validation
	if (!target || !ns.serverExists(target)) {
		ns.tprint(
			"ERROR: Invalid argument target ($ run daemon.ns <target> <allowedRam>)"
		);
		return;
	} else if (!allowedRam || typeof allowedRam != "number") {
		ns.tprint(
			"ERROR: Invalid argument allowedRam ($ run daemon.ns <target> <allowedRam>)"
		);
		ns.tprint("Must be numeric.");
		return;
	} else if (!ns.hasRootAccess(target)) {
		ns.tprint("ERROR: No root access on target: " + target);
		return;
	} else if (
		ns.getServerRequiredHackingLevel(target) > ns.getHackingLevel()
	) {
		ns.tprint(
			"ERROR: target hack level requirement too high (" +
				target +
				", " +
				ns.getServerRequiredHackingLevel(target) +
				")"
		);
		return;
	}

	// 1) minimise security level
	// 1.1) determine minimum sec level
	// 1.2) use all available threads to weaken()
	// 1.3) repeat 1.2 until minimum sec level reached
	await minimizeSecurity(ns, target, allowedRam);

	// repeat until killed
	while (true) {
		// 2) maximise money in server
		// 2.1) determine max money
		// 2.2) determine number of thread groups
		//      (13 threads - 12 grow, 1 weaken,)
		// 2.3) use all available threads to grow and weaken
		//      at same time, using given ratio (top of the file)
		// 2.4) repeat 1.3 until money is maxed
		await maximizeCash(ns, target, allowedRam);

		// 3) skim money from the server, never dropping below 90%
		//    of max money, as well as keeping sec level at minimum
		// 3.1) determine what 0.1 of max money is
		// 3.2) determine how many hack threads to skim that much money
		// 3.3) determine how many hack threads can be employed in general
		// 3.4) use the smaller of either the amount from 3.2 or 3.3
		// 3.5) use concurrent weaken threads to cover security loss from hack threads
		// 3.6) go back to step 2
		await startHack(ns, target, allowedRam);
	}
}

async function minimizeSecurity(ns, target, allowedRam) {
	let minSec = ns.getServerMinSecurityLevel(target);

	while (ns.getServerSecurityLevel(target) > minSec) {
		let threads = getThreads(ns, allowedRam);
		let duration = ns.getWeakenTime(target) + 200;

		// let's try to optimise the number of threads we use
		// this will allow running more than one daemon on systems
		// that have a lot of RAM like a mid-game home PC.
		// In this case it's pretty simple, we get the difference
		// between current sec level and min sec level, and divide
		// by 0.05.
		let diff = ns.getServerSecurityLevel(target) - minSec;
		let tNeeded = Math.ceil(diff / 0.05); // we always want to round up.

		// We use the lesser of the number of threads needed or the number of threads we can utilise.
		let tActual = Math.min(tNeeded, threads);
		ns.run("run-weaken.js", tActual, target);
		await ns.sleep(duration);
	}
}

async function maximizeCash(ns, target, allowedRam) {
	let maxMoney = ns.getServerMaxMoney(target);

	// try to optimise the number of grow/weaken threads used, so
	// multiple daemons can be run on high-RAM systems.

	while (ns.getServerMoneyAvailable(target) < maxMoney) {
		let threads = getThreads(ns, allowedRam);
		// work out how many threads it would take to raise it that amount in one go.
		// growthAnalyze() determines how many threads are needed to raise current money
		// by a decimal factor, so we need to work out which factor multiplying the current
		// money by will max out the money. That equation is: cur_cash * desired_factor = maxMoney.
		// that means maxMoney / cur_cash = desired_factor.

		// we should probably watch out for some weirdness that happens when all the cash is gone.
		// growthAnalyze will return stuff like Infinity in those cases.
		// so we can just skip all of that if money's at zero (which, ideally, it shouldn't be.)
		// mistakes happen.
		let tWeakenActual;
		let tGrowActual;
		if (threads < 13) {
			tWeakenActual = 1;
			tGrowActual = threads - 1;
		} else {
			tWeakenActual = Math.floor(threads / 13);
			tGrowActual = tWeakenActual * 12;
		}

		// if the needed threads for both grow and weaken are more than the threads we have,
		// we need to divvy up the threads we can use such that we use all available threads
		// while still running enough weaken() threads to keep security level down.
		// so the default values utilize all available threads.
		// then we check if we can get away with less. If we can, we do that instead.

		if (ns.getServerMoneyAvailable(target) > 0) {
			let factor = maxMoney / ns.getServerMoneyAvailable(target);
			let tGrowNeeded = Math.ceil(ns.growthAnalyze(target, factor));

			// with the current method of waiting for a weaken() cycle with every grow cycle,
			// we need 1 weaken() to every 12 grow().
			let tWeakenNeeded = Math.ceil(tGrowNeeded / 12);
			if (tGrowNeeded + tWeakenNeeded <= threads) {
				tGrowActual = tGrowNeeded;
				tWeakenActual = tWeakenNeeded;
			}
		}

		let duration = ns.getWeakenTime(target) + 200;

		ns.run("run-grow.js", tGrowActual, target);
		ns.run("run-weaken.js", tWeakenActual, target);
		await ns.sleep(duration);
	}
}

async function startHack(ns, target, allowedRam) {
	let threads = getThreads(ns, allowedRam);

	// determine how many threads can be dedicated
	let tHack;
	let tWeaken;
	if (threads < 26) {
		tHack = threads - 1;
		tWeaken = 1;
	} else {
		tHack = Math.floor(threads / 26) * 25;
		tWeaken = Math.floor(threads / 26);
		tWeaken = Math.max(1, tWeaken);
	}

	// determine how many threads are needed
	// 10% of max money...
	let moneyToHack = ns.getServerMaxMoney(target) * 0.1;
	let tHackNeeded = Math.ceil(ns.hackAnalyzeThreads(target, moneyToHack));

	// use smaller of needed hack threads or available hack
	let tHackActual = Math.min(tHackNeeded, tHack);
	let tWeakenNeeded = Math.ceil(tHackActual / 25);

	// use smaller of weaken threads needed or available weaken
	let tWeakenActual = Math.min(tWeakenNeeded, tWeaken);

	// we can just use as many weaken threads as we want, so proceed to hack <-- wtf?
	// leaving this absolutely ludicrous comment for posterity. We should NOT be using
	// "as many weaken threads as we want". We should use either the amount needed,
	// or the amount possible per batch, whichever is smaller.
	// the basic premise is to either skim only 10% or as much as possible, whichever is smaller
	let duration = ns.getWeakenTime(target) + 200;

	ns.run("run-hack.js", tHackActual, target);
	ns.run("run-weaken.js", tWeakenActual, target);

	await ns.sleep(duration);
}

function getThreads(ns, allowedRam) {
	const self = ns.getHostname();

	let ram = ns.getServerRam(self);
	ram = Math.max(0, Math.min(allowedRam, ram[0] - ram[1]));

	let threads = Math.floor(ram / 1.75);

	if (ram < 1 || threads < 2) {
		ns.tprint(
			"ERROR: Insufficient RAM to operate daemon on server: " + self
		);
		ns.exit();
	}

	return threads;
}
