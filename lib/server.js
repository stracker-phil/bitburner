import * as Common from "lib/common.js";
import * as Player from "lib/player.js";

/**
 * List of all Server instances.
 */
let servers = {};

/**
 * Game configuration.
 */
let config = {};

/**
 * List of services that need to constantly run
 * on the home server.
 */
const serviceFiles = ["attk.js", "grow.js", "sgrw.js"];

/**
 * List of all scripts that are required by our system.
 */
const allFiles = ["run-hack.js", "run-grow.js", "run-weaken.js"];

/**
 * Add a new server to the server list.
 * When the server already exists, nothing happens.
 */
function register(ns, host, route) {
	if (servers[host]) {
		return false;
	}

	new Server(ns, host, route);
	return true;
}

/**
 * Shares the Netscript instance with this module and
 * initializes the server list.
 *
 * @param {NS} ns
 */
export async function initialize(ns) {
	config = Common.getConfig(ns);
	servers = {};
	register(ns, "home", []);
	await all((server) => server.setup(ns));
}

/**
 * Runs a callback against every known server.
 */
export async function all(callback) {
	for (const key in servers) {
		await callback(servers[key]);
	}
}

/**
 * Runs a callback against every available attacker server.
 * Attackers are servers that we have root access to and that
 * are equipped with a minimum of 2GB RAM.
 */
export async function allAttackers(callback) {
	for (const key in servers) {
		if (servers[key].isAttacker) {
			await callback(servers[key]);
		}
	}
}

/**
 * Return a server instance by host name.
 */
export function get(host, stat) {
	const server = servers[host];

	if (server && stat) {
		return server[stat];
	} else {
		return server;
	}
}

/**
 * Purchase a new server with the given amount of RAM.
 */
export async function purchase(ns, host, ram) {
	const newHost = ns.purchaseServer(host, ram);

	if (newHost) {
		register(ns, newHost, ["home"]);
		const inst = get(newHost);
		await inst.setup(ns);
	}

	return !!newHost;
}

/**
 * Delete the specified server
 */
export async function upgrade(ns, host, ram) {
	ns.killall(host);

	if (ns.deleteServer(host)) {
		return await purchase(ns, host, ram);
	} else {
		return false;
	}
}

/**
 * Return the most profitable server for hacking.
 */
export function getHighProfit(ns, number = 1) {
	const list = filterList(ns, "profitValue", "desc");

	return list.slice(0, number).map((host) => get(host));
}

/**
 * Return the most insecure servers for hacking.
 */
export function getLowSecurity(ns, number = 1) {
	const list = filterList(
		ns,
		(server) => {
			if (!server.moneyMax) {
				return null;
			}
			return server.minDifficulty;
		},
		"asc"
	);

	return list.slice(0, number).map((host) => get(host));
}

/**
 * Returns a sorted list of host names.
 *
 * @param {NS} ns
 * @param {string|callback} sortBy
 * @param {string} dir - "asc" or "desc"
 * @returns
 */
function filterList(ns, sortBy, dir) {
	const player = Player.get(ns);
	const hostInfo = [];

	for (const key in servers) {
		const server = servers[key];
		let criteria;

		if (
			!server.hasAdminRights ||
			server.purchasedByPlayer ||
			server.requiredHackingSkill > player.hacking
		) {
			continue;
		}

		if ("string" === typeof sortBy) {
			criteria = server[sortBy];
		} else if ("function" === typeof sortBy) {
			criteria = sortBy(server);
		}

		if ("undefined" === typeof criteria || null === criteria) {
			continue;
		}

		hostInfo.push({
			hostname: server.hostname,
			criteria,
		});
	}

	if ("desc" === dir) {
		hostInfo.sort((a, b) => (a.criteria < b.criteria ? 1 : -1));
	} else {
		hostInfo.sort((a, b) => (a.criteria > b.criteria ? 1 : -1));
	}

	return hostInfo.map((item) => item.hostname);
}

class Server {
	/**
	 * Initialize the new Server instance.
	 */
	constructor(ns, host, route) {
		servers[host] = this;

		this.hostname = host;
		this.route = [...route, host];
		this.connections = [];
		this.children = [];
		this.attackCount = 0;

		// Collect details about the server.
		this.refresh(ns);
		this.refreshConnections(ns);
	}

	/**
	 * Refresh all server details.
	 */
	refresh(ns) {
		const info = ns.getServer(this.hostname);

		// Initial server security level (i.e. security level when the server was created)
		this.baseDifficulty = info.baseDifficulty;
		// How many CPU cores this server has. Maximum of 8. Affects magnitude of grow and weaken.
		this.cpuCores = info.cpuCores;
		// IP Address. Must be unique
		this.ip = info.ip;
		// Minimum server security level that this server can be weakened to
		this.minDifficulty = info.minDifficulty;
		// Maximum amount of money that this server can hold
		this.moneyMax = info.moneyMax;
		// Number of open ports required in order to gain admin/root access
		this.numOpenPortsRequired = info.numOpenPortsRequired;
		// Name of company/faction/etc. that this server belongs to. Optional, not applicable to all Servers
		this.organizationName = info.organizationName;
		// Flag indicating whether this is a purchased server
		this.purchasedByPlayer = info.purchasedByPlayer;
		// Hacking level required to hack this server
		this.requiredHackingSkill = info.requiredHackingSkill;
		// Parameter that affects how effectively this server's money can be increased using the grow() Netscript function
		this.serverGrowth = info.serverGrowth;

		this.refreshRam(ns);
		this.refreshAccess(ns);
		this.refreshStats(ns);
	}

	/**
	 * Refresh details about the servers RAM usage.
	 */
	refreshRam(ns) {
		config = Common.getConfig(ns);
		const ram = ns.getServerRam(this.hostname);

		// RAM (GB) available on this server
		this.ramMax = ram[0];
		this.ramTotalMax = ram[0];

		// On home server, reserve some RAM for the master script and tools.
		if ("home" === this.hostname) {
			const reserved = Math.max(
				20,
				parseFloat(config.lockedRam) + parseFloat(config.skillRam)
			);
			this.ramMax = Math.max(0, this.ramMax - reserved);
		}

		// RAM (GB) used. i.e. unavailable RAM
		this.ramUsed = ram[1];
		// RAM (GB) free. i.e. available RAM
		this.ramFree = Math.max(0, this.ramMax - this.ramUsed);

		this.ramUsedFormatted = Common.formatRam(this.ramUsed);
		this.ramFreeFormatted = Common.formatRam(this.ramFree);
		this.ramMaxFormatted = Common.formatRam(this.ramMax);
		this.ramTotalMaxFormatted = Common.formatRam(this.ramTotalMax);

		if (this.ramMax < 2) {
			this.isAttacker = false;
		}
	}

	/**
	 * Refreshes the list of open ports/root access flag.
	 */
	refreshAccess(ns) {
		const info = ns.getServer(this.hostname);

		// Flag indicating whether player is currently connected to this server
		this.isConnectedTo = info.isConnectedTo;
		// Flag indicating whether this server has a backdoor installed by a player
		this.backdoorInstalled = info.backdoorInstalled;
		// Flag indicating whether the FTP port is open
		this.ftpPortOpen = info.ftpPortOpen;
		// Flag indicating whether player has admin/root access to this server
		this.hasAdminRights = info.hasAdminRights;
		// Flag indicating whether HTTP Port is open
		this.httpPortOpen = info.httpPortOpen;
		// How many ports are currently opened on the server
		this.openPortCount = info.openPortCount;
		// Flag indicating whether SMTP Port is open
		this.smtpPortOpen = info.smtpPortOpen;
		// Flag indicating whether SQL Port is open
		this.sqlPortOpen = info.sqlPortOpen;
		// Flag indicating whether the SSH Port is open
		this.sshPortOpen = info.sshPortOpen;

		// Check, if we can use this server to attack other servers.
		if (!isNaN(this.ramMax) && this.ramMax > 2) {
			this.isAttacker = this.purchasedByPlayer || this.hasAdminRights;
		}
	}

	/**
	 * Refresh details about the servers attack stats.
	 *
	 * The times change after each hack/grow/weaken call
	 * and need to be refreshed constantly.
	 */
	refreshStats(ns) {
		this.securityRatingVal = 0;
		this.securityRating = "-    ";

		// Server Security Level
		this.hackDifficulty = ns.getServerSecurityLevel(this.hostname);

		// How much money currently resides on the server and can be hacked
		this.moneyAvailable = ns.getServerMoneyAvailable(this.hostname);

		const timeHack = ns.getHackTime(this.hostname);
		const timeGrow = ns.getGrowTime(this.hostname);
		const timeWeaken = ns.getWeakenTime(this.hostname);

		this.timeHack = timeHack;
		this.timeGrow = timeGrow;
		this.timeWeaken = timeWeaken;

		// Part of money that's stolen in a single hack thread. E.g. 0.01 is 1% of moneyAvailable
		this.hackAnalyze = ns.hackAnalyze(this.hostname);

		this.delayGrow = Math.max(0, timeWeaken - timeGrow - 15);
		this.delayHack = Math.max(0, timeGrow + this.delayGrow - timeHack - 15);

		let ratingVal = (this.hackDifficulty - this.minDifficulty) / 10;
		ratingVal = Math.min(5, Math.max(0, Math.floor(ratingVal)));

		this.securityRatingVal = ratingVal;
		this.securityRating = "!".repeat(ratingVal) + " ".repeat(5 - ratingVal);

		this.refreshRating();
	}

	/**
	 * Re-calculates the profit rating of this server, which
	 * is used to determine the most suitable server for attacking.
	 */
	refreshRating() {
		this.profitValue = 0;
		this.profitRatingVal = 0;
		this.profitRating = "-    ";

		if (
			this.purchasedByPlayer ||
			!this.hasAdminRights ||
			!this.hackDifficulty ||
			!this.minDifficulty
		) {
			return;
		}

		this.profitValue = Math.ceil(this.moneyMax / this.minDifficulty);

		// Determine Rating relative to all known servers.
		const maxValue = Math.max(
			1,
			...Object.keys(servers).map((host) => servers[host].profitValue)
		);
		let ratingVal = Math.ceil(5 * (this.profitValue / maxValue));
		ratingVal = Math.min(5, Math.max(0, ratingVal));

		this.profitRatingVal = ratingVal;
		this.profitRating = "$".repeat(ratingVal) + " ".repeat(5 - ratingVal);
	}

	/**
	 * Scan for connected servers and store a list of
	 * available server names in the "connections" property.
	 */
	refreshConnections(ns) {
		// An array containing the hostnames of all servers that are one node way from this server.
		this.connections = ns.scan(this.hostname);
		this.children = [];

		// Create instances of all connected servers.
		this.connections.forEach((host) => {
			register(ns, host, [...this.route]);

			if (-1 === this.route.indexOf(host)) {
				this.children.push(host);
			}
		});
	}

	/**
	 * Set up everything so this server can be used for
	 * attacks: Establish root access, copy files, start
	 * relevant services.
	 */
	async setup(ns) {
		config = Common.getConfig(ns);

		// Get root access.
		this.access(ns);

		// Install our scripts on the server.
		await this.installTools(ns);

		// Start or stop services on home.
		if ("home" === this.hostname) {
			if (config.started) {
				this.startServices(ns);
			} else {
				this.stopServices(ns);
			}
		}

		// Refresh all server details.
		this.refresh(ns);
		this.refreshConnections(ns);
	}

	/**
	 * Opens all ports on the server and establishes root
	 * access. If possible, also installs the backdoor.
	 */
	access(ns) {
		if (this.purchasedByPlayer) {
			return;
		}

		let changed = false;
		const player = Player.get(ns);

		player.portOpeners((tool) => {
			if (!this[tool.port]) {
				ns[tool.cmd](this.hostname);
				changed = true;
			}
		});

		if (changed) {
			this.refreshAccess(ns);
		}

		if (
			this.numOpenPortsRequired > this.openPortCount ||
			this.requiredHackingSkill > player.hacking
		) {
			return;
		}

		if (!this.hasAdminRights) {
			ns.nuke(this.hostname);

			this.refreshAccess(ns);
		}

		if (this.hasAdminRights && !this.backdoorInstalled) {
			// TODO: Requires NS-4
			// ns.installBackdoor(this.hostname);
		}
	}

	/**
	 * Installs hacking tools on this server.
	 */
	async installTools(ns) {
		if ("home" === this.hostname || !this.hasAdminRights) {
			return false;
		}

		// Copy/Replace tools to remote server.
		for (let i = 0; i < allFiles.length; i++) {
			const script = allFiles[i];

			if (!ns.fileExists(script, this.hostname)) {
				await ns.scp(script, "home", this.hostname);
			}
		}
	}

	/**
	 * Uninstalls hacking tools from this server.
	 */
	async uninstallTools(ns) {
		if ("home" === this.hostname || !this.hasAdminRights) {
			return false;
		}

		// Delete files from server.
		for (let i = 0; i < allFiles.length; i++) {
			const script = allFiles[i];

			if (ns.fileExists(script, this.hostname)) {
				ns.scriptKill(script, this.hostname);
				ns.rm(script, this.hostname);
			}
		}
	}

	/**
	 * Starts all stopped services on this machine.
	 */
	startServices(ns) {
		for (let i = 0; i < serviceFiles.length; i++) {
			const script = serviceFiles[i];

			if (
				ns.fileExists(script, this.hostname) &&
				!ns.isRunning(script, this.hostname)
			) {
				Common.say(ns, "Start service", script);
				ns.exec(script, this.hostname);
			}
		}
	}

	/**
	 * Stops all running services on this machine.
	 */
	stopServices(ns) {
		for (let i = 0; i < serviceFiles.length; i++) {
			const script = serviceFiles[i];

			if (ns.isRunning(script, this.hostname)) {
				Common.say(ns, "Stop service", script);
				ns.kill(script, this.hostname);
			}
		}
	}

	/**
	 * Calculate maximum number of threads a given script
	 * can take up on the current server.
	 */
	calcThreads(ns, script, maxPossible = false) {
		if (!ns.fileExists(script, this.hostname)) {
			return 0;
		}

		const ramNeeded = ns.getScriptRam(script, this.hostname);
		const base = maxPossible ? this.ramMax : this.ramFree;

		return Math.max(0, Math.floor(base / ramNeeded));
	}

	/**
	 * Runs an attack script.
	 *
	 * @param {NS} ns
	 * @param {string} type
	 * @param {int} threads
	 * @param {string} targetHost
	 * @param {int} delay
	 * @param {string} pid - String to identify the process
	 * @return {bool} True on success.
	 */
	attack(ns, type, threads, targetHost, delay, pid) {
		threads = Math.max(1, Math.ceil(threads) || 1);
		delay = Math.max(1, Math.ceil(delay) || 1);

		const script = `run-${type}.js`;

		if (!pid) {
			pid = `${type}-${this.attackCount}`;
		}

		this.attackCount++;
		if (this.attackCount > 999999) {
			this.attackCount = 0;
		}

		if (!ns.fileExists(script, this.hostname)) {
			console.error(
				`Could not start an attack from ${this.hostname} against ${targetHost}`,
				`| The attack-script "${script}" does not exist`
			);

			return false;
		}

		const ramRequired = ns.getScriptRam(script, this.hostname) * threads;
		if (this.ramFree < ramRequired) {
			console.error(
				`Could not start an attack from ${this.hostname} against ${targetHost}`,
				`| Not sufficient RAM to run ${threads} threads of "${script}"`,
				`| Available RAM ${this.ramFree}`
			);

			return false;
		}

		const res = ns.exec(
			script,
			this.hostname,
			threads,
			targetHost,
			delay,
			pid
		);

		if (!res) {
			console.error(
				`Could not start an attack from ${this.hostname} against ${targetHost}`,
				`| Executing the script ${script} failed`,
				`| Threads: ${threads}`,
				`| Delay: ${delay}`
			);

			return false;
		}

		return true;
	}

	/**
	 * Returns an analytics report of the server.
	 *
	 * @param {NS} ns
	 * @return {string} Multiline string with server details.
	 */
	analyze(ns) {
		const details = {};
		const route = [...this.route];

		const percent = (max, current) => {
			if (!max) {
				return "--%";
			}
			return Math.min((current / max) * 100, 100).toFixed(2) + "%";
		};

		route.shift();

		details["Path"] = "...";
		details["Profit Rating"] =
			this.profitRating + ` (${this.profitValue.toLocaleString()})`;

		details["RAM"] =
			`${this.ramUsed.toFixed(2)} GB / ` +
			`${this.ramTotalMaxFormatted}` +
			`(${percent(this.ramTotalMax, this.ramUsed)})`;

		details["Money"] =
			`${Common.formatMoney(ns, this.moneyAvailable)} / ` +
			`${Common.formatMoney(ns, this.moneyMax)} ` +
			`(${percent(this.moneyMax, this.moneyAvailable)})`;

		details["Security"] =
			this.hackDifficulty.toFixed(2) +
			" / " +
			this.minDifficulty.toFixed(2);
		details["Hack Time"] = ns.tFormat(this.timeHack);
		details["Grow Time"] = ns.tFormat(this.timeGrow);
		details["Weaken Time"] = ns.tFormat(this.timeWeaken);
		details["Organization"] = this.organizationName;
		details["Required Skill"] = this.requiredHackingSkill;
		details["Open Ports"] =
			this.openPortCount + " / " + this.numOpenPortsRequired;
		details["Root Access"] = this.hasAdminRights ? "yes" : "no";
		details["Has Backdoor"] = this.backdoorInstalled ? "yes" : "no";

		const keyLen = Math.max(...Object.keys(details).map((el) => el.length));
		const infos = [];
		details["Path"] = this.formatRoute(4 + keyLen);

		infos.push(`Server: ${this.hostname}`);

		for (const key in details) {
			infos.push(
				"  " +
					key +
					" ".repeat(keyLen - key.length) +
					" : " +
					details[key]
			);
		}

		infos.push(`  > ${this.cmdConnect()}`);

		return infos.join("\n");
	}

	/**
	 * Returns the command to connect to this server.
	 */
	cmdConnect() {
		const route = [...this.route];
		route.shift();

		return `home; connect ${route.join("; connect ")}`;
	}

	/**
	 * Returns a formatted string that describes the route from home
	 * to this server.
	 *
	 * @returns
	 */
	formatRoute(indent) {
		const res = [];
		if (!indent || isNaN(indent) || indent < 0) {
			indent = 0;
		}

		for (let i = 0; i < this.route.length; i++) {
			const space = " ".repeat(indent + i * 2);
			const prefix = i > 0 ? space + "└ " : "";
			res.push(`${prefix}${this.route[i]}`);
		}

		return res.join("\n");
	}
}
