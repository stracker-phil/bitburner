/** @param {NS} ns **/
export async function main(ns) {
	const target = ns.args[0];
	const threads = ns.args[1];
	const delay = ns.args[2];

	if (delay && delay > 0) {
		await ns.sleep(delay);
	}

	ns.print(`Starting operation: hack on ${target} in ${threads} threads`);
	const profit = await ns.hack(target, { threads, stock: true });
	await ns.writePort(1, profit);
	ns.exit();
}
