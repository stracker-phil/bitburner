export async function main(ns) {
	if (ns.args[1] > 0) {
		await ns.sleep(ns.args[1]);
	}

	await ns.weaken(ns.args[0], {stock: true});
}
