import * as Attack from "test/lib-attack.js";

/** @param {NS} ns **/
export async function main(ns) {
	const res = Attack.run(ns, "home", "n00dles", 0, 0);
	console.log(res);
}
