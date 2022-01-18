export async function main(ns) {
	ns.disableLog("ALL");
	ns.clearLog();

	const target = ns.args[0] || ns.getHostname();
	const minMoney = ns.getServerMaxMoney(target);
	const minSec = ns.getServerMinSecurityLevel(target) + 1;
	const lowMoney = minMoney * 0.9;
	const lowSec = minSec + 1;

	while (1) {
		const curSec = ns.getServerSecurityLevel(target);
		const curMoney = ns.getServerMoneyAvailable(target);
		const info = [
			new Date().toISOString().slice(11, 19),
			curSec.toFixed(1) + " / " + minSec,
			ns.nFormat(parseInt(curMoney), "$0.000a") +
				" / " +
				ns.nFormat(parseInt(minMoney), "$0.000a"),
		].join(" | ");

		if (curSec > lowSec) {
			ns.print("WEAKEN | " + info);
			await ns.weaken(target);
		} else if (curMoney < lowMoney) {
			ns.print("GROW   | " + info);
			await ns.grow(target);
		} else {
			ns.print("HACK   | " + info);
			await ns.hack(target);
		}
	}
}
