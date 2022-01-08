import * as Common from "lib/common.js";

/**
 * The player instance (singleton)
 */
let inst = null;

/**
 * Player accessor.
 */
export function get(nsInst) {
	if (!inst) {
		inst = new Player(nsInst);
	}

	return inst;
}

/**
 * Applies a callback to every program.
 */
export function programs(callback) {
	[
		{
			port: "sshPortOpen",
			file: "BruteSSH.exe",
			cmd: "brutessh",
			cost: 500000,
			level: 50,
		},
		{
			port: "ftpPortOpen",
			file: "FTPCrack.exe",
			cmd: "ftpcrack",
			cost: 1.5,
			level: 100,
		},
		{
			port: "smtpPortOpen",
			file: "relaySMTP.exe",
			cmd: "relaysmtp",
			cost: 5000000,
			level: 250,
		},
		{
			port: "httpPortOpen",
			file: "HTTPWorm.exe",
			cmd: "httpworm",
			cost: 30000000,
			level: 500,
		},
		{
			port: "sqlPortOpen",
			file: "SQLInject.exe",
			cmd: "sqlinject",
			cost: 250000000,
			level: 750,
		},
		{
			file: "ServerProfiler.exe",
			cost: 500000,
			level: 75,
		},
		{
			file: "DeepscanV1.exe",
			cost: 500000,
			level: 75,
		},
		{
			file: "DeepscanV2.exe",
			cost: 25000000,
			level: 400,
		},
		{
			file: "AutoLink.exe",
			cost: 200000,
			level: 25,
		},
		{
			file: "Formulas.exe",
			cost: 5000000000,
		},
	].forEach(callback);
}

class Player {
	/**
	 * Initialize the player object.
	 */
	constructor(nsInst) {
		this.refresh(nsInst);
		this.refreshPrograms(nsInst);
	}

	/**
	 * Refresh details about the player.
	 */
	refresh(ns) {
		const info = ns.getPlayer();

		this.agility_exp_mult = info.agility_exp_mult;
		this.agility_exp = info.agility_exp;
		this.agility_mult = info.agility_mult;
		this.agility = info.agility;
		this.bitNodeN = info.bitNodeN;
		this.bladeburner_analysis_mult = info.bladeburner_analysis_mult;
		this.bladeburner_max_stamina_mult = info.bladeburner_max_stamina_mult;
		this.bladeburner_stamina_gain_mult = info.bladeburner_stamina_gain_mult;
		this.bladeburner_success_chance_mult =
			info.bladeburner_success_chance_mult;
		this.charisma_exp_mult = info.charisma_exp_mult;
		this.charisma_exp = info.charisma_exp;
		this.charisma_mult = info.charisma_mult;
		this.charisma = info.charisma;
		this.city = info.city;
		this.className = info.className;
		this.company_rep_mult = info.company_rep_mult;
		this.companyName = info.companyName;
		this.createProgramName = info.createProgramName;
		this.createProgramReqLvl = info.createProgramReqLvl;
		this.crime_money_mult = info.crime_money_mult;
		this.crime_success_mult = info.crime_success_mult;
		this.crimeType = info.crimeType;
		this.currentWorkFactionDescription = info.currentWorkFactionDescription;
		this.currentWorkFactionName = info.currentWorkFactionName;
		this.defense_exp_mult = info.defense_exp_mult;
		this.defense_exp = info.defense_exp;
		this.defense_mult = info.defense_mult;
		this.defense = info.defense;
		this.dexterity_exp_mult = info.dexterity_exp_mult;
		this.dexterity_exp = info.dexterity_exp;
		this.dexterity_mult = info.dexterity_mult;
		this.dexterity = info.dexterity;
		this.faction_rep_mult = info.faction_rep_mult;
		this.factions = info.factions;
		this.hacking_chance_mult = info.hacking_chance_mult;
		this.hacking_exp_mult = info.hacking_exp_mult;
		this.hacking_exp = info.hacking_exp;
		this.hacking_grow_mult = info.hacking_grow_mult;
		this.hacking_money_mult = info.hacking_money_mult;
		this.hacking_mult = info.hacking_mult;
		this.hacking_speed_mult = info.hacking_speed_mult;
		this.hacking = info.hacking;
		this.hacknet_node_core_cost_mult = info.hacknet_node_core_cost_mult;
		this.hacknet_node_level_cost_mult = info.hacknet_node_level_cost_mult;
		this.hacknet_node_money_mult = info.hacknet_node_money_mult;
		this.hacknet_node_purchase_cost_mult =
			info.hacknet_node_purchase_cost_mult;
		this.hacknet_node_ram_cost_mult = info.hacknet_node_ram_cost_mult;
		this.has4SData = info.has4SData;
		this.has4SDataTixApi = info.has4SDataTixApi;
		this.hasTixApiAccess = info.hasTixApiAccess;
		this.hasWseAccount = info.hasWseAccount;
		this.hp = info.hp;
		this.intelligence = info.intelligence;
		this.isWorking = info.isWorking;
		this.jobs = info.jobs;
		this.location = info.location;
		this.max_hp = info.max_hp;
		this.money = info.money;
		this.numPeopleKilled = info.numPeopleKilled;
		this.playtimeSinceLastAug = info.playtimeSinceLastAug;
		this.playtimeSinceLastBitnode = info.playtimeSinceLastBitnode;
		this.strength_exp_mult = info.strength_exp_mult;
		this.strength_exp = info.strength_exp;
		this.strength_mult = info.strength_mult;
		this.strength = info.strength;
		this.tor = info.tor;
		this.totalPlaytime = info.totalPlaytime;
		this.work_money_mult = info.work_money_mult;
		this.workAgiExpGained = info.workAgiExpGained;
		this.workAgiExpGainRate = info.workAgiExpGainRate;
		this.workChaExpGained = info.workChaExpGained;
		this.workChaExpGainRate = info.workChaExpGainRate;
		this.workDefExpGained = info.workDefExpGained;
		this.workDefExpGainRate = info.workDefExpGainRate;
		this.workDexExpGained = info.workDexExpGained;
		this.workDexExpGainRate = info.workDexExpGainRate;
		this.workHackExpGained = info.workHackExpGained;
		this.workHackExpGainRate = info.workHackExpGainRate;
		this.workMoneyGained = info.workMoneyGained;
		this.workMoneyGainRate = info.workMoneyGainRate;
		this.workMoneyLossRate = info.workMoneyLossRate;
		this.workRepGained = info.workRepGained;
		this.workRepGainRate = info.workRepGainRate;
		this.workStrExpGained = info.workStrExpGained;
		this.workStrExpGainRate = info.workStrExpGainRate;
		this.workType = info.workType;
	}

	/**
	 * Checks, which programs are available to the player.
	 */
	refreshPrograms(ns) {
		this.listPortOpeners = [];
		this.listPrograms = [];

		programs((tool) => {
			if (ns.fileExists(tool.file, "home")) {
				this.listPrograms.push(tool.file.toLowerCase());
			}

			if (tool.port && this.hasProgram(tool.file)) {
				this.listPortOpeners.push(tool);
			}
		});
	}

	/**
	 * Checks, if the player owns a specific program.
	 */
	hasProgram(name) {
		return -1 !== this.listPrograms.indexOf(name.toLowerCase());
	}

	/**
	 * Passes each available port opener to a callback.
	 */
	portOpeners(callback) {
		this.listPortOpeners.forEach(callback);
	}
}
