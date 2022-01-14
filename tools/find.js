import * as Common from "lib/common.js";
import * as Server from "lib/server.js";

export async function main(ns) {
	const args = ns.flags([
		["help", false],
		["tree", false],
		["connect", false],
	]);

	if (!ns.args.length || args.help) {
		ns.tprint(
			"This script helps you find a server on the network and shows you the path to get to it."
		);
		ns.tprint(
			`Usage: run ${ns.getScriptName()} [--tree] [--connect] KEYWORD [KEYWORD2 ...]`
		);
		ns.tprint("Example:");
		ns.tprint(`> run ${ns.getScriptName()} n00dles`);
		ns.tprint(`> run ${ns.getScriptName()} --tree run`);
		ns.tprint(`> run ${ns.getScriptName()} --connect avmi`);
		return;
	}

	const terms = args._;
	const matches = [];
	const table = [];
	const details = [];

	await Server.initialize(ns);
	details.push(`\n- - - - - - - - - - - - - - - - - - - -`);
	details.push(`  Locating "${terms.join('", "')}" ...`);
	details.push(`- - - - - - - - - - - - - - - - - - - -\n`);

	async function locateServers(term) {
		term = term.toLowerCase();

		await Server.all((server) => {
			if (-1 !== matches.indexOf(server.hostname)) {
				return;
			}

			const host = server.hostname.toLowerCase();

			if (-1 !== host.indexOf(term)) {
				matches.push(server.hostname);
			}
		});
	}

	function showResult(host) {
		const server = Server.get(host);

		if (args.tree) {
			details.push(`${host}`);
			details.push(`${"-".repeat(host.length)}`);
			details.push(`  ${server.formatRoute(2)}`);
			details.push("\nConnection command:");
			details.push("  " + server.cmdConnect());
			details.push(`- - - - - - - - - - - - - - - - - - - -`);
		} else {
			table.push([host, server.route.join(" > ")]);
		}
	}

	for (let i = 0; i < terms.length; i++) {
		const term = terms[i];
		await locateServers(term);
	}

	matches
		.sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
		.forEach((host) => {
			showResult(host);
		});

	if (table.length) {
		details.push(
			Common.printF(table, ["Server", "Path"], [null, { len: 100 }])
		);
	}

	if (args.connect) {
		if (1 === matches.length) {
			const server = Server.get(matches[0]);
			const route = server.route.slice(1);

			// TODO: requires SF4.1
			/*
			for (let i = 0; i<route.length; i++) {
				 ns.connect(route[i]);
			}
			*/

			details.push("\n> connect " + route.join(";connect "));
		} else if (!matches.length) {
			details.push(
				"\n  Could not find a matching server, please adjust your search terms\n"
			);
		} else {
			details.push(
				"\n  Multiple matches found, please refine your search to enable auto-connect.\n"
			);
		}
	}

	ns.tprint(`${details.join("\n")}\n\n`);
}

export function autocomplete(data, args) {
	return data.servers;
}
