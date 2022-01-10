/** @param {NS} ns **/
export async function main(ns) {
	const target = ns.args[0];
	const delay = ns.args[1];

	if (delay && delay > 0) {
		await ns.sleep(delay);
	}

	ns.print(`Starting operation: hack on ${target}`);
	const profit = await ns.hack(target, { stock: true });
	await ns.writePort(1, profit);
}
