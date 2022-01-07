/** 
 * Distributed control script to configure the
 * current worker node on-the-fly.
 * 
 * This script modifies the data.config file,
 * which is frequently parsed by the work.js script
 * to determine the next action to take.
 * 
 * Usage:
 * 
 *   This script is distributed by "master.js" and
 *   invoked by "sync.js" on demand.
 * 
 * @param {NS} ns 
 */
export async function main(ns) {
    if (!ns.args.length) {
        console.error('Config sync failed: Missing data')
        return;
    }

    const rawConfig = ns.args[0];
    if (!rawConfig) {
        console.error('Config sync failed: Empty config string')
        return;
    }

    try {
        const config = JSON.parse(rawConfig);
        await ns.write('data.config', JSON.stringify(config), 'w');
    } catch (ex) {
        console.error('Config sync failed: Invalid config string', rawConfig)
        return;
    }
}