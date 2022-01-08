import * as Common from "lib/common.js";
import * as Server from "lib/server.js";
import * as Player from "lib/player.js";

/**
 * @param {NS} ns
 */
export async function main(ns) {
	Common.say(ns, "Test is working");

	await Server.initialize(ns);
	const home = Server.get("home");
	const player = Player.get(ns);

	console.log("Player:", player);
	console.log("Home: ", home);
}
