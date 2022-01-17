/**
 * Manipulates the stock market.
 * 
 * Setup:
 *   alias smanip="killall; run smanip.js"
 * 
 * Example:
 * 
 *   killall; run smanip.js joesguns down
 *   -> When price is low, buy all
 * 
 *   killall; run smanip.js joesguns up
 *   -> When price is high, sell all
 *
 * @param {NS} ns
 */
 export async function main(ns) {
	const target = ns.args[0]
	const type = ns.args[1]
	const me = ns.getHostname()
	const maxRam = ns.getServerMaxRam(me);

	if (!ns.serverExists(target)) {
		ns.tprint(`\nInvalid taret: "${target}" is no company server`);
		return;
	}
	if ('up' !== type && 'down' !== type) {
		ns.tprint(`\nExpexted type: [up|down]\nActual type:   "${type}"`);
		return;
	}

	while (true) {
		const usedRam = ns.getServerUsedRam(me);
		const freeRam = maxRam - usedRam;
		const threads = Math.floor(freeRam / 1.75);
		const timeWeak = ns.getWeakenTime(target);

		if ('up' === type) {
			const thrWeak = Math.ceil(threads / 12);
			const thrGrow = threads - thrWeak;

			ns.run('run-grow.js', thrGrow, target);
			ns.run('run-weaken.js', thrWeak, target);
		} else {
			const thrWeak = Math.ceil(threads / 25);
			const thrHack = threads - thrWeak;

			ns.run('run-hack.js', thrHack, target);
			ns.run('run-weaken.js', thrWeak, target);
		}

		await ns.sleep(timeWeak + 100);
	}
}