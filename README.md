# Bitburner

Collection of scripts to solve Bitburner tasks.

## Setup:

```
alias master="run master.js"
alias scan="run tools/scan.js"
alias find="run tools/find.js"
alias analyze="run tools/analyze.js"
alias contract="run tools/contract.js"
alias monitor="run tools/monitor.js;tail tools/monitor.js"
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
* `scan WORD` .. display all servers with the given keyword in their name or organizations name.

### `find`

Locates a server based on a case-insensitive keyword.

Usage:
* `find WORD` .. Locates all servers that contain WORD in their name, or organization name.
* `find WORD --connect` .. Displays connection string of the relevant server
* `find WORD --tree` .. alternate output format

Example:
* `find csec --connect` .. quickly find the CSEC server
* `find I.I --tree` .. display path to the BlackHand server I.I.I.I

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
