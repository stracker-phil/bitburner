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

/**
 * Generates a time expression (duration) from a millisecond value.
 *
 * Short: 01:02:34
 * Long:  1 hr 2 min 34 sec
 *
 * @param {int} value - Time in milliseconds
 * @param {bool} long - Generate long or short format?
 * @param {bool} millisecond - Display milliseconds?
 * @returns
 */
export function formatTime(value, long, millisecond) {
	let date = new Date();
	date.setTime(value + date.getTimezoneOffset() * 60000);

	const ms = (Math.round(date.getMilliseconds() / 10) + "00").slice(0, 2);

	if (long) {
		const parts = [];
		if (date.getHours() > 0) {
			parts.push(date.getHours() + " hr");
		}
		if (date.getMinutes() > 0) {
			parts.push(date.getMinutes() + " min");
		}
		if (millisecond) {
			if (date.getSeconds() > 0) {
				parts.push(date.getSeconds() + "." + ms + " sec");
			}
		} else {
			if (date.getSeconds() > 0) {
				parts.push(date.getSeconds() + " sec");
			}
		}

		return parts.join(" ");
	} else {
		let time = date.toLocaleTimeString().slice(0, 8);
		if (millisecond) {
			time += "." + ms;
		}
		if (0 === time.indexOf("00:")) {
			time = time.substring(3);
		}

		return time;
	}
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
 * @param {array} header
 * @param {array} format
 * @returns {string}
 */
export function printF(data, header = [], format = []) {
	const lines = [];
	const cols = [];

	function registerCol(index, length, format) {
		const col = cols[index] || {};

		if (!format) {
			format = ["left"];
		}

		col.len = Math.max(col.len || 0, length);
		col.align = -1 !== format.indexOf("right") ? "right" : "left";

		cols[index] = col;
	}

	data.map((row) => {
		for (let i = 0; i < row.length; i++) {
			registerCol(i, row[i].toString().length, format[i]);
		}
	});

	if (header && header.length) {
		for (let i = 0; i < header.length; i++) {
			registerCol(i, header[i].length, format[i]);
		}

		const line = [];
		const sep = [];
		for (let i = 0; i < cols.length; i++) {
			const col = cols[i];
			const cell = header[i] || "";
			const space = col.len - cell.length;
			const sp1 = Math.floor(space / 2);
			const sp2 = space - sp1;

			line.push(" ".repeat(sp1) + cell + " ".repeat(sp2));
			sep.push("-".repeat(col.len));
		}

		lines.push("  " + line.join("  |  ") + "  ");
		lines.push("--" + sep.join("--+--") + "--");
	}

	data.map((row) => {
		const line = [];
		for (let i = 0; i < cols.length; i++) {
			const col = cols[i];
			const value = (row[i] || "").toString();
			const space = Math.max(0, col.len - value.length);
			let cell = value;

			if ("right" === col.align) {
				cell = " ".repeat(space) + cell;
			} else {
				cell += " ".repeat(space);
			}

			line.push(cell);
		}

		lines.push("  " + line.join("  |  ") + "  ");
	});

	return lines.join("\n");
}
