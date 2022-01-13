import * as Common from "lib/common.js";

// Minimum cash to keep
const minimumCash = 50000000;

let tradeLog = [];
let totalExpense = 0;
let totalIncome = 0;
let stockSymbols = [];

/**
 * This day-trader script buys/sells stock at a fast rate with
 * a low profit margin.
 * 
 * Needs more testing!
 *
 * @param {*} ns
 */
export async function main(ns) {
	tradeLog = [];
	totalIncome = 0;
	totalExpense = 0;
	stockSymbols = ns.stock.getSymbols();

	ns.disableLog("ALL");

	while (true) {
		for (const stock of stockSymbols) {
			// Forecast values:
			//  0.35 means: 35 % of increase / 65% decrease
			//  0.61 means: 61 % of increase / 39% decrease
			//
			//  0.60 - 1.00  ++
			//  0.50 - 0.59   +
			//  0.40 - 0.49   -
			//  0.00 - 0.39  --
			const forecast = ns.stock.getForecast(stock);
			const bidPrice = ns.stock.getBidPrice(stock);
			const askPrice = ns.stock.getAskPrice(stock);
			const position = ns.stock.getPosition(stock);
			const profitMargin = 300000;

			if (position[0]) {
				// We have shares of this stock. Should we sell now?
				const buyValue = position[0] * position[1];
				const sellValue = position[0] * bidPrice;
				const profit = sellValue - buyValue;

				if (profit > profitMargin) {
                    // Sell all when we make profit.
					sellStock(ns, stock);
				} else if (askPrice < position[1] * 0.99) {
                    // Buy when the price dropped by 1%.
					buyStock(ns, stock);
				}
			} else {
				// We do not own any shares. Should be buy now?
				if (forecast >= 0.55) {
					buyStock(ns, stock);
				}
			}
		}

		showLog(ns);
		await ns.sleep(2000);
	}
}

function buyStock(ns, stock) {
	const stockPrice = ns.stock.getAskPrice(stock);

	const playerMoney = ns.getServerMoneyAvailable("home") - minimumCash;

	const position = ns.stock.getPosition(stock);
	const ownedShares = position[0];

	const maxSpend = playerMoney * 0.1;
	const calcShares = maxSpend / stockPrice;
	const maxShares = ns.stock.getMaxShares(stock);
	const availableShares = maxShares - ownedShares;

	const shares = Math.min(calcShares, availableShares, maxShares / 20);

	if (shares < 1) {
		return;
	}

	ns.stock.buy(stock, shares);
	totalExpense += stockPrice * shares;

	tradeLog.push({
		time: Date.now(),
		action: "buy",
		sym: stock,
		vol: shares,
		rate: stockPrice,
	});
}

function sellStock(ns, stock) {
	const position = ns.stock.getPosition(stock);
	const shares = position[0];

	const salePrice = ns.stock.sell(stock, shares);

	if (0 !== salePrice) {
		totalIncome += salePrice * shares;

		tradeLog.push({
			time: Date.now(),
			action: "sell",
			sym: stock,
			vol: shares,
			rate: salePrice,
		});
	}
}

function showLog(ns) {
	let portfolioValue = 0;

	while (tradeLog.length > 100) {
		tradeLog.shift();
	}

	ns.clearLog();

	// Portfolio list
	//
	const portfolioHead = [
		"Symbol",
		"Shares",
		"Buy Rate",
		"Curr Rate",
		"",
		"Curr Profit",
	];
	const portfolioFormat = ["left", "right", "right", "right", "right"];
	const portfolioData = [];

	for (const stock of stockSymbols) {
		const pos = ns.stock.getPosition(stock);

		if (pos[0] > 0) {
			const bidPrice = ns.stock.getBidPrice(stock);
			portfolioValue += bidPrice * pos[1];

			portfolioData.push([
				stock,
				Math.floor(pos[0]).toLocaleString(),
				Common.formatMoney(ns, pos[1]),
				Common.formatMoney(ns, bidPrice),
				pos[1] > bidPrice ? "▼ " : " ▲",
				(100 * (bidPrice / pos[1])).toFixed(2) + "%",
			]);
		}
	}

	// Script performance
	//
	const summaryHead = [
		"Expense",
		"Stock Value",
		"Income",
		"Profit",
		"Performance",
	];
	const summaryFormat = ["right", "right", "right", "right", "right"];
	const summaryData = [];
	const currIncome = totalIncome + portfolioValue;

	summaryData.push([
		Common.formatMoney(ns, totalExpense),
		Common.formatMoney(ns, portfolioValue),
		Common.formatMoney(ns, totalIncome),
		Common.formatMoney(ns, currIncome - totalExpense),
		totalExpense < 1
			? "-"
			: ((currIncome / totalExpense - 1) * 100).toFixed(2) + "%",
	]);

	// Trade history
	//
	const tradeHead = ["Time", "Action", "Symbol", "Volume", "Price"];
	const tradeFormat = ["left", "left", "left", "right", "right"];
	const tradeData = [];

	// Trade log.
	for (let i = 0; i < tradeLog.length; i++) {
		const item = tradeLog[i];
		const date = new Date(item.time);

		tradeData.unshift([
			date.toLocaleString().substr(-8),
			"sell" === item.action ? "◀︎  SELL" : " ▶︎ BUY",
			item.sym,
			Math.floor(item.vol).toLocaleString(),
			Common.formatMoney(ns, item.rate),
		]);
	}

	ns.print(
		`\n${Common.printF(
			summaryData,
			summaryHead,
			summaryFormat
		)}\n\nPortfolio:\n\n${Common.printF(
			portfolioData,
			portfolioHead,
			portfolioFormat
		)}\n\nTrades:\n\n${Common.printF(tradeData, tradeHead, tradeFormat)}\n`
	);
}
