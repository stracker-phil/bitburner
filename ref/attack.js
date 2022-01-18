import * as Common from "lib/common.js";

/** @param {NS} ns **/
export async function main(ns) {
	const start = Date.now();
	const attack = ns.args[0] || "hack";
	const target = ns.args[1] || "n00dles";
	const before = getStats(ns, target);
	const host = ns.getHostname();
	const args = [attack, target];
	let delay = 0;

	ns.tprint(`Analyzing ${target}...`);

	if ("hack" === attack) {
		ns.tprint(`Starting to hack ${target}...`);
		delay = before.value.timeHack;
	} else if ("grow" === attack) {
		ns.tprint(`Starting to grow ${target}...`);
		delay = before.value.timeGrow;
	} else if ("weaken" === attack) {
		ns.tprint(`Starting to weaken ${target}...`);
		delay = before.value.timeWeaken;
	}

	const metricScript = "/test/attack-metric.js";
	ns.exec(metricScript, host, 1, ...args);
	await ns.sleep(delay + 500);

	const script = ns.getRunningScript(metricScript, host, ...args);

	ns.kill(metricScript, host, ...args);

	const info = [];
	const stats = [];
	const infoHeader = ["Stat", "Value", "per Sec"];
	const infoFormat = ["left", "right", "right"];
	const statsHeader = ["Stat", "Before", "After", "Diff"];
	const statsFormat = ["left", "right", "right", "right"];
	const duration = ((Date.now() - start) / 1000).toFixed(2);
	const after = getStats(ns, target);

	info.push(["Duration", duration + " sec"]);
	info.push([
		"Income",
		"$" + script.onlineMoneyMade.toLocaleString(),
		"$" + Math.round(script.onlineMoneyMade / duration).toLocaleString(),
	]);
	info.push([
		"Experience",
		script.onlineExpGained.toLocaleString(),
		(script.onlineExpGained / duration).toLocaleString(),
	]);
	info.push(["Money Max", before.format.moneyMax]);
	info.push(["Security Min", before.format.securityMin]);

	stats.push([
		"Money Available",
		before.format.moneyCur,
		after.format.moneyCur,
		parseInt(after.value.moneyCur - before.value.moneyCur).toLocaleString(),
	]);
	stats.push([
		"Security Level",
		before.format.securityCur,
		after.format.securityCur,
		parseFloat(after.value.securityCur - before.value.securityCur).toFixed(
			8
		),
	]);
	stats.push([
		"Money per Hack",
		before.format.hackMoney,
		after.format.hackMoney,
		parseFloat(after.value.hackMoney - before.value.hackMoney).toFixed(8),
	]);
	stats.push([
		"Time (Hack):",
		before.format.timeHack,
		after.format.timeHack,
		after.value.timeHack - before.value.timeHack + " ms",
	]);
	stats.push([
		"Time (Grow):",
		before.format.timeGrow,
		after.format.timeGrow,
		after.value.timeGrow - before.value.timeGrow + " ms",
	]);
	stats.push([
		"Time (Weaken):",
		before.format.timeWeaken,
		after.format.timeWeaken,
		after.value.timeWeaken - before.value.timeWeaken + " ms",
	]);

	ns.tprint(
		`\n\n${Common.printF(info, infoHeader, infoFormat)}\n\n${Common.printF(
			stats,
			statsHeader,
			statsFormat
		)}\n\n`
	);
}

function getStats(ns, target) {
	const maxMoney = ns.getServerMaxMoney(target);
	const currMoney = ns.getServerMoneyAvailable(target);
	const minSecurity = ns.getServerMinSecurityLevel(target);
	const currSecurity = ns.getServerSecurityLevel(target);

	const changeMoneyHack = ns.hackAnalyze(target);

	const timeWeaken = Math.ceil(ns.getWeakenTime(target));
	const timeGrow = Math.ceil(ns.getGrowTime(target));
	const timeHack = Math.ceil(ns.getHackTime(target));

	return {
		value: {
			moneyMax: maxMoney,
			moneyCur: currMoney,
			securityCur: currSecurity,
			securityMin: minSecurity,
			hackMoney: changeMoneyHack,
			timeHack,
			timeGrow,
			timeWeaken,
		},
		format: {
			moneyMax: "$" + maxMoney.toLocaleString(),
			moneyCur: "$" + currMoney.toLocaleString(),
			securityCur: currSecurity.toFixed(4),
			securityMin: minSecurity.toFixed(4),
			hackMoney: changeMoneyHack.toFixed(4),
			timeHack: (timeHack / 1000).toFixed(2) + "sec",
			timeGrow: (timeGrow / 1000).toFixed(2) + "sec",
			timeWeaken: (timeWeaken / 1000).toFixed(2) + "sec",
		},
	};
}
