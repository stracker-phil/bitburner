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
	const args = ns.flags([
		["auto", false],
		["help", false],
		["start", false],
		["stop", false],
		["info", false],
		["install", false],
		["target", ""],
		["auto-target", ""],
		["auto-grow", ""],
		["auto-trade", ""],
		["auto-infiltrate", ""],
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

	if (!ns.args.length || args.auto) {
		await automation(ns, args);
	}

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

		if (!args["auto-target"]) {
			args["auto-target"] = "off";
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
			`Server growth daemon: ${config.autoGrow ? "On" : "Off"}`
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
			`Lock budget from auto grow: ${config.lockedBudget.toLocaleString()}`
		);
	}

	if ("" !== args["lock-ram"]) {
		config.lockedRam = Math.max(0, parseInt(args["lock-ram"]) || 0);
		Common.say(
			ns,
			`Reserved RAM on home computer: ${config.lockedRam.toLocaleString()} GB`
		);
	}

	if ("" !== args["auto-trade"]) {
		if ("on" === args["auto-trade"]) {
			config.autoTrade = true;
		} else if ("off" === args["auto-trade"]) {
			config.autoTrade = false;
		}

		Common.say(
			ns,
			`Stock Trade daemon: ${
				config.autoTrade ? "On" : "Off"
			}`
		);
	}

	if ("" !== args["auto-infiltrate"]) {
		if ("on" === args["auto-infiltrate"]) {
			config.autoInfiltrate = true;
		} else if ("off" === args["auto-infiltrate"]) {
			config.autoInfiltrate = false;
		}

		Common.say(
			ns,
			`Automatic infiltration daemon: ${
				config.autoInfiltrate ? "On" : "Off"
			}`
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
	}

	endScript(ns);
}

/**
 * Display usage instructions.
 */
function showHelp(ns) {
	const params = [];
	const paramFormat = [null, null, { align: "left", len: 64 }];

	params.push([
		"--start",
		"",
		"Start all services that are not running yet.",
	]);
	params.push([]);
	params.push(["--stop", "", "Start all running services on all servers."]);
	params.push([]);
	params.push([
		"--install",
		"",
		"Re-install the latest version of relevant scripts on all servers.",
	]);
	params.push([]);
	params.push([
		"--info",
		"",
		"Display current attack- and automation configuration.",
	]);
	params.push([]);
	params.push([
		"--auto-target",
		"on|off",
		"Enable or disable automatic picking of the target server, based on maximal expected profit.",
	]);
	params.push([]);
	params.push([
		"--target",
		"SERVER",
		"Tell all worker nodes to target a specific server. Disables auto-target.",
	]);
	params.push([]);
	params.push([
		"--bound-sec",
		"NUM",
		"Define the security level boundary. When security on target server is higher than this boundary, the server is weakened. Default: 2",
	]);
	params.push([]);
	params.push([
		"--bound-money",
		"NUM",
		"Define the money boundary. When the available money on the target server is lower than the boundary, the funds are grown. Default: 0.9 (i.e., 90% of max money).",
	]);
	params.push([]);
	params.push([
		"--auto-grow",
		"on|off",
		"Enable or disable automatic network growth.",
	]);
	params.push([]);
	params.push([
		"--lock-money",
		"VALUE",
		"Defines the locked budget that should not be invested into automatic network growth. Set to 0 to automatically invest all your money. Sample values: 20k, 250m, 1050b.",
	]);
	params.push([]);
	params.push([
		"--lock-ram",
		"VALUE",
		"Defines, how much RAM is reserved on the home computer. Locked RAM is not used by attk.js.",
	]);
	params.push([]);
	params.push([
		"--auto-trade",
		"on|off",
		"Enable or disable the automatic stock trading daemon.",
	]);
	params.push([]);
	params.push([
		"--auto-infiltrate",
		"on|off",
		"Enable or disable the automatic infiltration daemon.",
	]);

	const help = [
		"Usage:",
		"  master [--command [value]] [--command2 [value2]] ...",
		"",
		"Examples:",
		"  master",
		"  master --stop",
		"  master --target n00dles --start",
		"",
		"Commands:",
		"",
	];

	ns.tprint(
		`\n${help.join("\n")}\n${Common.printF(params, [], paramFormat)}\n`
	);
}

/**
 * Exits the script execution
 */
function endScript(ns) {
	// On starting server we need to spawn the grow script,
	// because RAM is too scarce to run master + grow at once.
	if (config.started && !ns.isRunning("/daemon/grow.js", "home")) {
		ns.spawn("/daemon/grow.js");
	}

	// Start or stop automatic infiltration.
	if (config.autoInfiltrate) {
		ns.run("/daemon/infiltrate.js", 1, "--start", "--quiet");
	} else {
		ns.run("/daemon/infiltrate.js", 1, "--stop", "--quiet");
	}

	// Start or stop automatic stock trading.
	const tradeOn = ns.isRunning("tools/stock.js", "home");
	if (config.autoTrade) {
		if (!tradeOn) {
			ns.run("/daemon/stock.js");
		}
	} else if (tradeOn) {
		ns.kill("/daemon/stock.js");
	}

	ns.exit();
}

async function automation(ns, args) {
	let runner;
	let guideFile;
	const guide = [];
	const homeRam = ns.getServerMaxRam("home");

	guide.push(" +------- -- -");
	guide.push(" | Current home RAM: " + homeRam.toLocaleString() + " GB");
	guide.push(" +---------- --- -");
	guide.push("");

	if (homeRam < 64) {
		guideFile = "/guide/stage1.js";

		runner = () => {
			ns.spawn("master.js", 1, "--install", "--start");
			ns.killall("home");
		};
	} else if (homeRam < 1024) {
		guideFile = "/guide/stage2.js";

		runner = () => {
			ns.spawn("master.js", 1, "--install", "--start");
			ns.killall("home");
		};
	} else {
		guideFile = "/guide/stage3.js";

		runner = () => {
			ns.spawn("master.js", 1, "--install", "--start");
			ns.killall("home");
		};
	}

	if (guideFile) {
		guide.push(ns.read(guideFile));
	}

	ns.tprint(
		`\n\n${guide.join(
			"\n"
		)}\n\nMore options: run ${ns.getScriptName()} --help\n\n`
	);

	if ("function" === typeof runner) {
		runner();
	}
}
