
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

// Data storage
let simulatorData = {};

// Load data
try {
  simulatorData = JSON.parse(fs.readFileSync('simulator.json', 'utf8'));
} catch (err) {
  simulatorData = {};
}

function saveSimulatorData() {
  fs.writeFileSync('simulator.json', JSON.stringify(simulatorData, null, 2));
}

// Get or create user data
function getUserData(userId, guildId) {
  const userKey = `${userId}-${guildId}`;
  if (!simulatorData[userKey]) {
    simulatorData[userKey] = {
      coins: 1000,
      // Fishing
      fishingLevel: 1,
      fishingXP: 0,
      fishingInventory: {},
      fishingRod: 'basic_rod',
      ownedFishingRods: ['basic_rod'],
      // Mining
      miningLevel: 1,
      miningXP: 0,
      miningInventory: {},
      miningPickaxe: 'basic_pickaxe',
      ownedPickaxes: ['basic_pickaxe'],
      // Farming
      farmingLevel: 1,
      farmingXP: 0,
      farmingInventory: {},
      farmingHoe: 'basic_hoe',
      ownedHoes: ['basic_hoe'],
      // Work
      workLevel: 1,
      workXP: 0,
      lastWork: 0,
      // Pets
      pets: [],
      equippedPet: null,
      petIdCounter: 0,
      // Items & Potions
      items: {},
      activeEffects: [],
      // Prestige
      prestige: 0,
      prestigeBonus: 1.0,
      // Cooldowns
      lastFish: 0,
      lastMine: 0,
      lastFarm: 0,
      // Trading
      inTrade: false,
      // Automation
      autoFarmExpiry: 0,
    };
  }
  return simulatorData[userKey];
}

// Tools/Items Database
const tools = {
  // Fishing Rods
  basic_rod: { name: 'Basic Rod', type: 'fishing', power: 1, efficiency: 1, multiplier: 1, rarity: 'Common', price: 0, cooldown: 10000 },
  sturdy_rod: { name: 'Sturdy Rod', type: 'fishing', power: 2, efficiency: 1.1, multiplier: 1.2, rarity: 'Rare', price: 500, cooldown: 9000 },
  epic_rod: { name: 'Epic Rod', type: 'fishing', power: 3, efficiency: 1.2, multiplier: 1.5, rarity: 'Epic', price: 2000, cooldown: 7000 },
  legendary_rod: { name: 'Legendary Rod', type: 'fishing', power: 5, efficiency: 1.5, multiplier: 2, rarity: 'Legendary', price: 10000, cooldown: 5000 },
  molten_rod: { name: '🔥 Molten Rod', type: 'fishing', power: 8, efficiency: 2, multiplier: 2.5, rarity: 'Mythic', price: 50000, cooldown: 4000 },
  
  // Pickaxes
  basic_pickaxe: { name: 'Basic Pickaxe', type: 'mining', power: 1, efficiency: 1, multiplier: 1, rarity: 'Common', price: 0, cooldown: 12000 },
  iron_pickaxe: { name: 'Iron Pickaxe', type: 'mining', power: 2, efficiency: 1.1, multiplier: 1.2, rarity: 'Rare', price: 600, cooldown: 10000 },
  diamond_pickaxe: { name: 'Diamond Pickaxe', type: 'mining', power: 4, efficiency: 1.3, multiplier: 1.5, rarity: 'Epic', price: 2500, cooldown: 8000 },
  molten_pickaxe: { name: '🔥 Molten Pickaxe', type: 'mining', power: 12, efficiency: 1.8, multiplier: 2.5, rarity: 'Epic', price: 15000, cooldown: 4000 },
  
  // Hoes
  basic_hoe: { name: 'Basic Hoe', type: 'farming', power: 1, efficiency: 1, multiplier: 1, rarity: 'Common', price: 0, cooldown: 15000 },
  steel_hoe: { name: 'Steel Hoe', type: 'farming', power: 2, efficiency: 1.1, multiplier: 1.3, rarity: 'Rare', price: 700, cooldown: 12000 },
  golden_hoe: { name: 'Golden Hoe', type: 'farming', power: 4, efficiency: 1.4, multiplier: 1.8, rarity: 'Epic', price: 3000, cooldown: 9000 },
  mystical_hoe: { name: '✨ Mystical Hoe', type: 'farming', power: 10, efficiency: 2, multiplier: 3, rarity: 'Mythic', price: 60000, cooldown: 5000 },
};

// Resources Database
const fishTypes = {
  salmon: { name: 'Salmon', emoji: '🐟', value: 10, xp: 5, rarity: 'Common' },
  tuna: { name: 'Tuna', emoji: '🐠', value: 25, xp: 12, rarity: 'Rare' },
  swordfish: { name: 'Swordfish', emoji: '⚔️', value: 100, xp: 50, rarity: 'Epic' },
  golden_fish: { name: 'Golden Fish', emoji: '🏆', value: 500, xp: 200, rarity: 'Legendary' },
  phoenix_fish: { name: 'Phoenix Fish', emoji: '🔥', value: 2000, xp: 800, rarity: 'Mythic' },
};

const oreTypes = {
  coal: { name: 'Coal', emoji: '⚫', value: 8, xp: 4, rarity: 'Common' },
  iron: { name: 'Iron', emoji: '⚪', value: 20, xp: 10, rarity: 'Rare' },
  gold: { name: 'Gold', emoji: '🟡', value: 80, xp: 40, rarity: 'Epic' },
  diamond: { name: 'Diamond', emoji: '💎', value: 300, xp: 150, rarity: 'Legendary' },
  mythril: { name: 'Mythril', emoji: '✨', value: 1500, xp: 600, rarity: 'Mythic' },
};

const cropTypes = {
  wheat: { name: 'Wheat', emoji: '🌾', value: 12, xp: 6, rarity: 'Common' },
  corn: { name: 'Corn', emoji: '🌽', value: 30, xp: 15, rarity: 'Rare' },
  pumpkin: { name: 'Pumpkin', emoji: '🎃', value: 120, xp: 60, rarity: 'Epic' },
  golden_apple: { name: 'Golden Apple', emoji: '🍎', value: 400, xp: 200, rarity: 'Legendary' },
  dragon_fruit: { name: 'Dragon Fruit', emoji: '🐉', value: 1800, xp: 700, rarity: 'Mythic' },
};

// Pet System
const petTypes = {
  ember_cat: { name: '🔥 Ember Cat', rarity: 'Legendary', boost: { type: 'coins', value: 1.25 }, hunger: 100, xp: 0, level: 1 },
  crystal_dog: { name: '💎 Crystal Dog', rarity: 'Epic', boost: { type: 'xp', value: 1.20 }, hunger: 100, xp: 0, level: 1 },
  phoenix: { name: '🐦 Phoenix', rarity: 'Mythic', boost: { type: 'rarity', value: 1.15 }, hunger: 100, xp: 0, level: 1 },
  turtle: { name: '🐢 Turtle', rarity: 'Common', boost: { type: 'cooldown', value: 0.95 }, hunger: 100, xp: 0, level: 1 },
};

// Potions
const potions = {
  hot_sauce: { name: 'Hot Sauce Potion', emoji: '🌶️', effect: 'coins', multiplier: 2, duration: 600000, price: 500 },
  xp_flask: { name: 'XP Flask', emoji: '🧪', effect: 'xp', multiplier: 1.5, duration: 900000, price: 800 },
  luck_brew: { name: 'Luck Brew', emoji: '🍀', effect: 'rarity', multiplier: 1.15, duration: 1200000, price: 1200 },
};

// Helper functions
function getRarityChance(power, baseRarity) {
  const chances = {
    Common: 60 + power * 2,
    Rare: 25 + power * 1.5,
    Epic: 10 + power,
    Legendary: 4 + power * 0.5,
    Mythic: 1 + power * 0.3,
  };
  
  const roll = Math.random() * 100;
  let cumulative = 0;
  
  for (const [rarity, chance] of Object.entries(chances)) {
    cumulative += chance;
    if (roll < cumulative) return rarity;
  }
  
  return 'Common';
}

function getRandomResource(resourceTypes, rarity) {
  const filtered = Object.entries(resourceTypes).filter(([_, r]) => r.rarity === rarity);
  if (filtered.length === 0) return Object.values(resourceTypes)[0];
  return filtered[Math.floor(Math.random() * filtered.length)][1];
}

function calculateXPNeeded(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function addXP(userData, activity, amount) {
  const xpField = `${activity}XP`;
  const levelField = `${activity}Level`;
  
  userData[xpField] += amount;
  
  while (userData[xpField] >= calculateXPNeeded(userData[levelField])) {
    userData[xpField] -= calculateXPNeeded(userData[levelField]);
    userData[levelField]++;
  }
}

function applyPetBoost(userData, type, value) {
  if (!userData.equippedPet) return value;
  
  const pet = userData.pets.find(p => p.id === userData.equippedPet);
  if (!pet || pet.hunger <= 0) return value;
  
  const petInfo = petTypes[pet.type];
  if (petInfo.boost.type === type) {
    return value * petInfo.boost.value;
  }
  
  return value;
}

function applyActiveEffects(userData, type, value) {
  const now = Date.now();
  userData.activeEffects = userData.activeEffects.filter(e => e.expiry > now);
  
  for (const effect of userData.activeEffects) {
    if (effect.type === type) {
      value *= effect.multiplier;
    }
  }
  
  return value;
}

// Core activity functions
async function performFish(userId, guildId) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const rod = tools[userData.fishingRod];
  
  const cooldown = rod.cooldown / (userData.prestige + 1);
  
  if (now - userData.lastFish < cooldown) {
    const remaining = Math.ceil((cooldown - (now - userData.lastFish)) / 1000);
    return { success: false, message: `Cooldown! Wait ${remaining}s` };
  }
  
  userData.lastFish = now;
  
  const rarity = getRarityChance(rod.power, 'Common');
  const fish = getRandomResource(fishTypes, rarity);
  
  let coins = Math.floor(fish.value * rod.multiplier * userData.prestigeBonus);
  let xp = Math.floor(fish.xp * rod.multiplier);
  
  coins = Math.floor(applyPetBoost(userData, 'coins', coins));
  coins = Math.floor(applyActiveEffects(userData, 'coins', coins));
  xp = Math.floor(applyActiveEffects(userData, 'xp', xp));
  
  userData.coins += coins;
  userData.fishingInventory[fish.name] = (userData.fishingInventory[fish.name] || 0) + 1;
  
  addXP(userData, 'fishing', xp);
  
  saveSimulatorData();
  
  return {
    success: true,
    fish: fish,
    coins: coins,
    xp: xp,
    level: userData.fishingLevel,
  };
}

async function performMine(userId, guildId) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const pickaxe = tools[userData.miningPickaxe];
  
  const cooldown = pickaxe.cooldown / (userData.prestige + 1);
  
  if (now - userData.lastMine < cooldown) {
    const remaining = Math.ceil((cooldown - (now - userData.lastMine)) / 1000);
    return { success: false, message: `Cooldown! Wait ${remaining}s` };
  }
  
  userData.lastMine = now;
  
  const rarity = getRarityChance(pickaxe.power, 'Common');
  const ore = getRandomResource(oreTypes, rarity);
  
  let coins = Math.floor(ore.value * pickaxe.multiplier * userData.prestigeBonus);
  let xp = Math.floor(ore.xp * pickaxe.multiplier);
  
  coins = Math.floor(applyPetBoost(userData, 'coins', coins));
  coins = Math.floor(applyActiveEffects(userData, 'coins', coins));
  xp = Math.floor(applyActiveEffects(userData, 'xp', xp));
  
  userData.coins += coins;
  userData.miningInventory[ore.name] = (userData.miningInventory[ore.name] || 0) + 1;
  
  addXP(userData, 'mining', xp);
  
  saveSimulatorData();
  
  return {
    success: true,
    ore: ore,
    coins: coins,
    xp: xp,
    level: userData.miningLevel,
  };
}

async function performFarm(userId, guildId) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const hoe = tools[userData.farmingHoe];
  
  const cooldown = hoe.cooldown / (userData.prestige + 1);
  
  if (now - userData.lastFarm < cooldown) {
    const remaining = Math.ceil((cooldown - (now - userData.lastFarm)) / 1000);
    return { success: false, message: `Cooldown! Wait ${remaining}s` };
  }
  
  userData.lastFarm = now;
  
  const rarity = getRarityChance(hoe.power, 'Common');
  const crop = getRandomResource(cropTypes, rarity);
  
  let coins = Math.floor(crop.value * hoe.multiplier * userData.prestigeBonus);
  let xp = Math.floor(crop.xp * hoe.multiplier);
  
  coins = Math.floor(applyPetBoost(userData, 'coins', coins));
  coins = Math.floor(applyActiveEffects(userData, 'coins', coins));
  xp = Math.floor(applyActiveEffects(userData, 'xp', xp));
  
  userData.coins += coins;
  userData.farmingInventory[crop.name] = (userData.farmingInventory[crop.name] || 0) + 1;
  
  addXP(userData, 'farming', xp);
  
  saveSimulatorData();
  
  return {
    success: true,
    crop: crop,
    coins: coins,
    xp: xp,
    level: userData.farmingLevel,
  };
}

module.exports = {
  getUserData,
  saveSimulatorData,
  tools,
  fishTypes,
  oreTypes,
  cropTypes,
  petTypes,
  potions,
  performFish,
  performMine,
  performFarm,
  calculateXPNeeded,
  addXP,
};
