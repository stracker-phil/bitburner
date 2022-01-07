import * as Common from 'common.js';

/** 
 * Control script that runs in a single thread on the
 * "home" server to distribute the current config 
 * file among all remote worker servers.
 * 
 * Usage:
 * 
 * Control this script via 
 * > master --start
 * > master --stop
 * 
 * @param {NS} ns
 */
export async function main(ns) {
	// Default sync interval. Can be set via config file.
	let syncInterval = 15000;

	while (true) {
		const servers = Common.findAllServers(ns);
		const config = Common.getConfig(ns);

		if (config && servers) {
			const keys = Object.keys(servers);
			Common.log(ns, `Sync config with ${keys.length} servers`);

			for (let i = 0; i < keys.length; i++) {
				const server = servers[keys[i]];

				await syncTarget(ns, server.hostname, config);
			}
		} else {
			Common.log(ns, `Could not sync (servers/config not found)`);
		}

		if (config && config.syncInterval && !isNaN(config.syncInterval)) {
			syncInterval = parseInt(config.syncInterval);
		}

		syncInterval = Math.max(5000, syncInterval);

		await ns.sleep(syncInterval);
	}
}

/**
 * Tries to send the given instructions to the
 * specified target server.
 * 
 * @param {string} target - The target server name.
 * @param {object} config - The config file to send.
 * @return {bool} True on success, false on failure.
 */
async function syncTarget(ns, target, config) {
	const data = JSON.stringify(config);
	const info = analyzeTarget(ns, target);
	let success = false;

	// Remote scripts not installed. Skip this host.
	if (!info.installed || info.ramMax < info.ramNeed) {
		return success;
	}

	if (info.ramFree >= info.ramNeed) {

		/**
		 * Scripts installed and sufficient RAM 
		 * to send data.
		 */

		success = sendData(ns, target, data);
	} else {

		/* 
		 * If the server has sufficient RAM, but it's all 
		 * used by other processes, then kill those
		 * tasks and spawn them again after our command
		 * was sent.
		 */

		// Kill all current jobs on the server.
		ns.killall(target);

		// Send our command.
		success = sendData(ns, target, data);

		// Restart all tasks on the remote server.
		info.jobs.forEach(job => {
			ns.exec(job.filename, target, job.threads, ...job.args);
		});
	}

	return success;
}

/**
 * Tries to contact the remote server with the new
 * configuration details.
 * 
 * @param {string} target - The target server name.
 * @param {string} data - The payload to send.
 * @return {bool} True on success, false on failure.
 */
function sendData(ns, target, data) {
	const pid = ns.exec('ctrl.js', target, 1, data);
	return 0 !== pid;
}

/**
 * Analyzes the remote server to determine, if the 
 * ctrl.js script can be executed.
 */
function analyzeTarget(ns, target) {
	const info = {
		// Whether the remote ctrl.js is installed.
		installed: ns.fileExists('ctrl.js', target),
		// Max available RAM.
		ramMax: ns.getServerMaxRam(target),
		// Currently used RAM.
		ramUsed: ns.getServerUsedRam(target),
		// Free (available) RAM. Calculated below.
		ramFree: 0,
		// RAM needed for the ctrl.js script.
		ramNeed: ns.getScriptRam('ctrl.js', target),
		// List of processes that are running on the server.
		jobs: ns.ps(target)
	};

	info.ramFree = info.ramMax - info.ramUsed;

	return info;
}