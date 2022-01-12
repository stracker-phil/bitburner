import * as Common from "lib/common.js";

/** @param {NS} ns **/
export async function main(ns) {
	const attack = ns.args[0] || "hack";
	const target = ns.args[1] || "n00dles";

	ns.tprint(`Start measuring ${attack} on ${target} ...`)
    if ("hack" === attack) {
		await ns.hack(target);
	} else if ("grow" === attack) {
		await ns.grow(target);
	} else if ("weaken" === attack) {
		await ns.weaken(target);
	}
	ns.tprint(`Finished ${attack} on ${target}`)

    // Wait for a few seconds, so the master script has 
    // time to read script income, etc
    await ns.sleep(60000);
}