import * as Common from "lib/common.js";
import * as Server from "lib/server.js";
import * as Player from "lib/player.js";

/**
 * The attack and script configuration.
 */
let config = {};

/**
 * Player instance.
 */
let player;

/**
 * Autonomous growth script that purchases or
 * upgrades servers, hacknodes, buys programs
 * or performs non-hacking tasks.
 *
 * @param {NS} ns
 */
export async function main(ns) {
	await Server.initialize(ns);
	player = Player.get(ns);

	ns.clearLog();
	ns.disableLog("ALL");

	while (true) {
		config = Common.getConfig(ns);

		if (config.autoGrow) {
			player.refresh(ns);

			await growNetwork(ns);
			workOnTasks(ns);

			await Server.initialize(ns);
		}

		await ns.sleep(30000);
	}
}

/**
 * Automatically upgrades servers and nodes or purchases
 * new elements when possible.
 *
 * This function will constantly extend the server/node
 * network with following rules:
 *
 *   - Purchase new servers (with minimal RAM)
 *   - Upgrade RAM of existing servers
 *   - Purchase new Hacknet Node
 *   - Update Hacknet Node RAM
 *   - Update Hacknet Node Level
 *   - Update Hacknet Node Core
 *
 * NS4:
 *   - todo: Update Hacknet Server Cache
 *   - todo: Purchase TOR router
 *   - todo: Darkweb programs
 *   - todo: Upgrade home RAM
 *   - todo: Upgrade home cores
 *
 * This function will process all affordable
 * updates.
 *
 * @return {int} Number of purchased upgrades.
 */
async function growNetwork(ns) {
	const initialBalance = player.money;

	let success = true;
	let count = 0;

	while (success) {
		player.refresh(ns);
		const upgrades = getAvailableUpgrades(ns);
		const budget = parseInt(player.money - config.lockedBudget);

		let select = null;
		let msg = "";

		// Find the next upgrade to purchase.
		for (let i = 0; i < upgrades.length; i++) {
			const upgrade = upgrades[i];

			// Skip options that we cannot afford.
			if (upgrade.cost > budget) {
				continue;
			}

			if (!select || upgrade.cost < select.cost) {
				select = upgrade;
			}
		}

		// Stop, if no affordable upgrade exists.
		if (!select) {
			if (count) {
				const spent = initialBalance - player.money;

				Common.log(
					ns,
					"Updates done",
					`Purchased ${count} upgrades`,
					`Spent ${Common.formatMoney(ns, spent)}`
				);
			}
			break;
		}

		// Purchase the upgrade.
		switch (select.action) {
			case "add_server":
				msg = `Purchase new Server: ${select.name} [${select.ram} GB]`;
				success = await Server.purchase(ns, select.name, select.ram);
				break;

			case "upg_server":
				msg = `Upgrade Server: ${select.name} [${select.ram} GB]`;
				success = await Server.upgrade(ns, select.name, select.ram);
				break;

			case "add_node":
				msg = `Purchase Hacknet Node`;
				success = -1 !== ns.hacknet.purchaseNode();
				break;

			case "upg_node_lvl":
				msg = `Upgrade Hacknet Level: Node ${select.index} [+${select.step}]`;
				success = ns.hacknet.upgradeLevel(select.index, select.step);
				break;

			case "upg_node_ram":
				msg = `Upgrade Hacknet RAM: Node ${select.index} [+${select.step}]`;
				success = ns.hacknet.upgradeRam(select.index, select.step);
				break;

			case "upg_node_cre":
				msg = `Upgrade Hacknet Cores: Node ${select.index} [+${select.step}]`;
				success = ns.hacknet.upgradeCore(select.index, select.step);
				break;

			case "upg_home_cre":
				msg = `Upgrade home computer cores`;
				// TODO: Requires NS-2
				// success = ns.upgradeHomeCores();
				break;

			case "upg_home_ram":
				msg = `Upgrade home computer RAM`;
				// TODO: Requires NS-2
				// success = ns.upgradeHomeRam();
				break;

			case "buy_tor":
				msg = `Purchase TOR router`;
				// TODO: Requires NS-4
				// success = ns.purchaseTor();
				break;

			case "buy_program":
				msg = `Purchase program in darkweb: ${select.name}`;
				// TODO: Requires NS-4
				// success = ns.purchaseProgram(select.name);
				// doInstall = true;
				break;
		}

		if (msg) {
			Common.log(ns, msg, Common.formatMoney(ns, select.cost));
		}

		if (success) {
			count++;
		}
	}

	return count;
}

/**
 * Start to work on specific tasks, such as
 * writing a program, committing crimes or visiting
 * a gym.
 *
 * TODO: Requires NS-4
 */
function workOnTasks(ns) {
	/*
	if (ns.isBusy()) {
		return;
	}

	const tasks = getAvailableTasks(ns);
	console.log("TASKS", tasks);

	let select = null;

	for (let i = 0; i < tasks.length; i++) {
		const task = tasks[i];

		// Prefer to write programs when possible.
		if ('write_program' === task.action) {
			select = task;
			break;
		}
	}

	if (!select) {
		return;
	}

	switch (select.action) {
		case 'write_program':
			Common.say(ns, `Start writing a program: ${select.name}`);
			ns.createProgram(select.name);
			break;
	}
	// */
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
	const serverInitRam = 4;
	const nodeStepLevel = 1;
	const nodeStepRam = 1;
	const nodeStepCore = 1;
	const actions = [];

	// Purchase new servers.
	if (serverList.length < serverMaxNum) {
		actions.push({
			action: "add_server",
			cost: ns.getPurchasedServerCost(serverInitRam),
			name: `pserv-${serverList.length}`,
			ram: serverInitRam,
		});
	}

	// Upgrade existing servers.
	for (let i = 0; i < serverList.length; i++) {
		const name = serverList[i];
		const currRam = Server.get(name, "ramMax");
		const newRam = 2 * currRam;

		if (newRam && !isNaN(newRam) && newRam < serverMaxRam) {
			actions.push({
				action: "upg_server",
				cost: ns.getPurchasedServerCost(newRam),
				name,
				ram: newRam,
			});
		}
	}

	// TODO: Requires NS-2
	/*
	const upgHomeCores = ns.getUpgradeHomeCoresCost();
	const upgHomeRam = ns.getUpgradeHomeRamCost();
	if (upgHomeCores && Infinity !== upgHomeCores) {
		actions.push({
			action: "upg_home_cre",
			cost: upgHomeCores,
		});
	}
	if (upgHomeRam && Infinity !== upgHomeRam) {
		actions.push({
			action: "upg_home_ram",
			cost: upgHomeRam,
		});
	}
	*/

	// Purchase new hacknet nodes.
	if (serverList.length >= 8 || nodesCount < 8) {
		actions.push({
			action: "add_node",
			cost: ns.hacknet.getPurchaseNodeCost(),
		});
	}

	// Update existing hacknet nodes.
	for (let i = 0; i < nodesCount; i++) {
		const costLevel = ns.hacknet.getLevelUpgradeCost(i, nodeStepLevel);
		const costRam = ns.hacknet.getRamUpgradeCost(i, nodeStepCore);
		const costCore = ns.hacknet.getCoreUpgradeCost(i, nodeStepRam);

		// When hacknet nodes are big enough, focus on custom servers for a while.
		if (serverList.length < 8 && costLevel > 50000) {
			continue;
		}

		if (costLevel && Infinity !== costLevel) {
			actions.push({
				action: "upg_node_lvl",
				cost: costLevel,
				index: i,
				step: nodeStepLevel,
			});
		}
		if (costRam && Infinity !== costRam) {
			actions.push({
				action: "upg_node_ram",
				cost: costRam,
				index: i,
				step: nodeStepRam,
			});
		}
		if (costCore && Infinity !== costCore) {
			actions.push({
				action: "upg_node_cre",
				cost: costCore,
				index: i,
				step: nodeStepCore,
			});
		}
	}

	// Purchase missing programs.
	// TODO: Requires NS-4
	/*
	if (!player.tor) {
		actions.push({
			action: "buy_tor",
			cost: 200000,
		});
	} else {
		Common.hackingTools.forEach(tool => {
			if (!ns.fileExists(tool.file, 'home')) {
				actions.push({
					action: 'buy_program',
					cost: tool.cost,
					name: tool.file,
				});
			}
		});
	}
	*/

	return actions;
}

/**
 * Generates a list of possible tasks to do.
 *
 * TODO: Requires NS-4
 */
function getAvailableTasks(ns) {
	const tasks = [];

	/*
	// Create missing programs.
	Common.hackingTools.forEach((tool) => {
		if (
			!ns.fileExists(tool.file, "home") &&
			tool.level &&
			player.hacking >= tool.level
		) {
			tasks.push({
				action: "write_program",
				name: tool.file,
			});
		}
	});
	*/

	return tasks;
}
