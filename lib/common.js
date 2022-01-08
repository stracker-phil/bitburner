/**
 * Reads data from the config file and returns
 * the full config object.
 */
export function getConfig(ns) {
	const raw = ns.read("data.config");
	const def = {
		started: false,
		target: "",
		autoPick: true,
		boundSec: 4,
		boundMoney: 0.6,
		autoGrow: 0,
		weaken: 0.6,
		grow: 0.4,
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

export function formatTime(time) {
	return new Date(time).toISOString().substring(11, 19);
}

export function formatMoney(value) {
	value = parseInt(value);
	return "$" + value.toLocaleString();
}
