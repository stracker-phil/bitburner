export async function main(ns) {
	let pos = ns.stock.getStockPosition("FSIG"); //defines an usable array for stocks
	let shares = pos[0]; // gets the total amount of shares
	let avgPriPerStock = pos[1]; //gets AvgPricePerStock

	//the above pos arrays are only defined because it was easier to explain and keep track of
	while (true) {
		pos = ns.stock.getStockPosition("FSIG"); //this is so the pos array gets updated and shows appropriate amounts every loop
		ns.getServerMoneyAvailable("home"); //just cause, this wont print to terminal
		ns.stock.getStockPrice("FSIG"); // same reason as getServerMoneyAvailable
		ns.tprint("you own " + pos[0] + " shares from FSIG."); // shows how many
		ns.tprint("total stocks average value ammounts to: " + pos[0] * pos[1]);

		if (
			ns.getServerMoneyAvailable("home") > 100000000000 &&
			ns.stock.getStockPrice("FSIG") < 1700000
		) {
			ns.stock.buyStock("FSIG", 20);
			ns.tprint("bought 20 stocks in FSIG");
			ns.tprint("stocks owned: " + pos[0]);
			//this block will buy 20 stocks if you have both more than 100b and the FSIG stock price is under 1.700m
			//PLEASE READ: if you get a spam of alot of stocks being bought this is ok!
			//This Script is designed to be profitable and make you moola, I have tested this myself.
			//if you notice anything that can be improved upon or messes up tell me!
		}
		if (ns.stock.getStockPrice("FSIG") > 1900000) {
			ns.stock.sellStock("FSIG", pos[0]);
			profit = pos[0] * (ns.stock.getStockPrice("FSIG") - 1900000); //simple math to get the aproximate profit you earned from selling.
			ns.tprint("you gained: " + profit);
			//if you want you can add a sleep(30000); here
		}
	}
}
