// Built upon u/pwillia7 's stock script.
// u/ferrus_aub stock script using simple portfolio algorithm.
// @see https://www.reddit.com/r/Bitburner/comments/rn7l84/stock_script_to_end_your_financial_problems/

/** @param {NS} ns **/
export async function main(ns) {
	const maxSharePer = 1.0;
	const stockBuyPer = 0.6;
	const stockVolPer = 0.05;
	const moneyKeep = 10000000;
	const minSharePer = 5;

	ns.disableLog("disableLog");
	ns.disableLog("sleep");
	ns.disableLog("getServerMoneyAvailable");
	ns.clearLog();

	while (true) {
		const stocks = ns.stock
			.getSymbols()
			.sort((a, b) => ns.stock.getForecast(b) - ns.stock.getForecast(a));

		for (const stock of stocks) {
			const position = ns.stock.getPosition(stock);

			if (position[0]) {
				sellPositions(stock);
			}
			buyPositions(stock);
		}

		await ns.sleep(6000);
	}

	function buyPositions(stock) {
		const maxShares =
			ns.stock.getMaxShares(stock) * maxSharePer - position[0];
		const askPrice = ns.stock.getAskPrice(stock);
		const forecast = ns.stock.getForecast(stock);
		const volPer = ns.stock.getVolatility(stock);
		const playerMoney = ns.getServerMoneyAvailable("home");

		if (forecast >= stockBuyPer && volPer <= stockVolPer) {
			if (
				playerMoney - moneyKeep >
				ns.stock.getPurchaseCost(stock, minSharePer, "Long")
			) {
				const shares = Math.min(
					(playerMoney - moneyKeep - 100000) / askPrice,
					maxShares
				);

				ns.stock.buy(stock, shares);
			}
		}
	}

	function sellPositions(stock) {
		const forecast = ns.stock.getForecast(stock);

		if (forecast < 0.5) {
			ns.stock.sell(stock, position[0]);
		}
	}
}
