import * as Server from "lib/server.js";

/** @param {NS} ns **/
export async function main(ns) {
	ns.disableLog("ALL");
	ns.enableLog("print");

	const options = ns.flags([
		["kill", false],
		["hack", false],
		["grow", false],
		["weaken", false],
		["waitTime", 10],
		["help", false],
	]);

	if (options["help"]) {
		ns.tail();
		ns.print(`Auto-script, options:
	  * --kill: Force kill every other process on every servers
	  * --hack some-script.js: Replace hack script with some-script.js one
	  * --grow some-script.js: Replace grow script with some-script.js one
	  * --weaken some-script.js: Replace weaken script with some-script.js one
	  * --waitTime 10: Wait time between two servers in ms, must be higher than 1
	  * --help: show this message
	  `);
		return;
	}

	// Creating scripts
	const hack = options["hack"] || "/temp/hack.js",
		grow = options["grow"] || "/temp/grow.js",
		weaken = options["weaken"] || "/temp/weaken.js";

	if (!options["hack"]) {
		await ns.write(
			hack,
			`
		/** @param {NS} ns **/
		export async function main(ns) {
			await ns.hack(ns.args[0]);
			await ns.hack(ns.args[0]);
			await ns.grow(ns.args[0]);
			await ns.weaken(ns.args[0]);
		}
	  `,
			"w"
		);
	}
	if (!options["grow"]) {
		await ns.write(
			grow,
			`
		/** @param {NS} ns **/
		export async function main(ns) {
			await ns.grow(ns.args[0]);
		}
	  `,
			"w"
		);
	}
	if (!options["weaken"]) {
		await ns.write(
			weaken,
			`
		/** @param {NS} ns **/
		export async function main(ns) {
			await ns.weaken(ns.args[0]);
		}
	  `,
			"w"
		);
	}

	// Divs variables declarations
	let attackTargets = [],
		attackers = [],
		hackables = [],
		growables = [],
		weakenables = [],
		proxyTarget,
		hackType;

	await Server.initialize(ns);

	// Find potential attack targets.
	const targetServers = Server.getLowSecurity(ns, 25);
	for (const key in targetServers) {
		attackTargets.push(targetServers[key].hostname);
	}

	// Prepare attacking servers.
	await Server.allAttackers(async (server) => {
		if ("skill" !== server.focus) {
			return;
		}
		await ns.scp([hack, grow, weaken], "home", server.hostname);
		if (options["kill"]) {
			ns.killall(server.hostname);
		}
		attackers.push(server.hostname);
	});

	if (attackTargets.length > 0) {
		while (true) {
			hackables = [];
			growables = [];
			weakenables = [];

			for (const target of attackTargets) {
				// Priority for targets: weaken, then grow, then hack
				if (
					ns.getServerSecurityLevel(target) >
					ns.getServerMinSecurityLevel(target) + 5
				) {
					hackType = weaken;
					weakenables.push(target);
				} else if (
					ns.getServerMoneyAvailable(target) <
					ns.getServerMaxMoney(target) * 0.8
				) {
					hackType = grow;
					growables.push(target);
				} else {
					hackType = hack;
					hackables.push(target);
				}
			}

			for (let i = 0; i < attackers.length; i++) {
				const proxy = attackers[i];

				// Priority for proxies: weaken -> grow -> hack
				if (weakenables.length > 0) {
					proxyTarget =
						weakenables[
							Math.floor(Math.random() * weakenables.length)
						];
					hackType = weaken;
				} else if (growables.length > 0) {
					proxyTarget =
						growables[Math.floor(Math.random() * growables.length)];
					hackType = grow;
				} else if (hackables.length > 0) {
					proxyTarget =
						hackables[Math.floor(Math.random() * hackables.length)];
					hackType = hack;
				}

				if (
					ns.getServerMaxRam(proxy) - ns.getServerUsedRam(proxy) >
					ns.getScriptRam(hackType)
				) {
					ns.exec(
						hackType,
						proxy,
						Math.floor(
							(ns.getServerMaxRam(proxy) -
								ns.getServerUsedRam(proxy)) /
								ns.getScriptRam(hackType)
						),
						proxyTarget
					);
					ns.print(
						"|||||||||| proxy --> " +
							proxy +
							" --> " +
							hackType +
							" --> " +
							proxyTarget +
							" ||||||||||"
					);
				}
			}

			// Await n ms between each servers to avoid issue with the infinite loop
			await ns.sleep(options["waitTime"]);
		}
	} else {
		ns.tprint("Error: No attackable servers found.");
	}
}
