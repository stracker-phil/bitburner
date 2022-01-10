import { formatMoney } from "lib/common.js";

const target = "n00dles";

const tests = [
	{
		active: false,
		info: "1 batch of 1 hack (direct)",
		threads: 1,
		runner: async (ns) => {
			const profit = await ns.hack(target);
			await ns.writePort(1, profit);
		},
	},
	{
		active: false,
		info: "1 batch of 1 hack (exec)",
		threads: 1,
		runner: async (ns) => {
			const timeHack = getTime(ns.getHackTime(target));
			ns.exec("run-hack.js", "home", 1, target);
			await ns.sleep(timeHack);
		},
	},
	{
		active: false,
		info: "1 batch of 100 hack (exec)",
		threads: 100,
		runner: async (ns) => {
			const timeHack = getTime(ns.getHackTime(target));
			ns.exec("run-hack.js", "home", 100, target);
			await ns.sleep(timeHack);
		},
	},
	{
		active: false,
		info: "5 batches of 20 hack (exec)",
		threads: 100,
		runner: async (ns) => {
			const timeHack = getTime(ns.getHackTime(target)) + 100;
			ns.exec("run-hack.js", "home", 20, target, 20);
			ns.exec("run-hack.js", "home", 20, target, 40);
			ns.exec("run-hack.js", "home", 20, target, 60);
			ns.exec("run-hack.js", "home", 20, target, 80);
			ns.exec("run-hack.js", "home", 20, target, 100);
			await ns.sleep(timeHack);
		},
	},
	{
		active: false,
		info: "1 WWHG batch",
		threads: 1,
		runner: async (ns) => {
			const timeWeaken = getTime(ns.getWeakenTime(target));
			const timeGrow = getTime(ns.getGrowTime(target));
			const timeHack = getTime(ns.getHackTime(target));
			const maxTime = Math.max(timeWeaken, timeGrow, timeHack);
			let batches = 0;

			const runBatch = (delay) => {
				let startHack = maxTime - timeHack;
				let startWeak1 = 20 + maxTime - timeWeaken;
				let startGrow = 40 + maxTime - timeGrow;
				let startWeak2 = 60 + maxTime - timeWeaken;
				const minStart = Math.min(
					startHack,
					startWeak1,
					startGrow,
					startWeak2
				);
				startHack = delay + startHack - minStart;
				startWeak1 = delay + startWeak1 - minStart;
				startGrow = delay + startGrow - minStart;
				startWeak2 = delay + startWeak2 - minStart;

				ns.exec("run-weaken.js", "home", 1, target, startWeak1);
				ns.exec("run-weaken.js", "home", 1, target, startWeak2);
				ns.exec("run-hack.js", "home", 1, target, startHack);
				ns.exec("run-grow.js", "home", 1, target, startGrow);
				batches++;

				return 80 + maxTime;
			};

			const duration = runBatch(0);
			ns.print(`  Batches: ${batches} | RAM: ${batches * 6.95} GB`);

			await ns.sleep(duration);
		},
	},
	{
		active: false,
		info: "2 WWHG batches",
		threads: 1,
		runner: async (ns) => {
			const timeWeaken = getTime(ns.getWeakenTime(target));
			const timeGrow = getTime(ns.getGrowTime(target));
			const timeHack = getTime(ns.getHackTime(target));
			const maxTime = Math.max(timeWeaken, timeGrow, timeHack);
			let batches = 0;

			const runBatch = (delay) => {
				let startHack = maxTime - timeHack;
				let startWeak1 = 20 + maxTime - timeWeaken;
				let startGrow = 40 + maxTime - timeGrow;
				let startWeak2 = 60 + maxTime - timeWeaken;
				const minStart = Math.min(
					startHack,
					startWeak1,
					startGrow,
					startWeak2
				);
				startHack = delay + startHack - minStart;
				startWeak1 = delay + startWeak1 - minStart;
				startGrow = delay + startGrow - minStart;
				startWeak2 = delay + startWeak2 - minStart;

				ns.exec("run-weaken.js", "home", 1, target, startWeak1);
				ns.exec("run-weaken.js", "home", 1, target, startWeak2);
				ns.exec("run-hack.js", "home", 1, target, startHack);
				ns.exec("run-grow.js", "home", 1, target, startGrow);
				batches++;

				return 80 + maxTime;
			};

			const duration = runBatch(0);
			runBatch(80);
			ns.print(`  Batches: ${batches} | RAM: ${batches * 6.95} GB`);

			await ns.sleep(80 + duration);
		},
	},
	{
		active: true,
		info: "Max WWHG batches (20ms delay)",
		threads: 1,
		runner: async (ns) => {
			const timeWeaken = getTime(ns.getWeakenTime(target));
			const timeGrow = getTime(ns.getGrowTime(target));
			const timeHack = getTime(ns.getHackTime(target));
			const maxTime = Math.max(timeWeaken, timeGrow, timeHack);
			let batches = 0;

			const runBatch = (delay) => {
				let startHack = maxTime - timeHack;
				let startWeak1 = 20 + maxTime - timeWeaken;
				let startGrow = 40 + maxTime - timeGrow;
				let startWeak2 = 60 + maxTime - timeWeaken;
				const minStart = Math.min(
					startHack,
					startWeak1,
					startGrow,
					startWeak2
				);
				startHack = delay + startHack - minStart;
				startWeak1 = delay + startWeak1 - minStart;
				startGrow = delay + startGrow - minStart;
				startWeak2 = delay + startWeak2 - minStart;

				ns.exec("run-weaken.js", "home", 1, target, startWeak1);
				ns.exec("run-weaken.js", "home", 1, target, startWeak2);
				ns.exec("run-hack.js", "home", 1, target, startHack);
				ns.exec("run-grow.js", "home", 1, target, startGrow);
				batches++;

				return 80 + maxTime;
			};

			let delay = 0;
			let duration = 0;
			do {
				duration = runBatch(delay);
				delay += 20;
			} while (delay < duration);
			ns.print(
				`  Batches: ${batches} | RAM: ${(batches * 6.95).toFixed(2)} GB`
			);

			await ns.sleep(20 + delay + duration);
		},
	},
	{
		active: true,
		info: "Max WWHG batches (80ms delay)",
		threads: 1,
		runner: async (ns) => {
			const timeWeaken = getTime(ns.getWeakenTime(target));
			const timeGrow = getTime(ns.getGrowTime(target));
			const timeHack = getTime(ns.getHackTime(target));
			const maxTime = Math.max(timeWeaken, timeGrow, timeHack);
			let batches = 0;

			const runBatch = (delay) => {
				let startHack = maxTime - timeHack;
				let startWeak1 = 20 + maxTime - timeWeaken;
				let startGrow = 40 + maxTime - timeGrow;
				let startWeak2 = 60 + maxTime - timeWeaken;
				const minStart = Math.min(
					startHack,
					startWeak1,
					startGrow,
					startWeak2
				);
				startHack = delay + startHack - minStart;
				startWeak1 = delay + startWeak1 - minStart;
				startGrow = delay + startGrow - minStart;
				startWeak2 = delay + startWeak2 - minStart;

				ns.exec("run-weaken.js", "home", 1, target, startWeak1);
				ns.exec("run-weaken.js", "home", 1, target, startWeak2);
				ns.exec("run-hack.js", "home", 1, target, startHack);
				ns.exec("run-grow.js", "home", 1, target, startGrow);
				batches++;

				return 80 + maxTime;
			};

			let delay = 0;
			let duration = 0;
			do {
				duration = runBatch(delay);
				delay += 80;
			} while (delay < duration);
			ns.print(
				`  Batches: ${batches} | RAM: ${(batches * 6.95).toFixed(2)} GB`
			);

			await ns.sleep(20 + delay + duration);
		},
	},
];

/** @param {NS} ns **/
export async function main(ns) {
	ns.tprint("See details: tail test.js");

	ns.clearLog();
	ns.disableLog("ALL");

	ns.print("Starting tests in a moment, when the target server is ready...");
	await prepare(ns);

	for (const key in tests) {
		const test = tests[key];
		if (!test.active) {
			continue;
		}

		const port = ns.getPortHandle(1);

		ns.print(`* Start test ${key} - target ${target}\n  ${test.info}...`);
		const start = Date.now();

		// Run the test algorithm.
		port.clear();
		await test.runner(ns);
		let profit = 0;
		while (!port.empty()) {
			profit += parseFloat(port.read());
		}

		// Dump the target server status after the test.
		dump(ns);

		// Restore target server to max values.
		await prepare(ns);

		const duration = (getTime(Date.now() - start) / 1000).toFixed(1);

		const lines = [];
		lines.push(`> Profit: ${formatMoney(ns, profit)}`);
		lines.push(`Duration: ${duration} sec`);
		lines.push(
			`$/thread/sec: ${parseInt(profit / duration / test.threads)}`
		);

		ns.print(`${lines.join(" | ")}\n`);
		await ns.sleep(500);
	}

	ns.print(`--- all done ---`);
}

async function prepare(ns) {
	let preparing = true;

	while (preparing) {
		const server = ns.getServer(target);
		const minSecurity = server.minDifficulty;
		const curSecurity = server.hackDifficulty;
		const maxMoney = server.moneyMax;
		const curMoney = server.moneyAvailable;
		const timeWeak = ns.getWeakenTime(target);
		const timeGrow = ns.getGrowTime(target);
		const timeDiff = 50;

		if (curSecurity > minSecurity) {
			ns.exec("run-grow.js", "home", 20, target);
			ns.exec("run-weaken.js", "home", 80, target, timeDiff + 100);
		} else if (curMoney < maxMoney) {
			ns.exec("run-grow.js", "home", 80, target);
			ns.exec("run-weaken.js", "home", 20, target, timeDiff + 100);
		} else {
			dumpSpace(ns);
			return;
		}

		const sleep = Math.ceil(Math.max(timeGrow, timeWeak)) + timeDiff;
		await ns.sleep(sleep + 150);
	}
}

function dumpSpace(ns) {
	ns.print("");
}

function dump(ns, ...args) {
	const time = new Date().toISOString().substring(11, 19);
	const server = ns.getServer(target);
	const details = [];

	details.push(`  > ${time}`);
	details.push(formatMoney(ns, server.moneyAvailable));
	details.push(formatMoney(ns, server.moneyMax - server.moneyAvailable));
	details.push(server.hackDifficulty);
	details.push(...args);

	ns.print(details.join(" | "));
}

function getTime(value) {
	return Math.ceil(value / 25) * 25;
}
