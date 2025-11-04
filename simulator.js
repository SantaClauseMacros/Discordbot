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
      // New activities
      lastDaily: 0,
      dailyStreak: 0,
      lastBeg: 0,
      lastCrime: 0,
      lastSearch: 0,
      // Trading
      inTrade: false,
      // Automation
      autoFarmExpiry: 0,
      // Challenges
      lastChallenge: 0,
      // Vote Rewards
      lastVoteReward: 0,
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

// Egg types for hatching pets
const eggTypes = {
  common_egg: { name: 'Common Egg', emoji: '🥚', price: 500, pets: ['turtle'] },
  epic_egg: { name: 'Epic Egg', emoji: '💎', price: 2000, pets: ['crystal_dog'] },
  legendary_egg: { name: 'Legendary Egg', emoji: '🔥', price: 5000, pets: ['ember_cat'] },
  mythic_egg: { name: 'Mythic Egg', emoji: '✨', price: 10000, pets: ['phoenix'] },
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

async function performWork(userId, guildId) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const workCooldown = 3600000; // 1 hour

  if (now - userData.lastWork < workCooldown) {
    const remaining = Math.ceil((workCooldown - (now - userData.lastWork)) / 60000);
    return { success: false, message: `You need to wait **${remaining} minutes** before working again!` };
  }

  const jobs = [
    { name: "Cashier", coins: 50, xp: 25 },
    { name: "Cook", coins: 75, xp: 35 },
    { name: "Developer", coins: 150, xp: 75 },
    { name: "Manager", coins: 200, xp: 100 },
    { name: "CEO", coins: 500, xp: 250 }
  ];

  const job = jobs[Math.floor(Math.random() * jobs.length)];
  let coins = Math.floor(job.coins * userData.prestigeBonus);
  let xp = job.xp;

  coins = Math.floor(applyPetBoost(userData, 'coins', coins));
  coins = Math.floor(applyActiveEffects(userData, 'coins', coins));
  xp = Math.floor(applyActiveEffects(userData, 'xp', xp));

  userData.coins += coins;
  userData.lastWork = now;

  addXP(userData, 'work', xp);

  saveSimulatorData();

  return {
    success: true,
    jobName: job.name,
    coins: coins,
    xp: xp,
    level: userData.workLevel,
  };
}

// Daily reward system
function claimDaily(userId, guildId) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const lastDaily = userData.lastDaily || 0;
  const dayInMs = 86400000; // 24 hours

  if (now - lastDaily < dayInMs) {
    const remaining = Math.ceil((dayInMs - (now - lastDaily)) / 3600000);
    return { success: false, message: `You can claim your daily reward in **${remaining} hours**!` };
  }

  // Check if streak continues (claimed within 48 hours)
  const streakValid = (now - lastDaily) < (dayInMs * 2);
  userData.dailyStreak = streakValid ? (userData.dailyStreak || 0) + 1 : 1;

  // Base reward + streak bonus
  const baseCoins = 100;
  const streakBonus = Math.min(userData.dailyStreak * 10, 500); // Max 500 bonus
  const totalCoins = baseCoins + streakBonus;

  userData.coins += totalCoins;
  userData.lastDaily = now;

  saveSimulatorData();

  return {
    success: true,
    coins: totalCoins,
    streak: userData.dailyStreak,
    totalCoins: userData.coins
  };
}

// Challenge system
const challenges = [
  { name: "Speed Fisher", difficulty: "Easy", coins: 75, xp: 30, cooldown: 1800000 },
  { name: "Rock Breaker", difficulty: "Medium", coins: 150, xp: 60, cooldown: 3600000 },
  { name: "Master Farmer", difficulty: "Hard", coins: 300, xp: 120, cooldown: 7200000 },
  { name: "Fortune Seeker", difficulty: "Expert", coins: 500, xp: 200, cooldown: 10800000 },
  { name: "Ladder Climber", difficulty: "Legendary", coins: 1000, xp: 400, cooldown: 14400000 }
];

function performChallenge(userId, guildId) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const lastChallenge = userData.lastChallenge || 0;
  const challengeCooldown = 3600000; // 1 hour base cooldown

  if (now - lastChallenge < challengeCooldown) {
    const remaining = Math.ceil((challengeCooldown - (now - lastChallenge)) / 60000);
    return { success: false, message: `You need to wait **${remaining} minutes** before starting another challenge!` };
  }

  const challenge = challenges[Math.floor(Math.random() * challenges.length)];

  let coins = Math.floor(challenge.coins * userData.prestigeBonus);
  let xp = challenge.xp;

  coins = Math.floor(applyPetBoost(userData, 'coins', coins));
  coins = Math.floor(applyActiveEffects(userData, 'coins', coins));
  xp = Math.floor(applyActiveEffects(userData, 'xp', xp));

  userData.coins += coins;
  userData.lastChallenge = now;

  saveSimulatorData();

  return {
    success: true,
    challengeName: challenge.name,
    difficulty: challenge.difficulty,
    coins: coins,
    xp: xp
  };
}

// Vote reward system
function claimVoteReward(userId, guildId) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const lastVote = userData.lastVoteReward || 0;
  const voteCooldown = 43200000; // 12 hours

  if (now - lastVote < voteCooldown) {
    const remaining = Math.ceil((voteCooldown - (now - lastVote)) / 3600000);
    return { success: false, message: `You can claim your vote reward in **${remaining} hours**!` };
  }

  const coins = 250;
  const xp = 100;

  userData.coins += coins;
  userData.lastVoteReward = now;

  saveSimulatorData();

  return {
    success: true,
    coins: coins,
    xp: xp
  };
}


function beg(userId, guildId) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const begCooldown = 45000; // 45 seconds

  if (!userData.lastBeg) {
    userData.lastBeg = 0;
  }

  if (now - userData.lastBeg < begCooldown) {
    const remaining = Math.ceil((begCooldown - (now - userData.lastBeg)) / 1000);
    return { success: false, message: `You need to wait **${remaining} seconds** before begging again!` };
  }

  userData.lastBeg = now;

  const chance = Math.random();
  let coins = 0;
  let message = "";

  if (chance < 0.3) {
    message = "Nobody gave you anything... 😔";
  } else if (chance < 0.7) {
    coins = Math.floor(Math.random() * 20) + 5;
    message = `Someone felt generous and gave you some coins!`;
  } else {
    coins = Math.floor(Math.random() * 50) + 25;
    message = `A kind stranger gave you a nice amount!`;
  }

  userData.coins += coins;
  saveSimulatorData();

  return {
    success: true,
    coins: coins,
    message: message,
    totalCoins: userData.coins,
  };
}

function crime(userId, guildId) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const crimeCooldown = 120000; // 2 minutes

  if (!userData.lastCrime) {
    userData.lastCrime = 0;
  }

  if (now - userData.lastCrime < crimeCooldown) {
    const remaining = Math.ceil((crimeCooldown - (now - userData.lastCrime)) / 1000);
    return { success: false, message: `You need to wait **${remaining} seconds** before committing another crime!` };
  }

  userData.lastCrime = now;

  const crimes = [
    { name: "rob a store", reward: [100, 300], fail: [50, 150] },
    { name: "steal a car", reward: [200, 500], fail: [100, 250] },
    { name: "hack a bank", reward: [300, 800], fail: [150, 400] },
    { name: "pickpocket someone", reward: [50, 150], fail: [25, 75] },
  ];

  const crime = crimes[Math.floor(Math.random() * crimes.length)];
  const caught = Math.random() < 0.4; // 40% chance of getting caught

  let coins = 0;
  let message = "";

  if (caught) {
    coins = -(Math.floor(Math.random() * (crime.fail[1] - crime.fail[0])) + crime.fail[0]);
    message = `You tried to ${crime.name} but got caught! You paid a fine.`;
    userData.coins = Math.max(0, userData.coins + coins);
  } else {
    coins = Math.floor(Math.random() * (crime.reward[1] - crime.reward[0])) + crime.reward[0];
    message = `You successfully ${crime.name}!`;
    userData.coins += coins;
  }

  saveSimulatorData();

  return {
    success: true,
    coins: coins,
    caught: caught,
    message: message,
    totalCoins: userData.coins,
  };
}

function search(userId, guildId, location) {
  const userData = getUserData(userId, guildId);
  const now = Date.now();
  const searchCooldown = 30000; // 30 seconds

  if (!userData.lastSearch) {
    userData.lastSearch = 0;
  }

  if (now - userData.lastSearch < searchCooldown) {
    const remaining = Math.ceil((searchCooldown - (now - userData.lastSearch)) / 1000);
    return { success: false, message: `You need to wait **${remaining} seconds** before searching again!` };
  }

  const locations = {
    trash: { name: "Trash Can", min: 5, max: 30, messages: ["You found some coins in the trash!", "Someone threw away money!"] },
    bench: { name: "Park Bench", min: 10, max: 50, messages: ["You found coins under the bench!", "There were coins between the cushions!"] },
    mailbox: { name: "Mailbox", min: 15, max: 60, messages: ["You found money in the mailbox!", "Someone left coins in there!"] },
    couch: { name: "Couch", min: 20, max: 80, messages: ["You found coins in the couch!", "The couch had money hidden!"] },
    street: { name: "Street", min: 5, max: 100, messages: ["You found coins on the street!", "Lucky find on the pavement!"] },
  };

  const loc = locations[location];
  const coins = Math.floor(Math.random() * (loc.max - loc.min)) + loc.min;
  const message = loc.messages[Math.floor(Math.random() * loc.messages.length)];

  userData.coins += coins;
  userData.lastSearch = now;

  saveSimulatorData();

  return {
    success: true,
    coins: coins,
    locationName: loc.name,
    message: message,
    totalCoins: userData.coins,
  };
}

// Pet System Functions
function hatchPet(userId, guildId, eggType) {
  const userData = getUserData(userId, guildId);
  const egg = eggTypes[eggType];

  if (!egg) {
    return { success: false, message: `Invalid egg type! Available eggs: ${Object.keys(eggTypes).join(', ')}` };
  }

  if (userData.coins < egg.price) {
    return { success: false, message: `You need **${egg.price}** coins to buy this egg! You have **${userData.coins}** coins.` };
  }

  userData.coins -= egg.price;
  const petId = egg.pets[Math.floor(Math.random() * egg.pets.length)];
  const petTemplate = petTypes[petId];

  if (!petTemplate) {
    return { success: false, message: 'Error hatching pet!' };
  }

  const newPet = {
    id: userData.petIdCounter++,
    type: petId,
    name: petTemplate.name,
    rarity: petTemplate.rarity,
    boost: { ...petTemplate.boost },
    hunger: 100,
    xp: 0,
    level: 1,
    hatchedAt: Date.now(),
  };

  userData.pets.push(newPet);

  if (!userData.equippedPet) {
    userData.equippedPet = newPet.id;
  }

  saveSimulatorData();

  return {
    success: true,
    pet: newPet,
    eggName: egg.name,
    totalCoins: userData.coins,
  };
}

function feedPet(userId, guildId, petId) {
  const userData = getUserData(userId, guildId);
  const pet = userData.pets.find(p => p.id === parseInt(petId));

  if (!pet) {
    return { success: false, message: `Pet with ID **${petId}** not found!` };
  }

  const feedCost = 50;
  if (userData.coins < feedCost) {
    return { success: false, message: `You need **${feedCost}** coins to feed your pet! You have **${userData.coins}** coins.` };
  }

  if (pet.hunger >= 100) {
    return { success: false, message: `${pet.name} is already full!` };
  }

  userData.coins -= feedCost;
  pet.hunger = Math.min(100, pet.hunger + 30);
  pet.xp += 10;

  if (pet.xp >= calculateXPNeeded(pet.level)) {
    pet.level++;
    pet.xp = 0;
    
    if (pet.boost.type === 'coins') {
      pet.boost.value += 0.05;
    } else if (pet.boost.type === 'xp') {
      pet.boost.value += 0.05;
    } else if (pet.boost.type === 'rarity') {
      pet.boost.value += 0.02;
    } else if (pet.boost.type === 'cooldown') {
      pet.boost.value = Math.max(0.5, pet.boost.value - 0.02);
    }
  }

  saveSimulatorData();

  return {
    success: true,
    pet: pet,
    leveledUp: pet.xp === 0,
    totalCoins: userData.coins,
  };
}

function viewPets(userId, guildId) {
  const userData = getUserData(userId, guildId);
  
  return {
    success: true,
    pets: userData.pets,
    equippedPet: userData.equippedPet,
    totalCoins: userData.coins,
  };
}

function equipPet(userId, guildId, petId) {
  const userData = getUserData(userId, guildId);
  const pet = userData.pets.find(p => p.id === parseInt(petId));

  if (!pet) {
    return { success: false, message: `Pet with ID **${petId}** not found!` };
  }

  userData.equippedPet = pet.id;
  saveSimulatorData();

  return {
    success: true,
    pet: pet,
    message: `You equipped ${pet.name}!`,
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
  eggTypes,
  potions,
  performFish,
  performMine,
  performFarm,
  performWork,
  claimDaily,
  performChallenge,
  claimVoteReward,
  beg,
  crime,
  search,
  hatchPet,
  feedPet,
  viewPets,
  equipPet,
  calculateXPNeeded,
  addXP,
};