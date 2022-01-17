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

	// Information on whether to purchase a given stock.
	const buyStock = {};

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

	while (true) {
		const stocks = ns.stock
			.getSymbols()
			.sort((a, b) => ns.stock.getForecast(b) - ns.stock.getForecast(a));

		for (const symbol of stocks) {
			const price = Math.ceil(ns.stock.getAskPrice(symbol));
			const bidPrice = Math.ceil(ns.stock.getBidPrice(symbol));
			const forecast = ns.stock.getForecast(symbol);
			const volatility = ns.stock.getVolatility(symbol);
			const range = 0.5 + Math.abs(forecast - 0.5);

			if (history[symbol]) {
				const position = ns.stock.getPosition(symbol);
				const prev = history[symbol];

				// Sell all shares when the stock changes from bull to
				// bear mode (i.e. from "++" to "--").
				if (position[0] && forecast < 0.5) {
					const value = position[0] * bidPrice - 100000;
					const profit = position[0] * position[1] - value;
					ns.print(
						`${symbol} | SELL @ ${bidPrice} | Profit ${profit.toLocaleString()}`
					);
					ns.stock.sell(symbol, position[0]);
				}

				// Start buying when the stock changes from bear to bull
				// mode (i.e. from "--" to "++"). We assume that the
				// price is near the bottom of the possible range now.
				if (forecast > 0.5 && prev.forecast < 0.5) {
					// Perform limit checks (min-forecast and max volatility)
					if (volatility <= maxVolatility && range >= minForecast) {
						buyStock[symbol] = price * 1.1;

						ns.print(
							`${symbol} | START BUYING | Max price: ${buyStock[
								symbol
							].toFixed(2)}`
						);
					} else {
						// Too volatile or too insecure: Do not buy this stock
						buyStock[symbol] = 0;
					}
				}

				// We continue to purchase stock shares until a calculated
				// price limit is reached.
				if (buyStock[symbol] && price <= buyStock[symbol]) {
					ns.print(`${symbol} | BUY @ ${price}`);
					buyPositions(symbol);
				}
			} else {
				history[symbol] = {
					forecast: forecast,
				};
			}

			history[symbol].forecast = forecast;
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
