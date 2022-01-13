/** @param {NS} ns **/
export async function main(ns) {
	const target = ns.args[0] || "n00dles";
	const hacks = parseInt(ns.args[1]) || 100;

	const moneyMax = ns.getServerMaxMoney(target);
	const hackMoney = ns.hackAnalyze(target);
	const hack10p1 = ns.hackAnalyzeThreads(target, moneyMax / 10);
	const hack10p2 = ((moneyMax / 10) * hackMoney) / 100;

	const stolen = Math.floor(moneyMax * hackMoney * hacks);
	const moneyLeft = Math.max(moneyMax / 100, moneyMax - stolen);
	const growFactor = Math.max(1, moneyMax / moneyLeft);

	// Values are only correct, when target has maxed out money and minimal security.

	ns.tprint("Money Max:    " + moneyMax);
	ns.tprint("Steal 10% A:  " + hack10p1 + " hacks");
	ns.tprint("Steal 10% B:  " + hack10p2 + " hacks");
	ns.tprint("Hack Money:   " + hackMoney);
	ns.tprint("Stolen:       " + stolen);
	ns.tprint("Money Left:   " + moneyLeft);
	ns.tprint("Grow by:      " + growFactor);
	ns.tprint(
		"Grow Threads: " + Math.ceil(ns.growthAnalyze(target, growFactor))
	);
}
