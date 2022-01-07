/** 
 * Distributed worker script to hack a common (remote)
 * target server. The target is chosen by a more advanced
 * analytics script on "home", and shared with worker 
 * nodes via the localStorage API.
 * 
 * We want to keep the RAM usage of this script as low
 * as possible, so we can spawn a maximum number of
 * concurrent threads.
 * 
 * For minimum RAM consumption, this script dispenses
 * some sanitiy checks, like "fileExists()".
 * 
 * Max. RAM usage of this script: 1.75GB
 * 
 * @param {NS} ns 
 */
export async function main(ns) {
	while (true) {
		await performTask(ns);
	}
}

/**
 * Reads data from the config file and returns
 * the full config object.
 */
function getConfig(ns) {
	const raw = ns.read('data.config');
	const def = {
		target: 'n00dles',
		weaken: 0.6,
		grow: 0.4,
	};

	if (raw) {
		try {
			const config = JSON.parse(raw);
			return { ...def, ...config };
		} catch (ex) {
			console.error('Cannot parse data.config file!', ex.message);
		}
	}

	return def;
}

/**
 * Runs the attack task against a server that 
 * is defined in the config file:
 * 
 * hack, grow, weaken
 */
async function performTask(ns) {
	const config = getConfig(ns);
	const target = config.target;
	const pctWeaken = Math.random();
	const pctGrow = Math.random();

	ns.print([
		`Target [${target}]`,
		`Weaken [${config.weaken.toFixed(3)} ${pctWeaken <= config.weaken ? 'yes' : 'no'}]`,
		`Grow [${config.grow.toFixed(3)} ${pctGrow <= config.grow ? 'yes' : 'no'}]`
	].join(' | '));

	if (pctWeaken <= config.weaken) {
		await ns.weaken(target);
	} else if (pctGrow <= config.grow) {
		await ns.grow(target);
	} else {
		await ns.hack(target);
	}
}