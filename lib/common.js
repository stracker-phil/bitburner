/**
 * Reads data from the config file and returns
 * the full config object.
 */
export function getConfig(ns) {
	const raw = ns.read("data.config");
	const def = {
		started: false,
		target: "",
		autoTarget: true,
		autoGrow: true,
		hackAlgo: "default", // default / hwgw
		boundSec: 4,
		boundMoney: 0.6,
		lockedBudget: 0,
		lockedRam: 0,
	};

	if (raw) {
		try {
			const config = JSON.parse(raw);
			const result = {};

			for (const key in def) {
				if ("undefined" !== typeof config[key]) {
					result[key] = config[key];
				} else {
					result[key] = def[key];
				}
			}

			return result;
		} catch (ex) {
			console.error("Cannot parse data.config file!", ex.message);
		}
	}

	return def;
}

/**
 * Save the updated config data.
 */
export async function setConfig(ns, config) {
	await ns.write("data.config", JSON.stringify(config), "w");
}

/**
 * Outputs a terminal message with a timestamp.
 */
export function say(ns, ...msg) {
	ns.tprint(`${timestamp()} | ${msg.join(" | ")}`);
}

/**
 * Outputs a log message with a timestamp.
 */
export function log(ns, ...msg) {
	ns.print(`${timestamp()} | ${msg.join(" | ")}`);
}

/**
 * Returns a formatted timestamp, for logging.
 */
export function timestamp(delay = 0) {
	let date;

	if (delay) {
		date = new Date(Date.now() + delay);
	} else {
		date = new Date();
	}

	return date.toISOString().substring(11, 19);
}

export function formatMoney(ns, value) {
	return ns.nFormat(parseInt(value), "$0.000a");
}
