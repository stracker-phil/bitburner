# Bitburner

Collection of scripts to solve Bitburner tasks.

### Note to other players

> This repo is public, to inspire you and to provide references for your own scripts.
> I've optimized scripts for best results on my machine and will not address issues of anyone else. In case you have a problem with one of the scripts, it's up to you to debug or improve the code.
>
> → **Finding creative solutions and writing your own scripts is the actual fun of the game** 😉

You are welcome to post feedback/ideas or share your own repo and scripts in the [Discussions](https://github.com/stracker-phil/bitburner/discussions/) section.

## Setup:

```
alias master="run master.js"
alias scan="run tools/scan.js"
alias find="run tools/find.js"
alias analyze="run tools/analyze.js"
alias contract="run tools/contract.js"
alias monitor="run tools/monitor.js;tail tools/monitor.js"
alias stock="run tools/stock.js"
alias infiltrate="run tools/infiltrate.js"
```

## Scripts

### `master`

Main entry point.

Usage: `master --help` or `master --info`

### `scan`

Greatly improved version of the original scan command. Requires about 20GB of RAM

Usage:
* `scan` .. list all servers
* `scan --hacked` .. only list hacked (rooted) servers
* `scan --own` .. only list own servers
* `scan --tree` .. display results as tree, instead of a list
* `scan WORD` .. display all servers with the given keyword in their name or organizations' name.

### `find`

Locate a server based on a case-insensitive keyword.

Usage:
* `find WORD1 WORD2 WORDn` .. Locates all servers that contain WORD in their name or organization name.
* `find WORDS --tree` .. alternate output format
* `find WORDS --connect` .. [**NS4.1**] Displays connection string of the relevant server

Example:
* `find cse run` .. locates the CSEC and run4theh1llz servers
* `find I.I --tree` .. display path to the BlackHand server I.I.I.I
* `find csec --connect` .. quickly find the CSEC server (*requires NS4.1*)

### `analyze`

Display details about a specific server

Usage:
* `analyze SERVER` .. output details about the specific server

### `contract`

List or solve available contracts.

Usage:
* `contract`  .. list all available contracts
* `contract --solve` .. automatically solve all available contracts

### `monitor`

Monitors the current attack target (the server that's targeted by `attk.js`)

Usage:
* `monitor` .. monitor the attk.js target
* `run tools/monitor.js n00dles; tail tools/monitor.js n00dles` .. monitor n00dles

### `stock`

**Requires API access to TIX and 4S**

Starts automated stock trading. Stock trading will take a while before showing first profits: During the first hour(s) the script seems to generate losses; this happens because it purchases many stock shares and holds them until prices reach an optimum. For best results, leave the script running for an entire day or overnight - but ensure that the game is running, as automated stock trading does not work when the game is closed!

Usage:
* `stock` .. start automated stock trading.

### `infiltrate`

Starts or stops automated infiltration mode. This script is a browser-automation script that does not use the NetScript API. It parses the screen contents and simulates the relevant keystrokes to solve infiltration games.

Usage:
* `infiltrate` .. start infiltration automation
* `infiltrate --status` .. get the status of the automation (enabled or disabled)
* `infiltrate --stop` .. stop automated infiltration mode again.