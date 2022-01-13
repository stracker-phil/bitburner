import * as Common from "lib/common.js";

// Stock market bot for bitburner, written by steamid/Meng- https://danielyxie.github.io/bitburner/ - [github.io]
// Runs infinitely - buys and sells stock, hopefully for a profit...
// version 1.21 - Added check for max stocks, cleaned things up a bit, cycle complete prints less frequently

let tradeLog = [];

let portfolio = [];

const profitMargin = 1.1; // Sell, when the stock price reaches this percentage (compared to buy price)
const forecastThresh = 0.64; // Buy above this confidence level (0.50-0.59 is "+" / 0.60+ is "++")
const minimumCash = 50000000; // Minimum cash to keep

let totalExpense = 0;
let totalIncome = 0;

export async function main(ns) {
	tradeLog = [];
	portfolio = [];
	totalIncome = 0;
	totalExpense = 0;

	ns.disableLog("sleep");
	ns.disableLog("getServerMoneyAvailable");
	ns.clearLog();

	const stockSymbols = ns.stock.getSymbols();

	// Finds and adds any stocks we already own.
	for (const stock of stockSymbols) {
		const pos = ns.stock.getPosition(stock);
		if (pos[0] > 0) {
			portfolio.push({ sym: stock, value: pos[1], shares: pos[0] });
			totalExpense += pos[1] * pos[0];
		}
	}

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
			const askPrice = ns.stock.getAskPrice(stock);
			const posIndex = portfolio.findIndex((obj) => obj.sym === stock);

			// Check existing portfolio.
			if (posIndex !== -1) {
				const item = portfolio[posIndex];

				if (askPrice >= item.value * profitMargin) {
					// Sell if we have enough profit.
					sellStock(ns, stock);
				} else if (forecast < 0.42) {
					// Damage control: Dump the position when it becomes worthless.
					sellStock(ns, stock);
				}
			}

			// Check symbols that are not in portfolio.
			if (forecast >= forecastThresh) {
				// if the forecast is better than threshold and we don't own then BUY
				buyStock(ns, stock);
			}
		}

		showLog(ns);
		await ns.sleep(2500);
	}
}

function showLog(ns) {
	const stockSymbols = ns.stock.getSymbols();
	const portfolio = [];

	// Finds and adds any stocks we already own.
	for (const stock of stockSymbols) {
		let pos = ns.stock.getPosition(stock);
		if (pos[0] > 0) {
			portfolio.push({ sym: stock, value: pos[1], shares: pos[0] });
		}
	}

	const summaryHead = ["Expense", "Income", "Profit", "Performance"];
	const summaryFormat = ["right", "right", "right", "right"];
	const summaryData = [];

	const portfolioHead = [
		"Symbol",
		"Shares",
		"Total Val",
		"Curr Sale Val",
		"Curr Profit",
	];
	const portfolioFormat = ["left", "right", "right", "right", "right"];
	const portfolioData = [];

	const tradeHead = [
		"Time",
		"Action",
		"Symbol",
		"Shares",
		"Buy/Share",
		"Sell/Share",
		"Profit",
	];
	const tradeFormat = [
		"left",
		"left",
		"left",
		"right",
		"right",
		"right",
		"right",
	];
	const tradeData = [];

	while (tradeLog.length > 50) {
		tradeLog.shift();
	}

	// Portfolio list.
	for (let i = 0; i < portfolio.length; i++) {
		const item = portfolio[i];
		const sellPrice = ns.stock.getBidPrice(item.sym);
		const totalValue = item.shares * item.value;
		const saleValue = sellPrice * item.shares;
		const profit = saleValue - totalValue;
		let profitPct = (
			"     " +
			((100 * profit) / totalValue).toFixed(2) +
			"%"
		).slice(-7);

		portfolioData.push([
			item.sym,
			Math.floor(item.shares).toLocaleString(),
			Common.formatMoney(ns, totalValue),
			Common.formatMoney(ns, saleValue),
			`${Common.formatMoney(ns, profit)} | ${profitPct}`,
		]);
	}

	// Trade log.
	for (let i = 0; i < tradeLog.length; i++) {
		const item = tradeLog[i];

		if ("buy" === item.action && item.shares < 1) {
			continue;
		}

		const date = new Date(item.time);
		const shareSign = "buy" === item.action ? "+" : "-";
		let profitCol = "";
		let sellCol = "";

		if ("sell" === item.action) {
			const buyValue = item.shares * item.buyValue;
			const sellValue = item.shares * item.sellVal;
			const profit = sellValue - buyValue;
			let profitPct = (
				"     " +
				((sellValue / buyValue - 1) * 100).toFixed(2) +
				"%"
			).slice(-7);

			sellCol = Common.formatMoney(ns, item.sellVal);
			profitCol = `${Common.formatMoney(ns, profit)} | ${profitPct}`;
		}

		tradeData.unshift([
			date.toLocaleString().substr(-8),
			item.action.toUpperCase(),
			item.sym,
			shareSign + Math.floor(item.shares).toLocaleString(),
			Common.formatMoney(ns, item.buyVal),
			sellCol,
			profitCol,
		]);
	}

	summaryData.push([
		Common.formatMoney(ns, totalExpense),
		Common.formatMoney(ns, totalIncome),
		Common.formatMoney(ns, totalIncome - totalExpense),
		((totalIncome / totalExpense - 1) * 100).toFixed(2) + "%",
	]);

	ns.clearLog();

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

function buyStock(ns, stock) {
	// Get the stock price
	const stockPrice = ns.stock.getAskPrice(stock);

	// calculate the shares to buy using StockBuyQuantCalc
	const shares = stockBuyQuantCalc(ns, stockPrice, stock);

	if (shares < 1) {
		return;
	}

	if (ns.stock.getVolatility(stock) <= 0.05) {
		// if volatility is < 5%, buy the stock
		ns.stock.buy(stock, shares);

		tradeLog.push({
			action: "buy",
			time: Date.now(),
			sym: stock,
			shares: shares,
			sellVal: 0,
			buyVal: stockPrice,
		});

		totalExpense += stockPrice * shares;

		portfolio.push({ sym: stock, value: stockPrice, shares: shares });
	}
}

function sellStock(ns, stock) {
	const position = ns.stock.getPosition(stock);
	const forecast = ns.stock.getForecast(stock);
	const posIndex = portfolio.findIndex((obj) => obj.sym === stock);

	if (-1 === posIndex) {
		return;
	}

	const item = portfolio[posIndex];

	// Only sell, when the forecast is too pessimistic.
	if (forecast < 0.55) {
		const value = ns.stock.sell(stock, position[0]);

		if (value !== 0) {
			// Remove the stock from portfolio
			portfolio.splice(posIndex, 1);

			tradeLog.push({
				action: "sell",
				time: Date.now(),
				sym: stock,
				shares: item.shares,
				buyVal: item.buyVal,
				sellVal: value,
			});

			totalIncome += value * item.shares;
		}
	}
}

// Calculates how many shares to buy.
function stockBuyQuantCalc(ns, stockPrice, stock) {
	const playerMoney = ns.getServerMoneyAvailable("home") - minimumCash;
	const position = ns.stock.getPosition(stock);
	const ownedShares = position[0];

	const maxSpend = playerMoney * 0.25;
	const calcShares = maxSpend / stockPrice;
	const maxShares = ns.stock.getMaxShares(stock) - ownedShares;

	return Math.min(calcShares, maxShares);
}
