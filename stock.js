// Built upon u/pwillia7 's stock script.
// u/ferrus_aub stock script using simple portfolio algorithm.
// @see https://www.reddit.com/r/Bitburner/comments/rn7l84/stock_script_to_end_your_financial_problems/

/**
 * Automated stock trader. Requires all Stock Trading APIs (TIX and 4S)
 *
 * Forecast toggles between bull and bear mode in a regular interval.
 * There's no fast changes between both states, and the forecast stays
 * rather static in either state:
 *
 * 0.7         ........      ........             ++   bull
 * 0.6         .      .      .      .             +
 * 0.5   - - - . - - -.- - - . - - -.- - - -
 * 0.4         .      .      .      .             -
 * 0.3   .......      ........      ........      --   bear
 *
 *             ^      ^      ^      ^
 *             |      |      |      |
 *             |      +------|------+----- sell when price is at peak
 *             |             |
 *             + ------------+------------ buy when price is low
 *
 * One stock will always toggle between the same level during one
 * game, and reset only when augmentations are installed.
 *
 *
 * @param {NS} ns
 */
export async function main(ns) {
	// Remembers the forecast that the stock had in the
	// previous interval.
	const history = {};

	// Decide on an action to take for a specific stock
	// symbol based on the history data.
	const stockAction = {};

	// Max percentage of shares to buy in one interval.
	// 1.0 = 100%
	const maxSharePercent = 1.0;

	// Requires forecast level that a stock requires to be
	// purchased. Must be greater than 0.5.
	const minForecast = 0.6;

	// Maximum volatility of a stock to be considered.
	const maxVolatility = 0.1;

	// Minimum number of shares to buy in one order.
	const minOrderVolume = 5;

	// Keep 1b in cash reserves
	const OneBil = 1000 * 1000 * 1000;
	const moneyKeep = 1 * OneBil;

	ns.disableLog("disableLog");
	ns.disableLog("sleep");
	ns.disableLog("getServerMoneyAvailable");
	ns.clearLog();

	// First get a list of relevant stocks. Because a symbol
	// always keeps the same forecast level throughout one round
	// we can calculate a list of relevant stocks right now and
	// only monitor those stocks.
	const stocks = ns.stock
		.getSymbols()
		.filter(
			(symbol) =>
				Math.abs(ns.stock.getForecast(symbol) - 0.5) + 0.5 >=
					minForecast &&
				ns.stock.getVolatility(symbol) <= maxVolatility
		);

	ns.tprint(
		`\nMonitoring the following stock symbols:\n${stocks.join(", ")}\n`
	);

	while (true) {
		for (const symbol of stocks) {
			const price = Math.ceil(ns.stock.getAskPrice(symbol));
			const forecast = ns.stock.getForecast(symbol);

			if (history[symbol]) {
				const position = ns.stock.getPosition(symbol);
				const prev = history[symbol];
				const bull2bear = forecast < 0.5 && prev.forecast > 0.5;
				const bear2bull = forecast > 0.5 && prev.forecast < 0.5;
				const meanPrice = Math.floor(
					(prev.maxPrice + prev.minPrice) / 2
				);

				// Sell all shares when the stock changes from bull to
				// bear mode (i.e. from "++" to "--").
				if (bull2bear) {
					ns.print(`${symbol} | SELL | Bull to bear`);
					if (position[0]) {
						ns.stock.sell(symbol, position[0]);
					}
				}

				// Start buying when the stock changes from bear to bull
				// mode (i.e. from "--" to "++"). We assume that the
				// price is near the bottom of the possible range now.
				if (bear2bull) {
					ns.print(`${symbol} | START BUYING | Bear to bull`);
					stockAction[symbol] = "buy";
				}

				// We continue to buy stock, while the current price is
				// lower than the mean between highest and lowest known
				// ask price for that symbol.
				if (stockAction[symbol] === "buy") {
					console.log("Buy?", symbol, price, meanPrice, prev);
					if (price <= meanPrice) {
						buyPositions(symbol);
					} else {
						ns.print(
							`${symbol} | STOP BUYING | Ask price too high | ${price} > ${meanPrice}`
						);
						stockAction[symbol] = "";
					}
				}
			} else {
				history[symbol] = {
					forecast: forecast,
					minPrice: price,
					maxPrice: price,
				};
			}

			history[symbol].forecast = forecast;
			history[symbol].minPrice = Math.min(
				price,
				history[symbol].minPrice
			);
			history[symbol].maxPrice = Math.max(
				price,
				history[symbol].maxPrice
			);
		}

		await ns.sleep(500);
	}

	// Calculate number of possible shares to buy and place the order.
	function buyPositions(symbol) {
		const position = ns.stock.getPosition(symbol);
		const maxShares =
			ns.stock.getMaxShares(symbol) * maxSharePercent - position[0];
		const askPrice = ns.stock.getAskPrice(symbol);
		const playerMoney = ns.getServerMoneyAvailable("home");
		const freeMoney = playerMoney - moneyKeep - 100000;
		const orderVolume = Math.min(
			Math.floor(freeMoney / askPrice),
			maxShares
		);

		if (orderVolume > 0) {
			ns.stock.buy(symbol, orderVolume);
		}
	}
}
