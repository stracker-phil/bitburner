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
		boundSec: 2,
		boundMoney: 0.9,
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
		const conf = {
			align: "left",
			len: 0,
		};

		if (format && "object" === typeof format) {
			for (const key in conf) {
				if ("undefined" !== typeof format[key]) {
					conf[key] = format[key];
				}
			}
		} else if (format) {
			conf.align = -1 !== format.indexOf("right") ? "right" : "left";
		}

		col.len = Math.max(col.len || 0, length);
		col.align = conf.align;

		if (conf.len > 0) {
			col.len = Math.min(col.len, conf.len);
		}

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

	const parsed = [];
	let rowId = 0;

	function addRow() {
		rowId++;
		parsed[rowId] = [];
		for (let i = 0; i < cols.length; i++) {
			parsed[rowId][i] = "";
		}
	}

	function setCol(colId, value) {
		if (colId >= 0 && colId < cols.length) {
			parsed[rowId][colId] = value.toString();
		}
	}

	function alignCell(colId, value) {
		if (colId < 0 || colId >= cols.length) {
			return "";
		}

		// Align the value.
		const align = cols[colId].align;
		const size = cols[colId].len;
		const space = Math.max(0, size - value.length);

		if ("right" === align) {
			value = " ".repeat(space) + value;
		} else {
			value += " ".repeat(space);
		}

		return value;
	}

	data.map((row) => {
		let splitLines = [];
		addRow();

		for (let i = 0; i < cols.length; i++) {
			let value = (row[i] || "").toString();

			// Add line breaks when needed.
			const maxLen = cols[i].len;

			if (value.length > maxLen) {
				const split = [];
				const words = value.split(" ");
				let subLine = "";

				while (words.length) {
					const word = words.shift();
					if (subLine.length + word.length < maxLen) {
						if (subLine.length) {
							subLine += " ";
						}
						subLine += word;
					} else {
						split.push(subLine);
						subLine = word;
					}
				}
				if (subLine) {
					split.push(subLine);
				}

				value = split.shift();

				for (let l = 0; l < split.length; l++) {
					if (!splitLines[l]) {
						splitLines[l] = [];
					}
					splitLines[l][i] = split[l];
				}
			}

			setCol(i, value);

			// Add sub-lines that were generated by splitting long tex
			for (let l = 0; l < splitLines.length; l++) {
				addRow();
				setCol(i, splitLines[l][i]);
			}
		}
	});

	parsed.map((row) => {
		const line = [];

		for (let i = 0; i < cols.length; i++) {
			line.push(alignCell(i, row[i]));
		}

		lines.push("  " + line.join("  |  ") + "  ");
	});

	return lines.join("\n");
}
