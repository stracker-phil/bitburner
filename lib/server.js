import * as Common from "lib/common.js";
import * as Player from "lib/player.js";

/**
 * List of all Server instances.
 */
let servers = {};

/**
 * List of services that need to constantly run
 * on the home server.
 */
const serviceFiles = ["chk.js", "grow.js"];

/**
 * List of all scripts that are required by our system.
 */
const allFiles = [
	"chk.js",
	"grow.js",
	"run-hack.js",
	"run-grow.js",
	"run-weaken.js",
];

/**
 * Add a new server to the server list.
 * When the server already exists, nothing happens.
 */
function register(ns, host, route) {
	if (servers[host]) {
		return servers[host];
	}

	return new Server(ns, host, route);
}

/**
 * Shares the Netscript instance with this module and
 * initializes the server list.
 *
 * @param {NS} ns
 */
export async function initialize(ns) {
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
	const res = ns.purchaseServer(host, ram);

	if (res) {
		const inst = register(ns, res, ["home"]);
		await inst.setup(ns);
	}

	return !!res;
}

/**
 * Delete the specified server
 */
export async function upgrade(ns, host, ram) {
	ns.killall(host);

	if (ns.deleteServer(host)) {
		return await purchase(host, ram);
	} else {
		return false;
	}
}

/**
 * Return the most profitable server for hacking.
 */
export function byProfit(ns) {
	const player = Player.get(ns);
	let selected = null;

	for (const key in servers) {
		const server = servers[key];

		if (server.requiredHackingSkill > player.hacking) {
			continue;
		}

		if (!selected || selected.profitRating < server.profitRating) {
			selected = server;
		}
	}

	return selected;
}

class Server {
	/**
	 * Initialize the new Server instance.
	 */
	constructor(ns, host, route) {
		servers[host] = this;

		this.hostname = host;
		this.route = route;
		this.jobs = [];
		this.pctWeaken = 0;
		this.pctGrow = 0;

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
		this.organizationName; // string = info.organizationName // string;
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
		const ram = ns.getServerRam(this.hostname);

		// RAM (GB) available on this server
		this.ramMax = ram[0];
		// RAM (GB) used. i.e. unavailable RAM
		this.ramUsed = ram[1];
		// RAM (GB) free. i.e. available RAM
		this.ramFree = this.ramMax - this.ramUsed;

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

		this.refreshRating();
	}

	/**
	 * Re-calculates the profit rating of this server, which
	 * is used to determine the most suitable server for attacking.
	 */
	refreshRating() {
		this.profitRating = 0;

		if (
			this.purchasedByPlayer ||
			!this.hasAdminRights ||
			!this.hackDifficulty ||
			!this.minDifficulty
		) {
			return;
		}

		const rateMoney = this.moneyMax + this.moneyAvailable / 10;
		const avgTime =
			(this.timeGrow + this.timeHack + 2 * this.timeWeaken) / 4;
		const minTime = (avgTime / this.hackDifficulty) * this.minDifficulty;

		this.profitRating = rateMoney / minTime;
	}

	/**
	 * Scan for connected servers and store a list of
	 * available server names in the "connections" property.
	 */
	refreshConnections(ns) {
		// An array containing the hostnames of all servers that are one node way from this server.
		this.connections = ns.scan(this.hostname);

		// Create instances of all connected servers.
		this.connections.forEach((host) => {
			const route = [...this.route, this.hostname];
			register(ns, host, route);
		});
	}

	/**
	 * Set up everything so this server can be used for
	 * attacks: Establish root access, copy files, start
	 * relevant services.
	 */
	async setup(ns) {
		const config = Common.getConfig(ns);

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
				const res = await ns.scp(script, "home", this.hostname);

				if (res) {
					Common.say(ns, "Installed", this.hostname, script);
				}
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
				const res = ns.rm(script, this.hostname);

				if (res) {
					Common.say(ns, "Uninstalled", this.hostname, script);
				}
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
	 */
	async attack(ns, type, threads, targetHost, delay) {
		const script = `run-${type}.js`;

		const res = await ns.exec(
			script,
			this.hostname,
			threads,
			targetHost,
			threads,
			delay
		);

		if (!res) {
			console.error(
				`Could not start an attack from ${this.hostname} against ${targetHost} |`,
				type,
				threads
			);
		}

		return res;
	}
}
