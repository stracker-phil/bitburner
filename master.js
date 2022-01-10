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
		["install", false],
		["target", ""],
		["auto-target", ""],
		["auto-grow", ""],
		["bound-sec", ""],
		["bound-money", ""],
		["lock-budget", ""],
		["lock-money", ""],
		["lock-ram", ""],
		["grow-skill", ""],
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

	if ("" !== args.target && ns.serverExists(args.target)) {
		config.target = args.target;
		Common.say(ns, `Change target server to ${config.target}`);

		if (!config["auto-target"]) {
			config["auto-target"] = "off";
		}
	}

	if ("" !== args["auto-target"]) {
		if ("on" === args["auto-target"]) {
			config.autoTarget = true;
		} else if ("off" === args["auto-target"]) {
			config.autoTarget = false;
		}

		Common.say(
			ns,
			`Auto pick attacked server: ${config.autoTarget ? "On" : "Off"}`
		);
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

	if ("" !== args["auto-grow"]) {
		if ("on" === args["auto-grow"]) {
			config.autoGrow = true;
		} else if ("off" === args["auto-grow"]) {
			config.autoGrow = false;
		}

		Common.say(
			ns,
			`Automatic network growth: ${config.autoGrow ? "On" : "Off"}`
		);
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

	if ("" !== args["grow-skill"]) {
		config.skillRam = parseFloat(args["grow-skill"]) || 0;
		config.skillRam = Math.max(config.skillRam, 0);

		if (config.skillRam > 51) {
			config.skillRam =
				Math.max(1, Math.round(config.skillRam / 52)) * 52;
		}
		Common.say(
			ns,
			`Allocate RAM for skill growth: ${config.skillRam.toLocaleString()} GB`
		);
	}

	// Store config/server list in files.
	await Common.setConfig(ns, config);

	// Refresh player and server stats; start services on all servers.
	await Server.initialize(ns);

	if (args.install) {
		await Server.all(async (server) => {
			await server.uninstallTools(ns);
			await server.setup(ns);
		});

		Common.say(ns, "Re-installed scripts on all servers");
	}

	Player.get(ns);

	if (args.info) {
		await ns.sleep(100);

		// Refresh config, in case attk.js changed target.
		config = Common.getConfig(ns);

		const info = [];

		info.push("");
		info.push("Config:");
		info.push(JSON.stringify(config, null, 4));
		info.push("");

		if (config.target) {
			const server = Server.get(config.target);

			info.push("Current attack target:");
			info.push("");

			info.push(server.analyze(ns).replaceAll("%", "%%"));
			info.push("");
		}

		info.push("");
		ns.tprintf(info.join("\n"));

		await ns.sleep(250);
		ns.tail("attk.js", "home");

		await ns.sleep(250);
		ns.tail("grow.js", "home");

		await ns.sleep(250);
		ns.tail("sgrw.js", "home");
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
		"  --install    Re-install the hacking scripts on all servers.",
		"  --info       Outputs the current attack config.",
		"",
		"  --auto-target on|off  Enable or Disable automatic picking of",
		"               the target server, based on maximal expected profit",
		"  --target <server>  Tell all worker nodes to target a specific",
		"               server.",
		"",
		"  --bound-sec <num>  Define the security level boundary.",
		"               Default: 4",
		"  --bound-money <num>  Define the money boundary.",
		"               Default: 0.6",
		"",
		"  --auto-grow on|off  Enable or Disable automatic network growth.",
		"  --lock-money <val>  Defines the locked budget that should",
		"               not be invested into automatic network growth.",
		"               Set to 0 to automatically invest all your money.",
		"               Sample values: 20k, 250m, 1050b",
		"",
		"  --lock-ram <val>  Defines, how much RAM is reserved on the home",
		"               computer. Locked RAM is not used by attk.js or sgrw.js.",
		"",
		"  --grow-skill <val>  Allocate RAM to grow hacking skill. This RAM",
		"               is not used by attk.js. Minimum value is 52 GB - a",
		"               value will disable this feature.",
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
