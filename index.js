const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
  ChannelType,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("bot.db");
const fs = require("fs");

// Load or initialize counters
let counters = { ticketCount: 0, banCount: 0 };
try {
  counters = JSON.parse(fs.readFileSync("counter.json", "utf8"));
} catch (err) {
  fs.writeFileSync("counter.json", JSON.stringify(counters));
}

function saveCounters() {
  fs.writeFileSync("counter.json", JSON.stringify(counters));
}

// Leveling system data - moved to top to fix reference error
let userLevels = new Map();
try {
  const levelData = JSON.parse(fs.readFileSync("levels.json", "utf8"));
  userLevels = new Map(Object.entries(levelData));
} catch (err) {
  userLevels = new Map();
  fs.writeFileSync("levels.json", JSON.stringify({}));
}

function saveLevels() {
  fs.writeFileSync(
    "levels.json",
    JSON.stringify(Object.fromEntries(userLevels)),
  );
}

// Bot settings with automod defaults
let botSettings = {
  autoModEnabled: true,
  badWordsFilterEnabled: true,
  capsFilterEnabled: true,
  spamFilterEnabled: true,
  messageRateLimit: 5,
  messageDuplicateLimit: 3,
};

try {
  botSettings = JSON.parse(fs.readFileSync("settings.json", "utf8"));
} catch (err) {
  botSettings = {};
  fs.writeFileSync("settings.json", JSON.stringify(botSettings));
}

function saveSettings() {
  fs.writeFileSync("settings.json", JSON.stringify(botSettings));
}

// Initialize database tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY,
    user_id TEXT,
    status TEXT,
    claimed_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY,
    user_id TEXT,
    user_tag TEXT,
    reason TEXT,
    banned_by TEXT,
    banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    unbanned_by TEXT,
    unbanned_at DATETIME
  )`);
});

const cooldowns = new Map();
const rateLimit = new Map();
const messages = new Map();

// Load or initialize tickets
let tickets = new Map();
try {
  const ticketsData = JSON.parse(fs.readFileSync("tickets.json", "utf8"));
  tickets = new Map(Object.entries(ticketsData));
} catch (err) {
  tickets = new Map();
  fs.writeFileSync("tickets.json", JSON.stringify(Object.fromEntries(tickets)));
}

// Voting system
let votes = new Map();
let voteCounter = 0;
try {
  const votesData = JSON.parse(fs.readFileSync("votes.json", "utf8"));
  votes = new Map(Object.entries(votesData.votes || {}));
  voteCounter = votesData.counter || 0;
} catch (err) {
  fs.writeFileSync("votes.json", JSON.stringify({ votes: {}, counter: 0 }));
}

function saveVotes() {
  fs.writeFileSync(
    "votes.json",
    JSON.stringify({
      votes: Object.fromEntries(votes),
      counter: voteCounter,
    }),
  );
}

// Invite tracking
let inviteTracker = new Map();
try {
  const inviteData = JSON.parse(fs.readFileSync("invites.json", "utf8"));
  inviteTracker = new Map(Object.entries(inviteData));
} catch (err) {
  fs.writeFileSync("invites.json", JSON.stringify({}));
}

function saveInvites() {
  fs.writeFileSync(
    "invites.json",
    JSON.stringify(Object.fromEntries(inviteTracker)),
  );
}

// Achievements system
let achievements = new Map();
try {
  const achievementData = JSON.parse(
    fs.readFileSync("achievements.json", "utf8"),
  );
  achievements = new Map(Object.entries(achievementData));
} catch (err) {
  fs.writeFileSync("achievements.json", JSON.stringify({}));
}

function saveAchievements() {
  fs.writeFileSync(
    "achievements.json",
    JSON.stringify(Object.fromEntries(achievements)),
  );
}

const achievementList = {
  // First steps
  first_message: {
    name: "First Steps",
    description: "Send your first message",
    emoji: "👋",
    xp: 50,
  },
  weekend_warrior: {
    name: "Weekend Warrior",
    description: "Be active on weekends",
    emoji: "⚔️",
    xp: 100,
  },
  early_bird: {
    name: "Early Bird",
    description: "Send a message between 5-8 AM",
    emoji: "🌅",
    xp: 75,
  },

  // Level achievements
  level_5: {
    name: "Getting Started",
    description: "Reach level 5",
    emoji: "🌟",
    xp: 100,
  },
  level_10: {
    name: "Active Member",
    description: "Reach level 10",
    emoji: "🔥",
    xp: 200,
  },
  level_20: {
    name: "Dedicated",
    description: "Reach level 20",
    emoji: "💎",
    xp: 400,
  },
  level_30: {
    name: "Elite",
    description: "Reach level 30",
    emoji: "🏆",
    xp: 600,
  },
  level_50: {
    name: "Legend",
    description: "Reach level 50",
    emoji: "👑",
    xp: 1000,
  },

  // Activity achievements
  chatterer: {
    name: "Chatterer",
    description: "Send 100 messages",
    emoji: "💬",
    xp: 150,
  },

  // Social achievements
  inviter: {
    name: "Inviter",
    description: "Invite 5 people to the server",
    emoji: "📨",
    xp: 250,
  },

  // Voting achievements
  voter: {
    name: "Voter",
    description: "Participate in your first poll",
    emoji: "🗳️",
    xp: 100,
  },
  poll_creator: {
    name: "Poll Creator",
    description: "Create your first poll",
    emoji: "📊",
    xp: 150,
  },
};

function saveTickets() {
  fs.writeFileSync("tickets.json", JSON.stringify(Object.fromEntries(tickets)));
}

db.get("SELECT MAX(id) as max_id FROM tickets", (err, row) => {
  if (!err && row.max_id) counters.ticketCount = row.max_id;
});

// Helper function to check if user has required role
function hasRequiredRole(member, requiredLevel) {
  const guildSettings = serverSettings[member.guild.id] || {};

  // Server owner always has all permissions
  if (member.id === member.guild.ownerId) return true;

  // Check custom set roles first
  if (requiredLevel === "owner") {
    return (
      guildSettings.ownerRoleId &&
      member.roles.cache.has(guildSettings.ownerRoleId)
    );
  }

  if (requiredLevel === "admin") {
    const hasOwnerRole =
      guildSettings.ownerRoleId &&
      member.roles.cache.has(guildSettings.ownerRoleId);
    const hasAdminRole =
      guildSettings.adminRoleId &&
      member.roles.cache.has(guildSettings.adminRoleId);
    return hasOwnerRole || hasAdminRole;
  }

  if (requiredLevel === "mod") {
    const hasOwnerRole =
      guildSettings.ownerRoleId &&
      member.roles.cache.has(guildSettings.ownerRoleId);
    const hasAdminRole =
      guildSettings.adminRoleId &&
      member.roles.cache.has(guildSettings.adminRoleId);
    const hasModRole =
      guildSettings.modRoleId &&
      member.roles.cache.has(guildSettings.modRoleId);
    return hasOwnerRole || hasAdminRole || hasModRole;
  }

  // Fall back to default role names if custom roles aren't set
  const roleNames = [];
  if (requiredLevel === "owner") roleNames.push("Owner");
  if (requiredLevel === "admin") roleNames.push("Owner", "Admin");
  if (requiredLevel === "mod") roleNames.push("Owner", "Admin", "Moderator");

  return member.roles.cache.some((role) => roleNames.includes(role.name));
}

// Rate limiting function
function isRateLimited(userId, command, limit = 3, timeWindow = 10000) {
  if (!rateLimit.has(userId)) {
    rateLimit.set(userId, new Map());
  }

  const userRateLimit = rateLimit.get(userId);
  if (!userRateLimit.has(command)) {
    userRateLimit.set(command, []);
  }

  const timestamps = userRateLimit.get(command);
  const now = Date.now();

  // Remove old timestamps
  while (timestamps.length > 0 && timestamps[0] < now - timeWindow) {
    timestamps.shift();
  }

  if (timestamps.length >= limit) {
    return true;
  }

  timestamps.push(now);
  return false;
}

// Message cooldown
function isOnCooldown(userId, cooldownTime = 1500) {
  if (cooldowns.has(userId)) {
    const lastMessage = cooldowns.get(userId);
    if (Date.now() - lastMessage < cooldownTime) {
      return true;
    }
  }
  cooldowns.set(userId, Date.now());
  return false;
}

// Level XP calculation functions
function calculateXPForLevel(level) {
  // Exponential XP curve: 100 * level^2
  return 100 * Math.pow(level, 2);
}

function getRandomXP() {
  // Random XP between 15-25 per message
  return Math.floor(Math.random() * 11) + 15;
}

function addUserXP(userId, guildId, message) {
  const userKey = `${userId}-${guildId}`;

  // Get current user data or initialize new
  const userData = userLevels.get(userKey) || {
    xp: 0,
    level: 1,
    totalXP: 0,
    messages: 0,
  };

  // Check for first message achievement
  if (userData.messages === 0) {
    checkAchievement(userId, guildId, "first_message", message);
  }

  // Add XP
  const xpToAdd = getRandomXP();
  userData.xp += xpToAdd;
  userData.totalXP += xpToAdd;
  userData.messages += 1;

  // Check for level up
  let leveledUp = false;
  let newLevel = userData.level;

  while (
    userData.xp >=
    calculateXPForLevel(newLevel + 1) - calculateXPForLevel(newLevel)
  ) {
    userData.xp -=
      calculateXPForLevel(newLevel + 1) - calculateXPForLevel(newLevel);
    newLevel++;
    leveledUp = true;
  }

  // If user leveled up, send level up message and check achievements
  if (leveledUp) {
    userData.level = newLevel;

    // Check level achievements
    if (newLevel === 5) checkAchievement(userId, guildId, "level_5", message);
    if (newLevel === 10) checkAchievement(userId, guildId, "level_10", message);
    if (newLevel === 20) checkAchievement(userId, guildId, "level_20", message);
    if (newLevel === 30) checkAchievement(userId, guildId, "level_30", message);
    if (newLevel === 50) checkAchievement(userId, guildId, "level_50", message);

    // Get guild settings
    const guildSettings = serverSettings[guildId] || {};

    // Get the level channel if set, otherwise send in current channel
    const levelChannel = guildSettings.levelChannelId
      ? message.guild.channels.cache.get(guildSettings.levelChannelId)
      : message.channel;

    if (levelChannel) {
      const levelUpEmbed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle("🔥 Level Up!")
        .setDescription(
          `Congratulations ${message.author}! You've reached **Level ${newLevel}**! 🎉`,
        )
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "🏆 New Level", value: `${newLevel}`, inline: true },
          {
            name: "✨ Total Experience",
            value: `${userData.totalXP}`,
            inline: true,
          },
        )
        .setTimestamp();

      levelChannel.send({ embeds: [levelUpEmbed] }).catch((error) => {
        console.error("Error sending level up message:", error);
      });
    }
  }

  // Save updated user data
  userLevels.set(userKey, userData);
  saveLevels();

  // Check for message-based achievements
  checkMessageBasedAchievements(userId, guildId, message);
}

function checkAchievement(userId, guildId, achievementId, message) {
  const userKey = `${userId}-${guildId}`;
  const userAchievements = achievements.get(userKey) || [];

  if (!userAchievements.includes(achievementId)) {
    userAchievements.push(achievementId);
    achievements.set(userKey, userAchievements);
    saveAchievements();

    const achievement = achievementList[achievementId];
    if (achievement) {
      // Give bonus XP
      const userData = userLevels.get(userKey) || {
        xp: 0,
        level: 1,
        totalXP: 0,
        messages: 0,
      };
      userData.xp += achievement.xp;
      userData.totalXP += achievement.xp;
      userLevels.set(userKey, userData);
      saveLevels();

      const achievementEmbed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🏆 Achievement Unlocked!")
        .setDescription(`${message.author} earned: **${achievement.name}**`)
        .addFields(
          { name: "Description", value: achievement.description, inline: true },
          { name: "Bonus XP", value: `+${achievement.xp}`, inline: true },
        )
        .setTimestamp();

      message.channel.send({ embeds: [achievementEmbed] }).catch((error) => {
        console.error("Error sending achievement message:", error);
      });
    }
  }
}

// Simplified achievement checking function
function checkMessageBasedAchievements(userId, guildId, message) {
  const userKey = `${userId}-${guildId}`;
  const userData = userLevels.get(userKey) || {
    xp: 0,
    level: 1,
    totalXP: 0,
    messages: 0,
  };
  const userAchievements = achievements.get(userKey) || [];

  const currentDay = new Date().getDay(); // 0 = Sunday, 6 = Saturday

  // Weekend warrior achievement
  if (
    (currentDay === 0 || currentDay === 6) &&
    !userAchievements.includes("weekend_warrior")
  ) {
    checkAchievement(userId, guildId, "weekend_warrior", message);
  }

  // Early bird achievement (5 AM - 8 AM)
  const currentHour = new Date().getHours();
  if (
    currentHour >= 5 &&
    currentHour < 8 &&
    !userAchievements.includes("early_bird")
  ) {
    checkAchievement(userId, guildId, "early_bird", message);
  }

  // Message count achievements
  if (userData.messages >= 100 && !userAchievements.includes("chatterer")) {
    checkAchievement(userId, guildId, "chatterer", message);
  }

  userLevels.set(userKey, userData);
}

const simulator = require("./simulator.js");

// Fishing Game Data
let fishingGameData = {};

try {
  fishingGameData = JSON.parse(fs.readFileSync("fishing.json", "utf8"));
} catch (err) {
  fishingGameData = {};
  fs.writeFileSync("fishing.json", JSON.stringify(fishingGameData));
}

function saveFishingData(userKey, data) {
  fishingGameData[userKey] = data;
  fs.writeFileSync("fishing.json", JSON.stringify(fishingGameData, null, 2));
}

function getFishingData(userKey) {
  if (!fishingGameData[userKey]) {
    fishingGameData[userKey] = {
      coins: 100,
      experience: 0,
      currentRod: { id: "basic_rod", ...fishingRods["basic_rod"] },
      ownedRods: ["basic_rod"],
      currentBoat: { id: "basic_boat", name: "Rowboat", speedBonus: 0 },
      ownedBoats: ["basic_boat"],
      currentArea: "pond",
      currentBait: null,
      baitInventory: {},
      fishCaught: {},
      totalFish: 0,
      totalCasts: 0,
      lastFished: 0,
      fishingStreak: 0,
      lastStreakDate: null,
      biggestCatch: null,
    };
  }
  return fishingGameData[userKey];
}

const fishingRods = {
  basic_rod: {
    name: "Basic Rod",
    emoji: "🎣",
    catchRate: 50,
    rareBonus: 0,
    price: 0,
    description: "A simple fishing rod",
  },
  sturdy_rod: {
    name: "Sturdy Rod",
    emoji: "🎣",
    catchRate: 65,
    rareBonus: 5,
    price: 500,
    description: "A more reliable rod",
  },
  pro_rod: {
    name: "Pro Rod",
    emoji: "🎣",
    catchRate: 75,
    rareBonus: 10,
    price: 2000,
    description: "For serious fishermen",
  },
  master_rod: {
    name: "Master Rod",
    emoji: "🎣",
    catchRate: 85,
    rareBonus: 20,
    price: 10000,
    description: "Top tier fishing equipment",
  },
  legendary_rod: {
    name: "Legendary Rod",
    emoji: "✨",
    catchRate: 95,
    rareBonus: 35,
    price: 50000,
    description: "The ultimate fishing rod",
  },
};

const fishingAreas = {
  pond: {
    id: "pond",
    name: "Pond",
    emoji: "🏞️",
    unlockLevel: 0,
    fishMultiplier: 1,
    rareBonus: 0,
    travelCost: 0,
    description: "A peaceful pond",
  },
  lake: {
    id: "lake",
    name: "Lake",
    emoji: "🌊",
    unlockLevel: 5,
    fishMultiplier: 1.5,
    rareBonus: 5,
    travelCost: 100,
    description: "A vast lake",
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    emoji: "🌊",
    unlockLevel: 15,
    fishMultiplier: 2,
    rareBonus: 15,
    travelCost: 500,
    description: "The deep ocean",
  },
  deep_sea: {
    id: "deep_sea",
    name: "Deep Sea",
    emoji: "🌊",
    unlockLevel: 30,
    fishMultiplier: 3,
    rareBonus: 30,
    travelCost: 2000,
    description: "Mysterious depths",
  },
};

const fishTypes = {
  bass: {
    id: "bass",
    name: "Bass",
    emoji: "🐟",
    value: 10,
    experience: 5,
    rarity: "Common",
    size: "Small",
  },
  trout: {
    id: "trout",
    name: "Trout",
    emoji: "🐟",
    value: 15,
    experience: 8,
    rarity: "Common",
    size: "Small",
  },
  salmon: {
    id: "salmon",
    name: "Salmon",
    emoji: "🐠",
    value: 30,
    experience: 15,
    rarity: "Uncommon",
    size: "Medium",
  },
  tuna: {
    id: "tuna",
    name: "Tuna",
    emoji: "🐠",
    value: 50,
    experience: 25,
    rarity: "Uncommon",
    size: "Medium",
  },
  swordfish: {
    id: "swordfish",
    name: "Swordfish",
    emoji: "🗡️",
    value: 100,
    experience: 50,
    rarity: "Rare",
    size: "Large",
  },
  marlin: {
    id: "marlin",
    name: "Marlin",
    emoji: "🐟",
    value: 200,
    experience: 100,
    rarity: "Rare",
    size: "Large",
  },
  shark: {
    id: "shark",
    name: "Shark",
    emoji: "🦈",
    value: 500,
    experience: 250,
    rarity: "Epic",
    size: "Huge",
  },
  whale: {
    id: "whale",
    name: "Whale",
    emoji: "🐋",
    value: 1000,
    experience: 500,
    rarity: "Epic",
    size: "Huge",
  },
  golden_fish: {
    id: "golden_fish",
    name: "Golden Fish",
    emoji: "🏆",
    value: 2500,
    experience: 1000,
    rarity: "Legendary",
    size: "Medium",
  },
  kraken: {
    id: "kraken",
    name: "Kraken",
    emoji: "🐙",
    value: 10000,
    experience: 5000,
    rarity: "Mythical",
    size: "Colossal",
  },
};

const baitTypes = {
  worm: { id: "worm", name: "Worm", emoji: "🪱", catchBonus: 5, price: 5 },
  lure: { id: "lure", name: "Lure", emoji: "🎣", catchBonus: 10, price: 15 },
  super_bait: {
    id: "super_bait",
    name: "Super Bait",
    emoji: "✨",
    catchBonus: 20,
    price: 50,
  },
};

function simulateFishing(fishingData) {
  const rod = fishingData.currentRod;
  const area = fishingAreas[fishingData.currentArea];
  let catchRate = rod.catchRate;

  if (fishingData.currentBait) {
    const bait = baitTypes[fishingData.currentBait];
    catchRate += bait.catchBonus;
  }

  const roll = Math.random() * 100;

  if (roll > catchRate) {
    return { caught: false };
  }

  // Determine rarity
  const rarityRoll = Math.random() * 100;
  let rarity = "Common";
  const rareBonus = rod.rareBonus + area.rareBonus;

  if (rarityRoll < 1 + rareBonus * 0.1) rarity = "Mythical";
  else if (rarityRoll < 5 + rareBonus * 0.3) rarity = "Legendary";
  else if (rarityRoll < 15 + rareBonus * 0.5) rarity = "Epic";
  else if (rarityRoll < 35 + rareBonus) rarity = "Rare";
  else if (rarityRoll < 60) rarity = "Uncommon";

  // Get random fish of that rarity
  const fishPool = Object.values(fishTypes).filter((f) => f.rarity === rarity);
  const fish =
    fishPool[Math.floor(Math.random() * fishPool.length)] || fishTypes.bass;

  return { caught: true, fish, sizeVariation: (Math.random() - 0.5) * 0.4 };
}

function getRarityEmoji(rarity) {
  const emojis = {
    Common: "⚪",
    Uncommon: "🟢",
    Rare: "🔵",
    Epic: "🟣",
    Legendary: "🟡",
    Mythical: "🔴",
  };
  return emojis[rarity] || "⚪";
}

function getRarestCatch(fishingData) {
  const rarityOrder = [
    "Common",
    "Uncommon",
    "Rare",
    "Epic",
    "Legendary",
    "Mythical",
  ];
  let rarest = "None";
  let rarestLevel = -1;

  for (const fishId of Object.keys(fishingData.fishCaught)) {
    const fish = fishTypes[fishId];
    if (fish) {
      const level = rarityOrder.indexOf(fish.rarity);
      if (level > rarestLevel) {
        rarestLevel = level;
        rarest = `${fish.emoji} ${fish.name}`;
      }
    }
  }

  return rarest;
}

function countRareFish(fishingData) {
  let count = 0;
  for (const fishId of Object.keys(fishingData.fishCaught)) {
    const fish = fishTypes[fishId];
    if (
      fish &&
      (fish.rarity === "Rare" ||
        fish.rarity === "Epic" ||
        fish.rarity === "Legendary" ||
        fish.rarity === "Mythical")
    ) {
      count += fishingData.fishCaught[fishId];
    }
  }
  return count;
}

function processWorkerIncome(fishingData) {
  // Placeholder for future worker system
  return fishingData;
}

const token = "MTQwOTkyNDQ0OTM1NjA5MTQ1Mg.Glv25D.5gohRHFrgtUix3LTv1CTHrP4RHfU2nGIP_2VN";

if (!token) {
  console.error("Error: DISCORD_BOT_TOKEN environment variable is not set!");
  process.exit(1);
}

const client = new Client({
  intents: Object.values(GatewayIntentBits),
  partials: Object.values(Partials),
  allowedMentions: { parse: ["users", "roles"], repliedUser: true },
  restTimeOffset: 0,
  failIfNotExists: false,
  presence: {
    activities: [{ name: `Fling Ladder`, type: ActivityType.Playing }],
    status: "online",
  },
});

const prefixes = ["!", "/"];

// Server settings with defaults
let serverSettings = {};

try {
  serverSettings = JSON.parse(fs.readFileSync("serverSettings.json", "utf8"));
} catch (err) {
  serverSettings = {};
  fs.writeFileSync("serverSettings.json", JSON.stringify(serverSettings));
}

function saveServerSettings() {
  fs.writeFileSync("serverSettings.json", JSON.stringify(serverSettings));
}

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} servers`);
  console.log(`Watching ${client.users.cache.size} users`);

  // Cache invites for tracking
  for (const guild of client.guilds.cache.values()) {
    try {
      const guildInvites = await guild.invites.fetch();
      const inviteMap = new Map();
      guildInvites.forEach((invite) => {
        inviteMap.set(invite.code, {
          uses: invite.uses,
          inviterId: invite.inviter?.id,
        });
      });
      inviteTracker.set(guild.id, inviteMap);
    } catch (error) {
      console.error(`Error caching invites for ${guild.name}:`, error);
    }
  }
  saveInvites();

  // Verify existing tickets
  for (const [channelName, ticketData] of tickets.entries()) {
    let ticketChannelExists = false;

    for (const guild of client.guilds.cache.values()) {
      const channel = guild.channels.cache.get(ticketData.channelId);
      if (channel) {
        ticketChannelExists = true;
        break;
      }
    }

    // Remove ticket from map if channel no longer exists
    if (!ticketChannelExists) {
      tickets.delete(channelName);
    }
  }

  // Save cleaned up tickets
  saveTickets();

  setInterval(() => {
    const activities = [
      { name: `Fling Ladder`, type: ActivityType.Playing },
      {
        name: `${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)} climbers`,
        type: ActivityType.Watching,
      },
      {
        name: `${client.guilds.cache.size} ladders`,
        type: ActivityType.Competing,
      },
    ];
    client.user.setPresence({
      activities: [activities[Math.floor(Math.random() * activities.length)]],
      status: "online",
    });
  }, 60000);

  console.log("Bot is ready and optimized!");

  setInterval(
    () => {
      updateMemberCountChannels();
    },
    10 * 60 * 1000,
  );

  updateMemberCountChannels();

  // Register slash commands globally
  const commands = [
    // General Commands
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Display the bot's help menu"),
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Check bot latency"),
    new SlashCommandBuilder()
      .setName("rules")
      .setDescription("Display server rules"),
    new SlashCommandBuilder()
      .setName("avatar")
      .setDescription("Display user avatar")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to view avatar")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("servericon")
      .setDescription("Display server icon"),

    // Leveling System
    new SlashCommandBuilder()
      .setName("level")
      .setDescription("View level and XP stats")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to view stats")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("View server leaderboard"),
    new SlashCommandBuilder()
      .setName("achievements")
      .setDescription("View achievements")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to view achievements")
          .setRequired(false),
      ),

    // Simulator Commands
    new SlashCommandBuilder().setName("fish").setDescription("Go fishing!"),
    new SlashCommandBuilder()
      .setName("mine")
      .setDescription("Mine for ores and gems!"),
    new SlashCommandBuilder().setName("farm").setDescription("Harvest crops!"),
    new SlashCommandBuilder()
      .setName("profile")
      .setDescription("View your simulator profile"),
    new SlashCommandBuilder()
      .setName("fishstats")
      .setDescription("View fishing statistics")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to view stats")
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName("fishinventory")
      .setDescription("View your fishing inventory"),
    new SlashCommandBuilder()
      .setName("mineinventory")
      .setDescription("View your mining inventory"),
    new SlashCommandBuilder()
      .setName("farminventory")
      .setDescription("View your farming inventory"),
    new SlashCommandBuilder()
      .setName("fishstore")
      .setDescription("View the fishing rod store"),
    new SlashCommandBuilder()
      .setName("minestore")
      .setDescription("View the pickaxe store"),
    new SlashCommandBuilder()
      .setName("farmstore")
      .setDescription("View the hoe store"),
    new SlashCommandBuilder()
      .setName("work")
      .setDescription("Work for coins and XP"),
    new SlashCommandBuilder()
      .setName("trade")
      .setDescription("Trade with another user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to trade with")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("daily")
      .setDescription("Claim your daily coins reward"),
    new SlashCommandBuilder()
      .setName("beg")
      .setDescription("Beg for some coins"),
    new SlashCommandBuilder()
      .setName("crime")
      .setDescription("Commit a crime for coins (risky!)"),
    new SlashCommandBuilder()
      .setName("search")
      .setDescription("Search a location for coins")
      .addStringOption((option) =>
        option
          .setName("location")
          .setDescription("Where to search")
          .setRequired(true)
          .addChoices(
            { name: "Trash Can", value: "trash" },
            { name: "Park Bench", value: "bench" },
            { name: "Mailbox", value: "mailbox" },
            { name: "Couch", value: "couch" },
            { name: "Street", value: "street" }
          )
      ),

    // Pet Commands
    new SlashCommandBuilder()
      .setName("hatch")
      .setDescription("Hatch a pet from an egg")
      .addStringOption((option) =>
        option
          .setName("egg")
          .setDescription("Type of egg to hatch")
          .setRequired(true)
          .addChoices(
            { name: "Common Egg (500 coins)", value: "common_egg" },
            { name: "Epic Egg (2000 coins)", value: "epic_egg" },
            { name: "Legendary Egg (5000 coins)", value: "legendary_egg" },
            { name: "Mythic Egg (10000 coins)", value: "mythic_egg" }
          )
      ),
    new SlashCommandBuilder()
      .setName("feed")
      .setDescription("Feed your pet")
      .addIntegerOption((option) =>
        option
          .setName("petid")
          .setDescription("ID of the pet to feed")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("pets")
      .setDescription("View all your pets"),
    new SlashCommandBuilder()
      .setName("equippet")
      .setDescription("Equip a pet")
      .addIntegerOption((option) =>
        option
          .setName("petid")
          .setDescription("ID of the pet to equip")
          .setRequired(true)
      ),

    // Gaming Commands
    new SlashCommandBuilder()
      .setName("8ball")
      .setDescription("Ask the magic 8-ball a question")
      .addStringOption((option) =>
        option
          .setName("question")
          .setDescription("Your question")
          .setRequired(true),
      ),
    new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),
    new SlashCommandBuilder()
      .setName("dice")
      .setDescription("Roll a die")
      .addIntegerOption((option) =>
        option
          .setName("sides")
          .setDescription("Number of sides (2-100)")
          .setRequired(false)
          .setMinValue(2)
          .setMaxValue(100),
      ),
    new SlashCommandBuilder()
      .setName("rps")
      .setDescription("Play rock paper scissors")
      .addStringOption((option) =>
        option
          .setName("choice")
          .setDescription("Your choice")
          .setRequired(true)
          .addChoices(
            { name: "Rock", value: "rock" },
            { name: "Paper", value: "paper" },
            { name: "Scissors", value: "scissors" },
          ),
      ),
  ];

  try {
    await client.application.commands.set(commands);
    console.log("Slash commands registered successfully!");
  } catch (error) {
    console.error("Error registering slash commands:", error);
  }
});

async function updateMemberCountChannels() {
  client.guilds.cache.forEach(async (guild) => {
    try {
      // Fetch all members to ensure accurate count
      await guild.members.fetch();

      const totalMembers = guild.memberCount;
      const humanMembers = guild.members.cache.filter(
        (member) => !member.user.bot,
      ).size;
      const botMembers = guild.members.cache.filter(
        (member) => member.user.bot,
      ).size;

      // Get guild settings or use default channel names
      const guildSettings = serverSettings[guild.id] || {};

      // Use custom channel IDs if set, otherwise find by default naming pattern
      const allMembersChannel = guildSettings.allMembersChannelId
        ? guild.channels.cache.get(guildSettings.allMembersChannelId)
        : guild.channels.cache.find((channel) =>
            channel.name.startsWith("👥┃all-members-"),
          );

      const membersChannel = guildSettings.membersChannelId
        ? guild.channels.cache.get(guildSettings.membersChannelId)
        : guild.channels.cache.find((channel) =>
            channel.name.startsWith("👤┃members-"),
          );

      const botsChannel = guildSettings.botsChannelId
        ? guild.channels.cache.get(guildSettings.botsChannelId)
        : guild.channels.cache.find((channel) =>
            channel.name.startsWith("🤖┃bots-"),
          );

      if (allMembersChannel) {
        await allMembersChannel.setName(`👥┃all-members-${totalMembers}`);
      }

      if (membersChannel) {
        await membersChannel.setName(`👤┃members-${humanMembers}`);
      }

      if (botsChannel) {
        await botsChannel.setName(`🤖┃bots-${botMembers}`);
      }

      console.log(`Updated member count channels for ${guild.name}`);
    } catch (error) {
      console.error(
        `Error updating member count channels for ${guild.name}:`,
        error,
      );
    }
  });
}

client.on("guildMemberAdd", async (member) => {
  try {
    // Track invites
    const newInvites = await member.guild.invites.fetch();
    let oldInvites = inviteTracker.get(member.guild.id);

    // Convert to Map if it's a plain object (from JSON loading)
    if (oldInvites && !(oldInvites instanceof Map)) {
      oldInvites = new Map(Object.entries(oldInvites));
      inviteTracker.set(member.guild.id, oldInvites);
    }

    if (!oldInvites) {
      oldInvites = new Map();
    }

    let inviterData = null;
    for (const [code, invite] of newInvites) {
      const oldInvite = oldInvites.get(code);
      if (oldInvite && invite.uses > oldInvite.uses) {
        inviterData = {
          code: code,
          inviterId: invite.inviter.id,
          inviterTag: invite.inviter.tag,
        };

        // Update invite count for inviter
        const inviterKey = `${invite.inviter.id}-${member.guild.id}`;
        const inviterAchievements = achievements.get(inviterKey) || [];

        // Count total invites for this user
        let totalInvites = 0;
        for (const [inviteCode, inviteData] of newInvites) {
          if (inviteData.inviter?.id === invite.inviter.id) {
            totalInvites += inviteData.uses;
          }
        }

        // Check for inviter achievement
        if (totalInvites >= 5 && !inviterAchievements.includes("inviter")) {
          const fakeMessage = {
            author: invite.inviter,
            channel: member.guild.channels.cache.find(
              (c) => c.type === ChannelType.GuildText,
            ),
            guild: member.guild,
          };
          if (fakeMessage.channel) {
            checkAchievement(
              invite.inviter.id,
              member.guild.id,
              "inviter",
              fakeMessage,
            );
          }
        }

        break;
      }
    }

    // Update cached invites
    const inviteMap = new Map();
    newInvites.forEach((invite) => {
      inviteMap.set(invite.code, {
        uses: invite.uses,
        inviterId: invite.inviter?.id,
      });
    });
    inviteTracker.set(member.guild.id, inviteMap);
    saveInvites();

    // Get guild settings
    const guildSettings = serverSettings[member.guild.id] || {};

    // Use custom welcome channel if set, otherwise find by default name
    const welcomeChannel = guildSettings.welcomeChannelId
      ? member.guild.channels.cache.get(guildSettings.welcomeChannelId)
      : member.guild.channels.cache.find(
          (channel) => channel.name === "👋┃welcome",
        );

    if (welcomeChannel) {
      const welcomeEmbed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle("New Member!")
        .setDescription(
          `Welcome to Fling Ladder, ${member}! We hope you enjoy your stay :)`,
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({
          text: `We now have ${member.guild.memberCount} members!`,
        });

      if (inviterData) {
        welcomeEmbed.addFields({
          name: "Invited by",
          value: `<@${inviterData.inviterId}>`,
          inline: true,
        });
      }

      welcomeChannel.send({ embeds: [welcomeEmbed] });
    }

    // Use custom member role if set, otherwise fall back to default "Member" role
    let memberRole = null;

    if (guildSettings.memberRoleId) {
      memberRole = member.guild.roles.cache.get(guildSettings.memberRoleId);
    } else {
      memberRole = member.guild.roles.cache.find(
        (role) => role.name === "Member",
      );
    }

    if (memberRole) {
      await member.roles.add(memberRole);
    }

    if (member.user.bot) {
      const botRole = member.guild.roles.cache.find(
        (role) => role.name === "Bot",
      );
      if (botRole) {
        await member.roles.add(botRole);
      }
    }

    // Update member count with slight delay to ensure proper count
    setTimeout(() => {
      updateMemberCountChannels();
    }, 1000);
  } catch (error) {
    console.error("Error in welcoming new member:", error);
  }
});

client.on("guildMemberRemove", async (member) => {
  // Update member count with slight delay to ensure proper count
  setTimeout(() => {
    updateMemberCountChannels();
  }, 1000);
});

// Handle reactions for vote updates
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  // Simplified reaction tracking (removed complex tracking)

  // Handle vote reactions
  const reactions = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
  if (reactions.includes(reaction.emoji.name)) {
    await updateVoteMessage(reaction, user, "add");
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot) return;

  // Handle vote reactions
  const reactions = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
  if (reactions.includes(reaction.emoji.name)) {
    await updateVoteMessage(reaction, user, "remove");
  }
});

async function updateVoteMessage(reaction, user, action) {
  try {
    // Find the vote that corresponds to this message
    let voteData = null;
    let voteId = null;

    for (const [id, vote] of votes.entries()) {
      if (vote.messageId === reaction.message.id && vote.active) {
        voteData = vote;
        voteId = id;
        break;
      }
    }

    if (!voteData) return;

    const reactionIndex = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"].indexOf(reaction.emoji.name);
    if (reactionIndex === -1 || reactionIndex >= voteData.options.length)
      return;

    // Update vote data
    if (action === "add") {
      // Check if user already voted
      if (voteData.votes.has(user.id)) {
        // Remove their old vote
        const oldChoice = voteData.votes.get(user.id);
        // Remove reaction from old choice if different
        if (oldChoice !== reactionIndex) {
          try {
            const oldReaction = reaction.message.reactions.cache.get(
              ["1️⃣", "2️⃣", "3️⃣", "4️⃣"][oldChoice],
            );
            if (oldReaction) {
              await oldReaction.users.remove(user.id);
            }
          } catch (error) {
            console.error("Error removing old reaction:", error);
          }
        }
      }
      voteData.votes.set(user.id, reactionIndex);
    } else if (action === "remove") {
      // Only remove if this was their actual vote
      if (voteData.votes.get(user.id) === reactionIndex) {
        voteData.votes.delete(user.id);
      }
    }

    votes.set(voteId, voteData);
    saveVotes();

    // Update the message with new vote counts
    const totalVotes = voteData.votes.size;
    const results = new Array(voteData.options.length).fill(0);

    for (const vote of voteData.votes.values()) {
      results[vote]++;
    }

    const updatedFields = voteData.options.map((option, index) => {
      const voteCount = results[index];
      const percentage =
        totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
      return {
        name: `${index + 1}️⃣ ${option}`,
        value: `${voteCount} votes (${percentage}%)`,
        inline: true,
      };
    });

    const updatedEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle(`📊 Poll #${voteId}`)
      .setDescription(voteData.question)
      .addFields(updatedFields)
      .setFooter({
        text: `Use !vote participate ${voteId} to vote | Created by ${reaction.message.guild.members.cache.get(voteData.createdBy)?.user.tag || "Unknown"}`,
      })
      .setTimestamp();

    await reaction.message.edit({ embeds: [updatedEmbed] });
  } catch (error) {
    console.error("Error updating vote message:", error);
  }
}

// Enhanced server logging system
function getLogsChannel(guild) {
  const guildSettings = serverSettings[guild.id] || {};
  return guildSettings.logsChannelId
    ? guild.channels.cache.get(guildSettings.logsChannelId)
    : null;
}

client.on("messageDelete", async (message) => {
  if (!message.guild || message.author?.bot) return;

  const logsChannel = getLogsChannel(message.guild);
  if (logsChannel && message.content) {
    const logEmbed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("🗑️ Message Deleted")
      .setDescription(
        `Message by ${message.author} was deleted in ${message.channel}`,
      )
      .addFields(
        {
          name: "Content",
          value:
            message.content.length > 1024
              ? message.content.substring(0, 1021) + "..."
              : message.content,
        },
        { name: "Channel", value: `${message.channel}`, inline: true },
        { name: "Author", value: `${message.author}`, inline: true },
      )
      .setTimestamp();

    await logsChannel
      .send({ embeds: [logEmbed] })
      .catch((err) => console.error("Failed to send delete log:", err));
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const logsChannel = getLogsChannel(oldMessage.guild);
  if (logsChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor("#FFA500")
      .setTitle("✏️ Message Edited")
      .setDescription(
        `Message by ${oldMessage.author} was edited in ${oldMessage.channel}`,
      )
      .addFields(
        {
          name: "Before",
          value:
            (oldMessage.content || "No content").length > 512
              ? (oldMessage.content || "No content").substring(0, 509) + "..."
              : oldMessage.content || "No content",
        },
        {
          name: "After",
          value:
            (newMessage.content || "No content").length > 512
              ? (newMessage.content || "No content").substring(0, 509) + "..."
              : newMessage.content || "No content",
        },
        { name: "Channel", value: `${oldMessage.channel}`, inline: true },
        { name: "Author", value: `${oldMessage.author}`, inline: true },
      )
      .setTimestamp();

    await logsChannel
      .send({ embeds: [logEmbed] })
      .catch((err) => console.error("Failed to send edit log:", err));
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const logsChannel = getLogsChannel(oldMember.guild);
  if (!logsChannel) return;

  const oldRoles =
    oldMember.roles.cache.map((role) => role.name).join(", ") || "None";
  const newRoles =
    newMember.roles.cache.map((role) => role.name).join(", ") || "None";

  if (oldRoles !== newRoles) {
    const logEmbed = new EmbedBuilder()
      .setColor("#0000FF")
      .setTitle("👤 Member Roles Updated")
      .setDescription(`Roles updated for ${newMember.user.tag}`)
      .addFields(
        {
          name: "Old Roles",
          value:
            oldRoles.length > 1024
              ? oldRoles.substring(0, 1021) + "..."
              : oldRoles,
        },
        {
          name: "New Roles",
          value:
            newRoles.length > 1024
              ? newRoles.substring(0, 1021) + "..."
              : newRoles,
        },
        { name: "Member", value: `${newMember.user}`, inline: true },
        { name: "User ID", value: newMember.id, inline: true },
      )
      .setTimestamp();

    await logsChannel
      .send({ embeds: [logEmbed] })
      .catch((err) => console.error("Failed to send member update log:", err));
  }

  // Log nickname changes
  if (oldMember.nickname !== newMember.nickname) {
    const nicknameEmbed = new EmbedBuilder()
      .setColor("#9B59B6")
      .setTitle("📝 Nickname Changed")
      .setDescription(`${newMember.user.tag}'s nickname was changed`)
      .addFields(
        {
          name: "Old Nickname",
          value: oldMember.nickname || "None",
          inline: true,
        },
        {
          name: "New Nickname",
          value: newMember.nickname || "None",
          inline: true,
        },
        { name: "Member", value: `${newMember.user}`, inline: true },
      )
      .setTimestamp();

    await logsChannel
      .send({ embeds: [nicknameEmbed] })
      .catch((err) => console.error("Failed to send nickname log:", err));
  }
});

// Channel logging events
client.on("channelCreate", async (channel) => {
  if (!channel.guild) return;

  const logsChannel = getLogsChannel(channel.guild);
  if (logsChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("📝 Channel Created")
      .setDescription(`A new channel was created`)
      .addFields(
        { name: "Channel", value: `${channel}`, inline: true },
        { name: "Type", value: channel.type.toString(), inline: true },
        {
          name: "Category",
          value: channel.parent ? channel.parent.name : "None",
          inline: true,
        },
        { name: "Channel ID", value: channel.id, inline: true },
      )
      .setTimestamp();

    await logsChannel
      .send({ embeds: [logEmbed] })
      .catch((err) => console.error("Failed to send channel create log:", err));
  }
});

client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;

  const logsChannel = getLogsChannel(channel.guild);
  if (logsChannel && channel.id !== logsChannel.id) {
    // Don't log if logs channel itself is deleted
    const logEmbed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("🗑️ Channel Deleted")
      .setDescription(`A channel was deleted`)
      .addFields(
        { name: "Channel Name", value: channel.name, inline: true },
        { name: "Type", value: channel.type.toString(), inline: true },
        {
          name: "Category",
          value: channel.parent ? channel.parent.name : "None",
          inline: true,
        },
        { name: "Channel ID", value: channel.id, inline: true },
      )
      .setTimestamp();

    await logsChannel
      .send({ embeds: [logEmbed] })
      .catch((err) => console.error("Failed to send channel delete log:", err));
  }
});

client.on("channelUpdate", async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  const logsChannel = getLogsChannel(newChannel.guild);
  if (logsChannel) {
    const changes = [];

    if (oldChannel.name !== newChannel.name) {
      changes.push({
        name: "Name Changed",
        value: `${oldChannel.name} → ${newChannel.name}`,
      });
    }

    if (oldChannel.topic !== newChannel.topic) {
      changes.push({
        name: "Topic Changed",
        value: `${oldChannel.topic || "None"} → ${newChannel.topic || "None"}`,
      });
    }

    if (oldChannel.parent?.id !== newChannel.parent?.id) {
      changes.push({
        name: "Category Changed",
        value: `${oldChannel.parent?.name || "None"} → ${newChannel.parent?.name || "None"}`,
      });
    }

    if (changes.length > 0) {
      const logEmbed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle("✏️ Channel Updated")
        .setDescription(`Channel ${newChannel} was modified`)
        .addFields(changes)
        .addFields({ name: "Channel ID", value: newChannel.id, inline: true })
        .setTimestamp();

      await logsChannel
        .send({ embeds: [logEmbed] })
        .catch((err) =>
          console.error("Failed to send channel update log:", err),
        );
    }
  }
});

// Role logging events
client.on("roleCreate", async (role) => {
  const logsChannel = getLogsChannel(role.guild);
  if (logsChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("🎭 Role Created")
      .setDescription(`A new role was created`)
      .addFields(
        { name: "Role", value: `${role}`, inline: true },
        { name: "Color", value: role.hexColor, inline: true },
        { name: "Hoisted", value: role.hoist ? "Yes" : "No", inline: true },
        {
          name: "Mentionable",
          value: role.mentionable ? "Yes" : "No",
          inline: true,
        },
        { name: "Role ID", value: role.id, inline: true },
      )
      .setTimestamp();

    await logsChannel
      .send({ embeds: [logEmbed] })
      .catch((err) => console.error("Failed to send role create log:", err));
  }
});

client.on("roleDelete", async (role) => {
  const logsChannel = getLogsChannel(role.guild);
  if (logsChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("🗑️ Role Deleted")
      .setDescription(`A role was deleted`)
      .addFields(
        { name: "Role Name", value: role.name, inline: true },
        { name: "Color", value: role.hexColor, inline: true },
        { name: "Members", value: role.members.size.toString(), inline: true },
        { name: "Role ID", value: role.id, inline: true },
      )
      .setTimestamp();

    await logsChannel
      .send({ embeds: [logEmbed] })
      .catch((err) => console.error("Failed to send role delete log:", err));
  }
});

client.on("roleUpdate", async (oldRole, newRole) => {
  const logsChannel = getLogsChannel(newRole.guild);
  if (logsChannel) {
    const changes = [];

    if (oldRole.name !== newRole.name) {
      changes.push({
        name: "Name Changed",
        value: `${oldRole.name} → ${newRole.name}`,
      });
    }

    if (oldRole.hexColor !== newRole.hexColor) {
      changes.push({
        name: "Color Changed",
        value: `${oldRole.hexColor} → ${newRole.hexColor}`,
      });
    }

    if (oldRole.hoist !== newRole.hoist) {
      changes.push({
        name: "Hoisted Changed",
        value: `${oldRole.hoist ? "Yes" : "No"} → ${newRole.hoist ? "Yes" : "No"}`,
      });
    }

    if (oldRole.mentionable !== newRole.mentionable) {
      changes.push({
        name: "Mentionable Changed",
        value: `${oldRole.mentionable ? "Yes" : "No"} → ${newRole.mentionable ? "Yes" : "No"}`,
      });
    }

    if (changes.length > 0) {
      const logEmbed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle("🎭 Role Updated")
        .setDescription(`Role ${newRole} was modified`)
        .addFields(changes)
        .addFields({ name: "Role ID", value: newRole.id, inline: true })
        .setTimestamp();

      await logsChannel
        .send({ embeds: [logEmbed] })
        .catch((err) => console.error("Failed to send role update log:", err));
    }
  }
});

// Channel permission overwrite logging
client.on("channelUpdate", async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  const logsChannel = getLogsChannel(newChannel.guild);
  if (!logsChannel) return;

  // Check for permission overwrites changes
  const oldOverwrites = oldChannel.permissionOverwrites.cache;
  const newOverwrites = newChannel.permissionOverwrites.cache;

  // Find added overwrites
  newOverwrites.forEach(async (newOverwrite, id) => {
    const oldOverwrite = oldOverwrites.get(id);
    if (!oldOverwrite) {
      // New permission overwrite added
      const target =
        newOverwrite.type === 0
          ? newChannel.guild.roles.cache.get(id)
          : newChannel.guild.members.cache.get(id);
      if (target) {
        const logEmbed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("🔐 Channel Permissions Added")
          .setDescription(`New permissions set for ${newChannel}`)
          .addFields(
            { name: "Target", value: target.toString(), inline: true },
            {
              name: "Type",
              value: newOverwrite.type === 0 ? "Role" : "Member",
              inline: true,
            },
            {
              name: "Allow",
              value: newOverwrite.allow.toArray().join(", ") || "None",
              inline: false,
            },
            {
              name: "Deny",
              value: newOverwrite.deny.toArray().join(", ") || "None",
              inline: false,
            },
          )
          .setTimestamp();

        await logsChannel
          .send({ embeds: [logEmbed] })
          .catch((err) =>
            console.error("Failed to send permission add log:", err),
          );
      }
    } else if (
      oldOverwrite.allow.bitfield !== newOverwrite.allow.bitfield ||
      oldOverwrite.deny.bitfield !== newOverwrite.deny.bitfield
    ) {
      // Permission overwrite modified
      const target =
        newOverwrite.type === 0
          ? newChannel.guild.roles.cache.get(id)
          : newChannel.guild.members.cache.get(id);
      if (target) {
        const logEmbed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle("🔐 Channel Permissions Updated")
          .setDescription(`Permissions updated for ${newChannel}`)
          .addFields(
            { name: "Target", value: target.toString(), inline: true },
            {
              name: "Type",
              value: newOverwrite.type === 0 ? "Role" : "Member",
              inline: true,
            },
            {
              name: "New Allow",
              value: newOverwrite.allow.toArray().join(", ") || "None",
              inline: false,
            },
            {
              name: "New Deny",
              value: newOverwrite.deny.toArray().join(", ") || "None",
              inline: false,
            },
          )
          .setTimestamp();

        await logsChannel
          .send({ embeds: [logEmbed] })
          .catch((err) =>
            console.error("Failed to send permission update log:", err),
          );
      }
    }
  });

  // Find removed overwrites
  oldOverwrites.forEach(async (oldOverwrite, id) => {
    if (!newOverwrites.has(id)) {
      // Permission overwrite removed
      const target =
        oldOverwrite.type === 0
          ? newChannel.guild.roles.cache.get(id)
          : newChannel.guild.members.cache.get(id);
      if (target) {
        const logEmbed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🔐 Channel Permissions Removed")
          .setDescription(`Permissions removed for ${newChannel}`)
          .addFields(
            { name: "Target", value: target.toString(), inline: true },
            {
              name: "Type",
              value: oldOverwrite.type === 0 ? "Role" : "Member",
              inline: true,
            },
          )
          .setTimestamp();

        await logsChannel
          .send({ embeds: [logEmbed] })
          .catch((err) =>
            console.error("Failed to send permission remove log:", err),
          );
      }
    }
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (isOnCooldown(message.author.id)) {
    return; // Ignore message if on cooldown
  }

  // Check for auto-reactions first (before spam detection)
  if (
    !message.content.startsWith(prefixes[0]) &&
    !message.content.startsWith(prefixes[1]) &&
    botSettings.autoReactions
  ) {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const autoReactionEmoji = botSettings.autoReactions[userKey];

    if (autoReactionEmoji) {
      try {
        await message.react(autoReactionEmoji);
      } catch (error) {
        console.error("Error auto-reacting to message:", error);
      }
    }
  }

  // Add XP to user when they send a message (for leveling system)
  if (
    !message.content.startsWith(prefixes[0]) &&
    !message.content.startsWith(prefixes[1])
  ) {
    try {
      addUserXP(message.author.id, message.guild.id, message);
    } catch (error) {
      console.error("Error adding XP:", error);
    }
  }

  // Auto-moderation
  if (botSettings.autoModEnabled) {
    const badWords = require("./badwords.js");
    const content = message.content.toLowerCase();

    // Check if user is staff (mod, admin, owner, or developer)
    const isStaff =
      message.member.roles.cache.some((r) =>
        ["Moderator", "Admin", "Owner", "Developer"].includes(r.name),
      ) ||
      message.member?.permissions.has(PermissionsBitField.Flags.Administrator);

    // Check for banned words
    if (
      botSettings.badWordsFilterEnabled &&
      badWords.some((word) => content.includes(word))
    ) {
      try {
        const usedNWord =
          content.includes("nigger") || content.includes("nigga");

        // For staff members
        if (isStaff) {
          // Only delete message and timeout for n-word, regardless of staff status
          if (usedNWord) {
            await message
              .delete()
              .catch((err) => console.error("Could not delete message:", err));

            await message.member
              .timeout(30 * 1000, "Using inappropriate language")
              .catch((err) => console.error("Could not timeout member:", err));

            const warning = await message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor("#FF0000")
                  .setTitle("⚠️ Language Warning")
                  .setDescription(
                    `${message.author} has been muted for 30 seconds for using inappropriate language.`,
                  ),
              ],
            });
            setTimeout(async () => {
              try {
                await warning.delete().catch(() => {});
              } catch (error) {
                console.error("Error deleting warning message:", error);
              }
            }, 5000);
          } else {
            // For other bad words, just send a warning without deleting or timing out
            const warning = await message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor("#FFA500")
                  .setTitle("⚠️ Language Warning")
                  .setDescription(
                    `${message.author}, please watch your language as a staff member.`,
                  ),
              ],
            });
            setTimeout(async () => {
              try {
                await warning.delete().catch(() => {});
              } catch (error) {
                console.error("Error deleting warning message:", error);
              }
            }, 5000);
          }
        } else {
          // For regular members, delete and timeout for any bad word
          await message
            .delete()
            .catch((err) => console.error("Could not delete message:", err));

          await message.member
            .timeout(30 * 1000, "Using inappropriate language")
            .catch((err) => console.error("Could not timeout member:", err));

          const warning = await message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor("#FF0000")
                .setTitle("⚠️ Language Warning")
                .setDescription(
                  `${message.author} has been muted for 30 seconds for using inappropriate language.`,
                ),
            ],
          });
          setTimeout(async () => {
            try {
              await warning.delete().catch(() => {});
            } catch (error) {
              console.error("Error deleting warning message:", error);
            }
          }, 5000);
        }
      } catch (error) {
        console.error("Error handling banned word:", error);
      }
      return;
    }

    // Enhanced spam detection - skip for staff
    if (botSettings.spamFilterEnabled) {
      // Check if user is staff - if so, skip spam detection entirely
      const isStaff =
        message.member.roles.cache.some((r) =>
          ["Moderator", "Admin", "Owner", "Developer"].includes(r.name),
        ) ||
        message.member?.permissions.has(
          PermissionsBitField.Flags.Administrator,
        );

      if (!isStaff) {
        const now = Date.now();
        const lastMessages = messages.get(message.author.id) || [];
        lastMessages.push({
          content: message.content,
          timestamp: now,
        });

        // Keep messages from last 30 seconds for better spam detection
        const recentMessages = lastMessages.filter(
          (msg) => now - msg.timestamp < 30000,
        );
        messages.set(message.author.id, recentMessages);
        // 1. Too many messages in short time (5 messages in 5 seconds)
        const veryRecentMessages = recentMessages.filter(
          (msg) => now - msg.timestamp < 5000,
        );

        // 2. Repeated content spam (3+ same messages in 30 seconds)
        const duplicateMessages = recentMessages.filter(
          (msg) => msg.content === message.content,
        );

        // 3. Consistent spamming pattern (8+ messages in 30 seconds)
        const consistentSpam = recentMessages.length >= 8;

        // 4. Fast repeated messages (4+ messages in 10 seconds)
        const fastMessages = recentMessages.filter(
          (msg) => now - msg.timestamp < 10000,
        );

        if (
          veryRecentMessages.length >= botSettings.messageRateLimit || // 5 in 5 seconds
          duplicateMessages.length >= botSettings.messageDuplicateLimit || // 3+ duplicates
          consistentSpam || // 8+ messages in 30 seconds
          fastMessages.length >= 4 // 4+ messages in 10 seconds
        ) {
          await message
            .delete()
            .catch((err) =>
              console.error("Could not delete spam message:", err),
            );

          // Longer timeout for persistent spammers
          const timeoutDuration = consistentSpam ? 30000 : 15000; // 30s for consistent spam, 15s for others

          const warning = await message.channel.send(
            `${message.author}, you are being muted for ${timeoutDuration / 1000} seconds for spamming!`,
          );

          await message.member
            .timeout(timeoutDuration, "Spamming detected")
            .catch((err) =>
              console.error("Could not timeout member for spam:", err),
            );

          setTimeout(() => warning.delete().catch(() => {}), 5000);

          // Clear their message history to reset spam detection
          messages.delete(message.author.id);
          return;
        }
      }
    }
  }

  // Check if message starts with any of the prefixes
  const prefix = prefixes.find((p) => message.content.startsWith(p));
  if (!prefix) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (isRateLimited(message.author.id, command)) {
    message.reply("You are being rate limited! Please try again later.");
    return;
  }

  if (command === "purge") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription(
              "You need `Manage Messages` permission to use this command.",
            ),
        ],
      });
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Amount")
            .setDescription("Please provide a number between 1 and 100."),
        ],
      });
    }

    try {
      // Ensure we don't exceed Discord's 100 message limit
      const deleteAmount = Math.min(amount + 1, 100);
      const deleted = await message.channel.bulkDelete(deleteAmount);
      const actualDeleted = Math.max(deleted.size - 1, 0);

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🧹 Messages Purged")
        .setDescription(`Successfully deleted ${actualDeleted} messages.`)
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();

      const reply = await message.channel.send({ embeds: [embed] });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error("Error in purge command:", error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error")
            .setDescription(
              "Failed to delete messages. They might be too old (14+ days) or already deleted.",
            ),
        ],
      });
    }
  }

  if (command === "ping") {
    const sent = await message.channel.send("Pinging...");
    const ping = sent.createdTimestamp - message.createdTimestamp;

    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("🏓 Pong!")
      .addFields(
        { name: "Bot Latency", value: `${ping}ms`, inline: true },
        {
          name: "API Latency",
          value: `${Math.round(client.ws.ping)}ms`,
          inline: true,
        },
      )
      .setTimestamp();

    sent.edit({ content: null, embeds: [embed] });
  }

  if (command === "logs" || command === "staff") {
    return message.reply("This command has been disabled.");
  }

  // Removed the !serversetup command

  if (command === "deletealltickets") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.channel.send(
        "You need administrator permissions to use this command!",
      );
    }

    try {
      const ticketChannels = message.guild.channels.cache.filter(
        (channel) =>
          channel.name.startsWith("ticket-") &&
          channel.type === ChannelType.GuildText,
      );

      let deletedCount = 0;
      for (const channel of ticketChannels.values()) {
        try {
          await channel.delete();
          deletedCount++;
        } catch (err) {
          console.error(`Error deleting channel ${channel.name}:`, err);
        }
      }

      // Reset ticket counter
      counters.ticketCount = 0;
      saveCounters();

      // Clear tickets map
      tickets.clear();
      saveTickets();

      await message.channel.send(
        `All ticket channels (${deletedCount}) have been deleted and counter reset!`,
      );
    } catch (error) {
      console.error("Error deleting tickets:", error);
      await message.channel.send("An error occurred while deleting tickets.");
    }
    return;
  }

  if (command === "help") {
    const isBotCommandsChannel = message.channel.name === "🤖┃bot-commands";
    const isStaff =
      message.member.roles.cache.some((r) =>
        ["Owner", "Admin", "Moderator", "Developer"].includes(r.name),
      ) || message.author.id === message.guild.ownerId;

    if (!isBotCommandsChannel && !isStaff) {
      return message.reply(
        "This command can only be used in the bot-commands channel or by staff members.",
      );
    }

    // Determine user role level
    const isOwner =
      message.author.id === message.guild.ownerId ||
      message.member.roles.cache.some((r) => r.name === "Owner");
    const isAdmin =
      isOwner || message.member.roles.cache.some((r) => r.name === "Admin");
    const isMod =
      isAdmin || message.member.roles.cache.some((r) => r.name === "Moderator");
    const isDev = message.member.roles.cache.some(
      (r) => r.name === "Developer",
    );

    const helpEmbed = new EmbedBuilder()
      .setColor("#FF4500")
      .setTitle("🔥 Flamin' Hot Games Bot - Command Help")
      .setDescription(
        "**Welcome to your ultimate Discord community management bot!**\n\nUse the commands below to manage your server, engage your community, and track activity.",
      )
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({
        text: "💡 All commands support ! or / prefix | Use !fishhelp for fishing guide",
        iconURL: message.guild.iconURL(),
      })
      .setTimestamp();

    // General & Utility (Everyone)
    helpEmbed.addFields({
      name: "ℹ️ **General & Utility**",
      value:
        "```\n!help          - Show this help menu\n!ping          - Check bot response time\n!rules         - Display server rules\n!avatar [@user]- Show user avatar\n!servericon    - Show server icon```",
      inline: false,
    });

    // Leveling & XP System (Everyone)
    helpEmbed.addFields({
      name: "🔥 **Leveling & XP System**",
      value:
        "```\n!lvl [@user]       - View level & XP stats\n!leaderboard       - Top server members\n!achievements [@user] - View achievements\n!allachievements   - All available achievements```",
      inline: false,
    });

    // Simulator - Core Activities (Everyone)
    helpEmbed.addFields({
      name: "🎣 **Simulator - Core Activities**",
      value:
        "```\n!fish / !f         - Go fishing (cooldown)\n!mine              - Mine ores & gems\n!farm              - Harvest crops\n!work              - Work for coins\n!profile           - View simulator profile```",
      inline: false,
    });

    // Simulator - Inventories & Stores (Everyone)
    helpEmbed.addFields({
      name: "🏪 **Simulator - Shopping & Inventory**",
      value:
        "```\n!fishinventory     - View fishing inventory\n!mineinventory     - View mining inventory\n!farminventory     - View farming inventory\n!fishstore         - Fishing rod store\n!minestore         - Pickaxe store\n!farmstore         - Hoe store```",
      inline: false,
    });

    // Simulator - Equipment (Everyone)
    helpEmbed.addFields({
      name: "⚒️ **Simulator - Equipment**",
      value:
        "```\n!buy <item>        - Purchase an item\n!equip <item>      - Equip a tool\n!upgrade <item>    - Upgrade equipment```",
      inline: false,
    });

    // Fishing Game Extended (Everyone)
    helpEmbed.addFields({
      name: "🌊 **Advanced Fishing System**",
      value:
        "```\n!fishstats [@user] - Detailed fishing stats\n!fishcollection    - All caught fish\n!areas / !travel   - Fishing locations\n!boats / !buyboat  - Boat shop & purchase\n!equipboat <name>  - Equip a boat\n!baitshop / !baits - View available baits\n!buybait <type>    - Purchase bait\n!usebait <type>    - Equip bait\n!sellfish <name>   - Sell specific fish\n!sellall           - Sell all fish\n!fishleaderboard   - Fishing rankings\n!fishhelp          - Complete fishing guide```",
      inline: false,
    });

    // Lucky Boxes & Workers (Everyone)
    helpEmbed.addFields({
      name: "🎁 **Lucky Boxes & Passive Income**",
      value:
        "```\n!luckyboxes / !boxes    - View lucky box shop\n!buybox <type> [qty]    - Buy lucky boxes\n!openbox <type>         - Open a lucky box\n!workers / !fishworkers - View workers\n!buyworker <type> [qty] - Hire workers\n!collect / !collectworkers - Collect income```",
      inline: false,
    });

    // Pets System (Everyone)
    helpEmbed.addFields({
      name: "🐾 **Pet System**",
      value:
        "```\n!hatch <egg>       - Hatch a pet egg\n!feed <pet>        - Feed your pet\n!train <pet>       - Train your pet\n!pets              - View all pets\n!equippet <pet>    - Equip a pet```",
      inline: false,
    });

    // Items & Potions (Everyone)
    helpEmbed.addFields({
      name: "🧪 **Items, Potions & Crafting**",
      value:
        "```\n!use <item>        - Use item/potion\n!craft <item>      - Craft new items\n!items             - View inventory```",
      inline: false,
    });

    // Trading System (Everyone)
    helpEmbed.addFields({
      name: "💰 **Trading & Market**",
      value:
        "```\n!trade @user       - Start a trade\n!trade add <item>  - Add items to trade\n!trade confirm     - Confirm trade\n!trade cancel      - Cancel trade```",
      inline: false,
    });

    // Prestige System (Everyone)
    helpEmbed.addFields({
      name: "💎 **Prestige System**",
      value: "```\n!prestige          - Reset for bonuses```",
      inline: false,
    });

    // Gaming & Fun (Everyone)
    helpEmbed.addFields({
      name: "🎮 **Gaming & Fun**",
      value:
        "```\n!8ball <question>  - Ask the magic 8-ball\n!coinflip          - Flip a coin\n!dice [sides]      - Roll a die (default 6)\n!rps <choice>      - Rock paper scissors\n!trivia            - Gaming trivia questions\n!wouldyourather    - Would you rather questions\n!guess             - Number guessing game\n!games             - Show all gaming commands```",
      inline: false,
    });

    // Voting & Polls (Everyone can participate, Mods+ can create)
    if (isMod) {
      helpEmbed.addFields({
        name: "📊 **Voting & Polls**",
        value:
          '```\n!vote create "Q" "Op1" "Op2" - Create poll\n!vote participate <ID> - Vote in a poll\n!vote end <ID>         - End a poll\n!vote                  - Show voting help\n!poll <question>       - Quick poll with 👍/👎```',
        inline: false,
      });
    } else {
      helpEmbed.addFields({
        name: "📊 **Voting & Polls**",
        value:
          "```\n!vote participate <ID> - Vote in a poll\n!vote                  - Show voting help```",
        inline: false,
      });
    }

    // Invite Tracking (Everyone)
    helpEmbed.addFields({
      name: "📨 **Invite Tracking**",
      value:
        "```\n!invite stats [@user] - View invite statistics\n!invite leaderboard   - Top server inviters\n!invite tracker       - Tracker help & info```",
      inline: false,
    });

    // Moderation Commands (Mods+)
    if (isMod) {
      helpEmbed.addFields({
        name: "🔨 **Moderation Commands**",
        value:
          "```\n!kick @user [reason]    - Kick a member\n!ban @user [reason]     - Ban a member\n!unban <userID> [reason]- Unban a member\n!warn @user [reason]    - Warn a member\n!mute @user <time>      - Timeout member\n!unmute @user           - Remove timeout\n!purge <1-100>          - Delete messages\n!lock / !unlock         - Lock/unlock channel```",
        inline: false,
      });
    }

    // Administration (Admins+)
    if (isAdmin) {
      helpEmbed.addFields({
        name: "🛠️ **Administration**",
        value:
          '```\n!editpanel "Title" Desc - Edit support panel\n!deletealltickets       - Delete all tickets\n!toggleautomod          - Toggle auto-moderation\n!togglebadwords         - Toggle profanity filter\n!togglecaps             - Toggle caps filter\n!togglespam             - Toggle spam protection\n!setlvlchannel #ch      - Set level notifications```',
        inline: false,
      });

      helpEmbed.addFields({
        name: "🔗 **Community Management**",
        value:
          '```\n!rr                  - Setup default reaction roles\n!addrr @role 🎮 "Lbl"- Add custom reaction role\n!removerr @role      - Remove reaction role```',
        inline: false,
      });
    }

    // Server Configuration (Admins+, some Owner only)
    if (isAdmin) {
      let configCommands =
        "```\n!set allmemberschannel #ch - Total member count\n!set memberschannel #ch    - Human member count\n!set botschannel #ch       - Bot member count\n!set welcomechannel #ch    - Welcome messages\n!set logschannel #ch       - Server logs\n!set modrole @role         - Moderator role\n!set memberrole @role      - Default member role";

      if (isOwner) {
        configCommands +=
          "\n!set ownerrole @role       - Owner role (Owner only)\n!set adminrole @role       - Admin role (Owner only)\n!resetlevel @user          - Reset user level (Owner only)";
      }

      configCommands += "```";

      helpEmbed.addFields({
        name: "⚙️ **Server Configuration**",
        value: configCommands,
        inline: false,
      });
    }

    // Developer Commands (Developer role only)
    if (isDev) {
      helpEmbed.addFields({
        name: "👨‍💻 **Developer Commands**",
        value:
          "```\n!autoreaction add @user 😀 - Add auto-reaction for user\n!autoreaction remove @user - Remove auto-reaction\n!autoreaction list        - List all auto-reactions```",
        inline: false,
      });
    }

    message.channel.send({ embeds: [helpEmbed] });
  }

  if (command === "rules") {
    const rulesEmbed = new EmbedBuilder()
      .setColor("#FF4500")
      .setTitle("🔥 Flamin' Hot Games Community Rules")
      .setDescription("Please follow these rules to keep our community fun:")
      .addFields(
        {
          name: "1. Be Respectful",
          value:
            "Treat all members with respectfully. No harassment, hate speech, or bullying.",
        },
        {
          name: "2. No Spamming",
          value:
            "Don't spam messages, emotes, or mentions. Keep chat as clean as your gameplay!",
        },
        {
          name: "3. Use Appropriate Channels",
          value: "Post images, tips, and discussions in the right channels.",
        },
        {
          name: "4. Keep Content Appropriate",
          value: "Keep all content family-friendly.",
        },
        {
          name: "5. Follow Discord TOS",
          value: "Adhere to Discord's Terms of Service.",
        },
        {
          name: "6. Listen to Staff",
          value: "Follow instructions from server moderators and admins.",
        },
      )
      .setTimestamp();

    message.channel.send({ embeds: [rulesEmbed] });
  }

  if (command === "kick") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.KickMembers)
    ) {
      return message.reply("You don't have permission to kick members.");
    }

    const member = message.mentions.members.first();
    if (!member) return message.reply("Please mention a member to kick.");

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      await member.kick(reason);
      message.channel.send(`Kicked ${member.user.tag} | Reason: ${reason}`);

      const logsChannel = message.guild?.channels.cache.find(
        (channel) => channel.name === "📝┃user-logs",
      );
      if (logsChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("Member Kicked")
          .setDescription(
            `${member.user.tag} was kicked by ${message.author.tag}`,
          )
          .addFields({ name: "Reason", value: reason })
          .setTimestamp();
        await logsChannel.send({ embeds: [logEmbed] });
      }
    } catch (error) {
      message.reply("Failed to kick member.");
    }
  }

  if (command === "ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to ban members."),
        ],
      });
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing User")
            .setDescription("Please mention a member to ban."),
        ],
      });
    }

    if (member.id === message.author.id) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Action")
            .setDescription("You cannot ban yourself."),
        ],
      });
    }

    if (
      member.roles.highest.position >= message.member.roles.highest.position &&
      message.author.id !== message.guild.ownerId
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Action")
            .setDescription(
              "You cannot ban someone with a higher or equal role.",
            ),
        ],
      });
    }

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      await member.ban({ reason });

      db.run(
        `INSERT INTO bans (user_id, user_tag, reason, banned_by, status) VALUES (?, ?, ?, ?, 'active')`,
        [member.id, member.user.tag, reason, message.author.id],
        function (err) {
          if (err) {
            console.error("Error inserting ban into database:", err);
            message.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor("#FF0000")
                  .setTitle("❌ Database Error")
                  .setDescription(
                    "Member was banned but failed to log to database.",
                  ),
              ],
            });
          } else {
            const banEmbed = new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("🔨 Member Banned")
              .setDescription(`${member.user.tag} has been banned`)
              .addFields({ name: "Reason", value: reason })
              .setTimestamp()
              .setFooter({
                text: `Banned by ${message.author.tag} | Ban ID: ${this.lastID}`,
              });

            message.channel.send({ embeds: [banEmbed] });

            const logsChannel = message.guild?.channels.cache.find(
              (channel) => channel.name === "📝┃user-logs",
            );

            if (logsChannel) {
              const logEmbed = new EmbedBuilder()
                .setColor("#FF0000")
                .setTitle(`Member Banned`)
                .setDescription(
                  `${member.user.tag} was banned by ${message.author.tag}`,
                )
                .addFields(
                  { name: "User ID", value: member.id, inline: true },
                  { name: "Ban ID", value: `${this.lastID}`, inline: true },
                  { name: "Reason", value: reason },
                )
                .setTimestamp();

              logsChannel.send({ embeds: [logEmbed] });
            }

            try {
              const dmEmbed = new EmbedBuilder()
                .setColor("#FF0000")
                .setTitle(`You have been banned from ${message.guild.name}`)
                .addFields({ name: "Reason", value: reason })
                .setTimestamp();

              member.send({ embeds: [dmEmbed] }).catch(() => {
                console.log("Couldn't DM the user about their ban");
              });
            } catch (dmError) {
              console.log("Failed to send DM to banned user");
            }
          }
        },
      );
    } catch (error) {
      console.error("Error banning member:", error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error")
            .setDescription("Failed to ban member."),
        ],
      });
    }
  }

  if (command === "editpanel") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply(
        "You need administrator permissions to use this command!",
      );
    }

    const titleEndIndex = message.content.indexOf('"');
    const titleEndIndex2 = message.content.indexOf('"', titleEndIndex + 1);

    if (titleEndIndex === -1 || titleEndIndex2 === -1) {
      return message.reply('Usage: !editpanel "Title Here" Description here');
    }

    const title = message.content.substring(titleEndIndex + 1, titleEndIndex2);
    const description = message.content.slice(titleEndIndex2 + 1).trim();

    if (!description) {
      return message.reply("Please provide both a title and description");
    }

    const panelEmbed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle(title)
      .setDescription(description)
      .addFields(
        {
          name: "Response Time",
          value: "Usually within 24 hours",
          inline: true,
        },
        { name: "Support Hours", value: "24/7", inline: true },
      )
      .setFooter({ text: "Your ticket will be handled by our support team" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel("Open Support Ticket")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎫"),
    );

    message.channel.send({ embeds: [panelEmbed], components: [row] });
  }

  if (command === "warn") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
    ) {
      return message.reply("You don't have permission to warn members.");
    }

    const member = message.mentions.members.first();
    if (!member) return message.reply("Please mention a member to warn.");

    const reason = args.slice(1).join(" ") || "No reason provided";

    const warnEmbed = new EmbedBuilder()
      .setColor("#FFA500")
      .setTitle("⚠️ Warning Issued")
      .setDescription(`${member} has been warned`)
      .addFields({ name: "Reason", value: reason })
      .setTimestamp();

    message.channel.send({ embeds: [warnEmbed] });

    const dmEmbed = new EmbedBuilder()
      .setColor("#FFA500")
      .setTitle("⚠️ Warning Received")
      .setDescription(`You were warned in ${message.guild.name}`)
      .addFields({ name: "Reason", value: reason })
      .setTimestamp();

    try {
      await member.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.log("Couldn't DM the user");
    }
  }

  if (command === "mute" || command === "timeout") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to mute members."),
        ],
      });
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing User")
            .setDescription("Please mention a member to mute."),
        ],
      });
    }

    if (member.id === message.author.id) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Action")
            .setDescription("You cannot mute yourself."),
        ],
      });
    }

    if (
      member.roles.highest.position >= message.member.roles.highest.position &&
      message.author.id !== message.guild.ownerId
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Action")
            .setDescription(
              "You cannot mute someone with a higher or equal role.",
            ),
        ],
      });
    }

    // Parse time arguments
    let timeArg = args[1];
    let timeMs = 0;
    let timeString = "";

    if (!timeArg) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing Time")
            .setDescription(
              "Please specify a time duration (e.g., 5m, 2h, 1d)",
            ),
        ],
      });
    }

    if (timeArg.endsWith("d")) {
      const days = parseInt(timeArg.slice(0, -1));
      if (isNaN(days)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Invalid Time")
              .setDescription("Please provide a valid number of days."),
          ],
        });
      }
      timeMs += days * 24 * 60 * 60 * 1000;
      timeString += `${days} day${days !== 1 ? "s" : ""}`;
    } else if (timeArg.endsWith("h")) {
      const hours = parseInt(timeArg.slice(0, -1));
      if (isNaN(hours)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Invalid Time")
              .setDescription("Please provide a valid number of hours."),
          ],
        });
      }
      timeMs += hours * 60 * 60 * 1000;
      timeString += `${hours} hour${hours !== 1 ? "s" : ""}`;
    } else if (timeArg.endsWith("m")) {
      const minutes = parseInt(timeArg.slice(0, -1));
      if (isNaN(minutes)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Invalid Time")
              .setDescription("Please provide a valid number of minutes."),
          ],
        });
      }
      timeMs += minutes * 60 * 1000;
      timeString += `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    } else {
      const minutes = parseInt(timeArg);
      if (isNaN(minutes)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Invalid Time")
              .setDescription(
                "Please provide a valid time duration (e.g., 5m, 2h, 1d)",
              ),
          ],
        });
      }
      timeMs += minutes * 60 * 1000;
      timeString += `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }

    // Discord has a maximum timeout of 28 days
    if (timeMs > 28 * 24 * 60 * 60 * 1000) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Duration")
            .setDescription("Timeout duration cannot exceed 28 days."),
        ],
      });
    }

    const reason = args.slice(2).join(" ") || "No reason provided";

    try {
      await member.timeout(timeMs, reason);

      const muteEmbed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle("🔇 Member Muted")
        .setDescription(`${member} has been muted for ${timeString}`)
        .addFields({ name: "Reason", value: reason })
        .setTimestamp()
        .setFooter({ text: `Muted by ${message.author.tag}` });

      message.channel.send({ embeds: [muteEmbed] });

      const logsChannel = message.guild?.channels.cache.find(
        (channel) => channel.name === "📝┃user-logs",
      );

      if (logsChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle("Member Muted")
          .setDescription(
            `${member.user.tag} was muted by ${message.author.tag}`,
          )
          .addFields(
            { name: "Duration", value: timeString, inline: true },
            { name: "Reason", value: reason, inline: true },
          )
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] });
      }

      try {
        const dmEmbed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle(`You have been muted in ${message.guild.name}`)
          .setDescription(`Duration: ${timeString}`)
          .addFields({ name: "Reason", value: reason })
          .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
      } catch (error) {
        console.log("Couldn't DM the user about their mute");
      }
    } catch (error) {
      console.error("Error muting member:", error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error")
            .setDescription("Failed to mute member."),
        ],
      });
    }
  }

  if (command === "unmute") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to unmute members."),
        ],
      });
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing User")
            .setDescription("Please mention a member to unmute."),
        ],
      });
    }

    try {
      await member.timeout(null);

      const unmuteEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🔊 Member Unmuted")
        .setDescription(`${member} has been unmuted`)
        .setTimestamp()
        .setFooter({ text: `Unmuted by ${message.author.tag}` });

      message.channel.send({ embeds: [unmuteEmbed] });

      const logsChannel = message.guild?.channels.cache.find(
        (channel) => channel.name === "📝┃user-logs",
      );

      if (logsChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("Member Unmuted")
          .setDescription(
            `${member.user.tag} was unmuted by ${message.author.tag}`,
          )
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] });
      }
    } catch (error) {
      console.error("Error unmuting member:", error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error")
            .setDescription("Failed to unmute member."),
        ],
      });
    }
  }

  if (command === "unban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to unban members."),
        ],
      });
    }

    const userId = args[0];
    if (!userId) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing User ID")
            .setDescription("Please provide a user ID to unban."),
        ],
      });
    }

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      // First check if the user is actually banned
      const banList = await message.guild.bans.fetch();
      const bannedUser = banList.find((ban) => ban.user.id === userId);

      if (!bannedUser) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ User Not Found")
              .setDescription("This user is not banned."),
          ],
        });
      }

      await message.guild.members.unban(userId, reason);

      const unbanEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🔓 User Unbanned")
        .setDescription(
          `<@${userId}> (${bannedUser.user.tag}) has been unbanned`,
        )
        .addFields({ name: "Reason", value: reason })
        .setTimestamp()
        .setFooter({ text: `Unbanned by ${message.author.tag}` });

      message.channel.send({ embeds: [unbanEmbed] });

      // Update database
      db.run(
        `UPDATE bans SET status = 'unbanned', unbanned_by = ?, unbanned_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'active'`,
        [message.author.id, userId],
        function (err) {
          if (err) {
            console.error("Error updating ban status in database:", err);
          }
        },
      );

      const logsChannel = message.guild?.channels.cache.find(
        (channel) => channel.name === "📝┃user-logs",
      );

      if (logsChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("User Unbanned")
          .setDescription(
            `${bannedUser.user.tag} was unbanned by ${message.author.tag}`,
          )
          .addFields({ name: "Reason", value: reason })
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] });
      }
    } catch (error) {
      console.error("Error unbanning user:", error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error")
            .setDescription("Failed to unban user. Make sure the ID is valid."),
        ],
      });
    }
  }

  if (command === "lock") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    ) {
      return message.reply("You don't have permission to lock channels.");
    }

    try {
      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: false,
        },
      );
      message.channel.send("🔒 Channel has been locked.");
    } catch (error) {
      message.reply("Failed to lock channel.");
    }
  }

  if (command === "unlock") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    ) {
      return message.reply("You don't have permission to unlock channels.");
    }

    try {
      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: true,
        },
      );
      message.channel.send("🔓 Channel has been unlocked.");
    } catch (error) {
      message.reply("Failed to unlock channel.");
    }
  }

  if (command === "poll") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)
    ) {
      return message.reply("You don't have permission to create polls.");
    }

    const question = args.join(" ");
    if (!question)
      return message.reply("Please provide a question for the poll.");

    const pollEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("📊 Poll")
      .setDescription(question)
      .setFooter({ text: `Started by ${message.author.tag}` })
      .setTimestamp();

    const pollMessage = await message.channel.send({ embeds: [pollEmbed] });
    await pollMessage.react("👍");
    await pollMessage.react("👎");
  }

  if (command === "avatar") {
    const target = message.mentions.users.first() || message.author;
    const avatarEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle(`${target.username}'s Avatar`)
      .setImage(target.displayAvatarURL({ size: 1024, dynamic: true }));

    message.channel.send({ embeds: [avatarEmbed] });
  }

  if (command === "servericon") {
    const iconEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle(`${message.guild.name}'s Icon`)
      .setImage(message.guild.iconURL({ size: 1024, dynamic: true }));

    message.channel.send({ embeds: [iconEmbed] });
  }

  if (command === "toggleautomod") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply(
        "You need administrator permissions to use this command!",
      );
    }
    botSettings.autoModEnabled = !botSettings.autoModEnabled;
    saveSettings();
    message.reply(
      `Auto-moderation is now ${botSettings.autoModEnabled ? "enabled" : "disabled"}.`,
    );
  }

  if (command === "togglebadwords") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply(
        "You need administrator permissions to use this command!",
      );
    }
    botSettings.badWordsFilterEnabled = !botSettings.badWordsFilterEnabled;
    saveSettings();
    message.reply(
      `Bad words filter is now ${botSettings.badWordsFilterEnabled ? "enabled" : "disabled"}.`,
    );
  }

  if (command === "togglecaps") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply(
        "You need administrator permissions to use this command!",
      );
    }
    botSettings.capsFilterEnabled = !botSettings.capsFilterEnabled;
    saveSettings();
    message.reply(
      `Caps filter is now ${botSettings.capsFilterEnabled ? "enabled" : "disabled"}.`,
    );
  }

  if (command === "togglespam") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply(
        "You need administrator permissions to use this command!",
      );
    }
    botSettings.spamFilterEnabled = !botSettings.spamFilterEnabled;
    saveSettings();
    message.reply(
      `Spam filter is now ${botSettings.spamFilterEnabled ? "enabled" : "disabled"}.`,
    );
  }

  if (command === "lvl" || command === "level" || command === "rank") {
    const target = message.mentions.users.first() || message.author;
    const userKey = `${target.id}-${message.guild.id}`;
    const userData = userLevels.get(userKey) || {
      xp: 0,
      level: 1,
      totalXP: 0,
      messages: 0,
    };

    const embed = new EmbedBuilder()
      .setColor("#FF4500")
      .setTitle("🔥 User Level & Experience")
      .setDescription(`**${target.username}**'s progress:`)
      .addFields(
        { name: "🏆 Level", value: `${userData.level}`, inline: true },
        {
          name: "✨ Current XP",
          value: `${userData.xp}/${calculateXPForLevel(userData.level + 1) - calculateXPForLevel(userData.level)}`,
          inline: true,
        },
        { name: "💫 Total XP", value: `${userData.totalXP}`, inline: true },
        {
          name: "💬 Messages Sent",
          value: `${userData.messages}`,
          inline: true,
        },
      )
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "leaderboard" || command === "lb") {
    const guildUsers = Array.from(userLevels.entries())
      .filter(([key]) => key.endsWith(`-${message.guild.id}`))
      .map(([key, data]) => ({
        userId: key.split("-")[0],
        ...data,
      }))
      .sort((a, b) => b.totalXP - a.totalXP)
      .slice(0, 10);

    if (guildUsers.length === 0) {
      return message.channel.send("No users found in the leaderboard yet!");
    }

    const embed = new EmbedBuilder()
      .setColor("#FF4500")
      .setTitle("🏆 Server Leaderboard")
      .setDescription("Here are the top users in this community:")
      .setTimestamp();

    let description = "";
    for (let i = 0; i < guildUsers.length; i++) {
      const user = guildUsers[i];
      try {
        const member = await message.guild.members
          .fetch(user.userId)
          .catch(() => null);
        const username = member ? member.user.username : "Unknown User";
        const medal =
          i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        description += `${medal} **${username}** - Level ${user.level} (${user.totalXP} XP)\n`;
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    }

    embed.setDescription(description);
    message.channel.send({ embeds: [embed] });
  }

  if (command === "SECRETTT") {
    if (!hasRequiredRole(message.member, "owner")) {
      return message.reply("Only owners can set levels for users!");
    }

    const target = message.mentions.users.first();
    if (!target) {
      return message.reply("Please mention a user to set their level.");
    }

    const level = parseInt(args[1]);
    if (isNaN(level) || level <= 0) {
      return message.reply("Please provide a valid level.");
    }

    const userKey = `${target.id}-${message.guild.id}`;
    const userData = userLevels.get(userKey) || {
      xp: 0,
      level: 1,
      totalXP: 0,
      messages: 0,
    };

    // Calculate XP needed for the target level
    let xpNeeded = 0;
    for (let i = 1; i < level; i++) {
      xpNeeded += calculateXPForLevel(i);
    }
    xpNeeded += calculateXPForLevel(level); // Add XP for the target level itself

    // Simple approach: set total XP to achieve the target level, resetting current XP.
    // A more complex system might adjust current XP and recalculate.
    userData.totalXP = xpNeeded;
    userData.level = level;
    userData.xp = 0; // Reset current XP for simplicity

    // Check for level achievements if the new level is high enough
    if (level >= 5)
      checkAchievement(target.id, message.guild.id, "level_5", {
        author: target,
        channel: message.channel,
        guild: message.guild,
      });
    if (level >= 10)
      checkAchievement(target.id, message.guild.id, "level_10", {
        author: target,
        channel: message.channel,
        guild: message.guild,
      });
    if (level >= 20)
      checkAchievement(target.id, message.guild.id, "level_20", {
        author: target,
        channel: message.channel,
        guild: message.guild,
      });
    if (level >= 30)
      checkAchievement(target.id, message.guild.id, "level_30", {
        author: target,
        channel: message.channel,
        guild: message.guild,
      });
    if (level >= 50)
      checkAchievement(target.id, message.guild.id, "level_50", {
        author: target,
        channel: message.channel,
        guild: message.guild,
      });

    userLevels.set(userKey, userData);
    saveLevels();

    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("✨ Level Set")
      .setDescription(`Set ${target}'s level to **${level}**!`)
      .addFields(
        { name: "New Level", value: `${userData.level}`, inline: true },
        { name: "Total XP", value: `${userData.totalXP}`, inline: true },
      );

    message.channel.send({ embeds: [embed] });
  }

  if (command === "resetlevel") {
    if (!hasRequiredRole(message.member, "owner")) {
      return message.reply("Only owners can reset user levels!");
    }

    const target = message.mentions.users.first();
    if (!target) {
      return message.reply("Please mention a user to reset their level.");
    }

    const userKey = `${target.id}-${message.guild.id}`;
    userLevels.set(userKey, { xp: 0, level: 1, totalXP: 0, messages: 0 });
    saveLevels();

    const embed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("🔄 Level Reset")
      .setDescription(`Reset ${target}'s level back to 1!`);

    message.channel.send({ embeds: [embed] });
  }

  if (command === "vote") {
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "create") {
      if (
        !message.member.permissions.has(
          PermissionsBitField.Flags.ManageMessages,
        )
      ) {
        return message.reply(
          "You need Manage Messages permission to create polls.",
        );
      }

      // Parse the command arguments
      const content = message.content.slice(prefix.length + 5).trim(); // Remove "!vote"
      const matches = content.match(
        /create\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"(?:\s+"([^"]+)")?(?:\s+"([^"]+)")?/,
      );

      if (!matches) {
        return message.reply(
          'Usage: !vote create "Question" "Option1" "Option2" ["Option3"] ["Option4"]',
        );
      }

      const question = matches[1];
      const options = [matches[2], matches[3]];
      if (matches[4]) options.push(matches[4]);
      if (matches[5]) options.push(matches[5]);

      const voteId = ++voteCounter;
      const voteData = {
        id: voteId,
        question: question,
        options: options,
        votes: new Map(),
        createdBy: message.author.id,
        active: true,
        channelId: message.channel.id,
      };

      votes.set(voteId.toString(), voteData);
      saveVotes();

      // Check poll creation achievements
      const userKey = `${message.author.id}-${message.guild.id}`;
      const userData = userLevels.get(userKey) || {
        xp: 0,
        level: 1,
        totalXP: 0,
        messages: 0,
      };
      const userAchievements = achievements.get(userKey) || [];

      // First poll creation
      if (!userAchievements.includes("poll_creator")) {
        checkAchievement(
          message.author.id,
          message.guild.id,
          "poll_creator",
          message,
        );
      }

      // Track polls created
      const pollsCreated = (userData.pollsCreated || 0) + 1;
      userData.pollsCreated = pollsCreated;
      userLevels.set(userKey, userData);
      saveLevels();

      // Removed complex poll tracking

      const voteEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle(`📊 Poll #${voteId}`)
        .setDescription(question)
        .addFields(
          options.map((option, index) => ({
            name: `${index + 1}️⃣ ${option}`,
            value: "0 votes (0%)",
            inline: true,
          })),
        )
        .setFooter({
          text: `Use !vote participate ${voteId} to vote | Created by ${message.author.tag}`,
        })
        .setTimestamp();

      const pollMessage = await message.channel.send({ embeds: [voteEmbed] });

      // Add reactions
      const reactions = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(reactions[i]);
      }

      voteData.messageId = pollMessage.id;
      votes.set(voteId.toString(), voteData);
      saveVotes();
    } else if (subCommand === "participate") {
      const voteId = args[1];
      if (!voteId) {
        return message.reply(
          "Please specify a vote ID. Usage: !vote participate <vote_id>",
        );
      }

      const voteData = votes.get(voteId);
      if (!voteData || !voteData.active) {
        return message.reply("Vote not found or no longer active.");
      }

      // Check if user already voted
      if (voteData.votes.has(message.author.id)) {
        return message.reply("You have already voted in this poll!");
      }

      const optionsText = voteData.options
        .map((option, index) => `${index + 1}. ${option}`)
        .join("\n");

      const participateEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle(`Vote in Poll #${voteId}`)
        .setDescription(`**${voteData.question}**\n\n${optionsText}`)
        .setFooter({
          text:
            "Reply with the number of your choice (1-" +
            voteData.options.length +
            ")",
        });

      await message.reply({ embeds: [participateEmbed] });

      const filter = (m) =>
        m.author.id === message.author.id && /^[1-4]$/.test(m.content);
      const collector = message.channel.createMessageCollector({
        filter,
        time: 30000,
        max: 1,
      });

      collector.on("collect", (m) => {
        const choice = parseInt(m.content) - 1;
        if (choice >= 0 && choice < voteData.options.length) {
          voteData.votes.set(message.author.id, choice);
          votes.set(voteId, voteData);
          saveVotes();

          // Check voting achievements
          const userKey = `${message.author.id}-${message.guild.id}`;
          const userData = userLevels.get(userKey) || {
            xp: 0,
            level: 1,
            totalXP: 0,
            messages: 0,
          };
          const userAchievements = achievements.get(userKey) || [];

          // First vote achievement
          if (!userAchievements.includes("voter")) {
            checkAchievement(
              message.author.id,
              message.guild.id,
              "voter",
              message,
            );
          }

          m.reply(
            `✅ Your vote for "${voteData.options[choice]}" has been recorded!`,
          );
        } else {
          m.reply("Invalid choice!");
        }
      });

      collector.on("end", (collected) => {
        if (collected.size === 0) {
          message.followUp("❌ Vote timed out.");
        }
      });
    } else if (subCommand === "end") {
      const voteId = args[1];
      if (!voteId) {
        return message.reply(
          "Please specify a vote ID. Usage: !vote end <vote_id>",
        );
      }

      const voteData = votes.get(voteId);
      if (!voteData) {
        return message.reply("Vote not found.");
      }

      if (
        voteData.createdBy !== message.author.id &&
        !message.member.permissions.has(
          PermissionsBitField.Flags.ManageMessages,
        )
      ) {
        return message.reply(
          "You can only end votes you created or you need Manage Messages permission.",
        );
      }

      voteData.active = false;
      votes.set(voteId, voteData);
      saveVotes();

      // Calculate results
      const totalVotes = voteData.votes.size;
      const results = new Array(voteData.options.length).fill(0);

      for (const vote of voteData.votes.values()) {
        results[vote]++;
      }

      const resultFields = voteData.options.map((option, index) => {
        const voteCount = results[index];
        const percentage =
          totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
        return {
          name: `${index + 1}️⃣ ${option}`,
          value: `${voteCount} votes (${percentage}%)`,
          inline: true,
        };
      });

      const resultsEmbed = new EmbedBuilder()
        .setColor("#ff9900")
        .setTitle(`📊 Poll #${voteId} Results`)
        .setDescription(
          `**${voteData.question}**\n\nTotal Votes: ${totalVotes}`,
        )
        .addFields(resultFields)
        .setFooter({ text: "Poll ended" })
        .setTimestamp();

      message.channel.send({ embeds: [resultsEmbed] });
    } else {
      const voteHelpEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("📊 Voting System Help")
        .setDescription("Available voting commands:")
        .addFields(
          {
            name: "Create Poll",
            value:
              '!vote create "Question" "Option1" "Option2" ["Option3"] ["Option4"]',
            inline: false,
          },
          {
            name: "Participate",
            value: "!vote participate <vote_id>",
            inline: false,
          },
          { name: "End Poll", value: "!vote end <vote_id>", inline: false },
        )
        .setFooter({ text: "Polls support 2-4 options" });

      message.channel.send({ embeds: [voteHelpEmbed] });
    }
  }

  if (command === "achievements") {
    const target = message.mentions.users.first() || message.author;
    const userKey = `${target.id}-${message.guild.id}`;
    const userAchievements = achievements.get(userKey) || [];

    if (userAchievements.length === 0) {
      return message.channel.send(
        `${target.username} hasn't unlocked any achievements yet!`,
      );
    }

    const achievementFields = userAchievements
      .map((achievementId) => {
        const achievement = achievementList[achievementId];
        return achievement
          ? {
              name: `${achievement.emoji} ${achievement.name}`,
              value: `${achievement.description} (+${achievement.xp} XP)`,
              inline: true,
            }
          : null;
      })
      .filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle(`🏆 ${target.username}'s Achievements`)
      .setDescription(
        `**${userAchievements.length}/${Object.keys(achievementList).length}** achievements unlocked`,
      )
      .addFields(achievementFields)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "allachievements" || command === "achievementslist") {
    const achievementCategories = {
      "🚀 Getting Started": ["first_message", "weekend_warrior", "early_bird"],
      "⭐ Level Milestones": [
        "level_5",
        "level_10",
        "level_20",
        "level_30",
        "level_50",
      ],
      "💬 Activity": ["chatterer"],
      "👥 Social & Invites": ["inviter"],
      "🗳️ Voting & Polls": ["voter", "poll_creator"],
    };

    const embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("🏆 All Available Achievements")
      .setDescription(
        `Here are all ${Object.keys(achievementList).length} achievements you can unlock:`,
      )
      .setTimestamp();

    for (const [category, achievementIds] of Object.entries(
      achievementCategories,
    )) {
      const categoryAchievements = achievementIds
        .filter((id) => achievementList[id])
        .map((id) => {
          const achievement = achievementList[id];
          return `${achievement.emoji} **${achievement.name}** - ${achievement.description} (+${achievement.xp} XP)`;
        })
        .join("\n");

      if (categoryAchievements) {
        embed.addFields({
          name: category,
          value:
            categoryAchievements.length > 1024
              ? categoryAchievements.substring(0, 1021) + "..."
              : categoryAchievements,
          inline: false,
        });
      }
    }

    embed.setFooter({
      text: "Use !achievements [@user] to see someone's unlocked achievements",
    });
    message.channel.send({ embeds: [embed] });
  }

  if (command === "invite") {
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "tracker") {
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
      ) {
        return message.reply(
          "You need Manage Server permission to use invite tracker commands.",
        );
      }

      const trackerEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("📨 Invite Tracker")
        .setDescription(
          "Invite tracking is automatically enabled! Here are the available commands:",
        )
        .addFields(
          {
            name: "!invite stats",
            value: "Show your invite statistics",
            inline: false,
          },
          {
            name: "!invite stats @user",
            value: "Show someone else's invite statistics",
            inline: false,
          },
          {
            name: "!invite leaderboard",
            value: "Show top inviters in the server",
            inline: false,
          },
        )
        .setFooter({
          text: "Invites are automatically tracked when members join",
        });

      message.channel.send({ embeds: [trackerEmbed] });
    } else if (subCommand === "stats") {
      const target = message.mentions.users.first() || message.author;

      try {
        const guildInvites = await message.guild.invites.fetch();
        let totalInvites = 0;
        let inviteDetails = [];

        for (const [code, invite] of guildInvites) {
          if (invite.inviter?.id === target.id) {
            totalInvites += invite.uses;
            inviteDetails.push({
              code: code,
              uses: invite.uses,
              channel: invite.channel?.name || "Unknown",
            });
          }
        }

        const embed = new EmbedBuilder()
          .setColor("#00ff00")
          .setTitle(`📊 Invite Stats for ${target.username}`)
          .setDescription(`**Total Invites:** ${totalInvites}`)
          .setThumbnail(target.displayAvatarURL({ dynamic: true }))
          .setTimestamp();

        if (inviteDetails.length > 0) {
          const detailsText = inviteDetails
            .map((inv) => `• ${inv.code}: ${inv.uses} uses (${inv.channel})`)
            .join("\n");
          embed.addFields({
            name: "Invite Details",
            value: detailsText.slice(0, 1024),
          });
        }

        message.channel.send({ embeds: [embed] });
      } catch (error) {
        console.error("Error fetching invite stats:", error);
        message.reply("Failed to fetch invite statistics.");
      }
    } else if (subCommand === "leaderboard") {
      try {
        const guildInvites = await message.guild.invites.fetch();
        const inviterStats = new Map();

        for (const [code, invite] of guildInvites) {
          if (invite.inviter && invite.uses > 0) {
            const currentCount = inviterStats.get(invite.inviter.id) || 0;
            inviterStats.set(invite.inviter.id, currentCount + invite.uses);
          }
        }

        const sortedInviters = Array.from(inviterStats.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        if (sortedInviters.length === 0) {
          return message.channel.send("No invite data available yet!");
        }

        let description = "";
        for (let i = 0; i < sortedInviters.length; i++) {
          const [userId, inviteCount] = sortedInviters[i];
          try {
            const user = await client.users.fetch(userId);
            const medal =
              i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
            description += `${medal} **${user.username}** - ${inviteCount} invites\n`;
          } catch (error) {
            console.error("Error fetching user:", error);
          }
        }

        const embed = new EmbedBuilder()
          .setColor("#FFD700")
          .setTitle("📨 Top Inviters")
          .setDescription(description)
          .setTimestamp();

        message.channel.send({ embeds: [embed] });
      } catch (error) {
        console.error("Error fetching invite leaderboard:", error);
        message.reply("Failed to fetch invite leaderboard.");
      }
    } else {
      const inviteHelpEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("📨 Invite Commands")
        .setDescription("Available invite commands:")
        .addFields(
          {
            name: "!invite tracker",
            value: "Show invite tracker information",
            inline: false,
          },
          {
            name: "!invite stats [@user]",
            value: "Show invite statistics",
            inline: false,
          },
          {
            name: "!invite leaderboard",
            value: "Show top inviters",
            inline: false,
          },
        );

      message.channel.send({ embeds: [inviteHelpEmbed] });
    }
  }

  if (command === "setlvlchannel") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply(
        "You need administrator permissions to use this command!",
      );
    }

    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply(
        "Please mention a channel to set for level notifications.",
      );
    }

    if (!serverSettings[message.guild.id]) {
      serverSettings[message.guild.id] = {};
    }

    serverSettings[message.guild.id].levelChannelId = channel.id;
    saveServerSettings();

    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("✅ Channel Set")
          .setDescription(
            `Level up notifications will now be sent to ${channel}`,
          ),
      ],
    });
  }

  if (command === "autoreaction") {
    // Only allow specific user ID to use this command
    if (message.author.id !== "886398974456655892") {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to use this command."),
        ],
      });
    }

    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "add") {
      const targetUser = message.mentions.users.first();
      const emoji = args[2];

      if (!targetUser) {
        return message.reply("Please mention a user to auto-react to.");
      }

      if (!emoji) {
        return message.reply(
          "Please provide an emoji to use for auto-reactions.",
        );
      }

      // Initialize auto reactions if not exists
      if (!botSettings.autoReactions) {
        botSettings.autoReactions = {};
      }

      const userKey = `${targetUser.id}-${message.guild.id}`;
      botSettings.autoReactions[userKey] = emoji;
      saveSettings();

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Auto Reaction Added")
        .setDescription(
          `Will now auto-react with ${emoji} to messages from ${targetUser}`,
        )
        .setTimestamp();

      message.channel.send({ embeds: [embed] });
    } else if (subCommand === "remove") {
      const targetUser = message.mentions.users.first();

      if (!targetUser) {
        return message.reply(
          "Please mention a user to remove auto-reactions for.",
        );
      }

      if (!botSettings.autoReactions) {
        return message.reply("No auto-reactions are currently set up.");
      }

      const userKey = `${targetUser.id}-${message.guild.id}`;

      if (!botSettings.autoReactions[userKey]) {
        return message.reply(`No auto-reaction set for ${targetUser}.`);
      }

      delete botSettings.autoReactions[userKey];
      saveSettings();

      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🗑️ Auto Reaction Removed")
        .setDescription(`Removed auto-reaction for ${targetUser}`)
        .setTimestamp();

      message.channel.send({ embeds: [embed] });
    } else if (subCommand === "list") {
      if (
        !botSettings.autoReactions ||
        Object.keys(botSettings.autoReactions).length === 0
      ) {
        return message.reply("No auto-reactions are currently set up.");
      }

      let description = "";
      for (const [userKey, emoji] of Object.entries(
        botSettings.autoReactions,
      )) {
        const userId = userKey.split("-")[0];
        try {
          const user = await client.users.fetch(userId);
          description += `${user.username}: ${emoji}\n`;
        } catch (error) {
          description += `Unknown User (${userId}): ${emoji}\n`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#0099FF")
        .setTitle("📝 Auto Reactions List")
        .setDescription(description)
        .setTimestamp();

      message.channel.send({ embeds: [embed] });
    } else {
      const helpEmbed = new EmbedBuilder()
        .setColor("#0099FF")
        .setTitle("🤖 Auto Reaction Help")
        .setDescription("Available auto-reaction commands:")
        .addFields(
          {
            name: "!autoreaction add @user 😀",
            value: "Add auto-reaction for a user",
            inline: false,
          },
          {
            name: "!autoreaction remove @user",
            value: "Remove auto-reaction for a user",
            inline: false,
          },
          {
            name: "!autoreaction list",
            value: "List all current auto-reactions",
            inline: false,
          },
        );

      message.channel.send({ embeds: [helpEmbed] });
    }
  }

  if (command === "set") {
    // Check for admin permissions
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription(
              "You need Administrator permission to use this command.",
            ),
        ],
      });
    }

    // Initialize server settings if not exists
    if (!serverSettings[message.guild.id]) {
      serverSettings[message.guild.id] = {};
    }

    const guildSettings = serverSettings[message.guild.id];
    const subCommand = args[0]?.toLowerCase();

    // Handle different settings
    if (subCommand === "allmemberschannel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply(
          "Please mention a channel to set for all members count.",
        );
      }

      guildSettings.allMembersChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`All members count channel set to ${channel}`),
        ],
      });
    } else if (subCommand === "memberschannel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply(
          "Please mention a channel to set for human members count.",
        );
      }

      guildSettings.membersChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`Human members count channel set to ${channel}`),
        ],
      });
    } else if (subCommand === "botschannel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply(
          "Please mention a channel to set for bot members count.",
        );
      }

      guildSettings.botsChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`Bot members count channel set to ${channel}`),
        ],
      });
    } else if (subCommand === "welcomechannel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply(
          "Please mention a channel to set for welcome messages.",
        );
      }

      guildSettings.welcomeChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`Welcome channel set to ${channel}`),
        ],
      });
    } else if (subCommand === "logschannel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply(
          "Please mention a channel to set for server logs.",
        );
      }

      guildSettings.logsChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`Server logs channel set to ${channel}`),
        ],
      });
    } else if (subCommand === "ownerrole") {
      // Only server owner can set this
      if (message.author.id !== message.guild.ownerId) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Permission Denied")
              .setDescription("Only the server owner can set the owner role."),
          ],
        });
      }

      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply("Please mention a role to set as the owner role.");
      }

      guildSettings.ownerRoleId = role.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Role Set")
            .setDescription(`Owner role set to ${role}`),
        ],
      });
    } else if (subCommand === "adminrole") {
      // Only server owner can set this
      if (message.author.id !== message.guild.ownerId) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Permission Denied")
              .setDescription("Only the server owner can set the admin role."),
          ],
        });
      }

      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply("Please mention a role to set as the admin role.");
      }

      guildSettings.adminRoleId = role.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Role Set")
            .setDescription(`Admin role set to ${role}`),
        ],
      });
    } else if (subCommand === "modrole") {
      // Owner or admin can set this
      const hasOwnerRole =
        guildSettings.ownerRoleId &&
        message.member.roles.cache.has(guildSettings.ownerRoleId);
      const hasAdminRole =
        guildSettings.adminRoleId &&
        message.member.roles.cache.has(guildSettings.adminRoleId);

      if (
        message.author.id !== message.guild.ownerId &&
        !hasOwnerRole &&
        !hasAdminRole
      ) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Permission Denied")
              .setDescription(
                "Only owners and admins can set the moderator role.",
              ),
          ],
        });
      }

      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply(
          "Please mention a role to set as the moderator role.",
        );
      }

      guildSettings.modRoleId = role.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Role Set")
            .setDescription(`Moderator role set to ${role}`),
        ],
      });
    } else if (subCommand === "memberrole") {
      // Owner or admin can set this
      const hasOwnerRole =
        guildSettings.ownerRoleId &&
        message.member.roles.cache.has(guildSettings.ownerRoleId);
      const hasAdminRole =
        guildSettings.adminRoleId &&
        message.member.roles.cache.has(guildSettings.adminRoleId);

      if (
        message.author.id !== message.guild.ownerId &&
        !hasOwnerRole &&
        !hasAdminRole
      ) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Permission Denied")
              .setDescription(
                "Only owners and admins can set the member role.",
              ),
          ],
        });
      }

      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply(
          "Please mention a role to set as the member role.",
        );
      }

      guildSettings.memberRoleId = role.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Role Set")
            .setDescription(`Member role set to ${role}`),
        ],
      });
    } else {
      // Show help message for !set command
      const setHelpEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("!set Command Help")
        .setDescription("Configure server settings with the following options:")
        .addFields(
          {
            name: "Channel Settings",
            value:
              "!set allmemberschannel #channel - Set total members count channel\n!set memberschannel #channel - Set human members count channel\n!set botschannel #channel - Set bot members count channel\n!set welcomechannel #channel - Set welcome messages channel\n!set logschannel #channel - Set server logs channel",
          },
          {
            name: "Role Settings",
            value:
              "!set ownerrole @role - Set owner role (Server Owner only)\n!set adminrole @role - Set admin role (Server Owner only)\n!set modrole @role - Set moderator role (Owner/Admin only)\n!set memberrole @role - Set member role (Owner/Admin only)",
          },
        )
        .setFooter({
          text: "Role permissions determine who can use specific commands",
        });

      message.channel.send({ embeds: [setHelpEmbed] });
    }
  }

  if (command === "addrr") {
    // Check for admin permissions
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription(
              "You need Administrator permission to use this command.",
            ),
        ],
      });
    }

    // Parse command: !addrr @role emoji "button_label"
    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing Role")
            .setDescription('Usage: !addrr @role 🎮 "Button Label"'),
        ],
      });
    }

    const argsAfterRole = args.slice(1);
    const emoji = argsAfterRole[0];
    if (!emoji) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing Emoji")
            .setDescription('Usage: !addrr @role 🎮 "Button Label"'),
        ],
      });
    }

    // Extract button label from quotes
    const labelMatch = message.content.match(/"([^"]+)"/);
    const buttonLabel = labelMatch ? labelMatch[1] : role.name;

    // Find existing reaction role panel in the channel
    const messages = await message.channel.messages.fetch({ limit: 50 });
    let existingPanel = null;

    for (const msg of messages.values()) {
      if (
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title &&
        msg.embeds[0].title.includes("Community Roles")
      ) {
        existingPanel = msg;
        break;
      }
    }

    if (!existingPanel) {
      // Create new panel
      const rolesEmbed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle("🔥 Flamin' Hot Games Community Roles")
        .setDescription("React to the buttons below to get roles:")
        .addFields({
          name: `${emoji} ${role.name}`,
          value: `Get the ${role.name} role!`,
          inline: false,
        })
        .setFooter({ text: "Click the buttons below to add or remove roles" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`role-${role.id}`)
          .setLabel(`${emoji} ${buttonLabel}`)
          .setStyle(ButtonStyle.Primary),
      );

      await message.channel.send({
        embeds: [rolesEmbed],
        components: [row],
      });
    } else {
      // Update existing panel
      const currentEmbed = existingPanel.embeds[0];
      const currentComponents = existingPanel.components[0];

      // Add new field to embed
      const newFields = currentEmbed.fields ? [...currentEmbed.fields] : [];
      newFields.push({
        name: `${emoji} ${role.name}`,
        value: `Get the ${role.name} role!`,
        inline: false,
      });

      const updatedEmbed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle(currentEmbed.title)
        .setDescription(currentEmbed.description)
        .addFields(newFields)
        .setFooter({ text: "Click the buttons below to add or remove roles" });

      // Add new button to existing row
      const existingButtons = currentComponents.components;
      if (existingButtons.length < 5) {
        // Discord limit is 5 buttons per row
        existingButtons.push(
          new ButtonBuilder()
            .setCustomId(`role-${role.id}`)
            .setLabel(`${emoji} ${buttonLabel}`)
            .setStyle(ButtonStyle.Primary),
        );

        const row = new ActionRowBuilder().addComponents(existingButtons);

        await existingPanel.edit({
          embeds: [updatedEmbed],
          components: [row],
        });
      } else {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Too Many Buttons")
              .setDescription(
                "The reaction role panel already has the maximum of 5 buttons.",
              ),
          ],
        });
      }
    }

    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("✅ Reaction Role Added")
          .setDescription(`Added ${role} to the reaction roles panel!`),
      ],
    });
  }

  if (command === "removerr") {
    // Check for admin permissions
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription(
              "You need Administrator permission to use this command.",
            ),
        ],
      });
    }

    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing Role")
            .setDescription("Usage: !removerr @role"),
        ],
      });
    }

    // Find existing reaction role panel in the channel
    const messages = await message.channel.messages.fetch({ limit: 50 });
    let existingPanel = null;

    for (const msg of messages.values()) {
      if (
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title &&
        msg.embeds[0].title.includes("Community Roles")
      ) {
        existingPanel = msg;
        break;
      }
    }

    if (!existingPanel) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ No Panel Found")
            .setDescription("No reaction role panel found in this channel."),
        ],
      });
    }

    try {
      const currentEmbed = existingPanel.embeds[0];
      const currentComponents = existingPanel.components[0];

      // Remove field from embed that matches the role
      const newFields = currentEmbed.fields
        ? currentEmbed.fields.filter((field) => !field.name.includes(role.name))
        : [];

      // Remove button that matches the role
      const existingButtons = currentComponents.components.filter(
        (button) =>
          button.data.custom_id !== `role-${role.id}` &&
          button.data.custom_id !== "role-announcement" &&
          button.data.custom_id !== "role-giveaway",
      );

      // Add back predefined buttons if they exist
      const announcementRole = message.guild.roles.cache.find(
        (r) => r.name === "Announcement Ping",
      );
      const giveawayRole = message.guild.roles.cache.find(
        (r) => r.name === "Giveaway Ping",
      );

      if (announcementRole && role.id !== announcementRole.id) {
        existingButtons.push(
          new ButtonBuilder()
            .setCustomId("role-announcement")
            .setLabel("📢 Announcements")
            .setStyle(ButtonStyle.Primary),
        );
      }

      if (giveawayRole && role.id !== giveawayRole.id) {
        existingButtons.push(
          new ButtonBuilder()
            .setCustomId("role-giveaway")
            .setLabel("🎁 Giveaways")
            .setStyle(ButtonStyle.Success),
        );
      }

      const updatedEmbed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle(currentEmbed.title)
        .setDescription(currentEmbed.description)
        .setFooter({ text: "Click the buttons below to add or remove roles" });

      if (newFields.length > 0) {
        updatedEmbed.addFields(newFields);
      }

      if (existingButtons.length > 0) {
        const row = new ActionRowBuilder().addComponents(existingButtons);
        await existingPanel.edit({
          embeds: [updatedEmbed],
          components: [row],
        });
      } else {
        await existingPanel.edit({
          embeds: [updatedEmbed],
          components: [],
        });
      }

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Reaction Role Removed")
            .setDescription(`Removed ${role} from the reaction roles panel!`),
        ],
      });
    } catch (error) {
      console.error("Error removing reaction role:", error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error")
            .setDescription("Failed to remove reaction role from panel."),
        ],
      });
    }
  }

  // Gaming Commands
  if (command === "8ball") {
    const question = args.join(" ");
    if (!question) {
      return message.reply("Please ask a question for the magic 8-ball!");
    }

    const responses = [
      "🎱 It is certain",
      "🎱 It is decidedly so",
      "🎱 Without a doubt",
      "🎱 Yes definitely",
      "🎱 You may rely on it",
      "🎱 As I see it, yes",
      "🎱 Most likely",
      "🎱 Outlook good",
      "🎱 Yes",
      "🎱 Signs point to yes",
      "🎱 Reply hazy, try again",
      "🎱 Ask again later",
      "🎱 Better not tell you now",
      "🎱 Cannot predict now",
      "🎱 Concentrate and ask again",
      "🎱 Don't count on it",
      "🎱 My reply is no",
      "🎱 My sources say no",
      "🎱 Outlook not so good",
      "🎱 Very doubtful",
    ];

    const randomResponse =
      responses[Math.floor(Math.random() * responses.length)];

    const embed = new EmbedBuilder()
      .setColor("#9932CC")
      .setTitle("🎱 Magic 8-Ball")
      .addFields(
        { name: "Question", value: question, inline: false },
        { name: "Answer", value: randomResponse, inline: false },
      )
      .setFooter({ text: `Asked by ${message.author.tag}` })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "coinflip" || command === "flip") {
    const outcomes = ["🪙 **Heads!**", "🪙 **Tails!**"];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];

    const embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("🪙 Coin Flip")
      .setDescription(result)
      .setFooter({ text: `Flipped by ${message.author.tag}` })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "dice" || command === "roll") {
    const sides = parseInt(args[0]) || 6;
    if (sides < 2 || sides > 100) {
      return message.reply(
        "Please choose between 2 and 100 sides for the dice!",
      );
    }

    const result = Math.floor(Math.random() * sides) + 1;

    const embed = new EmbedBuilder()
      .setColor("#FF6B6B")
      .setTitle("🎲 Dice Roll")
      .setDescription(`You rolled a **${result}** on a ${sides}-sided die!`)
      .setFooter({ text: `Rolled by ${message.author.tag}` })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "rps") {
    const choices = ["rock", "paper", "scissors"];
    const userChoice = args[0]?.toLowerCase();

    if (!userChoice || !choices.includes(userChoice)) {
      return message.reply("Please choose: `rock`, `paper`, or `scissors`!");
    }

    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    let result = "";
    let color = "#FFFF00";

    if (userChoice === botChoice) {
      result = "It's a tie! 🤝";
      color = "#FFFF00";
    } else if (
      (userChoice === "rock" && botChoice === "scissors") ||
      (userChoice === "paper" && botChoice === "rock") ||
      (userChoice === "scissors" && botChoice === "paper")
    ) {
      result = "You win! 🎉";
      color = "#00FF00";
    } else {
      result = "You lose! 😔";
      color = "#FF0000";
    }

    const emojiMap = {
      rock: "🪨",
      paper: "📄",
      scissors: "✂️",
    };

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle("🎮 Rock Paper Scissors")
      .addFields(
        {
          name: "Your Choice",
          value: `${emojiMap[userChoice]} ${userChoice}`,
          inline: true,
        },
        {
          name: "Bot Choice",
          value: `${emojiMap[botChoice]} ${botChoice}`,
          inline: true,
        },
        { name: "Result", value: result, inline: false },
      )
      .setFooter({ text: `Played by ${message.author.tag}` })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "trivia") {
    const triviaQuestions = [
      {
        question: "What year was the first gaming console released?",
        options: ["A) 1972", "B) 1975", "C) 1977", "D) 1980"],
        answer: "A",
        explanation: "The Magnavox Odyssey was released in 1972!",
      },
      {
        question:
          "Which game is known as the best-selling video game of all time?",
        options: [
          "A) Tetris",
          "B) Minecraft",
          "C) GTA V",
          "D) Super Mario Bros",
        ],
        answer: "B",
        explanation: "Minecraft has sold over 300 million copies!",
      },
      {
        question: "What does 'FPS' stand for in gaming?",
        options: [
          "A) First Person Shooter",
          "B) Frames Per Second",
          "C) Fast Paced Strategy",
          "D) Both A and B",
        ],
        answer: "D",
        explanation:
          "FPS can mean both First Person Shooter and Frames Per Second!",
      },
      {
        question: "Which company created the PlayStation?",
        options: ["A) Nintendo", "B) Microsoft", "C) Sony", "D) Sega"],
        answer: "C",
        explanation: "Sony created the PlayStation in 1994!",
      },
      {
        question: "What is the maximum level in Pac-Man?",
        options: ["A) 255", "B) 256", "C) 300", "D) Infinite"],
        answer: "B",
        explanation: "Level 256 causes a kill screen due to a programming bug!",
      },
    ];

    const randomQuestion =
      triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];

    const embed = new EmbedBuilder()
      .setColor("#4169E1")
      .setTitle("🧠 Gaming Trivia")
      .setDescription(
        `**${randomQuestion.question}**\n\n${randomQuestion.options.join("\n")}`,
      )
      .setFooter({ text: "Reply with A, B, C, or D! You have 30 seconds." })
      .setTimestamp();

    const triviaMessage = await message.channel.send({ embeds: [embed] });

    const filter = (m) =>
      m.author.id === message.author.id && /^[ABCD]$/i.test(m.content);
    const collector = message.channel.createMessageCollector({
      filter,
      time: 30000,
      max: 1,
    });

    collector.on("collect", (m) => {
      const userAnswer = m.content.toUpperCase();
      const isCorrect = userAnswer === randomQuestion.answer;

      const resultEmbed = new EmbedBuilder()
        .setColor(isCorrect ? "#00FF00" : "#FF0000")
        .setTitle(isCorrect ? "✅ Correct!" : "❌ Incorrect!")
        .setDescription(
          `**${randomQuestion.question}**\n\nCorrect answer: **${randomQuestion.answer}**\n${randomQuestion.explanation}`,
        )
        .setFooter({ text: `Answered by ${message.author.tag}` })
        .setTimestamp();

      message.channel.send({ embeds: [resultEmbed] });

      // Add XP for participation
      if (isCorrect) {
        const userKey = `${message.author.id}-${message.guild.id}`;
        const userData = userLevels.get(userKey) || {
          xp: 0,
          level: 1,
          totalXP: 0,
          messages: 0,
        };
        userData.xp += 50;
        userData.totalXP += 50;
        userLevels.set(userKey, userData);
        saveLevels();
      }
    });

    collector.on("end", (collected) => {
      if (collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor("#FFFF00")
          .setTitle("⏰ Time's Up!")
          .setDescription(
            `**${randomQuestion.question}**\n\nCorrect answer: **${randomQuestion.answer}**\n${randomQuestion.explanation}`,
          )
          .setTimestamp();

        message.channel.send({ embeds: [timeoutEmbed] });
      }
    });
  }

  if (command === "wouldyourather" || command === "wyr") {
    const wyrQuestions = [
      "Would you rather have the ability to fly or be invisible?",
      "Would you rather fight 100 duck-sized horses or 1 horse-sized duck?",
      "Would you rather always know when someone is lying or always get away with lying?",
      "Would you rather have unlimited money or unlimited time?",
      "Would you rather be able to speak every language or play every instrument?",
      "Would you rather have the power to heal others or the power to bring back the dead?",
      "Would you rather be famous for something embarrassing or not be famous at all?",
      "Would you rather live in a world without music or without movies?",
      "Would you rather have perfect memory or perfect health?",
      "Would you rather be able to control time or control gravity?",
    ];

    const randomQuestion =
      wyrQuestions[Math.floor(Math.random() * wyrQuestions.length)];

    const embed = new EmbedBuilder()
      .setColor("#FF69B4")
      .setTitle("🤔 Would You Rather...")
      .setDescription(randomQuestion)
      .setFooter({
        text: "React with 1️⃣ for first option, 2️⃣ for second option!",
      })
      .setTimestamp();

    const wyrMessage = await message.channel.send({ embeds: [embed] });
    await wyrMessage.react("1️⃣");
    await wyrMessage.react("2️⃣");
  }

  if (command === "game" || command === "games") {
    const gamesEmbed = new EmbedBuilder()
      .setColor("#FF4500")
      .setTitle("🎮 Gaming Commands")
      .setDescription("Here are all the fun games you can play:")
      .addFields(
        {
          name: "🎱 !8ball <question>",
          value: "Ask the magic 8-ball a question",
          inline: false,
        },
        {
          name: "🪙 !coinflip",
          value: "Flip a coin (heads or tails)",
          inline: false,
        },
        {
          name: "🎲 !dice [sides]",
          value: "Roll a die (default 6 sides, max 100)",
          inline: false,
        },
        {
          name: "🪨 !rps <rock/paper/scissors>",
          value: "Play rock paper scissors",
          inline: false,
        },
        {
          name: "🧠 !trivia",
          value: "Answer a gaming trivia question",
          inline: false,
        },
        {
          name: "🤔 !wouldyourather",
          value: "Get a would you rather question",
          inline: false,
        },
        {
          name: "🎯 !guess",
          value: "Guess a number between 1-100",
          inline: false,
        },
        {
          name: "🎣 !fish / !f",
          value: "Advanced fishing with areas, boats, baits & more!",
          inline: false,
        },
        {
          name: "🗺️ !areas / !travel",
          value: "Explore different fishing locations",
          inline: false,
        },
        {
          name: "🪱 !baitshop / !boats",
          value: "Buy baits and boats for better fishing",
          inline: false,
        },
        {
          name: "💰 !sellfish / !sellall",
          value: "Sell your catches for coins",
          inline: false,
        },
        {
          name: "🎁 !luckyboxes / !boxes",
          value: "View and buy lucky boxes with random rewards",
          inline: false,
        },
        {
          name: "📦 !buybox <type> [qty] / !openbox <type>",
          value: "Buy and open lucky boxes for surprises",
          inline: false,
        },
        {
          name: "👷 !workers / !fishworkers",
          value: "View your passive income workers",
          inline: false,
        },
        {
          name: "🏢 !buyworker <type> [qty] / !collect",
          value: "Hire workers and collect their earnings",
          inline: false,
        },
        {
          name: "🆘 !fishhelp",
          value: "Complete fishing game guide and commands",
          inline: false,
        },
      )
      .setFooter({ text: "Have fun gaming! 🔥" })
      .setTimestamp();

    message.channel.send({ embeds: [gamesEmbed] });
  }

  if (command === "guess") {
    const targetNumber = Math.floor(Math.random() * 100) + 1;
    let attempts = 0;
    const maxAttempts = 6;

    const embed = new EmbedBuilder()
      .setColor("#00BFFF")
      .setTitle("🎯 Number Guessing Game")
      .setDescription(
        `I'm thinking of a number between **1** and **100**!\nYou have **${maxAttempts}** attempts to guess it.`,
      )
      .setFooter({ text: "Type a number to make your guess!" })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });

    const filter = (m) =>
      m.author.id === message.author.id &&
      !isNaN(m.content) &&
      m.content >= 1 &&
      m.content <= 100;
    const collector = message.channel.createMessageCollector({
      filter,
      time: 60000,
      max: maxAttempts,
    });

    collector.on("collect", (m) => {
      attempts++;
      const guess = parseInt(m.content);
      let response = "";
      let color = "#FFFF00";

      if (guess === targetNumber) {
        response = `🎉 **Congratulations!** You guessed it in ${attempts} attempt(s)!`;
        color = "#00FF00";
        collector.stop("correct");

        // Add XP for winning
        const userKey = `${message.author.id}-${message.guild.id}`;
        const userData = userLevels.get(userKey) || {
          xp: 0,
          level: 1,
          totalXP: 0,
          messages: 0,
        };
        const bonusXP = Math.max(100 - attempts * 15, 25);
        userData.xp += bonusXP;
        userData.totalXP += bonusXP;
        userLevels.set(userKey, userData);
        saveLevels();
      } else if (guess < targetNumber) {
        response = `📈 Too low! Try higher. (${attempts}/${maxAttempts})`;
        color = "#FF6B6B";
      } else {
        response = `📉 Too high! Try lower. (${attempts}/${maxAttempts})`;
        color = "#FF6B6B";
      }

      const responseEmbed = new EmbedBuilder()
        .setColor(color)
        .setDescription(response)
        .setTimestamp();

      message.channel.send({ embeds: [responseEmbed] });

      if (attempts >= maxAttempts && guess !== targetNumber) {
        const gameOverEmbed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("💥 Game Over!")
          .setDescription(
            `You've used all your attempts! The number was **${targetNumber}**.`,
          )
          .setTimestamp();

        message.channel.send({ embeds: [gameOverEmbed] });
        collector.stop("maxAttempts");
      }
    });

    collector.on("end", (collected, reason) => {
      if (reason === "time" && collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor("#FFFF00")
          .setTitle("⏰ Time's Up!")
          .setDescription(
            `The number was **${targetNumber}**. Better luck next time!`,
          )
          .setTimestamp();

        message.channel.send({ embeds: [timeoutEmbed] });
      }
    });
  }

  // ==================== SIMULATOR COMMANDS ====================

  // FISH Command
  if (command === "fish") {
    const result = await simulator.performFish(
      message.author.id,
      message.guild.id,
    );

    if (!result.success) {
      return message.reply(result.message);
    }

    const embed = new EmbedBuilder()
      .setColor("#00BFFF")
      .setTitle("🎣 Fishing Success!")
      .setDescription(
        `You caught a **${result.fish.name}** ${result.fish.emoji}!`,
      )
      .addFields(
        { name: "💰 Coins Earned", value: `${result.coins}`, inline: true },
        { name: "✨ XP Gained", value: `${result.xp}`, inline: true },
        { name: "📊 Level", value: `${result.level}`, inline: true },
      )
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // MINE Command
  if (command === "mine") {
    const result = await simulator.performMine(
      message.author.id,
      message.guild.id,
    );

    if (!result.success) {
      return message.reply(result.message);
    }

    const embed = new EmbedBuilder()
      .setColor("#8B4513")
      .setTitle("⛏️ Mining Success!")
      .setDescription(`You mined **${result.ore.name}** ${result.ore.emoji}!`)
      .addFields(
        { name: "💰 Coins Earned", value: `${result.coins}`, inline: true },
        { name: "✨ XP Gained", value: `${result.xp}`, inline: true },
        { name: "📊 Level", value: `${result.level}`, inline: true },
      )
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // FARM Command
  if (command === "farm") {
    const result = await simulator.performFarm(
      message.author.id,
      message.guild.id,
    );

    if (!result.success) {
      return message.reply(result.message);
    }

    const embed = new EmbedBuilder()
      .setColor("#228B22")
      .setTitle("🌾 Farming Success!")
      .setDescription(
        `You harvested **${result.crop.name}** ${result.crop.emoji}!`,
      )
      .addFields(
        { name: "💰 Coins Earned", value: `${result.coins}`, inline: true },
        { name: "✨ XP Gained", value: `${result.xp}`, inline: true },
        { name: "📊 Level", value: `${result.level}`, inline: true },
      )
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // PROFILE Command
  if (command === "profile") {
    const userData = simulator.getUserData(message.author.id, message.guild.id);

    const embed = new EmbedBuilder()
      .setColor("#FF4500")
      .setTitle(`🔥 ${message.author.username}'s Profile`)
      .addFields(
        { name: "💰 Coins", value: `${userData.coins}`, inline: true },
        { name: "💥 Prestige", value: `${userData.prestige}`, inline: true },
        {
          name: "🎣 Fishing Level",
          value: `${userData.fishingLevel}`,
          inline: true,
        },
        {
          name: "⛏️ Mining Level",
          value: `${userData.miningLevel}`,
          inline: true,
        },
        {
          name: "🌾 Farming Level",
          value: `${userData.farmingLevel}`,
          inline: true,
        },
        { name: "🐾 Pets", value: `${userData.pets.length}`, inline: true },
      )
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // BUY Command
  if (command === "buy") {
    const itemName = args.join("_").toLowerCase();
    if (!itemName) {
      return message.reply("Usage: !buy <item_name>");
    }

    const userData = simulator.getUserData(message.author.id, message.guild.id);
    const tool = simulator.tools[itemName];

    if (!tool) {
      return message.reply(
        "Item not found! Use !fishstore, !minestore, or !farmstore to see available items.",
      );
    }

    if (userData.coins < tool.price) {
      return message.reply(
        `You need ${tool.price} coins but only have ${userData.coins} coins.`,
      );
    }

    // Check if already owned
    if (
      tool.type === "fishing" &&
      userData.ownedFishingRods.includes(itemName)
    ) {
      return message.reply("You already own this item!");
    }
    if (tool.type === "mining" && userData.ownedPickaxes.includes(itemName)) {
      return message.reply("You already own this item!");
    }
    if (tool.type === "farming" && userData.ownedHoes.includes(itemName)) {
      return message.reply("You already own this item!");
    }

    userData.coins -= tool.price;

    if (tool.type === "fishing") {
      userData.ownedFishingRods.push(itemName);
    } else if (tool.type === "mining") {
      userData.ownedPickaxes.push(itemName);
    } else if (tool.type === "farming") {
      userData.ownedHoes.push(itemName);
    }

    simulator.saveSimulatorData();

    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("🛍️ Purchase Successful!")
      .setDescription(`You bought **${tool.name}**!`)
      .addFields(
        { name: "💰 Cost", value: `${tool.price} coins`, inline: true },
        {
          name: "🏦 Remaining",
          value: `${userData.coins} coins`,
          inline: true,
        },
      )
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // EQUIP Command
  if (command === "equip") {
    const itemName = args.join("_").toLowerCase();
    if (!itemName) {
      return message.reply("Usage: !equip <item_name>");
    }

    const userData = simulator.getUserData(message.author.id, message.guild.id);
    const tool = simulator.tools[itemName];

    if (!tool) {
      return message.reply("Item not found!");
    }

    if (tool.type === "fishing") {
      if (!userData.ownedFishingRods.includes(itemName)) {
        return message.reply("You don't own this rod!");
      }
      userData.fishingRod = itemName;
    } else if (tool.type === "mining") {
      if (!userData.ownedPickaxes.includes(itemName)) {
        return message.reply("You don't own this pickaxe!");
      }
      userData.miningPickaxe = itemName;
    } else if (tool.type === "farming") {
      if (!userData.ownedHoes.includes(itemName)) {
        return message.reply("You don't own this hoe!");
      }
      userData.farmingHoe = itemName;
    }

    simulator.saveSimulatorData();
    message.reply(`✅ Equipped **${tool.name}**!`);
  }

  // FISHSTORE Command
  if (command === "fishstore") {
    const embed = new EmbedBuilder()
      .setColor("#00BFFF")
      .setTitle("🏪 Fishing Store")
      .setDescription("Available fishing rods:");

    for (const [id, tool] of Object.entries(simulator.tools)) {
      if (tool.type === "fishing") {
        embed.addFields({
          name: `${tool.name} (${tool.rarity})`,
          value: `💰 ${tool.price} coins | Power: ${tool.power} | Multiplier: ${tool.multiplier}x`,
          inline: false,
        });
      }
    }

    message.channel.send({ embeds: [embed] });
  }

  // MINESTORE Command
  if (command === "minestore") {
    const embed = new EmbedBuilder()
      .setColor("#8B4513")
      .setTitle("🏪 Mining Store")
      .setDescription("Available pickaxes:");

    for (const [id, tool] of Object.entries(simulator.tools)) {
      if (tool.type === "mining") {
        embed.addFields({
          name: `${tool.name} (${tool.rarity})`,
          value: `💰 ${tool.price} coins | Power: ${tool.power} | Multiplier: ${tool.multiplier}x`,
          inline: false,
        });
      }
    }

    message.channel.send({ embeds: [embed] });
  }

  // FARMSTORE Command
  if (command === "farmstore") {
    const embed = new EmbedBuilder()
      .setColor("#228B22")
      .setTitle("🏪 Farming Store")
      .setDescription("Available hoes:");

    for (const [id, tool] of Object.entries(simulator.tools)) {
      if (tool.type === "farming") {
        embed.addFields({
          name: `${tool.name} (${tool.rarity})`,
          value: `💰 ${tool.price} coins | Power: ${tool.power} | Multiplier: ${tool.multiplier}x`,
          inline: false,
        });
      }
    }

    message.channel.send({ embeds: [embed] });
  }

  // FISHINVENTORY Command
  if (command === "fishinventory") {
    const userData = simulator.getUserData(message.author.id, message.guild.id);

    const embed = new EmbedBuilder()
      .setColor("#00BFFF")
      .setTitle("🎣 Fishing Inventory")
      .setDescription(
        `Current Rod: **${simulator.tools[userData.fishingRod].name}**\n\n**Fish Caught:**`,
      );

    if (Object.keys(userData.fishingInventory).length === 0) {
      embed.setDescription(embed.data.description + "\nNone yet!");
    } else {
      for (const [fishName, count] of Object.entries(
        userData.fishingInventory,
      )) {
        const fish = Object.values(simulator.fishTypes).find(
          (f) => f.name === fishName,
        );
        if (fish) {
          embed.addFields({
            name: `${fish.emoji} ${fishName}`,
            value: `x${count}`,
            inline: true,
          });
        }
      }
    }

    message.channel.send({ embeds: [embed] });
  }

  // MINEINVENTORY Command
  if (command === "mineinventory") {
    const userData = simulator.getUserData(message.author.id, message.guild.id);

    const embed = new EmbedBuilder()
      .setColor("#8B4513")
      .setTitle("⛏️ Mining Inventory")
      .setDescription(
        `Current Pickaxe: **${simulator.tools[userData.miningPickaxe].name}**\n\n**Ores Mined:**`,
      );

    if (Object.keys(userData.miningInventory).length === 0) {
      embed.setDescription(embed.data.description + "\nNone yet!");
    } else {
      for (const [oreName, count] of Object.entries(userData.miningInventory)) {
        const ore = Object.values(simulator.oreTypes).find(
          (o) => o.name === oreName,
        );
        if (ore) {
          embed.addFields({
            name: `${ore.emoji} ${oreName}`,
            value: `x${count}`,
            inline: true,
          });
        }
      }
    }

    message.channel.send({ embeds: [embed] });
  }

  // FARMINVENTORY Command
  if (command === "farminventory") {
    const userData = simulator.getUserData(message.author.id, message.guild.id);

    const embed = new EmbedBuilder()
      .setColor("#228B22")
      .setTitle("🌾 Farming Inventory")
      .setDescription(
        `Current Hoe: **${simulator.tools[userData.farmingHoe].name}**\n\n**Crops Harvested:**`,
      );

    if (Object.keys(userData.farmingInventory).length === 0) {
      embed.setDescription(embed.data.description + "\nNone yet!");
    } else {
      for (const [cropName, count] of Object.entries(
        userData.farmingInventory,
      )) {
        const crop = Object.values(simulator.cropTypes).find(
          (c) => c.name === cropName,
        );
        if (crop) {
          embed.addFields({
            name: `${crop.emoji} ${cropName}`,
            value: `x${count}`,
            inline: true,
          });
        }
      }
    }

    message.channel.send({ embeds: [embed] });
  }

  // WORK Command
  if (command === "work") {
    const result = await simulator.performWork(message.author.id, message.guild.id);

    if (!result.success) {
      return message.reply(result.message);
    }

    const embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("💼 Work Complete!")
      .setDescription(`You worked as a **${result.jobName}**!`)
      .addFields(
        { name: "💰 Coins Earned", value: `${result.coins}`, inline: true },
        { name: "✨ XP Gained", value: `${result.xp}`, inline: true },
        { name: "📊 Work Level", value: `${result.level}`, inline: true }
      )
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // TRADE Command
  if (command === "trade") {
    const target = message.mentions.users.first();

    if (!target) {
      const tradeEmbed = new EmbedBuilder()
        .setColor("#FF69B4")
        .setTitle("💱 Trading System")
        .setDescription("Trade items with other players!")
        .addFields(
          { name: "Usage", value: "`!trade @user`", inline: false },
          { name: "Example", value: "`!trade @JohnDoe`", inline: false }
        )
        .setFooter({ text: "Trading system coming soon!" });

      return message.channel.send({ embeds: [tradeEmbed] });
    }

    if (target.id === message.author.id) {
      return message.reply("You can't trade with yourself!");
    }

    if (target.bot) {
      return message.reply("You can't trade with bots!");
    }

    const tradeEmbed = new EmbedBuilder()
      .setColor("#FFA500")
      .setTitle("💱 Trading Coming Soon!")
      .setDescription(`Trading with ${target} will be available in a future update!`)
      .addFields(
        { name: "📌 Note", value: "The full trading system is under development.", inline: false }
      )
      .setTimestamp();

    message.channel.send({ embeds: [tradeEmbed] });
  }

  // Advanced Fishing Game System
  if (command === "cast" || command === "f") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    let fishingData = getFishingData(userKey);

    // Process passive worker income before fishing
    processWorkerIncome(fishingData);
    saveFishingData(userKey, fishingData);

    // Check fishing cooldown (5 seconds)
    const now = Date.now();
    if (fishingData.lastFished && now - fishingData.lastFished < 5000) {
      const remaining = Math.ceil(
        (5000 - (now - fishingData.lastFished)) / 1000,
      );
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF6B6B")
            .setTitle("🎣 Fishing Cooldown")
            .setDescription(
              `You need to wait **${remaining} seconds** before fishing again!`,
            )
            .setFooter({
              text: "Use this time to check your inventory or buy better gear!",
            }),
        ],
      });
    }

    // Use bait if equipped
    if (
      fishingData.currentBait &&
      fishingData.baitInventory[fishingData.currentBait] > 0
    ) {
      fishingData.baitInventory[fishingData.currentBait]--;
      if (fishingData.baitInventory[fishingData.currentBait] <= 0) {
        delete fishingData.baitInventory[fishingData.currentBait];
        fishingData.currentBait = null;
      }
    }

    // Simulate fishing
    const fishingResult = simulateFishing(fishingData);
    fishingData.lastFished = now;
    fishingData.totalCasts++;

    // Rod breaking functionality removed

    if (fishingResult.caught) {
      const fish = fishingResult.fish;
      const area = fishingAreas[fishingData.currentArea];

      // Update fishing data
      fishingData.fishCaught[fish.id] =
        (fishingData.fishCaught[fish.id] || 0) + 1;
      fishingData.totalFish++;
      fishingData.coins += fish.value;
      fishingData.experience += fish.experience;

      // Update fishing streak
      const today = new Date().toDateString();
      if (fishingData.lastStreakDate !== today) {
        fishingData.fishingStreak =
          fishingData.lastStreakDate ===
          new Date(Date.now() - 86400000).toDateString()
            ? fishingData.fishingStreak + 1
            : 1;
        fishingData.lastStreakDate = today;
      }

      // Check for biggest catch
      if (
        !fishingData.biggestCatch ||
        fish.value > fishingData.biggestCatch.value
      ) {
        fishingData.biggestCatch = { ...fish, caughtAt: area.name };
      }

      // Check for level up
      const oldLevel = Math.floor(
        (fishingData.experience - fish.experience) / 1000,
      );
      const newLevel = Math.floor(fishingData.experience / 1000);
      const leveledUp = newLevel > oldLevel;

      // Calculate size description
      let sizeDesc = "";
      if (fishingResult.sizeVariation) {
        if (fishingResult.sizeVariation > 0.15)
          sizeDesc = "🔹 **Huge specimen!**";
        else if (fishingResult.sizeVariation > 0.05)
          sizeDesc = "🔸 **Above average size**";
        else if (fishingResult.sizeVariation < -0.15)
          sizeDesc = "🔻 **Small specimen**";
        else if (fishingResult.sizeVariation < -0.05)
          sizeDesc = "🔽 **Below average size**";
      }

      const catchEmbed = new EmbedBuilder()
        .setColor("#00FF7F")
        .setTitle("🎣 Nice Catch!")
        .setDescription(
          `You caught a **${fish.name}**! ${fish.emoji}\n${sizeDesc}`,
        )
        .addFields(
          {
            name: "🏞️ Location",
            value: `${area.emoji} ${area.name}`,
            inline: true,
          },
          { name: "💰 Value", value: `${fish.value} coins`, inline: true },
          {
            name: "✨ XP Gained",
            value: `${fish.experience} XP`,
            inline: true,
          },
          {
            name: "📊 Level",
            value: `${Math.floor(fishingData.experience / 1000)}`,
            inline: true,
          },
          {
            name: "🔥 Streak",
            value: `${fishingData.fishingStreak} days`,
            inline: true,
          },
        );

      if (fishingData.currentBait) {
        const bait = baitTypes[fishingData.currentBait];
        const remaining =
          fishingData.baitInventory[fishingData.currentBait] || 0;
        catchEmbed.addFields({
          name: "🪱 Bait Used",
          value: `${bait.emoji} ${bait.name} (${remaining} left)`,
          inline: true,
        });
      }

      catchEmbed
        .setFooter({
          text: `${fish.rarity} ${fish.size} fish | Boat: ${fishingData.currentBoat.name}`,
        })
        .setTimestamp();

      if (leveledUp) {
        catchEmbed.setDescription(
          catchEmbed.data.description +
            `\n\n🎉 **LEVEL UP!** You reached level ${newLevel}!`,
        );
      }

      message.channel.send({ embeds: [catchEmbed] });
    } else {
      const area = fishingAreas[fishingData.currentArea];

      const missEmbed = new EmbedBuilder()
        .setColor("#87CEEB")
        .setTitle("🎣 No Luck This Time")
        .setDescription("The fish got away! Better luck next time.")
        .addFields(
          {
            name: "🏞️ Location",
            value: `${area.emoji} ${area.name}`,
            inline: true,
          },
          {
            name: "🎯 Cast #",
            value: `${fishingData.totalCasts}`,
            inline: true,
          },
          {
            name: "📊 Level",
            value: `${Math.floor(fishingData.experience / 1000)}`,
            inline: true,
          },
        );

      if (fishingData.currentBait) {
        const bait = baitTypes[fishingData.currentBait];
        const remaining =
          fishingData.baitInventory[fishingData.currentBait] || 0;
        missEmbed.addFields({
          name: "🪱 Bait Used",
          value: `${bait.emoji} ${bait.name} (${remaining} left)`,
          inline: true,
        });
      }

      missEmbed
        .setFooter({
          text: `Using ${fishingData.currentRod.name} | Try using better bait!`,
        })
        .setTimestamp();

      message.channel.send({ embeds: [missEmbed] });
    }

    saveFishingData(userKey, fishingData);
  }

  if (command === "fishstats" || command === "fishprofile") {
    const target = message.mentions.users.first() || message.author;
    const userKey = `${target.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const embed = new EmbedBuilder()
      .setColor("#4169E1")
      .setTitle(`🎣 ${target.username}'s Fishing Profile`)
      .setDescription("Here are your fishing statistics:")
      .addFields(
        {
          name: "📊 Fishing Level",
          value: `${Math.floor(fishingData.experience / 1000)}`,
          inline: true,
        },
        {
          name: "✨ Total XP",
          value: `${fishingData.experience}`,
          inline: true,
        },
        { name: "🏦 Coins", value: `${fishingData.coins}`, inline: true },
        {
          name: "🎣 Total Fish Caught",
          value: `${fishingData.totalFish}`,
          inline: true,
        },
        {
          name: "🎯 Total Casts",
          value: `${fishingData.totalCasts}`,
          inline: true,
        },
        {
          name: "📈 Success Rate",
          value: `${fishingData.totalCasts > 0 ? Math.round((fishingData.totalFish / fishingData.totalCasts) * 100) : 0}%`,
          inline: true,
        },
        {
          name: "🎣 Current Rod",
          value: fishingData.currentRod.name,
          inline: true,
        },
        {
          name: "🗂️ Fish Types Caught",
          value: `${Object.keys(fishingData.fishCaught).length}/${Object.keys(fishTypes).length}`,
          inline: true,
        },
        {
          name: "🏆 Rarest Catch",
          value: getRarestCatch(fishingData),
          inline: true,
        },
      )
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: "Use !fish to go fishing or !fishhelp for commands" })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "fishleaderboard" || command === "fishlb") {
    const leaderboardType = args[0]?.toLowerCase() || "total";
    const validTypes = ["total", "level", "coins", "rare"];

    if (!validTypes.includes(leaderboardType)) {
      return message.reply(
        "Valid leaderboard types: `total`, `level`, `coins`, `rare`",
      );
    }

    const allFishingData = [];
    try {
      const fishingDataRaw = JSON.parse(
        fs.readFileSync("fishing.json", "utf8"),
      );

      for (const [userGuildKey, data] of Object.entries(fishingDataRaw)) {
        if (userGuildKey.endsWith(`-${message.guild.id}`)) {
          const userId = userGuildKey.split("-")[0];
          allFishingData.push({ userId, ...data });
        }
      }
    } catch (err) {
      return message.reply("No fishing data available yet!");
    }

    if (allFishingData.length === 0) {
      return message.reply("No fishing data available yet!");
    }

    // Sort based on type
    let sortedData;
    let title;
    let valueField;

    switch (leaderboardType) {
      case "total":
        sortedData = allFishingData.sort((a, b) => b.totalFish - a.totalFish);
        title = "🐟 Most Fish Caught";
        valueField = (data) => `${data.totalFish} fish`;
        break;
      case "level":
        sortedData = allFishingData.sort((a, b) => b.experience - a.experience);
        title = "📊 Highest Fishing Level";
        valueField = (data) =>
          `Level ${Math.floor(data.experience / 1000)} (${data.experience} XP)`;
        break;
      case "coins":
        sortedData = allFishingData.sort((a, b) => b.coins - a.coins);
        title = "💰 Richest Fishers";
        valueField = (data) => `${data.coins} coins`;
        break;
      case "rare":
        sortedData = allFishingData.sort(
          (a, b) => countRareFish(b) - countRareFish(a),
        );
        title = "✨ Most Rare Fish";
        valueField = (data) => `${countRareFish(data)} rare fish`;
        break;
    }

    const topUsers = sortedData.slice(0, 10);
    let description = "";

    for (let i = 0; i < topUsers.length; i++) {
      try {
        const user = await client.users.fetch(topUsers[i].userId);
        const medal =
          i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        description += `${medal} **${user.username}** - ${valueField(topUsers[i])}\n`;
      } catch (error) {
        console.error("Error fetching user for leaderboard:", error);
      }
    }

    const embed = new EmbedBuilder()
      .setColor("#4169E1")
      .setTitle(`🏆 Fishing Leaderboard - ${title}`)
      .setDescription(description)
      .setFooter({
        text: "Use !fishleaderboard [total|level|coins|rare] to change view",
      })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "fishstore" || command === "fishmarket") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const storeEmbed = new EmbedBuilder()
      .setColor("#00BFFF")
      .setTitle("🏪 Fishing Store")
      .setDescription(
        `**Your Coins:** ${fishingData.coins}\n**Current Rod:** ${fishingData.currentRod.name} ${fishingData.currentRod.emoji}`,
      )
      .setFooter({ text: "Use !buyrod <rod_name> to purchase a rod" })
      .setTimestamp();

    for (const [rodId, rod] of Object.entries(fishingRods)) {
      const owned = fishingData.ownedRods.includes(rodId)
        ? "✅ **OWNED**"
        : `💰 **${rod.price} coins**`;
      const current =
        fishingData.currentRod.id === rodId ? "🎣 **EQUIPPED**" : "";
      storeEmbed.addFields({
        name: `${rod.emoji} ${rod.name} ${current}`,
        value: `${rod.description}\n🎯 Catch Rate: ${rod.catchRate}%\n💎 Rare Bonus: +${rod.rareBonus}%\n${owned}`,
        inline: true,
      });
    }

    message.channel.send({ embeds: [storeEmbed] });
  }

  if (command === "buyrod") {
    const rodName = args.join(" ").toLowerCase();
    if (!rodName) {
      return message.reply(
        "Please specify a rod to buy! Use `!fishstore` to see available rods.",
      );
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const rod = Object.entries(fishingRods).find(
      ([id, rod]) => rod.name.toLowerCase().includes(rodName) || id === rodName,
    );

    if (!rod) {
      return message.reply(
        "Rod not found! Use `!fishstore` to see available rods.",
      );
    }

    const [rodId, rodData] = rod;

    if (fishingData.ownedRods.includes(rodId)) {
      return message.reply(
        "You already own this rod! Use `!equiprod` to equip it.",
      );
    }

    if (fishingData.coins < rodData.price) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("💸 Insufficient Funds")
            .setDescription(
              `You need **${rodData.price}** coins but only have **${fishingData.coins}** coins.`,
            )
            .addFields({
              name: "💡 Tip",
              value: "Go fishing to earn more coins!",
            }),
        ],
      });
    }

    fishingData.coins -= rodData.price;
    fishingData.ownedRods.push(rodId);
    saveFishingData(userKey, fishingData);

    const buyEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("🛍️ Purchase Successful!")
      .setDescription(`You bought the **${rodData.name}**! ${rodData.emoji}`)
      .addFields(
        { name: "💰 Cost", value: `${rodData.price} coins`, inline: true },
        {
          name: "🏦 Remaining Coins",
          value: `${fishingData.coins}`,
          inline: true,
        },
        { name: "🎣 Catch Rate", value: `${rodData.catchRate}%`, inline: true },
      )
      .setFooter({ text: "Use !equiprod to equip your new rod!" })
      .setTimestamp();

    message.channel.send({ embeds: [buyEmbed] });
  }

  if (command === "equiprod") {
    const rodName = args.join(" ").toLowerCase();
    if (!rodName) {
      return message.reply(
        "Please specify a rod to equip! Use `!fishinventory` to see your rods.",
      );
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const rod = Object.entries(fishingRods).find(
      ([id, rod]) =>
        (rod.name.toLowerCase().includes(rodName) || id === rodName) &&
        fishingData.ownedRods.includes(id),
    );

    if (!rod) {
      return message.reply(
        "You don't own this rod! Use `!fishstore` to buy it.",
      );
    }

    const [rodId, rodData] = rod;
    fishingData.currentRod = { id: rodId, ...rodData };
    saveFishingData(userKey, fishingData);

    const equipEmbed = new EmbedBuilder()
      .setColor("#4169E1")
      .setTitle("🎣 Rod Equipped!")
      .setDescription(`You equipped the **${rodData.name}**! ${rodData.emoji}`)
      .addFields(
        { name: "🎯 Catch Rate", value: `${rodData.catchRate}%`, inline: true },
        {
          name: "💎 Rare Bonus",
          value: `+${rodData.rareBonus}%`,
          inline: true,
        },
        {
          name: "🔥 Ready to Fish!",
          value: "Use `!fish` to start fishing!",
          inline: true,
        },
      )
      .setTimestamp();

    message.channel.send({ embeds: [equipEmbed] });
  }

  if (command === "fishinventory" || command === "fishbag") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const inventoryEmbed = new EmbedBuilder()
      .setColor("#9932CC")
      .setTitle(`🎒 ${message.author.username}'s Fishing Inventory`)
      .setDescription(
        `**Coins:** ${fishingData.coins}\n**Current Rod:** ${fishingData.currentRod.name} ${fishingData.currentRod.emoji}`,
      )
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    // Show owned rods
    const ownedRodsText =
      fishingData.ownedRods
        .map((rodId) => {
          const rod = fishingRods[rodId];
          const equipped = fishingData.currentRod.id === rodId ? "🎣" : "";
          return `${equipped} ${rod.emoji} ${rod.name}`;
        })
        .join("\n") || "No rods owned";

    inventoryEmbed.addFields({
      name: "🎣 Owned Rods",
      value: ownedRodsText,
      inline: false,
    });

    // Show fish collection (top 10 most caught)
    const fishEntries = Object.entries(fishingData.fishCaught)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (fishEntries.length > 0) {
      const fishText = fishEntries
        .map(([fishId, count]) => {
          const fish = fishTypes[fishId];
          return `${fish.emoji} ${fish.name} x${count}`;
        })
        .join("\n");

      inventoryEmbed.addFields({
        name: "🐟 Top Fish Collection",
        value: fishText,
        inline: false,
      });
    }

    message.channel.send({ embeds: [inventoryEmbed] });
  }

  if (command === "fishcollection") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const rarityGroups = {
      Common: [],
      Uncommon: [],
      Rare: [],
      Epic: [],
      Legendary: [],
      Mythical: [],
    };

    // Group fish by rarity
    for (const [fishId, count] of Object.entries(fishingData.fishCaught)) {
      const fish = fishTypes[fishId];
      if (fish && fish.emoji && fish.name && fish.rarity) {
        rarityGroups[fish.rarity].push(`${fish.emoji} ${fish.name} x${count}`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor("#9932CC")
      .setTitle(`📚 ${message.author.username}'s Fish Collection`)
      .setDescription(
        `**Total Fish Types:** ${Object.keys(fishingData.fishCaught).length}/${Object.keys(fishTypes).length}`,
      )
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    for (const [rarity, fishes] of Object.entries(rarityGroups)) {
      if (fishes.length > 0) {
        embed.addFields({
          name: `${getRarityEmoji(rarity)} ${rarity}`,
          value: fishes.slice(0, 10).join("\n"),
          inline: true,
        });
      }
    }

    message.channel.send({ embeds: [embed] });
  }

  if (command === "sellfish") {
    const fishId = args[0]?.toLowerCase();
    const quantity = parseInt(args[1]) || 1;

    if (!fishId) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing Fish Type")
            .setDescription(
              "Usage: `!sellfish <fish_name> [quantity]`\nExample: `!sellfish bass 5`",
            )
            .addFields({
              name: "💡 Tip",
              value: "Use `!fishcollection` to see your available fish",
            }),
        ],
      });
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    // Find the fish by name or ID
    const fish = Object.values(fishTypes).find(
      (f) => f.name.toLowerCase().includes(fishId) || f.id === fishId,
    );

    if (!fish) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Fish Not Found")
            .setDescription("That fish type doesn't exist!")
            .addFields({
              name: "💡 Tip",
              value: "Use `!fishcollection` to see available fish types",
            }),
        ],
      });
    }

    const ownedQuantity = fishingData.fishCaught[fish.id] || 0;

    if (ownedQuantity === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF6B6B")
            .setTitle("🐟 No Fish to Sell")
            .setDescription(`You don't have any **${fish.name}** to sell!`)
            .addFields({
              name: "💡 Tip",
              value: "Go fishing to catch more fish!",
            }),
        ],
      });
    }

    if (quantity <= 0 || quantity > ownedQuantity) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF6B6B")
            .setTitle("❌ Invalid Quantity")
            .setDescription(
              `You can only sell 1-${ownedQuantity} **${fish.name}**`,
            ),
        ],
      });
    }

    // Calculate total value
    const totalValue = fish.value * quantity;

    // Update player data
    fishingData.fishCaught[fish.id] -= quantity;
    if (fishingData.fishCaught[fish.id] === 0) {
      delete fishingData.fishCaught[fish.id];
    }
    fishingData.coins += totalValue;

    saveFishingData(userKey, fishingData);

    const sellEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("💰 Fish Sold Successfully!")
      .setDescription(`You sold **${quantity}x ${fish.name}** ${fish.emoji}`)
      .addFields(
        { name: "💵 Coins Earned", value: `${totalValue} coins`, inline: true },
        {
          name: "🏦 Total Coins",
          value: `${fishingData.coins} coins`,
          inline: true,
        },
        {
          name: "🐟 Remaining",
          value: `${fishingData.fishCaught[fish.id] || 0}x ${fish.name}`,
          inline: true,
        },
      )
      .setFooter({ text: "Use your coins to buy better fishing rods!" })
      .setTimestamp();

    message.channel.send({ embeds: [sellEmbed] });
  }

  if (command === "sellall") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    if (Object.keys(fishingData.fishCaught).length === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF6B6B")
            .setTitle("🐟 No Fish to Sell")
            .setDescription("You don't have any fish to sell!")
            .addFields({
              name: "💡 Tip",
              value: "Go fishing to catch some fish first!",
            }),
        ],
      });
    }

    let totalValue = 0;
    let totalFish = 0;
    const soldFish = [];

    // Calculate total value and prepare sale details
    for (const [fishId, quantity] of Object.entries(fishingData.fishCaught)) {
      const fish = fishTypes[fishId];
      if (fish) {
        const fishValue = fish.value * quantity;
        totalValue += fishValue;
        totalFish += quantity;
        soldFish.push(
          `${quantity}x ${fish.name} ${fish.emoji} = ${fishValue} coins`,
        );
      }
    }

    // Clear all fish and add coins
    fishingData.fishCaught = {};
    fishingData.coins += totalValue;

    saveFishingData(userKey, fishingData);

    const sellAllEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("💰 Sold All Fish!")
      .setDescription(
        `You sold **${totalFish} fish** for a total of **${totalValue} coins**!`,
      )
      .addFields(
        {
          name: "🏦 Total Coins",
          value: `${fishingData.coins} coins`,
          inline: true,
        },
        { name: "🐟 Fish Sold", value: `${totalFish} fish`, inline: true },
        { name: "💵 Value", value: `${totalValue} coins`, inline: true },
      )
      .setFooter({ text: "All your fish have been converted to coins!" })
      .setTimestamp();

    // Add sale details if not too long
    const saleDetails = soldFish.slice(0, 10).join("\n");
    if (saleDetails.length < 1024) {
      sellAllEmbed.addFields({
        name: "📋 Sale Details",
        value: saleDetails,
        inline: false,
      });
    }

    message.channel.send({ embeds: [sellAllEmbed] });
  }

  if (command === "areas" || command === "fishareas") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);
    const fishingLevel = Math.floor(fishingData.experience / 1000);

    const areasEmbed = new EmbedBuilder()
      .setColor("#4169E1")
      .setTitle("🗺️ Fishing Areas")
      .setDescription(
        `**Current Area:** ${fishingAreas[fishingData.currentArea].emoji} ${fishingAreas[fishingData.currentArea].name}\n**Your Level:** ${fishingLevel}`,
      )
      .setFooter({ text: "Use !travel <area> to change location" })
      .setTimestamp();

    for (const [areaId, area] of Object.entries(fishingAreas)) {
      const unlocked = fishingLevel >= area.unlockLevel;
      const current = fishingData.currentArea === areaId;
      const status = current
        ? "📍 **CURRENT**"
        : unlocked
          ? "✅ **UNLOCKED**"
          : `🔒 **Requires Level ${area.unlockLevel}**`;

      areasEmbed.addFields({
        name: `${area.emoji} ${area.name} ${current ? "📍" : ""}`,
        value: `${area.description}\n🎣 Fish Bonus: ${Math.round((area.fishMultiplier - 1) * 100)}%\n💎 Rare Bonus: +${area.rareBonus}%\n🚗 Travel Cost: ${area.travelCost} coins\n${status}`,
        inline: true,
      });
    }

    message.channel.send({ embeds: [areasEmbed] });
  }

  if (command === "travel") {
    const areaName = args[0]?.toLowerCase();
    if (!areaName) {
      return message.reply(
        "Please specify an area to travel to! Use `!areas` to see available locations.",
      );
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);
    const fishingLevel = Math.floor(fishingData.experience / 1000);

    const area = Object.values(fishingAreas).find(
      (a) => a.name.toLowerCase().includes(areaName) || a.id === areaName,
    );

    if (!area) {
      return message.reply(
        "Area not found! Use `!areas` to see available locations.",
      );
    }

    if (fishingLevel < area.unlockLevel) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("🔒 Area Locked")
            .setDescription(
              `You need to be level **${area.unlockLevel}** to access **${area.name}**.`,
            )
            .addFields({
              name: "Current Level",
              value: `${fishingLevel}`,
              inline: true,
            }),
        ],
      });
    }

    if (fishingData.currentArea === area.id) {
      return message.reply(`You're already at ${area.emoji} **${area.name}**!`);
    }

    if (fishingData.coins < area.travelCost) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("💸 Insufficient Funds")
            .setDescription(
              `You need **${area.travelCost}** coins to travel to **${area.name}**.`,
            )
            .addFields({
              name: "Your Coins",
              value: `${fishingData.coins}`,
              inline: true,
            }),
        ],
      });
    }

    fishingData.coins -= area.travelCost;
    fishingData.currentArea = area.id;
    saveFishingData(userKey, fishingData);

    const travelEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("🚗 Travel Complete!")
      .setDescription(`You've arrived at ${area.emoji} **${area.name}**!`)
      .addFields(
        {
          name: "Travel Cost",
          value: `${area.travelCost} coins`,
          inline: true,
        },
        {
          name: "Remaining Coins",
          value: `${fishingData.coins}`,
          inline: true,
        },
        {
          name: "Fish Bonus",
          value: `+${Math.round((area.fishMultiplier - 1) * 100)}%`,
          inline: true,
        },
      )
      .setFooter({ text: area.description })
      .setTimestamp();

    message.channel.send({ embeds: [travelEmbed] });
  }

  // Boats system
  if (command === "boats") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const boatsEmbed = new EmbedBuilder()
      .setColor("#1E90FF")
      .setTitle("🚤 Boat Shop")
      .setDescription(
        "Boats increase your fishing efficiency across all areas!",
      )
      .setFooter({ text: "Use !buyboat <boat_name> to purchase" })
      .setTimestamp();

    message.channel.send({ embeds: [boatsEmbed] });
  }
});

// Handle button interactions for reaction roles
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // Handle reaction roles
    if (customId.startsWith("role-")) {
      const roleId = customId.replace("role-", "");
      let role = null;

      // Handle special predefined roles
      if (roleId === "announcement") {
        role = interaction.guild.roles.cache.find(r => r.name === "Announcement Ping");
      } else if (roleId === "giveaway") {
        role = interaction.guild.roles.cache.find(r => r.name === "Giveaway Ping");
      } else {
        role = interaction.guild.roles.cache.get(roleId);
      }

      if (!role) {
        return interaction.reply({
          content: "This role no longer exists!",
          ephemeral: true,
        });
      }

      // Toggle role
      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        await interaction.reply({
          content: `Removed the ${role.name} role!`,
          ephemeral: true,
        });
      } else {
        await interaction.member.roles.add(role);
        await interaction.reply({
          content: `You now have the ${role.name} role!`,
          ephemeral: true,
        });
      }
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  try {
    // General Commands
    if (commandName === "help") {
      // Reuse the help embed logic
      const isOwner =
        interaction.user.id === interaction.guild.ownerId ||
        interaction.member.roles.cache.some((r) => r.name === "Owner");
      const isAdmin =
        isOwner ||
        interaction.member.roles.cache.some((r) => r.name === "Admin");
      const isMod =
        isAdmin ||
        interaction.member.roles.cache.some((r) => r.name === "Moderator");
      const isDev = interaction.member.roles.cache.some(
        (r) => r.name === "Developer",
      );

      const helpEmbed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle("🔥 Flamin' Hot Games Bot - Command Help")
        .setDescription(
          "**Welcome!** Use slash commands (/) for the best experience!",
        )
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          {
            name: "ℹ️ General",
            value: "`/help` `/ping` `/rules` `/avatar`",
            inline: false,
          },
          {
            name: "🔥 Leveling",
            value: "`/level` `/leaderboard` `/achievements`",
            inline: false,
          },
          {
            name: "🎣 Fishing",
            value: "`/fish` `/fishstats` `/areas` `/travel`",
            inline: false,
          },
          {
            name: "⛏️ Mining",
            value: "`/mine` `/mineinventory`",
            inline: false,
          },
          {
            name: "🌾 Farming",
            value: "`/farm` `/farminventory`",
            inline: false,
          },
          {
            name: "🎮 Games",
            value: "`/8ball` `/coinflip` `/dice` `/rps`",
            inline: false,
          },
        )
        .setFooter({ text: "💡 Slash commands are faster and easier to use!" });

      await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    } else if (commandName === "ping") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🏓 Pong!")
        .addFields({
          name: "API Latency",
          value: `${Math.round(client.ws.ping)}ms`,
          inline: true,
        })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "avatar") {
      const target = options.getUser("user") || interaction.user;
      const avatarEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(`${target.username}'s Avatar`)
        .setImage(target.displayAvatarURL({ size: 1024, dynamic: true }));
      await interaction.reply({ embeds: [avatarEmbed] });
    } else if (commandName === "level") {
      const target = options.getUser("user") || interaction.user;
      const userKey = `${target.id}-${interaction.guild.id}`;
      const userData = userLevels.get(userKey) || {
        xp: 0,
        level: 1,
        totalXP: 0,
        messages: 0,
      };

      const embed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle("🔥 User Level & Experience")
        .setDescription(`**${target.username}**'s progress:`)
        .addFields(
          { name: "🏆 Level", value: `${userData.level}`, inline: true },
          {
            name: "✨ Current XP",
            value: `${userData.xp}/${calculateXPForLevel(userData.level + 1) - calculateXPForLevel(userData.level)}`,
            inline: true,
          },
          { name: "💫 Total XP", value: `${userData.totalXP}`, inline: true },
        )
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "fish") {
      const result = await simulator.performFish(
        interaction.user.id,
        interaction.guild.id,
      );
      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor("#00BFFF")
        .setTitle("🎣 Fishing Success!")
        .setDescription(
          `You caught a **${result.fish.name}** ${result.fish.emoji}!`,
        )
        .addFields(
          { name: "💰 Coins Earned", value: `${result.coins}`, inline: true },
          { name: "✨ XP Gained", value: `${result.xp}`, inline: true },
          { name: "📊 Level", value: `${result.level}`, inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "mine") {
      const result = await simulator.performMine(
        interaction.user.id,
        interaction.guild.id,
      );
      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor("#8B4513")
        .setTitle("⛏️ Mining Success!")
        .setDescription(`You mined **${result.ore.name}** ${result.ore.emoji}!`)
        .addFields(
          { name: "💰 Coins Earned", value: `${result.coins}`, inline: true },
          { name: "✨ XP Gained", value: `${result.xp}`, inline: true },
          { name: "📊 Level", value: `${result.level}`, inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "farm") {
      const result = await simulator.performFarm(
        interaction.user.id,
        interaction.guild.id,
      );
      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor("#228B22")
        .setTitle("🌾 Farming Success!")
        .setDescription(
          `You harvested **${result.crop.name}** ${result.crop.emoji}!`,
        )
        .addFields(
          { name: "💰 Coins Earned", value: `${result.coins}`, inline: true },
          { name: "✨ XP Gained", value: `${result.xp}`, inline: true },
          { name: "📊 Level", value: `${result.level}`, inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "profile") {
      const userData = simulator.getUserData(
        interaction.user.id,
        interaction.guild.id,
      );

      const embed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle(`🔥 ${interaction.user.username}'s Profile`)
        .addFields(
          { name: "💰 Coins", value: `${userData.coins}`, inline: true },
          { name: "💥 Prestige", value: `${userData.prestige}`, inline: true },
          {
            name: "🎣 Fishing Level",
            value: `${userData.fishingLevel}`,
            inline: true,
          },
          {
            name: "⛏️ Mining Level",
            value: `${userData.miningLevel}`,
            inline: true,
          },
          {
            name: "🌾 Farming Level",
            value: `${userData.farmingLevel}`,
            inline: true,
          },
        )
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "8ball") {
      const question = options.getString("question");
      const responses = [
        "🎱 It is certain",
        "🎱 Without a doubt",
        "🎱 Yes definitely",
        "🎱 Reply hazy, try again",
        "🎱 Ask again later",
        "🎱 Don't count on it",
        "🎱 My reply is no",
        "🎱 Very doubtful",
      ];
      const answer = responses[Math.floor(Math.random() * responses.length)];

      const embed = new EmbedBuilder()
        .setColor("#9932CC")
        .setTitle("🎱 Magic 8-Ball")
        .addFields(
          { name: "Question", value: question, inline: false },
          { name: "Answer", value: answer, inline: false },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "coinflip") {
      const result = Math.random() < 0.5 ? "🪙 **Heads!**" : "🪙 **Tails!**";
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🪙 Coin Flip")
        .setDescription(result)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "dice") {
      const sides = options.getInteger("sides") || 6;
      const result = Math.floor(Math.random() * sides) + 1;

      const embed = new EmbedBuilder()
        .setColor("#FF6B6B")
        .setTitle("🎲 Dice Roll")
        .setDescription(`You rolled a **${result}** on a ${sides}-sided die!`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "rps") {
      const userChoice = options.getString("choice");
      const choices = ["rock", "paper", "scissors"];
      const botChoice = choices[Math.floor(Math.random() * choices.length)];

      let result = "";
      let color = "#FFFF00";

      if (userChoice === botChoice) {
        result = "It's a tie! 🤝";
      } else if (
        (userChoice === "rock" && botChoice === "scissors") ||
        (userChoice === "paper" && botChoice === "rock") ||
        (userChoice === "scissors" && botChoice === "paper")
      ) {
        result = "You win! 🎉";
        color = "#00FF00";
      } else {
        result = "You lose! 😔";
        color = "#FF0000";
      }

      const emojiMap = { rock: "🪨", paper: "📄", scissors: "✂️" };

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🎮 Rock Paper Scissors")
        .addFields(
          {
            name: "Your Choice",
            value: `${emojiMap[userChoice]} ${userChoice}`,
            inline: true,
          },
          {
            name: "Bot Choice",
            value: `${emojiMap[botChoice]} ${botChoice}`,
            inline: true,
          },
          { name: "Result", value: result, inline: false },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "rules") {
      const rulesEmbed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle("🔥 Fling Ladder Community Rules")
        .setDescription("Please follow these rules to keep our community fun:")
        .addFields(
          {
            name: "1. Be Respectful",
            value:
              "Treat all members with respect. No harassment, hate speech, or bullying.",
          },
          {
            name: "2. No Spamming",
            value: "Don't spam messages, emotes, or mentions.",
          },
          {
            name: "3. Use Appropriate Channels",
            value: "Post content in the right channels.",
          },
          {
            name: "4. Keep Content Appropriate",
            value: "Keep all content family-friendly.",
          },
          {
            name: "5. Follow Discord TOS",
            value: "Adhere to Discord's Terms of Service.",
          },
          {
            name: "6. Listen to Staff",
            value: "Follow instructions from server moderators and admins.",
          },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [rulesEmbed] });
    } else if (commandName === "servericon") {
      const iconEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(`${interaction.guild.name}'s Icon`)
        .setImage(interaction.guild.iconURL({ size: 1024, dynamic: true }));

      await interaction.reply({ embeds: [iconEmbed] });
    } else if (commandName === "leaderboard") {
      const guildUsers = Array.from(userLevels.entries())
        .filter(([key]) => key.endsWith(`-${interaction.guild.id}`))
        .map(([key, data]) => ({
          userId: key.split("-")[0],
          ...data,
        }))
        .sort((a, b) => b.totalXP - a.totalXP)
        .slice(0, 10);

      if (guildUsers.length === 0) {
        return interaction.reply({
          content: "No users found in the leaderboard yet!",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle("🏆 Server Leaderboard")
        .setDescription("Here are the top users in this community:")
        .setTimestamp();

      let description = "";
      for (let i = 0; i < guildUsers.length; i++) {
        const user = guildUsers[i];
        try {
          const member = await interaction.guild.members
            .fetch(user.userId)
            .catch(() => null);
          const username = member ? member.user.username : "Unknown User";
          const medal =
            i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          description += `${medal} **${username}** - Level ${user.level} (${user.totalXP} XP)\n`;
        } catch (error) {
          console.error("Error fetching user:", error);
        }
      }

      embed.setDescription(description);
      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "fishinventory") {
      const userData = simulator.getUserData(
        interaction.user.id,
        interaction.guild.id,
      );

      const embed = new EmbedBuilder()
        .setColor("#00BFFF")
        .setTitle("🎣 Fishing Inventory")
        .setDescription(
          `Current Rod: **${simulator.tools[userData.fishingRod].name}**\n\n**Fish Caught:**`,
        );

      if (Object.keys(userData.fishingInventory).length === 0) {
        embed.setDescription(embed.data.description + "\nNone yet!");
      } else {
        for (const [fishName, count] of Object.entries(
          userData.fishingInventory,
        )) {
          const fish = Object.values(simulator.fishTypes).find(
            (f) => f.name === fishName,
          );
          if (fish) {
            embed.addFields({
              name: `${fish.emoji} ${fishName}`,
              value: `x${count}`,
              inline: true,
            });
          }
        }
      }

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "mineinventory") {
      const userData = simulator.getUserData(
        interaction.user.id,
        interaction.guild.id,
      );

      const embed = new EmbedBuilder()
        .setColor("#8B4513")
        .setTitle("⛏️ Mining Inventory")
        .setDescription(
          `Current Pickaxe: **${simulator.tools[userData.miningPickaxe].name}**\n\n**Ores Mined:**`,
        );

      if (Object.keys(userData.miningInventory).length === 0) {
        embed.setDescription(embed.data.description + "\nNone yet!");
      } else {
        for (const [oreName, count] of Object.entries(
          userData.miningInventory,
        )) {
          const ore = Object.values(simulator.oreTypes).find(
            (o) => o.name === oreName,
          );
          if (ore) {
            embed.addFields({
              name: `${ore.emoji} ${oreName}`,
              value: `x${count}`,
              inline: true,
            });
          }
        }
      }

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "farminventory") {
      const userData = simulator.getUserData(
        interaction.user.id,
        interaction.guild.id,
      );

      const embed = new EmbedBuilder()
        .setColor("#228B22")
        .setTitle("🌾 Farming Inventory")
        .setDescription(
          `Current Hoe: **${simulator.tools[userData.farmingHoe].name}**\n\n**Crops Harvested:**`,
        );

      if (Object.keys(userData.farmingInventory).length === 0) {
        embed.setDescription(embed.data.description + "\nNone yet!");
      } else {
        for (const [cropName, count] of Object.entries(
          userData.farmingInventory,
        )) {
          const crop = Object.values(simulator.cropTypes).find(
            (c) => c.name === cropName,
          );
          if (crop) {
            embed.addFields({
              name: `${crop.emoji} ${cropName}`,
              value: `x${count}`,
              inline: true,
            });
          }
        }
      }

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "fishstore") {
      const embed = new EmbedBuilder()
        .setColor("#00BFFF")
        .setTitle("🏪 Fishing Store")
        .setDescription("Available fishing rods:");

      for (const [id, tool] of Object.entries(simulator.tools)) {
        if (tool.type === "fishing") {
          embed.addFields({
            name: `${tool.name} (${tool.rarity})`,
            value: `💰 ${tool.price} coins | Power: ${tool.power} | Multiplier: ${tool.multiplier}x`,
            inline: false,
          });
        }
      }

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "minestore") {
      const embed = new EmbedBuilder()
        .setColor("#8B4513")
        .setTitle("🏪 Mining Store")
        .setDescription("Available pickaxes:");

      for (const [id, tool] of Object.entries(simulator.tools)) {
        if (tool.type === "mining") {
          embed.addFields({
            name: `${tool.name} (${tool.rarity})`,
            value: `💰 ${tool.price} coins | Power: ${tool.power} | Multiplier: ${tool.multiplier}x`,
            inline: false,
          });
        }
      }

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "farmstore") {
      const embed = new EmbedBuilder()
        .setColor("#228B22")
        .setTitle("🏪 Farming Store")
        .setDescription("Available hoes:");

      for (const [id, tool] of Object.entries(simulator.tools)) {
        if (tool.type === "farming") {
          embed.addFields({
            name: `${tool.name} (${tool.rarity})`,
            value: `💰 ${tool.price} coins | Power: ${tool.power} | Multiplier: ${tool.multiplier}x`,
            inline: false,
          });
        }
      }

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "fishstats") {
      const target = options.getUser("user") || interaction.user;
      const userData = simulator.getUserData(target.id, interaction.guild.id);

      const embed = new EmbedBuilder()
        .setColor("#4169E1")
        .setTitle(`🎣 ${target.username}'s Fishing Stats`)
        .addFields(
          {
            name: "📊 Fishing Level",
            value: `${userData.fishingLevel}`,
            inline: true,
          },
          {
            name: "✨ Fishing XP",
            value: `${userData.fishingXP}`,
            inline: true,
          },
          { name: "💰 Coins", value: `${userData.coins}`, inline: true },
        )
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "achievements") {
      const target = options.getUser("user") || interaction.user;
      const userKey = `${target.id}-${interaction.guild.id}`;
      const userAchievements = achievements.get(userKey) || [];

      if (userAchievements.length === 0) {
        return interaction.reply({
          content: `${target.username} hasn't unlocked any achievements yet!`,
          ephemeral: true,
        });
      }

      const achievementFields = userAchievements
        .map((achievementId) => {
          const achievement = achievementList[achievementId];
          return achievement
            ? {
                name: `${achievement.emoji} ${achievement.name}`,
                value: `${achievement.description} (+${achievement.xp} XP)`,
                inline: true,
              }
            : null;
        })
        .filter(Boolean);

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`🏆 ${target.username}'s Achievements`)
        .setDescription(
          `**${userAchievements.length}/${Object.keys(achievementList).length}** achievements unlocked`,
        )
        .addFields(achievementFields)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "work") {
      const result = simulator.performWork(interaction.user.id, interaction.guild.id);

      if (!result.success) {
        return interaction.reply({
          content: result.message,
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("💼 Work Complete!")
        .setDescription(`You worked as a **${result.jobName}**!`)
        .addFields(
          { name: "💰 Coins Earned", value: `${result.coins}`, inline: true },
          { name: "✨ XP Gained", value: `${result.xp}`, inline: true },
          { name: "📊 Work Level", value: `${result.level}`, inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "trade") {
      const target = options.getUser("user");

      if (target.id === interaction.user.id) {
        return interaction.reply({
          content: "You can't trade with yourself!",
          ephemeral: true,
        });
      }

      if (target.bot) {
        return interaction.reply({
          content: "You can't trade with bots!",
          ephemeral: true,
        });
      }

      const tradeEmbed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle("💱 Trading Coming Soon!")
        .setDescription(`Trading with ${target} will be available in a future update!`)
        .addFields(
          { name: "📌 Note", value: "The full trading system is under development.", inline: false }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [tradeEmbed] });
    } else if (commandName === "daily") {
      const result = simulator.claimDaily(interaction.user.id, interaction.guild.id);

      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🎁 Daily Reward Claimed!")
        .setDescription(`You received **${result.coins}** coins!`)
        .addFields(
          { name: "💰 Total Coins", value: `${result.totalCoins}`, inline: true },
          { name: "🔥 Streak", value: `${result.streak} days`, inline: true }
        )
        .setFooter({ text: "Come back tomorrow for another reward!" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "beg") {
      const result = simulator.beg(interaction.user.id, interaction.guild.id);

      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(result.coins > 0 ? "#00FF00" : "#FF6B6B")
        .setTitle(result.coins > 0 ? "💰 Someone Gave You Coins!" : "😔 No Luck")
        .setDescription(result.message)
        .addFields(
          { name: "💵 Received", value: `${result.coins} coins`, inline: true },
          { name: "🏦 Total Coins", value: `${result.totalCoins}`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "crime") {
      const result = simulator.crime(interaction.user.id, interaction.guild.id);

      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(result.caught ? "#FF0000" : "#00FF00")
        .setTitle(result.caught ? "🚔 Caught!" : "💰 Crime Success!")
        .setDescription(result.message)
        .addFields(
          { name: result.caught ? "💸 Lost" : "💵 Earned", value: `${Math.abs(result.coins)} coins`, inline: true },
          { name: "🏦 Total Coins", value: `${result.totalCoins}`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "search") {
      const location = options.getString("location");
      const result = simulator.search(interaction.user.id, interaction.guild.id, location);

      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor("#4169E1")
        .setTitle(`🔍 Searched ${result.locationName}`)
        .setDescription(result.message)
        .addFields(
          { name: "💰 Found", value: `${result.coins} coins`, inline: true },
          { name: "🏦 Total Coins", value: `${result.totalCoins}`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "hatch") {
      const eggType = options.getString("egg");
      const result = simulator.hatchPet(interaction.user.id, interaction.guild.id, eggType);

      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🥚 Pet Hatched!")
        .setDescription(`You hatched a **${result.pet.name}**!`)
        .addFields(
          { name: "🏷️ Rarity", value: result.pet.rarity, inline: true },
          { name: "📊 Level", value: `${result.pet.level}`, inline: true },
          { name: "🆔 Pet ID", value: `${result.pet.id}`, inline: true },
          { name: "💰 Remaining Coins", value: `${result.totalCoins}`, inline: true },
          { name: "⚡ Boost", value: `${result.pet.boost.type}: ${result.pet.boost.value}x`, inline: true }
        )
        .setFooter({ text: `Use /feed ${result.pet.id} to feed your pet!` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "feed") {
      const petId = options.getInteger("petid");
      const result = simulator.feedPet(interaction.user.id, interaction.guild.id, petId);

      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(result.leveledUp ? "#FFD700" : "#00FF00")
        .setTitle(result.leveledUp ? "🎉 Pet Leveled Up!" : "🍖 Pet Fed!")
        .setDescription(`You fed **${result.pet.name}**!`)
        .addFields(
          { name: "😋 Hunger", value: `${result.pet.hunger}/100`, inline: true },
          { name: "📊 Level", value: `${result.pet.level}`, inline: true },
          { name: "✨ XP", value: `${result.pet.xp}/${simulator.calculateXPNeeded(result.pet.level)}`, inline: true },
          { name: "💰 Remaining Coins", value: `${result.totalCoins}`, inline: true }
        )
        .setTimestamp();

      if (result.leveledUp) {
        embed.setFooter({ text: `Your pet is now level ${result.pet.level}! Boost increased!` });
      }

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "pets") {
      const result = simulator.viewPets(interaction.user.id, interaction.guild.id);

      if (result.pets.length === 0) {
        return interaction.reply({ 
          content: "You don't have any pets yet! Use `/hatch` to get your first pet!", 
          ephemeral: true 
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#9B59B6")
        .setTitle("🐾 Your Pets")
        .setDescription(`You have **${result.pets.length}** pet(s)`)
        .addFields({ name: "💰 Total Coins", value: `${result.totalCoins}`, inline: false });

      result.pets.forEach(pet => {
        const isEquipped = pet.id === result.equippedPet ? "⭐" : "";
        embed.addFields({
          name: `${isEquipped} ${pet.name} (ID: ${pet.id})`,
          value: `**Rarity:** ${pet.rarity}\n**Level:** ${pet.level}\n**Hunger:** ${pet.hunger}/100\n**Boost:** ${pet.boost.type} ${pet.boost.value}x`,
          inline: true
        });
      });

      embed.setFooter({ text: "Use /equippet <id> to equip a pet | Use /feed <id> to feed a pet" });

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "equippet") {
      const petId = options.getInteger("petid");
      const result = simulator.equipPet(interaction.user.id, interaction.guild.id, petId);

      if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("⭐ Pet Equipped!")
        .setDescription(result.message)
        .addFields(
          { name: "🐾 Pet", value: result.pet.name, inline: true },
          { name: "📊 Level", value: `${result.pet.level}`, inline: true },
          { name: "⚡ Boost", value: `${result.pet.boost.type}: ${result.pet.boost.value}x`, inline: true }
        )
        .setFooter({ text: "Your equipped pet boosts will apply to your activities!" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  } catch (error) {
    console.error("Error handling slash command:", error);
    const errorMessage = "There was an error executing this command!";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

// Handle button interactions for tickets
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "create_ticket") {
    const ticketId = ++counters.ticketCount;
    saveCounters();

    const ticketChannelName = `ticket-${ticketId}`;

    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: ticketChannelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ManageChannels,
            ],
          },
        ],
      });

      tickets.set(ticketChannelName, {
        userId: interaction.user.id,
        status: "open",
        claimedBy: null,
        channelId: ticketChannel.id,
      });
      saveTickets();

      db.run(
        `INSERT INTO tickets (id, user_id, status) VALUES (?, ?, ?)`,
        [ticketId, interaction.user.id, "open"],
        (err) => {
          if (err) console.error("Error inserting ticket:", err);
        }
      );

      const ticketEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle(`🎫 Support Ticket #${ticketId}`)
        .setDescription(
          `Welcome ${interaction.user}! Please describe your issue and a staff member will assist you shortly.`
        )
        .addFields(
          { name: "Status", value: "🟢 Open", inline: true },
          { name: "Created By", value: `${interaction.user}`, inline: true }
        )
        .setFooter({ text: "Our team will respond as soon as possible" })
        .setTimestamp();

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔒")
      );

      await ticketChannel.send({
        embeds: [ticketEmbed],
        components: [closeButton],
      });

      await interaction.reply({
        content: `Ticket created! Please check ${ticketChannel}`,
        ephemeral: true,
      });

      const logsChannel = interaction.guild.channels.cache.find(
        (channel) => channel.name === "📝┃user-logs"
      );

      if (logsChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("🎫 New Ticket Created")
          .setDescription(`Ticket #${ticketId} created by ${interaction.user.tag}`)
          .addFields(
            { name: "Channel", value: `${ticketChannel}`, inline: true },
            { name: "User ID", value: interaction.user.id, inline: true }
          )
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] });
      }
    } catch (error) {
      console.error("Error creating ticket:", error);
      await interaction.reply({
        content: "There was an error creating your ticket. Please try again later.",
        ephemeral: true,
      });
    }
  } else if (interaction.customId === "close_ticket") {
    const ticketData = tickets.get(interaction.channel.name);

    if (!ticketData) {
      return interaction.reply({
        content: "This is not a valid ticket channel.",
        ephemeral: true,
      });
    }

    const hasPermission =
      interaction.user.id === ticketData.userId ||
      interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);

    if (!hasPermission) {
      return interaction.reply({
        content: "You don't have permission to close this ticket.",
        ephemeral: true,
      });
    }

    try {
      ticketData.status = "closed";
      tickets.set(interaction.channel.name, ticketData);
      saveTickets();

      db.run(
        `UPDATE tickets SET status = 'closed' WHERE user_id = ? AND status = 'open'`,
        [ticketData.userId],
        (err) => {
          if (err) console.error("Error updating ticket status:", err);
        }
      );

      await interaction.reply({
        content: "This ticket will be deleted in 5 seconds...",
      });

      setTimeout(async () => {
        try {
          await interaction.channel.delete();
          tickets.delete(interaction.channel.name);
          saveTickets();
        } catch (error) {
          console.error("Error deleting ticket channel:", error);
        }
      }, 5000);

      const logsChannel = interaction.guild.channels.cache.find(
        (channel) => channel.name === "📝┃user-logs"
      );

      if (logsChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🔒 Ticket Closed")
          .setDescription(
            `Ticket ${interaction.channel.name} was closed by ${interaction.user.tag}`
          )
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] });
      }
    } catch (error) {
      console.error("Error closing ticket:", error);
      await interaction.followUp({
        content: "There was an error closing this ticket.",
        ephemeral: true,
      });
    }
  }
});

client.login(token);