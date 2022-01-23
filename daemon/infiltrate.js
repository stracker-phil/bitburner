const state = {
	// Name of the company that's infiltrated.
	company: "",

	// Whether infiltration started. False means, we're
	// waiting to arrive on the infiltration screen.
	started: false,

	// Details/state of the current mini game.
	// Is reset after every game.
	game: {},
};

// Speed of game actions, in milliseconds.
const speed = 22;

// Small hack to save RAM.
// This will work smoothly, because the script does not use
// any "ns" functions, it's a pure browser automation tool.
const wnd = eval("window");
const doc = wnd["document"];

// List of all games and an automated solver.
const infiltrationGames = [
	{
		name: "type it backward",
		init: function (screen) {
			const lines = getLines(getEl(screen, "p"));
			state.game.data = lines[0].split("");
		},
		play: function (screen) {
			if (!state.game.data || !state.game.data.length) {
				delete state.game.data;
				return;
			}

			pressKey(state.game.data.shift());
		},
	},
	{
		name: "enter the code",
		init: function (screen) {},
		play: function (screen) {
			const h4 = getEl(screen, "h4");
			const code = h4[1].textContent;

			switch (code) {
				case "↑":
					pressKey("w");
					break;
				case "↓":
					pressKey("s");
					break;
				case "←":
					pressKey("a");
					break;
				case "→":
					pressKey("d");
					break;
			}
		},
	},
	{
		name: "close the brackets",
		init: function (screen) {
			const data = getLines(getEl(screen, "p"));
			const brackets = data.join("").split("");
			state.game.data = [];

			for (let i = brackets.length - 1; i >= 0; i--) {
				const char = brackets[i];

				if ("<" == char) {
					state.game.data.push(">");
				} else if ("(" == char) {
					state.game.data.push(")");
				} else if ("{" == char) {
					state.game.data.push("}");
				} else if ("[" == char) {
					state.game.data.push("]");
				}
			}
		},
		play: function (screen) {
			if (!state.game.data || !state.game.data.length) {
				delete state.game.data;
				return;
			}

			pressKey(state.game.data.shift());
		},
	},
	{
		name: "slash when his guard is down",
		init: function (screen) {},
		play: function (screen) {
			const data = getLines(getEl(screen, "h4"));

			if (-1 !== data.indexOf("ATTACKING!")) {
				pressKey(" ");
			}
		},
	},
	{
		name: "say something nice about the guard",
		init: function (screen) {},
		play: function (screen) {
			const correct = [
				"affectionate",
				"agreeable",
				"bright",
				"charming",
				"creative",
				"determined",
				"energetic",
				"friendly",
				"funny",
				"generous",
				"polite",
				"likable",
				"diplomatic",
				"helpful",
				"giving",
				"kind",
				"hardworking",
				"patient",
				"dynamic",
				"loyal",
			];
			const word = getLines(getEl(screen, "h5"))[1];

			if (-1 !== correct.indexOf(word)) {
				pressKey(" ");
			} else {
				pressKey("w");
			}
		},
	},
	{
		name: "remember all the mines",
		init: function (screen) {
			const rows = getLines(getEl(screen, "p"));

			state.game.data = [];

			for (let y = 0; y < rows.length; y++) {
				const cols = rows[y].split("[");
				state.game.data[y] = [];

				for (let x = 0; x < cols.length; x++) {
					if (cols[x].length > 1) {
						state.game.data[y].push("?" === cols[x][0]);
					}
				}
			}
		},
		play: function (screen) {},
	},
	{
		name: "mark all the mines",
		init: function (screen) {
			state.game.x = 0;
			state.game.y = 0;
			state.game.cols = state.game.data[0].length;
			state.game.dir = 1;
		},
		play: function (screen) {
			let { data, x, y, cols, dir } = state.game;

			if (data[y][x]) {
				pressKey(" ");
				data[y][x] = false;
			}

			x += dir;

			if (x < 0 || x >= cols) {
				x = Math.max(0, Math.min(cols - 1, x));
				y++;
				dir *= -1;
				pressKey("s");
			} else {
				pressKey(dir > 0 ? "d" : "a");
			}

			state.game.data = data;
			state.game.x = x;
			state.game.y = y;
			state.game.dir = dir;
		},
	},
	{
		name: "match the symbols",
		init: function (screen) {
			const data = getLines(getEl(screen, "h5 span"));
			const rows = getLines(getEl(screen, "p"));
			const keypad = [];
			const targets = [];

			for (let i = 0; i < rows.length; i++) {
				keypad[i] = rows[i].trim().split(/\s/);
			}

			for (let i = 0; i < data.length; i++) {
				const symbol = data[i].trim();

				for (let j = 0; j < keypad.length; j++) {
					const k = keypad[j].indexOf(symbol);

					if (-1 !== k) {
						targets.push([j, k]);
						break;
					}
				}
			}

			state.game.data = targets;
			state.game.x = 0;
			state.game.y = 0;
		},
		play: function (screen) {
			const target = state.game.data[0];
			let { x, y } = state.game;

			if (!target) {
				return;
			}

			const to_y = target[0];
			const to_x = target[1];

			if (to_y < y) {
				y--;
				pressKey("w");
			} else if (to_y > y) {
				y++;
				pressKey("s");
			} else if (to_x < x) {
				x--;
				pressKey("a");
			} else if (to_x > x) {
				x++;
				pressKey("d");
			} else {
				pressKey(" ");
				state.game.data.shift();
			}

			state.game.x = x;
			state.game.y = y;
		},
	},
	{
		name: "cut the wires with the following properties",
		init: function (screen) {
			const colors = {
				red: "red",
				white: "white",
				blue: "blue",
				"rgb(255, 193, 7)": "yellow",
			};
			const wireColor = {
				red: [],
				white: [],
				blue: [],
				yellow: [],
			};
			const instructions = getLines(getEl(screen, "div > h4 ~ p"));
			const samples = getEl(screen, "div > div");
			const wires = [];

			for (let i = 0; i < samples.length; i++) {
				const sample = samples[i];
				const wireNodes = getEl(sample, "p span");

				for (let j = 0; j < wireNodes.length && j < 10; j++) {
					const num = j + 1;
					const node = wireNodes[j];
					const color = colors[node.style.color];
					if (!color || -1 !== wireColor[color].indexOf(num)) {
						continue;
					}
					wireColor[color].push(num);
				}
			}

			for (let i = 0; i < instructions.length; i++) {
				const line = instructions[i].trim().toLowerCase();

				if (!line || line.length < 10) {
					continue;
				}
				if (-1 !== line.indexOf("cut wires number")) {
					const parts = line.split(/(number\s*|\.)/);
					wires.push(parseInt(parts[2]));
				}
				if (-1 !== line.indexOf("cut all wires colored")) {
					const parts = line.split(/(colored\s*|\.)/);
					const color = parts[2];

					if (!wireColor[color]) {
						// should never happen.
						continue;
					}

					wireColor[color].forEach((num) => wires.push(num));
				}
			}

			// new Set() removes duplicate elements.
			state.game.data = [...new Set(wires)];
		},
		play: function (screen) {
			const wire = state.game.data.shift();

			if (!wire) {
				return;
			}

			pressKey(wire.toString());
		},
	},
];

/** @param {NS} ns **/
export async function main(ns) {
	const args = ns.flags([
		["start", false],
		["stop", false],
		["status", false],
		["quiet", false],
	]);

	function print(msg) {
		if (!args.quiet) {
			ns.tprint(`\n${msg}\n`);
		}
	}

	if (args.status) {
		if (wnd.tmrAutoInf) {
			print("Automated infiltration is active");
		} else {
			print("Automated infiltration is inactive");
		}
		return;
	}

	if (wnd.tmrAutoInf) {
		print("Stopping automated infiltration...");
		clearInterval(wnd.tmrAutoInf);
		delete wnd.tmrAutoInf;
	}

	if (args.stop) {
		return;
	}

	print(
		"Automated infiltration is enabled...\nVWhen you visit the infiltration screen of any company, all tasks are completed automatically."
	);

	endInfiltration();

	// Monitor the current screen and start infiltration once a
	// valid screen is detected.
	wnd.tmrAutoInf = setInterval(infLoop, speed);

	// Modify the addEventListener logic.
	wrapEventListeners();
}

/**
 * The infiltration loop, which is called at a rapid interval
 */
function infLoop() {
	if (!state.started) {
		waitForStart();
	} else {
		playGame();
	}
}

/**
 * Returns a list of DOM elements from the main game
 * container.
 */
function getEl(parent, selector) {
	let prefix = ":scope";

	if ("string" === typeof parent) {
		selector = parent;
		parent = doc;

		prefix = ".MuiBox-root>.MuiBox-root>.MuiBox-root";

		if (!doc.querySelectorAll(prefix).length) {
			prefix = ".MuiBox-root>.MuiBox-root>.MuiGrid-root";
		}
		if (!doc.querySelectorAll(prefix).length) {
			return [];
		}
	}

	selector = selector.split(",");
	selector = selector.map((item) => `${prefix} ${item}`);
	selector = selector.join(",");

	return parent.querySelectorAll(selector);
}

/**
 * Returns the first element with matching text content.
 */
function filterByText(elements, text) {
	text = text.toLowerCase();

	for (let i = 0; i < elements.length; i++) {
		const content = elements[i].textContent.toLowerCase();

		if (-1 !== content.indexOf(text)) {
			return elements[i];
		}
	}

	return null;
}

/**
 * Returns an array with the text-contents of the given elements.
 *
 * @param {NodeList} elements
 * @returns {string[]}
 */
function getLines(elements) {
	const lines = [];
	elements.forEach((el) => lines.push(el.textContent));

	return lines;
}

/**
 * Reset the state after infiltration is done.
 */
function endInfiltration() {
	unwrapEventListeners();
	state.company = "";
	state.started = false;
}

/**
 * Simulate a keyboard event (keydown + keyup).
 *
 * @param {string|int} keyOrCode A single letter (string) or key-code to send.
 */
function pressKey(keyOrCode) {
	let keyCode = 0;
	let key = "";

	if ("string" === typeof keyOrCode && keyOrCode.length > 0) {
		key = keyOrCode.toLowerCase().substr(0, 1);
		keyCode = key.charCodeAt(0);
	} else if ("number" === typeof keyOrCode) {
		keyCode = keyOrCode;
		key = String.fromCharCode(keyCode);
	}

	if (!keyCode || key.length !== 1) {
		return;
	}

	function sendEvent(event) {
		const keyboardEvent = new KeyboardEvent(event, {
			key,
			keyCode,
		});

		doc.dispatchEvent(keyboardEvent);
	}

	sendEvent("keydown");
}

/**
 * Infiltration monitor to start automatic infiltration.
 *
 * This function runs asynchronously, after the "main" function ended,
 * so we cannot use any "ns" function here!
 */
function waitForStart() {
	if (state.started) {
		return;
	}

	const h4 = getEl("h4");

	if (!h4.length) {
		return;
	}

	const title = h4[0].textContent;
	if (0 !== title.indexOf("Infiltrating")) {
		return;
	}

	const btnStart = filterByText(getEl("button"), "Start");
	if (!btnStart) {
		return;
	}

	state.company = title.substr(13);
	state.started = true;
	wrapEventListeners();

	console.log("Start automatic infiltration of", state.company);
	btnStart.click();
}

/**
 * Identify the current infiltration game.
 */
function playGame() {
	const screens = getEl(">.MuiGrid-root:nth-child(3)>.MuiGrid-root");

	if (!screens.length) {
		endInfiltration();
		return;
	}

	const screen = screens[0];
	const h4 = getEl(screen, "h4");

	if (!h4.length) {
		endInfiltration();
		return;
	}

	const title = h4[0].textContent.trim().toLowerCase().split(/[!.(]/)[0];

	if ("infiltration successful" === title) {
		endInfiltration();
		return;
	}

	if ("get ready" === title) {
		return;
	}

	const game = infiltrationGames.find((game) => game.name === title);

	if (game) {
		if (state.game.current !== title) {
			state.game.current = title;
			game.init(screen);
		}

		game.play(screen);
	} else {
		console.error("Unknown game:", title);
	}
}

/**
 * Wrap all event listeners with a custom function that injects
 * the "isTrusted" flag.
 *
 * Is this cheating? Or is it real hacking? Don't care, as long
 * as it's working :)
 */
function wrapEventListeners() {
	if (!doc._addEventListener) {
		doc._addEventListener = doc.addEventListener;

		doc.addEventListener = function (type, callback, options) {
			if ("undefined" === typeof options) {
				options = false;
			}
			let handler = false;

			// For this script, we only want to modify "keydown" events.
			if ("keydown" === type) {
				handler = function (...args) {
					if (!args[0].isTrusted) {
						const hackedEv = {};

						for (const key in args[0]) {
							if ("isTrusted" === key) {
								hackedEv.isTrusted = true;
							} else if ("function" === typeof args[0][key]) {
								hackedEv[key] = args[0][key].bind(args[0]);
							} else {
								hackedEv[key] = args[0][key];
							}
						}

						args[0] = hackedEv;
					}

					return callback.apply(callback, args);
				};

				for (const prop in callback) {
					if ("function" === typeof callback[prop]) {
						handler[prop] = callback[prop].bind(callback);
					} else {
						handler[prop] = callback[prop];
					}
				}
			}

			if (!this.eventListeners) {
				this.eventListeners = {};
			}
			if (!this.eventListeners[type]) {
				this.eventListeners[type] = [];
			}
			this.eventListeners[type].push({
				listener: callback,
				useCapture: options,
				wrapped: handler,
			});

			return this._addEventListener(
				type,
				handler ? handler : callback,
				options
			);
		};
	}

	if (!doc._removeEventListener) {
		doc._removeEventListener = doc.removeEventListener;

		doc.removeEventListener = function (type, callback, options) {
			if ("undefined" === typeof options) {
				options = false;
			}

			if (!this.eventListeners) {
				this.eventListeners = {};
			}
			if (!this.eventListeners[type]) {
				this.eventListeners[type] = [];
			}

			for (let i = 0; i < this.eventListeners[type].length; i++) {
				if (
					this.eventListeners[type][i].listener === callback &&
					this.eventListeners[type][i].useCapture === options
				) {
					if (this.eventListeners[type][i].wrapped) {
						callback = this.eventListeners[type][i].wrapped;
					}

					this.eventListeners[type].splice(i, 1);
					break;
				}
			}

			if (this.eventListeners[type].length == 0) {
				delete this.eventListeners[type];
			}

			return this._removeEventListener(type, callback, options);
		};
	}
}

/**
 * Revert the "wrapEventListeners" changes.
 */
function unwrapEventListeners() {
	if (doc._addEventListener) {
		doc.addEventListener = doc._addEventListener;
		delete doc._addEventListener;
	}
	if (doc._removeEventListener) {
		doc.removeEventListener = doc._removeEventListener;
		delete doc._removeEventListener;
	}
	delete doc.eventListeners;
}
