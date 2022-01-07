import * as Common from 'common.js';

/** 
 * Centralized monitoring script, that runs in a
 * single thread on the "home" server. 
 * 
 * It monitors the attacked servers' stats in
 * an interval and decides on whether to hack, 
 * weaken or grow the target server during the 
 * next interval.
 * 
 * The decission is transported to the 
 * distributed worker nodes via the ctrl.js
 * mechanism.
 * 
 * @param {NS} ns
 */
export async function main(ns) {
	while (true) {
		refreshKnownServers(ns);

		await scanTargets(ns);
		growNetwork(ns);
		checkForFreeServers(ns);

		await ns.sleep(5000);
	}
}

/**
 * The attack and script configuration.
 */
let config = {};

/**
 * List of all known servers.
 */
let knownServers = {};

/**
 * Refreshes the list of known remote servers.
 */
function refreshKnownServers(ns) {
	knownServers = Common.findAllServers(ns);
}

/**
 * Reads details from the config/server files and
 * performs relevant scans, to decide the next tasks
 * Updates the config file when done.
 */
async function scanTargets(ns) {
	const config = Common.getConfig(ns);

	// Step 1: Pick target.
	const prevTarget = config.target;

	if (config.autoPick) {
		config.target = compareTargets(ns);
	}
	if (prevTarget !== config.target) {
		ns.tprint(`Monitoring picked a new target: ${config.target}`);
	}
	const server = ns.getServer(config.target);

	// Step 2: Decide action probability.
	calcActions(ns, config, server);

	// Save the config file.
	await Common.setConfig(ns, config);
}

/**
 * Analyze all servers and pick the most profitable one.
 */
function compareTargets(ns) {
	const stats = Common.getPlayerStats(ns);
	const keys = Object.keys(servers);

	let bestProfit = 0;
	let bestServer = null;

	/**
	 * Each server is compared using the following 
	 * criteria:
	 * 
	 * - root access .. required to hack a server.
	 * - company server .. we cannot hack own servers.
	 * - hacking skill .. it limits the servers we can hack.
	 * - security level [1 - 99] .. lower is preferred.
	 * - max money .. higher is preferred.
	 */
	for (let i = 0; i < keys.length; i++) {
		const server = knownServers[keys[i]];

		if (
			!server.hasAdminRights
			|| server.purchasedByPlayer
			|| server.requiredHackingSkill > stats.hacking
		) {
			continue;
		}

		const rateMoney = server.moneyMax + server.moneyAvailable / 10;
		const rateSec = server.baseDifficulty + server.hackDifficulty / 10;
		const rateProfit = rateMoney / rateSec;

		if (rateProfit > bestProfit) {
			bestProfit = rateProfit;
			bestServer = server;
			Common.log(
				ns,
				'Possible Target',
				parseInt(bestProfit).toLocaleString(),
				server.hostname,
				`\$ ${parseInt(rateMoney).toLocaleString()}`,
				`Sec ${parseInt(rateSec).toLocaleString()}`
			);
		}
	}

	if (bestServer) {
		return bestServer.hostname;
	}

	// Default response in case of failure.
	return 'n00dles';
}

/**
 * Scan the target and decide which action to take.
 */
function calcActions(ns, config, server) {
	const target = server.hostname;
	const maxMoney = server.moneyMax;
	const minSec = server.baseDifficulty;

	const secArgs = [
		parseFloat(server.hackDifficulty.toFixed(3)),
		minSec + config.boundSec,
		minSec
	];
	const moneyArgs = [
		parseInt(server.moneyAvailable),
		maxMoney,
		maxMoney * config.boundMoney
	];

	config.weaken = calcUrgency('lower', ...secArgs);
	config.grow = calcUrgency('raise', ...moneyArgs);

	Common.log(
		ns,
		target,
		`Weaken ${config.weaken.toFixed(2)} [${secArgs.join(', ')}]`,
		`Grow ${config.grow.toFixed(2)} [${moneyArgs.join(', ')}]`
	);
}

/**
 * Decide how urgent it is to align the current value
 * inside the bounds.
 * 
 * @return {number} A value between 0 (not urgent) and 1 (very urgent).
 */
function calcUrgency(goal, current, upperBound, lowerBound) {
	if (upperBound < lowerBound) {
		const tmp = upperBound;
		upperBound = lowerBound;
		lowerBound = tmp;
	}

	let urgency = 0;

	if (current > upperBound) {
		urgency = 0;
	} else if (current < lowerBound) {
		urgency = 1;
	} else {
		urgency = (current - lowerBound) / (upperBound - lowerBound);
	}

	urgency = Math.min(Math.max(urgency, 0.05), 0.95);
	if ('raise' === goal) {
		urgency = 1 - urgency;
	}

	return parseFloat(urgency.toFixed(4));
}

/**
 * Checks all known servers to see if they have free
 * resources that we can use for our worker script.
 */
function checkForFreeServers(ns) {
	refreshKnownServers(ns);
	const keys = Object.keys(knownServers);
	const requiredRam = ns.getScriptRam('work.js', 'home');
	const freeServers = [];

	for (let i = 0; i < keys.length; i++) {
		const server = knownServers[keys[i]];
		const freeRam = server.maxRam - server.ramUsed;

		// Continue, if insufficient permissions.
		if (!server.hasAdminRights && !server.purchasedByPlayer) {
			continue;
		}

		// Continue, if server has too little RAM.
		if (freeRam < requiredRam) {
			continue;
		}

		freeServers.push(server.hostname);
	}

	/* 
	 * If a server with free capacity is detected, then
	 * reinstall and start our tools network wide.
	 */
	if (freeServers.length) {
		Common.say(ns, `Available resources found on [${freeServers.join(', ')}]`);
		ns.spawn('master.js', 1, '--install', '--start', '--quiet');
	}
}

/**
 * Automatically upgrades servers and nodes or purchases
 * new elements when possible.
 * 
 * This function will constantly extend the server/node
 * network with following rules:
 * 
 * 1. Purchase new servers with minimal RAM, until the 
 *    server limit is reached
 * 2. Determine costs of the following actions:
 *    - Upgrade server RAM (delete + purchase new server)
 *    - New Hacknet Node
 *    - Hacknet Node RAM Update
 *    - Hacknet Node Level Update
 *    - Hacknet Node Core Update
 *    - Hacknet Server Cache Update
 *    Pick the cheapeast of all available actions.
 * 
 * The function will only perform a single action when
 * called.
 */
function growNetwork(ns) {
	const stats = Common.getPlayerStats(ns);
	const upgrades = getAvailableUpgrades(ns);
	const availableMoney = stats.money;

	let select = null;

	for (let i = 0; i < upgrades.length; i++) {
		const upgrade = upgrades[i];

		// Skip options that we cannot afford.
		if (upgrade.cost > availableMoney) {
			continue;
		}

		// New servers are always preferred.
		if ('add_server' === upgrade.action) {
			select = upgrade;
			break;
		}

		if (!select || upgrade.cost < select.cost) {
			select = upgrade;
		}
	}

	if (!select) {
		return;
	}

	switch (select.action) {
		case 'add_server':
			Common.say(ns, `Purchase new Server: ${select.name} [${select.ram} GB]`);
			ns.purchaseServer(select.name, select.ram);
			break;
		case 'upg_server':
			Common.say(ns, `Upgrade Server: ${select.name} [${select.ram} GB]`);
			ns.deleteServer(select.name);
			ns.purchaseServer(select.name, select.ram);
			break;
		case 'add_node':
			Common.say(ns, `Purchase Hacknet Node`);
			ns.hacknet.purchaseNode();
			break;
		case 'upg_node_lvl':
			Common.say(ns, `Upgrade Hacknet Level: Node ${select.index} [+${select.step}]`);
			ns.hacknet.upgradeLevel(select.index, select.step);
			break;
		case 'upg_node_ram':
			Common.say(ns, `Upgrade Hacknet RAM: Node ${select.index} [+${select.step}]`);
			ns.hacknet.upgradeRam(select.index, select.step);
			break;
		case 'upg_node_cre':
			Common.say(ns, `Upgrade Hacknet Cores: Node ${select.index} [+${select.step}]`);
			ns.hacknet.upgradeCore(select.index, select.step);
			break;
	}
}

/**
 * Collects a list of all possible upgrades and their 
 * costs.
 */
function getAvailableUpgrades(ns) {
	const serverMaxRam = ns.getPurchasedServerMaxRam();
	const serverMaxNum = ns.getPurchasedServerLimit();
	const serverList = ns.getPurchasedServers();
	const nodesCount = ns.hacknet.numNodes();
	const nodesMax = ns.hacknet.maxNumNodes();
	const serverInitRam = 4;
	const nodeStepLevel = 10;
	const nodeStepRam = 5;
	const nodeStepCore = 5;
	const actions = [];

	// Purchase new servers.
	if (serverList.length < serverMaxNum) {
		actions.push({
			action: 'add_server',
			cost: ns.getPurchasedServerCost(serverInitRam),
			name: `pserv-${serverList.length}`,
			ram: serverInitRam
		});
	}

	// Upgrade existing servers.
	for (let i = 0; i < serverList.length; i++) {
		const name = serverList[i];
		const upgradeRam = 2 * ns.getServerMaxRam(name);

		if (upgradeRam < serverMaxRam) {
			actions.push({
				action: 'upg_server',
				cost: ns.getPurchasedServerCost(upgradeRam),
				name,
				ram: upgradeRam
			});
		}
	}

	// Purchase new hacknet nodes.
	if (nodesCount < nodesMax) {
		actions.push({
			action: 'add_node',
			cost: ns.hacknet.getPurchaseNodeCost()
		});
	}

	// Update existing hacknet nodes.
	for (let i = 0; i < nodesCount; i++) {
		const costLevel = ns.hacknet.getLevelUpgradeCost(i, nodeStepLevel);
		const costRam = ns.hacknet.getRamUpgradeCost(i, nodeStepCore);
		const costCore = ns.hacknet.getCoreUpgradeCost(i, nodeStepRam);

		if (costLevel && costLevel !== Infinity) {
			actions.push({
				action: 'upg_node_lvl',
				cost: costLevel,
				index: i,
				step: nodeStepLevel
			});
		}
		if (costRam && costRam !== Infinity) {
			actions.push({
				action: 'upg_node_ram',
				cost: costRam,
				index: i,
				step: nodeStepRam
			});
		}
		if (costCore && costCore !== Infinity) {
			actions.push({
				action: 'upg_node_cre',
				cost: costCore,
				index: i,
				step: nodeStepCore
			});
		}
	}

	return actions;
}
