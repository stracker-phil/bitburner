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
		skillRam: 520, // 520 GB equals 100 H/G/W threads (10 attacks against 10 targets)
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

	return date.toLocaleString().substr(-8);
}

export function formatMoney(ns, value) {
	return ns.nFormat(parseInt(value), "$0.000a");
}

export function formatRam(value) {
	if (!value || isNaN(value)) {
		return "0 GB";
	}

	const units = ["GB", "TB", "PB", "EB"];

	const i = parseInt(Math.floor(Math.log(value) / Math.log(1024)));
	return Math.round(value / Math.pow(1024, i), 2) + " " + units[i];
}

/**
 * Converts a multi dimensional array into a table-like string.
 *
 * @param {array} data
 * @returns {string}
 */
export function printF(data, header = []) {
	const lines = [];
	const colSize = [];

	data.map((row) => {
		for (let i = 0; i < row.length; i++) {
			colSize[i] = Math.max(
				...data.map((row) => (row[i] ? row[i].length : 0))
			);
		}
	});

	if (header && header.length) {
		for (let i = 0; i < header.length; i++) {
			colSize[i] = Math.max(colSize[i] || 0, header[i].length);
		}

		const line = [];
		const sep = [];
		for (let i = 0; i < colSize.length; i++) {
			const cell = header[i] || "";
			const space = colSize[i] - cell.length;

			line.push(cell + " ".repeat(space));
			sep.push("-".repeat(colSize[i]));
		}

		lines.push("  " + line.join("  |  ") + "  ");
		lines.push("--" + sep.join("--+--") + "--");
	}

	data.map((row) => {
		const line = [];
		for (let i = 0; i < colSize.length; i++) {
			const cell = (row[i] || "").toString();
			const space = Math.max(0, colSize[i] - cell.length);

			line.push(cell + " ".repeat(space));
		}

		lines.push("  " + line.join("  |  ") + "  ");
	});

	return lines.join("\n");
}
