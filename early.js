/**
 * Early game hacking script to get money and skill.
 *
 * The script is rather primitive to minimize RAM usage.
 * It's used while the home server has less than 64GB RAM.
 *
 * @param {NS} ns
 */
export async function main(ns) {
	ns.disableLog("ALL");
	ns.clearLog();

	while (true) {
		let target = "";
		let maxMoney = 1;
		const servers = findServers(ns);

		for (const host in servers) {
			if (servers[host].money > maxMoney) {
				target = host;
				maxMoney = servers[host].money;
			}
		}

		if (target) {
			const highSec = servers[target].sec + 1;
			const lowMoney = servers[target].money * 0.92;
			const curSec = ns.getServerSecurityLevel(target);
			const curMoney = ns.getServerMoneyAvailable(target);

			if (curSec > highSec) {
				runTask(ns, servers, target, "weaken");
			} else if (curMoney < lowMoney) {
				runTask(ns, servers, target, "grow");
			} else {
				runTask(ns, servers, target, "hack");
			}
		}

		await ns.sleep(5000);
	}
}

function runTask(ns, attackers, target, action) {
	for (const host in attackers) {
		const ramMax = ns.getServerMaxRam(host);
		const ramUsed = ns.getServerUsedRam(host);
		const ramFree = ramMax - ramUsed;
		let script = "";
		let threads = 0;

		if ("weaken" === action) {
			threads = Math.floor(ramFree / 1.75);
			script = "run-weaken.js";
		} else if ("grow" === action) {
			threads = Math.floor(ramFree / 1.75);
			script = "run-grow.js";
		} else {
			threads = Math.floor(ramFree / 1.7);
			script = "run-hack.js";
		}

		if (threads > 0 && script) {
			ns.print(
				`${host} attacks ${target} with ${threads} ${action}s ...`
			);
			ns.exec(script, host, threads, target);
		}
	}
}

/**
 * Returns a basic list with all available servers.
 * If a locked server is found, this function tries to nuke it.
 *
 * @param ns
 */
function findServers(ns) {
	const list = {};
	const checked = [];

	function addServer(host) {
		if (nukeServer(ns, host)) {
			list[host] = {
				sec: ns.getServerMinSecurityLevel(host),
				money: ns.getServerMaxMoney(host),
			};
		}

		findChildren(host);
	}

	function findChildren(parent) {
		const children = ns.scan();
		for (let i = 0; i < children.length; i++) {
			const host = children[i];
			if (-1 !== checked.indexOf(host)) {
				continue;
			}
			checked.push(host);
			addServer(host);
		}
	}

	addServer("home");
	return list;
}

/**
 * Opens all possible ports on the target server and tries to nuke it.
 *
 * @param {NS} ns
 * @param {string} host
 * @return {bool} True, if the server is hacked (root access available).
 */
function nukeServer(ns, host) {
	function can(action) {
		return ns.fileExists(action + ".exe", "home");
	}

	if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel()) {
		return false;
	}

	let openPorts = 0;

	if (can("brutessh")) {
		ns.brutessh(host);
		openPorts++;
	}
	if (can("ftpcrack")) {
		ns.ftpcrack(host);
		openPorts++;
	}
	if (can("relaysmtp")) {
		ns.relaysmtp(host);
		openPorts++;
	}
	if (can("httpworm")) {
		ns.httpworm(host);
		openPorts++;
	}
	if (can("sqlinject")) {
		ns.sqlinject(host);
		openPorts++;
	}

	if (openPorts >= ns.getServerNumPortsRequired(host)) {
		ns.nuke(host);
	}

	return ns.hasRootAccess(host);
}
