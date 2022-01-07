import * as Common from 'common.js';

/**
 * The master script manages all worker nodes.
 * 
 * It can use a lot of RAM, as it does the main
 * data processing and orchestrates the entire
 * network of workers.
 * 
 * This script is only used on the "home" server!
 * 
 * Installation:
 * > alias master="run master.js"
 * 
 * Params:
 *   --help            Show params
 *   --target <server> Attack a specific server.
 * SAMPLES:
 * 
 * Hack a specific server:
 * > master --target n00dles
 * 
 * Control worker nodes:
 * > master --start
 * > master --stop
 * 
 * @param {NS} ns
 */
export async function main(ns) {
	/**
	 * The main netscript API interface must be
	 * available in all functions.
	 * 
	 * @param {NS} ns
	 */
	window.ns = ns;

	if (!ns.args.length) {
		showHelp();
		return true;
	}

	const args = ns.flags([
		['help', false],
		['install', false],
		['start', false],
		['stop', false],
		['sync', false],
		['info', false],
		['quiet', false],
		['target', ''],
		['bound-sec', ''],
		['bound-money', ''],
	]);

	if (args.help) {
		showHelp();
		return true;
	}

	// Initialize the environment.

	loadConfigFile();
	initializePrograms();
	initializeStats();
	refreshKnownServers();

	// Process commands.

	if (args.install) {
		Common.say(ns, 'Install tools on remote servers');
		workerStatus = 'start';
		serviceStatus = 'start';
		await doInstallTools(args.quiet);
	}
	if ('' !== args.target) {
		if (ns.serverExists(args.target)) {
			Common.say(ns, `Change target server to ${args.target}`);
			config.target = args.target;
			config.autoPick = false;
		} else {
			Common.say(ns, 'Auto pick target server');
			config.target = '';
			config.autoPick = true;
		}

		serviceStatus = 'start';
	}
	if ('' !== args['bound-sec']) {
		config.boundSec = parseFloat(args['bound-sec'])
		config.boundSec = Math.max(config.boundSec, 0.5);
		config.boundSec = Math.min(config.boundSec, 99);
		serviceStatus = 'start';
		Common.say(ns, `New security boundary: ${config.boundSec.toFixed(2)}`);
	}
	if ('' !== args['bound-money']) {
		config.boundMoney = parseFloat(args['bound-money'])
		config.boundMoney = Math.max(config.boundMoney, 0);
		config.boundMoney = Math.min(config.boundMoney, 1);
		serviceStatus = 'start';
		Common.say(ns, `New money boundary: ${config.boundMoney.toFixed(2)}`);
	}
	if (args.start) {
		Common.say(ns, 'Start worker scripts');
		workerStatus = 'start';
		serviceStatus = 'start';
		await doControlWorker(args.quiet);
	}
	if (args.stop) {
		Common.say(ns, 'Stop worker scripts');
		workerStatus = 'stop';
		serviceStatus = 'stop';
		await doControlWorker(args.quiet);
	}
	if (args.sync) {
		Common.say(ns, 'Restart sync and monitoring service');
		serviceStatus = 'start';
	}

	// Store config/server list in files.
	await Common.setConfig(ns, config);

	// Control the config sync process.
	const home = ns.getHostname();

	if (serviceStatus) {
		ns.kill('sync.js', home);
		ns.kill('chk.js', home);

		if ('start' === serviceStatus) {
			ns.exec('sync.js', home);
			ns.exec('chk.js', home);
		}
	}

	// Always restart the worker on our home server:
	ns.kill('work.js', home);
	const threads = calcThreads(home, 'work.js', 0);
	ns.exec('work.js', home, threads);

	if (args.info) {
		showConfig();
		return true;
	}

	return true;
}

/**
 * Whether to change the worker status.
 * Value can be "start" or "stop".
 */
let workerStatus = '';

/**
 * Whether to restart/stop the local management 
 * services. Value can be "start" or "stop".
 */
let serviceStatus = '';

/**
 * List of remote worker scripts that need to be
 * installed on each worker node.
 */
let remoteFiles = [
	'ctrl.js',
	'work.js'
];

/**
 * A globally available list of all known servers
 * in our entire network.
 */
let knownServers = {};

/**
 * A list of available port opener programs.
 */
let portOpeners = [];

/**
 * Details about the current player stats.
 */
let stats = {};

/**
 * Attack configuration object that is shared
 * with the distributed nodes and defines the
 * specific actions to take.
 */
let config = {};

/**
 * Display usage instructions.
 */
function showHelp() {
	const help = [
		'Usage:',
		'  master [--command [value]] [--command2 [value2]] ...',
		'',
		'Examples:',
		'  master --target n00dles',
		'  master --start',
		'  master --target n00dles --start',
		'',
		'Commands:',
		'  --start      Start all worker nodes.',
		'  --stop       Stop all worker nodes.',
		'  --target <server> Tell all worker nodes to target',
		'               a specific server.',
		'  --target auto  Let the script pick the most profitable',
		'               target server for you.',
		'  --bound-sec <num> Define the security level boundary',
		'               Default: 4',
		'  --bound-money <num> Define the money boundary',
		'               Default: 0.6',
		'  --sync       Instantly update the attack config on.',
		'               all worker nodes.',
		'  --install    Installs or updates scripts on all',
		'               accessible remote servers.',
		'  --info       Outputs the current attack config.',
	];

	ns.tprintf("\n%s\n", help.join("\n"));
}

/**
 * Output the current config contents 
 * inside the terminal.
 */
function showConfig() {
	const server = knownServers[config.target];
	let path = '(unknown)';

	if (server) {
		const route = [...server.route, server.hostname];
		path = route.join(' > ');
	}

	ns.tprintf(
		"\nConfig:\n%s\nPath: %s\n\n",
		JSON.stringify(config, null, 4),
		path
	);
}

/**
 * Prepares a list of all available (installed)
 * hacking tools that we'll use later to open ports
 * and establish root access to a remote server.
 */
function initializePrograms() {
	const allTools = [
		{
			port: 'sshPortOpen',
			file: 'BruteSSH.exe',
			cmd: 'brutessh'
		},
		{
			port: 'ftpPortOpen',
			file: 'FTPCrack.exe',
			cmd: 'ftpcrack'
		},
		{
			port: 'smtpPortOpen',
			file: 'relaySMTP.exe',
			cmd: 'relaysmtp'
		},
		{
			port: 'httpPortOpen',
			file: 'HTTPWorm.exe',
			cmd: 'httpworm'
		},
		{
			port: 'sqlPortOpen',
			file: 'SQLInject.exe',
			cmd: 'sqlinject'
		}
	];

	portOpeners = [];

	allTools.forEach(tool => {
		if (ns.fileExists(tool.file, 'home')) {
			portOpeners.push(tool);
		}
	});
}

/**
 * Collects various game statistics that are required
 * by other functions later.
 */
function initializeStats() {
	stats = Common.getPlayerStats(ns);
}

/**
 * Loads and initializes the attack coordination config.
 *  */
function loadConfigFile() {
	const data = Common.getConfig(ns);

	for (const key in data) {
		config[key] = data[key];
	}
}

/**
 * Refreshes the list of known remote servers.
 */
function refreshKnownServers() {
	knownServers = Common.findAllServers(ns);
}

/**
 * Task: Install the latest version of our hacking
 * software on all known servers.
 */
async function doInstallTools(quiet) {
	const keys = Object.keys(knownServers);

	for (let i = 0; i < keys.length; i++) {
		const server = knownServers[keys[i]];

		// Establish root access, open all ports.
		attackServer(server);

		// Continue, if insufficient permissions.
		if (!server.hasAdminRights && !server.purchasedByPlayer) {
			continue;
		}

		// Copy/Replace tools to remote server.
		for (let j = 0; j < remoteFiles.length; j++) {
			await ns.scp(remoteFiles[j], 'home', server.hostname);
		}

		if (!quiet) {
			Common.say(ns, `Tools installed on ${server.hostname}`);
		}
	}
}

/**
 * (Re)Starts or stops the worker script on all
 * remote servers.
 */
async function doControlWorker(quiet) {
	const keys = Object.keys(knownServers);
	const ctrlScript = 'ctrl.js';
	const workScript = 'work.js';

	for (let i = 0; i < keys.length; i++) {
		const server = knownServers[keys[i]];

		if (!ns.fileExists(workScript, server.hostname)) {
			continue;
		}

		// Stop all scripts on the server. 
		// We want to focus on work.js execution.
		ns.killall(server.hostname);

		if ('start' !== workerStatus) {
			continue;
		}

		// RAM needed by the control script. Keep memory for 1 thread.
		const ramCtrl = ns.getScriptRam(ctrlScript, server.hostname);

		// Calculate maxumum number of workers we can spawn.
		const threads = calcThreads(server.hostname, workScript, ramCtrl);

		let message = '';

		if (threads > 0) {
			// Spawn as many worker instances as possible.
			const pid = ns.exec(workScript, server.hostname, threads);

			if (!pid) {
				message = `Server could not start ${workScript}: ${server.hostname}`;
			}
		} else {
			message = `Not enough RAM for ${workScript}: ${server.hostname}`;
		}

		if (message && !quiet) {
			Common.say(ns, message);
		}
	}
}

/**
 * Calculate maxumum number of threads a given script
 * can take up on the specified server.
 */
function calcThreads(host, script, reserved) {
	if (!reserved || isNaN(reserved) || reserved < 0) {
		reserved = 0;
	}

	const needed = ns.getScriptRam(script, host);
	const max = ns.getServerMaxRam(host);
	const used = ns.getServerUsedRam(host);
	const avail = max - used - reserved;

	return Math.max(0, Math.floor(avail / needed));
}

/**
 * Establishes root access on the given target
 * server and opens all available ports.
 * 
 * @param {Server} server - Target server details.
 */
function attackServer(server) {
	// Open all ports on the server.
	portOpeners.forEach(tool => {
		if (!server[tool.port]) {
			ns[tool.cmd](server.hostname);
		}
	});

	// Update the server object.
	server = { ...server, ...ns.getServer(server.hostname) };

	// Establish root access if needed.
	if (
		!server.hasAdminRights
		&& server.requiredHackingSkill <= stats.hacking
		&& server.numOpenPortsRequired <= portOpeners.length
	) {
		ns.nuke(server.hostname);
		server.hasAdminRights = ns.hasRootAccess(server.hostname);
	}
}