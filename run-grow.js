/** @param {NS} ns **/
export async function main(ns) {
	const target = ns.args[0];
	const delay = ns.args[1];

	if (delay && delay > 0) {
		await ns.sleep(delay);
	}

	ns.print(`Starting operation: grow on ${target}`);
	await ns.grow(target, { stock: true });
}
