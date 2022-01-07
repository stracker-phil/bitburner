/**
 * Reads data from the config file and returns
 * the full config object.
 */
export function getConfig(ns) {
	const raw = ns.read('data.config');
	const def = {
		target: '',
		autoPick: true,
		boundSec: 4,
		boundMoney: 0.6,
		weaken: 0.6,
		grow: 0.4,
	};

	if (raw) {
		try {
			const config = JSON.parse(raw);
			const result = {};

			for (const key in def) {
				if ('undefined' !== typeof config[key]) {
					result[key] = config[key];
				} else {
					result[key] = def[key];
				}
			}

			return result;
		} catch (ex) {
			console.error('Cannot parse data.config file!', ex.message);
		}
	}

	return def;
}

/**
 * Save the updated config data.
 */
export async function setConfig(ns, config) {
	await ns.write('data.config', JSON.stringify(config), 'w');
}

/**
 * Returns a list of all known remote servers with
 * current stats.
 */
export function findAllServers(ns) {
	const servers = {};

	function scanServers(host, route) {
		if (!route) {
			route = [];
		}
		const serverRoute = [...route, host];

		ns.scan(host)
			.filter(name => name !== 'home' && !servers[name])
			.forEach(name => {
				servers[name] = {
					distance: route.length,
					route: serverRoute,
					...ns.getServer(name)
				};

				scanServers(name, [...serverRoute]);
			});

		return servers;
	}

	return scanServers('home');
}

/**
 * Returns some details about the current player.
 */
export function getPlayerStats(ns) {
	const stats = ns.getPlayer();
	return stats;
}

/**
 * Outputs a terminal message with a timestamp.
 */
export function say(ns, ...msg) {
	ns.tprint(`${timestamp()} | ${msg.join(' | ')}`);
}

/**
 * Outputs a log message with a timestamp.
 */
export function log(ns, ...msg) {
	ns.print(`${timestamp()} | ${msg.join(' | ')}`);
}

/**
 * Returns a formatted timestamp, for logging.
 */
export function timestamp() {
	return new Date().toISOString().substr(11, 8);
};

/**
 * IDEA: Use localStorage for data transfer.
 */
export function getItem(key) {
	let item = localStorage.getItem(key);

	return item ? JSON.parse(item) : undefined;
}

export function setItem(key, value) {
	localStorage.setItem(key, JSON.stringify(value));
}