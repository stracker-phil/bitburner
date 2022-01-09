import * as Common from "lib/common.js";
import * as Player from "lib/player.js";
import * as Server from "lib/server.js";

/**
 * Attack configuration object that is shared
 * with the distributed nodes and defines the
 * specific actions to take.
 */
let config = {};

/**
 * The master script manages the main services
 * and prepares worker nodes.
 *
 * It can use a lot of RAM, as it does the main
 * data processing and orchestrates the entire
 * network of workers.
 *
 * This script is only used on the "home" server!
 *
 * Installation:
 * -------------
 *
 * > alias master="run master.js"
 *
 * Usage:
 * ------
 *
 * > master --help
 *
 * @param {NS} ns
 */
export async function main(ns) {
	ns.tprint("");
	ns.tprint("---------- START ----------");

	if (!ns.args.length) {
		showHelp(ns);
		endScript(ns);
	}

	const args = ns.flags([
		["help", false],
		["start", false],
		["stop", false],
		["info", false],
		["target", ""],
		["hack-algo", ""],
		["bound-sec", ""],
		["bound-money", ""],
		["lock-budget", ""],
		["lock-money", ""],
		["lock-ram", ""],
	]);

	if (args.help) {
		showHelp(ns);
		endScript(ns);
	}

	config = Common.getConfig(ns);

	// Process commands.

	if (args.start) {
		config.started = true;
	}

	if (args.stop) {
		config.started = false;
	}

	if ("" !== args.target) {
		if (ns.serverExists(args.target)) {
			Common.say(ns, `Change target server to ${args.target}`);
			config.target = args.target;
			config.autoTarget = false;
		} else if ("auto" === args.target) {
			Common.say(ns, "Auto pick target server");
			config.target = "";
			config.autoTarget = true;
		}
	}

	if ("" !== args["hack-algo"]) {
		if ("hwgw" === args["hack-algo"]) {
			config.hackAlgo = "hwgw";
		} else if ("default" === args["hack-algo"]) {
			config.hackAlgo = "default";
		}
		Common.say(ns, `Change hacking algorithm to ${config.hackAlgo}`);
	}

	if ("" !== args["bound-sec"]) {
		config.boundSec = parseFloat(args["bound-sec"]) || 0;
		config.boundSec = Math.max(config.boundSec, 0.5);
		config.boundSec = Math.min(config.boundSec, 99);
		Common.say(ns, `New security boundary: ${config.boundSec.toFixed(2)}`);
	}

	if ("" !== args["bound-money"]) {
		config.boundMoney = parseFloat(args["bound-money"]) || 0;
		config.boundMoney = Math.max(config.boundMoney, 0);
		config.boundMoney = Math.min(config.boundMoney, 1);
		Common.say(ns, `New money boundary: ${config.boundMoney.toFixed(2)}`);
	}

	if ("" !== args["lock-money"]) {
		args["lock-budget"] = args["lock-money"];
	}
	if ("" !== args["lock-budget"]) {
		let value = args["lock-budget"]
			.replaceAll(".", "")
			.replaceAll("b", "000000")
			.replaceAll("m", "000")
			.replaceAll("k", "");

		config.lockedBudget = Math.max(0, parseInt(value) || 0);
		Common.say(
			ns,
			`Lock budget from grow.js: ${config.lockedBudget.toLocaleString()}`
		);
	}

	if ("" !== args["lock-ram"]) {
		config.lockedRam = Math.max(0, parseInt(args["lock-ram"]) || 0);
		Common.say(
			ns,
			`Reserved RAM on home computer: ${config.lockedRam.toLocaleString()} GB`
		);
	}

	// Store config/server list in files.
	await Common.setConfig(ns, config);

	// Refresh player and server stats; start services on all servers.
	await Server.initialize(ns);
	Player.get(ns);

	if (args.info) {
		let target = config.target;

		ns.tprintf("\nConfig:\n%s\n\n", JSON.stringify(config, null, 4));

		if (target) {
			ns.exec("tools/analyze-server.js", "home", 1, target);
		}
	}

	endScript(ns);
}

/**
 * Display usage instructions.
 */
function showHelp(ns) {
	const help = [
		"Usage:",
		"  master [--command [value]] [--command2 [value2]] ...",
		"",
		"Examples:",
		"  master --target n00dles",
		"  master --stop",
		"  master --target n00dles --start",
		"",
		"Commands:",
		"  --start      Start all stopped services.",
		"  --stop       Stop all running services.",
		"  --info       Outputs the current attack config.",
		"",
		"  --hack-algo <name>  Enable a different hacking algorithm",
		"               default ... Default algorithm",
		"               hwgw ... Hack-Weaken-Grow-Weaken batches",
		"  --target <server>  Tell all worker nodes to target a specific",
		"               server.",
		'               Set the server to "auto" to let the script pick.',
		"               the most profitable target.",
		"  --bound-sec <num>  Define the security level boundary.",
		"               Default: 4",
		"  --bound-money <num>  Define the money boundary.",
		"               Default: 0.6",
		"",
		"  --lock-money <val>  Defines the locked budget that should",
		"               not be invested into automatic server growth.",
		"               Set to 0 to automatically invest all your money.",
		"               Sample values: 20k, 250m, 1050b",
		"  --lock-ram <val>  Defines, how much RAM is reserved on the home",
		"               computer. RAM that is not reserved is used by",
		"               attk.js to attack a target server.",
	];

	ns.tprintf("\n%s\n", help.join("\n"));
}

/**
 * Exits the script execution
 */
function endScript(ns) {
	ns.tprint("---------- EXIT ----------\n\n");
	ns.exit();
}
