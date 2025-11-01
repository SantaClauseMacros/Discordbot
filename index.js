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

const token =
  "MTQwOTkyNDQ0OTM1NjA5MTQ1Mg.Glv25D.5gohRHFrgtUix3LTv1CTHrP4RHfU2nGIP_2VN";

const client = new Client({
  intents: Object.values(GatewayIntentBits),
  partials: Object.values(Partials),
  allowedMentions: { parse: ["users", "roles"], repliedUser: true },
  restTimeOffset: 0,
  failIfNotExists: false,
  presence: {
    activities: [{ name: `Skull`, type: ActivityType.Playing }],
    status: "online",
  },
});

const prefix = "!";

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
      { name: `Skull`, type: ActivityType.Playing },
      {
        name: `${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)} gamers`,
        type: ActivityType.Watching,
      },
      {
        name: `${client.guilds.cache.size} gaming communities`,
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
          `Welcome to Flamin' Hot Games, ${member}! We hope you enjoy your stay :)`,
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
  if (!message.content.startsWith(prefix) && botSettings.autoReactions) {
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
  if (!message.content.startsWith(prefix)) {
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

  if (!message.content.startsWith(prefix)) return;

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
        text: "💡 All commands start with ! | Use individual help commands for details",
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

    // Gaming & Fun (Everyone)
    helpEmbed.addFields({
      name: "🎮 **Gaming & Fun**",
      value:
        "```\n!8ball <question>  - Ask the magic 8-ball\n!coinflip          - Flip a coin\n!dice [sides]      - Roll a die (default 6)\n!rps <choice>      - Rock paper scissors\n!trivia            - Gaming trivia questions\n!wouldyourather    - Would you rather questions\n!guess             - Number guessing game\n!games             - Show all gaming commands```",
      inline: false,
    });

    // Fishing Game (Everyone)
    helpEmbed.addFields({
      name: "🎣 **Fishing Game**",
      value:
        "```\n!fish              - Go fishing (5sec cooldown)\n!fishstats [@user] - View fishing profile\n!fishinventory     - View your fishing gear\n!fishcollection    - View all caught fish\n!fishstore         - View fishing store\n!buyrod <name>     - Buy a fishing rod\n!equiprod <name>   - Equip a fishing rod\n!fishleaderboard   - Fishing leaderboards\n!fishhelp          - Complete fishing guide```",
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
            const user = await message.client.users.fetch(userId);
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

  // Advanced Fishing Game System
  if (command === "fish" || command === "cast" || command === "f") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    let fishingData = getFishingData(userKey);

    // Process passive worker income before fishing
    processWorkerIncome(fishingData);

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
    if (fishingData.currentBait && fishingData.baitInventory[fishingData.currentBait] > 0) {
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
      fishingData.fishCaught[fish.id] = (fishingData.fishCaught[fish.id] || 0) + 1;
      fishingData.totalFish++;
      fishingData.coins += fish.value;
      fishingData.experience += fish.experience;

      // Update fishing streak
      const today = new Date().toDateString();
      if (fishingData.lastStreakDate !== today) {
        fishingData.fishingStreak = (fishingData.lastStreakDate === new Date(Date.now() - 86400000).toDateString()) 
          ? fishingData.fishingStreak + 1 : 1;
        fishingData.lastStreakDate = today;
      }

      // Check for biggest catch
      if (!fishingData.biggestCatch || fish.value > fishingData.biggestCatch.value) {
        fishingData.biggestCatch = { ...fish, caughtAt: area.name };
      }

      // Check for level up
      const oldLevel = Math.floor((fishingData.experience - fish.experience) / 1000);
      const newLevel = Math.floor(fishingData.experience / 1000);
      const leveledUp = newLevel > oldLevel;

      // Calculate size description
      let sizeDesc = "";
      if (fishingResult.sizeVariation) {
        if (fishingResult.sizeVariation > 0.15) sizeDesc = "🔹 **Huge specimen!**";
        else if (fishingResult.sizeVariation > 0.05) sizeDesc = "🔸 **Above average size**";
        else if (fishingResult.sizeVariation < -0.15) sizeDesc = "🔻 **Small specimen**";
        else if (fishingResult.sizeVariation < -0.05) sizeDesc = "🔽 **Below average size**";
      }

      const catchEmbed = new EmbedBuilder()
        .setColor("#00FF7F")
        .setTitle("🎣 Nice Catch!")
        .setDescription(`You caught a **${fish.name}**! ${fish.emoji}\n${sizeDesc}`)
        .addFields(
          { name: "🏞️ Location", value: `${area.emoji} ${area.name}`, inline: true },
          { name: "💰 Value", value: `${fish.value} coins`, inline: true },
          { name: "✨ XP Gained", value: `${fish.experience} XP`, inline: true },
          { name: "📊 Level", value: `${Math.floor(fishingData.experience / 1000)}`, inline: true },
          { name: "🔥 Streak", value: `${fishingData.fishingStreak} days`, inline: true },
        );

      if (fishingData.currentBait) {
        const bait = baitTypes[fishingData.currentBait];
        const remaining = fishingData.baitInventory[fishingData.currentBait] || 0;
        catchEmbed.addFields({
          name: "🪱 Bait Used",
          value: `${bait.emoji} ${bait.name} (${remaining} left)`,
          inline: true,
        });
      }

      catchEmbed.setFooter({
        text: `${fish.rarity} ${fish.size} fish | Boat: ${fishingData.currentBoat.name}`,
      }).setTimestamp();

      if (leveledUp) {
        catchEmbed.setDescription(catchEmbed.data.description + `\n\n🎉 **LEVEL UP!** You reached level ${newLevel}!`);
      }

      message.channel.send({ embeds: [catchEmbed] });
    } else {
      const area = fishingAreas[fishingData.currentArea];
      
      const missEmbed = new EmbedBuilder()
        .setColor("#87CEEB")
        .setTitle("🎣 No Luck This Time")
        .setDescription("The fish got away! Better luck next time.")
        .addFields(
          { name: "🏞️ Location", value: `${area.emoji} ${area.name}`, inline: true },
          { name: "🎯 Cast #", value: `${fishingData.totalCasts}`, inline: true },
          { name: "📊 Level", value: `${Math.floor(fishingData.experience / 1000)}`, inline: true },
        );

      if (fishingData.currentBait) {
        const bait = baitTypes[fishingData.currentBait];
        const remaining = fishingData.baitInventory[fishingData.currentBait] || 0;
        missEmbed.addFields({
          name: "🪱 Bait Used",
          value: `${bait.emoji} ${bait.name} (${remaining} left)`,
          inline: true,
        });
      }

      missEmbed.setFooter({
        text: `Using ${fishingData.currentRod.name} | Try using better bait!`,
      }).setTimestamp();

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
      .setColor("#FFD700")
      .setTitle("🏪 Fishing Store")
      .setDescription(
        `**Your Coins:** ${fishingData.coins}\n\nAvailable fishing rods for purchase:`,
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
      .setDescription(`**Current Area:** ${fishingAreas[fishingData.currentArea].emoji} ${fishingAreas[fishingData.currentArea].name}\n**Your Level:** ${fishingLevel}`)
      .setFooter({ text: "Use !travel <area> to change location" })
      .setTimestamp();

    for (const [areaId, area] of Object.entries(fishingAreas)) {
      const unlocked = fishingLevel >= area.unlockLevel;
      const current = fishingData.currentArea === areaId;
      const status = current ? "📍 **CURRENT**" : unlocked ? "✅ **UNLOCKED**" : `🔒 **Requires Level ${area.unlockLevel}**`;
      
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
      return message.reply("Please specify an area to travel to! Use `!areas` to see available locations.");
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);
    const fishingLevel = Math.floor(fishingData.experience / 1000);

    const area = Object.values(fishingAreas).find(
      a => a.name.toLowerCase().includes(areaName) || a.id === areaName
    );

    if (!area) {
      return message.reply("Area not found! Use `!areas` to see available locations.");
    }

    if (fishingLevel < area.unlockLevel) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("🔒 Area Locked")
            .setDescription(`You need to be level **${area.unlockLevel}** to access **${area.name}**.`)
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
            .setDescription(`You need **${area.travelCost}** coins to travel to **${area.name}**.`)
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
        { name: "Travel Cost", value: `${area.travelCost} coins`, inline: true },
        { name: "Remaining Coins", value: `${fishingData.coins}`, inline: true },
        { name: "Fish Bonus", value: `+${Math.round((area.fishMultiplier - 1) * 100)}%`, inline: true },
      )
      .setFooter({ text: area.description })
      .setTimestamp();

    message.channel.send({ embeds: [travelEmbed] });
  }

  if (command === "baitshop" || command === "baits") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const baitEmbed = new EmbedBuilder()
      .setColor("#8B4513")
      .setTitle("🪱 Bait Shop")
      .setDescription(`**Your Coins:** ${fishingData.coins}\n**Current Bait:** ${fishingData.currentBait ? baitTypes[fishingData.currentBait].emoji + " " + baitTypes[fishingData.currentBait].name : "None"}`)
      .setFooter({ text: "Use !buybait <bait_name> [quantity] to purchase" })
      .setTimestamp();

    for (const [baitId, bait] of Object.entries(baitTypes)) {
      const owned = fishingData.baitInventory[baitId] || 0;
      baitEmbed.addFields({
        name: `${bait.emoji} ${bait.name}`,
        value: `${bait.description}\n🎣 Catch Bonus: +${bait.catchBonus}%\n💎 Rare Bonus: +${bait.rareBonus}%\n💰 Price: ${bait.price} coins (x${bait.quantity})\n📦 Owned: ${owned}`,
        inline: true,
      });
    }

    message.channel.send({ embeds: [baitEmbed] });
  }

  if (command === "buybait") {
    const baitName = args[0]?.toLowerCase();
    const quantity = parseInt(args[1]) || 1;

    if (!baitName) {
      return message.reply("Please specify a bait to buy! Use `!baitshop` to see available baits.");
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const bait = Object.values(baitTypes).find(
      b => b.name.toLowerCase().includes(baitName) || b.id === baitName
    );

    if (!bait) {
      return message.reply("Bait not found! Use `!baitshop` to see available baits.");
    }

    const totalCost = bait.price * quantity;

    if (fishingData.coins < totalCost) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("💸 Insufficient Funds")
            .setDescription(`You need **${totalCost}** coins but only have **${fishingData.coins}** coins.`),
        ],
      });
    }

    fishingData.coins -= totalCost;
    fishingData.baitInventory[bait.id] = (fishingData.baitInventory[bait.id] || 0) + (bait.quantity * quantity);
    saveFishingData(userKey, fishingData);

    const buyEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("🛍️ Bait Purchased!")
      .setDescription(`You bought **${quantity}x ${bait.name}** ${bait.emoji} (${bait.quantity * quantity} uses)`)
      .addFields(
        { name: "💰 Cost", value: `${totalCost} coins`, inline: true },
        { name: "🏦 Remaining Coins", value: `${fishingData.coins}`, inline: true },
        { name: "📦 Total Owned", value: `${fishingData.baitInventory[bait.id]}`, inline: true },
      )
      .setTimestamp();

    message.channel.send({ embeds: [buyEmbed] });
  }

  if (command === "usebait" || command === "bait") {
    const baitName = args[0]?.toLowerCase();

    if (!baitName) {
      return message.reply("Please specify a bait to use! Use `!baitshop` to see your baits.");
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    if (baitName === "none" || baitName === "remove") {
      fishingData.currentBait = null;
      saveFishingData(userKey, fishingData);
      return message.reply("🎣 You're now fishing without bait.");
    }

    const bait = Object.values(baitTypes).find(
      b => b.name.toLowerCase().includes(baitName) || b.id === baitName
    );

    if (!bait) {
      return message.reply("Bait not found! Use `!baitshop` to see available baits.");
    }

    const owned = fishingData.baitInventory[bait.id] || 0;
    if (owned <= 0) {
      return message.reply(`You don't have any **${bait.name}**! Buy some from the bait shop.`);
    }

    fishingData.currentBait = bait.id;
    saveFishingData(userKey, fishingData);

    const baitEmbed = new EmbedBuilder()
      .setColor("#8B4513")
      .setTitle("🪱 Bait Equipped!")
      .setDescription(`You're now using **${bait.name}** ${bait.emoji}`)
      .addFields(
        { name: "🎣 Catch Bonus", value: `+${bait.catchBonus}%`, inline: true },
        { name: "💎 Rare Bonus", value: `+${bait.rareBonus}%`, inline: true },
        { name: "📦 Remaining", value: `${owned} uses`, inline: true },
      )
      .setTimestamp();

    message.channel.send({ embeds: [baitEmbed] });
  }

  if (command === "boats" || command === "fishboats") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);
    const fishingLevel = Math.floor(fishingData.experience / 1000);

    const boatsEmbed = new EmbedBuilder()
      .setColor("#0066CC")
      .setTitle("⛵ Boat Shop")
      .setDescription(`**Your Coins:** ${fishingData.coins}\n**Current Boat:** ${fishingData.currentBoat.emoji} ${fishingData.currentBoat.name}`)
      .setFooter({ text: "Use !buyboat <boat_name> to purchase" })
      .setTimestamp();

    for (const [boatId, boat] of Object.entries(boatTypes)) {
      const owned = fishingData.ownedBoats.includes(boatId);
      const unlocked = fishingLevel >= boat.unlockLevel;
      const current = fishingData.currentBoat.id === boatId;
      
      let status;
      if (current) status = "⛵ **EQUIPPED**";
      else if (owned) status = "✅ **OWNED**";
      else if (unlocked) status = `💰 **${boat.price} coins**`;
      else status = `🔒 **Level ${boat.unlockLevel} required**`;

      boatsEmbed.addFields({
        name: `${boat.emoji} ${boat.name} ${current ? "⛵" : ""}`,
        value: `${boat.description}\n🎣 Catch Bonus: +${boat.catchBonus}%\n🗺️ Area Bonus: +${boat.areaBonus}%\n📍 Unlock Level: ${boat.unlockLevel}\n${status}`,
        inline: true,
      });
    }

    message.channel.send({ embeds: [boatsEmbed] });
  }

  if (command === "buyboat") {
    const boatName = args.join(" ").toLowerCase();
    if (!boatName) {
      return message.reply("Please specify a boat to buy! Use `!boats` to see available boats.");
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);
    const fishingLevel = Math.floor(fishingData.experience / 1000);

    const boat = Object.values(boatTypes).find(
      b => b.name.toLowerCase().includes(boatName) || b.id === boatName
    );

    if (!boat) {
      return message.reply("Boat not found! Use `!boats` to see available boats.");
    }

    if (fishingData.ownedBoats.includes(boat.id)) {
      return message.reply("You already own this boat! Use `!equipboat` to use it.");
    }

    if (fishingLevel < boat.unlockLevel) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("🔒 Level Required")
            .setDescription(`You need to be level **${boat.unlockLevel}** to buy **${boat.name}**.`),
        ],
      });
    }

    if (fishingData.coins < boat.price) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("💸 Insufficient Funds")
            .setDescription(`You need **${boat.price}** coins but only have **${fishingData.coins}** coins.`),
        ],
      });
    }

    fishingData.coins -= boat.price;
    fishingData.ownedBoats.push(boat.id);
    saveFishingData(userKey, fishingData);

    const buyEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("⛵ Boat Purchased!")
      .setDescription(`You bought the **${boat.name}**! ${boat.emoji}`)
      .addFields(
        { name: "💰 Cost", value: `${boat.price} coins`, inline: true },
        { name: "🏦 Remaining Coins", value: `${fishingData.coins}`, inline: true },
        { name: "🎣 Catch Bonus", value: `+${boat.catchBonus}%`, inline: true },
      )
      .setFooter({ text: "Use !equipboat to use your new boat!" })
      .setTimestamp();

    message.channel.send({ embeds: [buyEmbed] });
  }

  if (command === "equipboat") {
    const boatName = args.join(" ").toLowerCase();
    if (!boatName) {
      return message.reply("Please specify a boat to equip! Use `!boats` to see your boats.");
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const boat = Object.values(boatTypes).find(
      b => (b.name.toLowerCase().includes(boatName) || b.id === boatName) &&
           fishingData.ownedBoats.includes(b.id)
    );

    if (!boat) {
      return message.reply("You don't own this boat! Use `!boats` to buy it.");
    }

    fishingData.currentBoat = boat;
    saveFishingData(userKey, fishingData);

    const equipEmbed = new EmbedBuilder()
      .setColor("#0066CC")
      .setTitle("⛵ Boat Equipped!")
      .setDescription(`You're now using the **${boat.name}**! ${boat.emoji}`)
      .addFields(
        { name: "🎣 Catch Bonus", value: `+${boat.catchBonus}%`, inline: true },
        { name: "🗺️ Area Bonus", value: `+${boat.areaBonus}%`, inline: true },
        { name: "🌊 Ready to Fish!", value: "Use `!fish` to start fishing!", inline: true },
      )
      .setTimestamp();

    message.channel.send({ embeds: [equipEmbed] });
  }

  

  if (command === "fishhelp") {
    const helpEmbed = new EmbedBuilder()
      .setColor("#4169E1")
      .setTitle("🎣 Advanced Fishing Game - Complete Guide")
      .setDescription("Welcome to the ultimate Discord fishing experience!")
      .addFields(
        {
          name: "🎣 Basic Commands",
          value:
            "```\n!fish / !cast / !f     - Go fishing (5s cooldown)\n!fishstats [@user]     - View fishing profile\n!fishinventory         - View your fishing inventory\n!fishcollection        - View all your caught fish```",
          inline: false,
        },
        {
          name: "🗺️ Areas & Travel",
          value:
            "```\n!areas                 - View all fishing areas\n!travel <area>         - Travel to a fishing area```",
          inline: false,
        },
        {
          name: "🪱 Baits & Equipment",
          value:
            "```\n!baitshop              - View available baits\n!buybait <name> [qty]  - Buy bait\n!usebait <name>        - Equip bait (or 'none')\n!boats                 - View boat shop\n!buyboat <name>        - Buy a boat\n!equipboat <name>      - Equip a boat```",
          inline: false,
        },
        {
          name: "🏪 Shopping & Equipment",
          value:
            "```\n!fishstore             - View fishing rod store\n!buyrod <name>         - Buy a fishing rod\n!equiprod <name>       - Equip a fishing rod```",
          inline: false,
        },
        {
          name: "💰 Fish Economy",
          value:
            "```\n!sellfish <name> [qty] - Sell specific fish for coins\n!sellall               - Sell all your fish at once```",
          inline: false,
        },
        {
          name: "🎁 Lucky Boxes",
          value:
            "```\n!luckyboxes            - View lucky box shop\n!buybox <type> [qty]   - Buy lucky boxes\n!openbox <type>        - Open a lucky box\n  Types: basic, premium, legendary, mythical```",
          inline: false,
        },
        {
          name: "👷 Passive Workers",
          value:
            "```\n!workers               - View worker management\n!buyworker <type> [qty]- Hire fishing workers\n!collectworkers        - Collect passive income\n  Types: novice, experienced, master, legendary```",
          inline: false,
        },
        {
          name: "🏆 Leaderboards",
          value:
            "```\n!fishleaderboard [type] - View fishing leaderboards\n  Types: total, level, coins, rare```",
          inline: false,
        },
        {
          name: "🎮 Advanced Mechanics",
          value:
            "• **Areas** unlock at different levels with unique fish\n• **Baits** boost catch rates and attract preferred fish\n• **Boats** provide bonuses and access to new areas\n• **Rod durability** decreases with use, repair when needed\n• **Fishing streaks** give bonuses for consecutive catches\n• **Fish sizes** vary, affecting value and experience\n• **Preferred baits** give higher chances for specific fish",
          inline: false,
        },
        {
          name: "🐟 Fish Rarities & Sizes",
          value:
            "🟢 Common → 🔵 Uncommon → 🟣 Rare → 🟠 Epic → 🟡 Legendary → ✨ Mythical\n📏 Tiny → Small → Medium → Large → Huge → Massive → Colossal",
          inline: false,
        },
      )
      .setFooter({ text: "Start your fishing adventure with !fish or !f!" })
      .setTimestamp();

    message.channel.send({ embeds: [helpEmbed] });
  }

  // Lucky Boxes System
  if (command === "luckyboxes" || command === "boxes" || command === "lootboxes") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const boxEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("🎁 Lucky Box Shop")
      .setDescription(`**Your Coins:** ${fishingData.coins}\n**Boxes Owned:** ${fishingData.luckyBoxes || 0}`)
      .addFields(
        {
          name: "📦 Basic Lucky Box",
          value: "💰 **500 coins**\nContains: 50-200 coins, basic bait, small XP bonus\n🎲 Success Rate: 85%",
          inline: true,
        },
        {
          name: "🎁 Premium Lucky Box", 
          value: "💰 **2,000 coins**\nContains: 200-800 coins, premium bait, rod upgrades\n🎲 Success Rate: 90%",
          inline: true,
        },
        {
          name: "✨ Legendary Lucky Box",
          value: "💰 **8,000 coins**\nContains: 1000-5000 coins, rare fish, legendary items\n🎲 Success Rate: 95%",
          inline: true,
        },
        {
          name: "🌟 Mythical Lucky Box",
          value: "💰 **25,000 coins**\nContains: 5000-15000 coins, mythical fish, workers\n🎲 Success Rate: 98%",
          inline: true,
        },
      )
      .setFooter({ text: "Use !buybox <type> [quantity] to purchase | !openbox <type> to open" })
      .setTimestamp();

    message.channel.send({ embeds: [boxEmbed] });
  }

  if (command === "buybox") {
    const boxType = args[0]?.toLowerCase();
    const quantity = parseInt(args[1]) || 1;

    if (!boxType) {
      return message.reply("Please specify box type: `basic`, `premium`, `legendary`, or `mythical`");
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const boxPrices = {
      basic: 500,
      premium: 2000, 
      legendary: 8000,
      mythical: 25000
    };

    const price = boxPrices[boxType];
    if (!price) {
      return message.reply("Invalid box type! Use: `basic`, `premium`, `legendary`, or `mythical`");
    }

    const totalCost = price * quantity;
    if (fishingData.coins < totalCost) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("💸 Insufficient Funds")
            .setDescription(`You need **${totalCost}** coins but only have **${fishingData.coins}** coins.`)
        ]
      });
    }

    fishingData.coins -= totalCost;
    if (!fishingData.luckyBoxes) fishingData.luckyBoxes = {};
    fishingData.luckyBoxes[boxType] = (fishingData.luckyBoxes[boxType] || 0) + quantity;
    saveFishingData(userKey, fishingData);

    const buyEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("🛍️ Lucky Boxes Purchased!")
      .setDescription(`You bought **${quantity}x ${boxType} lucky box${quantity > 1 ? 'es' : ''}**!`)
      .addFields(
        { name: "💰 Cost", value: `${totalCost} coins`, inline: true },
        { name: "🏦 Remaining Coins", value: `${fishingData.coins}`, inline: true },
        { name: "📦 Total Owned", value: `${fishingData.luckyBoxes[boxType]}`, inline: true },
      )
      .setFooter({ text: "Use !openbox to open your boxes!" })
      .setTimestamp();

    message.channel.send({ embeds: [buyEmbed] });
  }

  if (command === "openbox") {
    const boxType = args[0]?.toLowerCase();
    
    if (!boxType) {
      return message.reply("Please specify box type: `basic`, `premium`, `legendary`, or `mythical`");
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    if (!fishingData.luckyBoxes || !fishingData.luckyBoxes[boxType] || fishingData.luckyBoxes[boxType] <= 0) {
      return message.reply(`You don't have any ${boxType} lucky boxes!`);
    }

    // Open the box
    const reward = openLuckyBox(boxType, fishingData);
    
    // Consume the box
    fishingData.luckyBoxes[boxType]--;
    if (fishingData.luckyBoxes[boxType] <= 0) {
      delete fishingData.luckyBoxes[boxType];
    }
    
    saveFishingData(userKey, fishingData);

    const rewardEmbed = new EmbedBuilder()
      .setColor(reward.color)
      .setTitle(`🎁 ${boxType.charAt(0).toUpperCase() + boxType.slice(1)} Lucky Box Opened!`)
      .setDescription(reward.description)
      .addFields(reward.fields)
      .setFooter({ text: `Boxes remaining: ${fishingData.luckyBoxes[boxType] || 0}` })
      .setTimestamp();

    message.channel.send({ embeds: [rewardEmbed] });
  }

  // Workers System
  if (command === "workers" || command === "fishworkers") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);
    
    // Process worker income before showing status
    processWorkerIncome(fishingData);
    saveFishingData(userKey, fishingData);

    const workers = fishingData.workers || {};
    const totalWorkers = Object.values(workers).reduce((sum, count) => sum + count, 0);

    const workerEmbed = new EmbedBuilder()
      .setColor("#4169E1")
      .setTitle("👷 Fishing Workers")
      .setDescription(`**Your Coins:** ${fishingData.coins}\n**Total Workers:** ${totalWorkers}`)
      .addFields(
        {
          name: "🎣 Novice Fisher",
          value: `💰 **3,000 coins**\nIncome: 5 coins/hour\nOwned: ${workers.novice || 0}`,
          inline: true,
        },
        {
          name: "🐟 Experienced Angler", 
          value: `💰 **12,000 coins**\nIncome: 25 coins/hour\nOwned: ${workers.experienced || 0}`,
          inline: true,
        },
        {
          name: "🏆 Master Fisher",
          value: `💰 **45,000 coins**\nIncome: 100 coins/hour\nOwned: ${workers.master || 0}`,
          inline: true,
        },
        {
          name: "✨ Legendary Captain",
          value: `💰 **150,000 coins**\nIncome: 400 coins/hour\nOwned: ${workers.legendary || 0}`,
          inline: true,
        },
        {
          name: "💰 Current Income",
          value: `${calculateWorkerIncome(workers)} coins/hour`,
          inline: true,
        },
        {
          name: "⏰ Last Collection",
          value: fishingData.lastWorkerCollection ? new Date(fishingData.lastWorkerCollection).toLocaleString() : "Never",
          inline: true,
        },
      )
      .setFooter({ text: "Use !buyworker <type> [quantity] | !collectworkers to claim income" })
      .setTimestamp();

    message.channel.send({ embeds: [workerEmbed] });
  }

  if (command === "buyworker") {
    const workerType = args[0]?.toLowerCase();
    const quantity = parseInt(args[1]) || 1;

    if (!workerType) {
      return message.reply("Please specify worker type: `novice`, `experienced`, `master`, or `legendary`");
    }

    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    const workerPrices = {
      novice: 3000,
      experienced: 12000,
      master: 45000,
      legendary: 150000
    };

    const price = workerPrices[workerType];
    if (!price) {
      return message.reply("Invalid worker type! Use: `novice`, `experienced`, `master`, or `legendary`");
    }

    const totalCost = price * quantity;
    if (fishingData.coins < totalCost) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("💸 Insufficient Funds")
            .setDescription(`You need **${totalCost}** coins but only have **${fishingData.coins}** coins.`)
        ]
      });
    }

    fishingData.coins -= totalCost;
    if (!fishingData.workers) fishingData.workers = {};
    fishingData.workers[workerType] = (fishingData.workers[workerType] || 0) + quantity;
    
    // Set initial collection time if first worker
    if (!fishingData.lastWorkerCollection) {
      fishingData.lastWorkerCollection = Date.now();
    }
    
    saveFishingData(userKey, fishingData);

    const buyEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("👷 Workers Hired!")
      .setDescription(`You hired **${quantity}x ${workerType} worker${quantity > 1 ? 's' : ''}**!`)
      .addFields(
        { name: "💰 Cost", value: `${totalCost} coins`, inline: true },
        { name: "🏦 Remaining Coins", value: `${fishingData.coins}`, inline: true },
        { name: "👷 Total Workers", value: `${fishingData.workers[workerType]}`, inline: true },
      )
      .setFooter({ text: "Your workers will start earning coins immediately!" })
      .setTimestamp();

    message.channel.send({ embeds: [buyEmbed] });
  }

  if (command === "collectworkers" || command === "collect") {
    const userKey = `${message.author.id}-${message.guild.id}`;
    const fishingData = getFishingData(userKey);

    if (!fishingData.workers || Object.keys(fishingData.workers).length === 0) {
      return message.reply("You don't have any workers! Buy some with `!buyworker`");
    }

    const income = processWorkerIncome(fishingData);
    saveFishingData(userKey, fishingData);

    if (income <= 0) {
      return message.reply("No income to collect yet! Workers generate income over time.");
    }

    const collectEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("💰 Worker Income Collected!")
      .setDescription(`Your workers earned you **${income} coins**!`)
      .addFields(
        { name: "💵 Income Collected", value: `${income} coins`, inline: true },
        { name: "🏦 Total Coins", value: `${fishingData.coins}`, inline: true },
        { name: "⏰ Next Collection", value: "Available now (passive income)", inline: true },
      )
      .setTimestamp();

    message.channel.send({ embeds: [collectEmbed] });
  }

  if (command === "rr") {
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

    // First, create the roles if they don't exist
    let announcementRole = message.guild.roles.cache.find(
      (r) => r.name === "Announcement Ping",
    );
    let giveawayRole = message.guild.roles.cache.find(
      (r) => r.name === "Giveaway Ping",
    );

    if (!announcementRole) {
      try {
        announcementRole = await message.guild.roles.create({
          name: "Announcement Ping",
          color: "#3498DB",
          reason: "Role for announcement notifications",
        });
      } catch (error) {
        console.error("Error creating Announcement Ping role:", error);
        return message.reply("Failed to create Announcement Ping role.");
      }
    }

    if (!giveawayRole) {
      try {
        giveawayRole = await message.guild.roles.create({
          name: "Giveaway Ping",
          color: "#2ECC71",
          reason: "Role for giveaway notifications",
        });
      } catch (error) {
        console.error("Error creating Giveaway Ping role:", error);
        return message.reply("Failed to create Giveaway Ping role.");
      }
    }

    // Create the reaction roles panel
    const rolesEmbed = new EmbedBuilder()
      .setColor("#FF4500")
      .setTitle("🔥 Flamin' Hot Games Community Roles")
      .setDescription("React to the buttons below to get notification roles:")
      .addFields(
        {
          name: "📢 Announcement Ping",
          value: "Get notified for important community updates and game news!",
          inline: false,
        },
        {
          name: "🎁 Giveaway Ping",
          value: "Get notified when we host awesome giveaways and events!",
          inline: false,
        },
      )
      .setFooter({ text: "Click the buttons below to add or remove roles" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("role-announcement")
        .setLabel("📢 Announcements")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("role-giveaway")
        .setLabel("🎁 Giveaways")
        .setStyle(ButtonStyle.Success),
    );

    await message.channel.send({
      embeds: [rolesEmbed],
      components: [row],
    });

    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("✅ Reaction Roles Setup")
          .setDescription("Reaction roles panel has been created!"),
      ],
    });
  }
});

async function setupRolesChannel(guild, roles) {
  const rolesChannel = guild.channels.cache.find(
    (channel) => channel.name === "👋┃roles",
  );

  if (!rolesChannel) return;

  try {
    const rolesEmbed = new EmbedBuilder()
      .setColor("#9C59B6")
      .setTitle("🔔 Server Notification Roles")
      .setDescription("React to this message to get notification roles:")
      .addFields(
        {
          name: "📢 Announcement Ping",
          value: "Get notified for important server announcements",
          inline: false,
        },
        {
          name: "🎁 Giveaway Ping",
          value: "Get notified when we host giveaways",
          inline: false,
        },
      )
      .setFooter({ text: "Click the buttons below to add or remove roles" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("role-announcement")
        .setLabel("📢 Announcements")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("role-giveaway")
        .setLabel("🎁 Giveaways")
        .setStyle(ButtonStyle.Success),
    );

    await rolesChannel.send({ embeds: [rolesEmbed], components: [row] });
  } catch (error) {
    console.error("Error setting up roles channel:", error);
  }
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith("role-")) {
    let role = null;
    let roleName = "";

    // Handle predefined roles
    if (interaction.customId === "role-announcement") {
      roleName = "Announcement Ping";
      role = interaction.guild.roles.cache.find((r) => r.name === roleName);
    } else if (interaction.customId === "role-giveaway") {
      roleName = "Giveaway Ping";
      role = interaction.guild.roles.cache.find((r) => r.name === roleName);
    } else {
      // Handle dynamic roles (role-{roleId})
      const roleId = interaction.customId.replace("role-", "");
      role = interaction.guild.roles.cache.get(roleId);
      roleName = role ? role.name : "Unknown Role";
    }

    if (!role) {
      return interaction.reply({
        content: "Role not found. Please contact an administrator.",
        flags: 64, // EPHEMERAL flag
      });
    }

    try {
      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        await interaction.reply({
          content: `You no longer have the ${roleName} role.`,
          flags: 64, // EPHEMERAL flag
        });
      } else {
        await interaction.member.roles.add(role);
        await interaction.reply({
          content: `You now have the ${roleName} role!`,
          flags: 64, // EPHEMERAL flag
        });
      }
    } catch (error) {
      console.error(`Error toggling role ${roleName}:`, error);

      // Handle interaction timeout/unknown interaction errors
      if (
        error.code === 10062 ||
        error.message.includes("Unknown interaction")
      ) {
        console.log(
          "Interaction expired or already responded to - this is normal",
        );
        return;
      }

      // Only try to reply if the interaction hasn't been responded to
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: "An error occurred while updating your roles.",
            flags: 64, // EPHEMERAL flag
          });
        } catch (replyError) {
          console.log("Could not reply to interaction - likely expired");
        }
      }
    }
  }
});

async function setupRolesChannel(guild, roles) {
  const categories = [
    {
      name: "🏆 VIP GAMING ZONE 🏆",
      channels: [
        { name: "💬┃vip-chat", type: ChannelType.GuildText },
        { name: "🎁┃vip-giveaways", type: ChannelType.GuildText },
        { name: "📝┃vip-vouches", type: ChannelType.GuildText },
        { name: "📜┃vip-rules", type: ChannelType.GuildText },
        { name: "🔍┃vip-logs", type: ChannelType.GuildText },
        { name: "⚔️┃tournaments", type: ChannelType.GuildText },
        { name: "🔒┃private-gaming", type: ChannelType.GuildText },
        { name: "🔊┃vip-voice", type: ChannelType.GuildVoice },
      ],
      permissions: [
        {
          role: roles.owner,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ManageChannels",
            "ManageMessages",
          ],
        },
        {
          role: roles.admin,
          allow: ["ViewChannel", "SendMessages", "ManageMessages"],
        },
        { role: roles.moderator, allow: ["ViewChannel", "SendMessages"] },
        { role: roles.member, deny: ["ViewChannel"] },
      ],
    },
    {
      name: "🎁 SERVER STATS 🎁",
      channels: [
        { name: "👥┃all-members-0", type: ChannelType.GuildText },
        { name: "👤┃members-0", type: ChannelType.GuildText },
        { name: "🤖┃bots-0", type: ChannelType.GuildText },
      ],
      permissions: [
        {
          role: guild.roles.everyone,
          allow: ["ViewChannel"],
          deny: ["SendMessages"],
        },
        {
          role: roles.owner,
          allow: ["ViewChannel", "ManageChannels", "SendMessages"],
        },
        { role: roles.admin, allow: ["ViewChannel", "SendMessages"] },
      ],
    },
    {
      name: "📜 IMPORTANT 📜",
      channels: [
        { name: "📢┃announcements", type: ChannelType.GuildText },
        { name: "👋┃welcome", type: ChannelType.GuildText },
        { name: "📖┃rules", type: ChannelType.GuildText },
        { name: "⚡┃join-community", type: ChannelType.GuildText },
        { name: "🔒┃private-server", type: ChannelType.GuildText },
        { name: "👋┃roles", type: ChannelType.GuildText },
      ],
      permissions: [
        {
          role: guild.roles.everyone,
          allow: ["ViewChannel"],
          deny: ["SendMessages"],
        },
        {
          role: roles.owner,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ManageChannels",
            "ManageMessages",
          ],
        },
        {
          role: roles.admin,
          allow: ["ViewChannel", "SendMessages", "ManageMessages"],
        },
        { role: roles.moderator, allow: ["ViewChannel", "SendMessages"] },
      ],
    },
    {
      name: "🎟️ TICKETS 🎟️",
      channels: [
        { name: "🏅┃claim-prizes", type: ChannelType.GuildText },
        { name: "📩┃support-ticket", type: ChannelType.GuildText },
      ],
      permissions: [
        { role: guild.roles.everyone, allow: ["ViewChannel", "SendMessages"] },
        {
          role: roles.owner,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ManageChannels",
            "ManageMessages",
          ],
        },
        {
          role: roles.admin,
          allow: ["ViewChannel", "SendMessages", "ManageMessages"],
        },
        {
          role: roles.moderator,
          allow: ["ViewChannel", "SendMessages", "ManageMessages"],
        },
      ],
    },
    {
      name: "💬 TEXT CHANNELS 💬",
      channels: [
        { name: "🗨️┃chat", type: ChannelType.GuildText },
        { name: "🤖┃bot-commands", type: ChannelType.GuildText },
        { name: "📷┃media", type: ChannelType.GuildText },
        { name: "💼┃partnerships", type: ChannelType.GuildText },
        { name: "🎮┃gaming", type: ChannelType.GuildText },
      ],
      permissions: [
        {
          role: guild.roles.everyone,
          allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
        },
        {
          role: roles.owner,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ManageChannels",
            "ManageMessages",
          ],
        },
        {
          role: roles.admin,
          allow: ["ViewChannel", "SendMessages", "ManageMessages"],
        },
        {
          role: roles.moderator,
          allow: ["ViewChannel", "SendMessages", "ManageMessages"],
        },
      ],
    },
    {
      name: "😎 FUN 😎",
      channels: [
        { name: "🎁┃giveaways", type: ChannelType.GuildText },
        { name: "📜┃giveaway-proof", type: ChannelType.GuildText },
        { name: "🔰┃vouch", type: ChannelType.GuildText },
        { name: "📊┃levels", type: ChannelType.GuildText },
      ],
      permissions: [
        {
          role: guild.roles.everyone,
          allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
        },
        {
          role: roles.owner,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ManageChannels",
            "ManageMessages",
          ],
        },
        {
          role: roles.admin,
          allow: ["ViewChannel", "SendMessages", "ManageMessages"],
        },
        {
          role: roles.moderator,
          allow: ["ViewChannel", "SendMessages", "ManageMessages"],
        },
      ],
    },
    {
      name: "🔊 VOICE CHANNELS 🔊",
      channels: [
        { name: "🎮 Gaming", type: ChannelType.GuildVoice },
        { name: "💬 General", type: ChannelType.GuildVoice },
        { name: "🎵 Music", type: ChannelType.GuildVoice },
        { name: "🎲 AFK", type: ChannelType.GuildVoice },
        { name: "🏆 Tournaments", type: ChannelType.GuildVoice },
      ],
      permissions: [
        {
          role: guild.roles.everyone,
          allow: ["ViewChannel", "Connect", "Speak"],
        },
        {
          role: roles.owner,
          allow: [
            "ViewChannel",
            "Connect",
            "Speak",
            "ManageChannels",
            "MuteMembers",
            "DeafenMembers",
            "MoveMembers",
          ],
        },
        {
          role: roles.admin,
          allow: [
            "ViewChannel",
            "Connect",
            "Speak",
            "MuteMembers",
            "DeafenMembers",
            "MoveMembers",
          ],
        },
        {
          role: roles.moderator,
          allow: ["ViewChannel", "Connect", "Speak", "MuteMembers"],
        },
      ],
    },
  ];

  for (const category of categories) {
    const categoryChannel = await guild.channels.create({
      name: category.name,
      type: ChannelType.GuildCategory,
      reason: "Server setup",
    });

    if (category.permissions) {
      for (const perm of category.permissions) {
        if (perm.role) {
          const allowPermissions = convertPermissionsToFlags(perm.allow || []);
          const denyPermissions = convertPermissionsToFlags(perm.deny || []);

          await categoryChannel.permissionOverwrites.create(perm.role, {
            allow: allowPermissions,
            deny: denyPermissions,
          });
        }
      }
    }

    for (const channel of category.channels) {
      await guild.channels.create({
        name: channel.name,
        type: channel.type,
        parent: categoryChannel,
        reason: "Server setup",
      });
    }
  }
}

function convertPermissionsToFlags(permissions) {
  return permissions.reduce((acc, perm) => {
    if (PermissionsBitField.Flags[perm]) {
      return acc | PermissionsBitField.Flags[perm];
    }
    return acc;
  }, 0n);
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "add_member") {
    try {
      if (!interaction.channel.name.startsWith("ticket-")) {
        await interaction.reply({
          content: "This command can only be used in ticket channels.",
          ephemeral: true,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId("add_member_modal")
        .setTitle("Add Member to Ticket");

      const userIdInput = new TextInputBuilder()
        .setCustomId("user_id")
        .setLabel("Enter User ID")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter the ID of the user to add")
        .setRequired(true);

      const actionRow = new ActionRowBuilder().addComponents(userIdInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      console.error("Error showing add member modal:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Failed to show add member modal.",
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error("Error replying to interaction:", replyError);
      }
    }
    return;
  }

  if (interaction.customId === "create_ticket") {
    try {
      // First, defer the reply to prevent timeout
      // Reply immediately instead of deferring to avoid timeout

      // Check if user already has an open ticket
      const existingTicket = Array.from(tickets.values()).find(
        (ticket) => ticket.userId === interaction.user.id,
      );

      if (existingTicket) {
        await interaction.reply({
          content:
            "You already have an open ticket! Please close your existing ticket first.",
          ephemeral: true,
        });
        return;
      }

      // Check cooldown
      const cooldownKey = `ticket_cooldown_${interaction.user.id}`;
      const cooldownTime = cooldowns.get(cooldownKey);
      const now = Date.now();

      if (cooldownTime && now - cooldownTime < 300000) {
        // 5 minutes = 300000ms
        const remainingTime = Math.ceil(
          (300000 - (now - cooldownTime)) / 1000 / 60,
        );
        await interaction.reply({
          content: `Please wait ${remainingTime} minutes before creating another ticket.`,
          ephemeral: true,
        });
        return;
      }

      // Defer the reply now that initial checks have passed
      await interaction.deferReply({ ephemeral: true });

      const ticketId = ++counters.ticketCount;
      cooldowns.set(cooldownKey, now);
      saveCounters();
      const channelName = `ticket-${ticketId}`;

      let category = interaction.guild.channels.cache.find(
        (c) =>
          c.name === "🎫 TICKETS 🎫" && c.type === ChannelType.GuildCategory,
      );

      if (!category) {
        category = await interaction.guild.channels.create({
          name: "🎫 TICKETS 🎫",
          type: ChannelType.GuildCategory,
        });
      }

      const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category,
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
            ],
          },
        ],
      });

      // Add role permissions after channel creation
      const adminRole = interaction.guild.roles.cache.find(
        (r) => r.name === "Admin",
      );
      const modRole = interaction.guild.roles.cache.find(
        (r) => r.name === "Moderator",
      );

      if (adminRole) {
        await ticketChannel.permissionOverwrites.edit(adminRole, {
          ViewChannel: true,
          SendMessages: true,
          ManageChannels: true,
        });
      }

      if (modRole) {
        await ticketChannel.permissionOverwrites.edit(modRole, {
          ViewChannel: true,
          SendMessages: true,
        });
      }

      const ticketEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle(`Ticket #${ticketId}`)
        .setDescription(`Support ticket created by ${interaction.user}`)
        .addFields(
          { name: "Status", value: "Open", inline: true },
          { name: "Created", value: new Date().toLocaleString(), inline: true },
        );

      const ticketControls = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("claim_ticket")
          .setLabel("Claim")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("👋"),
        new ButtonBuilder()
          .setCustomId("add_member")
          .setLabel("Add Member")
          .setStyle(ButtonStyle.Success)
          .setEmoji("➕"),
        new ButtonBuilder()
          .setCustomId("transcript")
          .setLabel("Transcript")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("📝"),
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔒"),
      );

      // Send welcome message and ping notifications
      const welcomeEmbed = new EmbedBuilder()
        .setColor("#FF4500")
        .setTitle("🔥 Welcome to Your Flamin' Hot Games Support Ticket")
        .setDescription(
          "Our staff team will assist you shortly.\n\n**Tips:**\n• Describe your issue or question clearly\n• You can ping other members to add them to the ticket\n• Staff will claim the ticket when available\n• Feel free to share screenshots/videos of your issues if relevant",
        )
        .setTimestamp();

      await ticketChannel.send({
        content: `Welcome ${interaction.user}!`,
        embeds: [welcomeEmbed],
      });

      await ticketChannel.send({
        embeds: [ticketEmbed],
        components: [ticketControls],
      });

      // Setup message collector for member pings
      const collector = ticketChannel.createMessageCollector();
      collector.on("collect", async (message) => {
        try {
          const mentions = message.mentions.members;
          if (mentions.size > 0) {
            mentions.forEach(async (member) => {
              if (
                !member.user.bot &&
                !ticketChannel
                  .permissionsFor(member)
                  .has(PermissionsBitField.Flags.ViewChannel)
              ) {
                await ticketChannel.permissionOverwrites.edit(member, {
                  ViewChannel: true,
                  SendMessages: true,
                });
                await ticketChannel.send({
                  embeds: [
                    new EmbedBuilder()
                      .setColor("#00ff00")
                      .setDescription(
                        `${member} has been added to the ticket by ${message.author}`,
                      )
                      .setTimestamp(),
                  ],
                });
              }
            });
          }
        } catch (error) {
          console.error("Error in message collector:", error);
        }
      });

      await db.run("INSERT INTO tickets (user_id, status) VALUES (?, ?)", [
        interaction.user.id,
        "open",
      ]);

      tickets.set(channelName, {
        id: ticketId,
        userId: interaction.user.id,
        claimed: false,
        claimedBy: null,
        channelId: ticketChannel.id,
      });

      // Save tickets to file
      saveTickets();

      await interaction.editReply({
        content: `Ticket created! Check ${ticketChannel}`,
      });
    } catch (error) {
      console.error("Error creating ticket:", error);
      try {
        // Only attempt to editReply if the interaction has been deferred
        await interaction.editReply({
          content: "Failed to create ticket!",
        });
      } catch (replyError) {
        console.error("Error replying to interaction:", replyError);
      }
    }
  }

  if (interaction.customId === "edit_ticket") {
    const modal = new ModalBuilder()
      .setCustomId("edit_ticket_modal")
      .setTitle("Edit Ticket");

    const contentInput = new TextInputBuilder()
      .setCustomId("ticket_content")
      .setLabel("Edit Ticket Content")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Enter ticket content")
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(contentInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
  }

  if (interaction.customId === "claim_ticket") {
    try {
      const ticket = tickets.get(interaction.channel.name);
      if (!ticket) {
        await interaction.reply({
          content: "Could not find ticket information!",
          ephemeral: true,
        });
        return;
      }

      if (ticket.claimed) {
        await interaction.reply({
          content: "This ticket has already been claimed!",
          ephemeral: true,
        });
        return;
      }

      const isStaff = interaction.member.roles.cache.some((r) =>
        ["Admin", "Moderator"].includes(r.name),
      );
      if (!isStaff) {
        await interaction.reply({
          content: "Only staff members can claim tickets!",
          ephemeral: true,
        });
        return;
      }

      ticket.claimed = true;
      ticket.claimedBy = interaction.user.id;

      // Save tickets to file
      saveTickets();

      const claimEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle("Ticket Claimed")
        .setDescription(`This ticket has been claimed by ${interaction.user}`)
        .setTimestamp();

      await interaction.reply({ embeds: [claimEmbed] });
    } catch (error) {
      console.error("Error claiming ticket:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "An error occurred while claiming the ticket.",
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error("Error replying to interaction:", replyError);
      }
    }
  }

  if (interaction.customId === "close_ticket") {
    try {
      // Get channel information before deferring reply
      const channelName = interaction.channel.name;
      const ticket = tickets.get(channelName);

      if (!ticket) {
        await interaction.reply({
          content: "Could not find ticket information!",
          ephemeral: true,
        });
        return;
      }

      const isStaff = interaction.member.roles.cache.some((r) =>
        ["Admin", "Moderator"].includes(r.name),
      );
      const isTicketCreator = interaction.user.id === ticket.userId;

      if (!isStaff && !isTicketCreator) {
        await interaction.reply({
          content: "You don't have permission to close this ticket!",
          ephemeral: true,
        });
        return;
      }

      // Reply immediately instead of deferring
      await interaction.reply({
        content: "Closing ticket in 5 seconds...",
        ephemeral: false,
      });

      db.run(
        "UPDATE tickets SET status = ? WHERE id = ?",
        ["closed", ticket.id],
        function (err) {
          if (err) {
            console.error("Error closing ticket in database:", err);
          }
        },
      );

      setTimeout(async () => {
        try {
          const channel = interaction.guild.channels.cache.get(
            ticket.channelId,
          );
          if (channel) {
            await channel.delete();
            tickets.delete(channelName);
            saveTickets();
          }
        } catch (error) {
          console.error("Error deleting ticket channel:", error);
        }
      }, 5000);
    } catch (error) {
      console.error("Error in close ticket interaction:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "An error occurred while closing the ticket.",
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error("Error replying to interaction:", replyError);
      }
    }
  }

  if (interaction.customId === "transcript") {
    try {
      if (!interaction.channel.name.startsWith("ticket-")) {
        await interaction.reply({
          content: "This command can only be used in ticket channels.",
          ephemeral: true,
        });
        return;
      }

      const isStaff = interaction.member.roles.cache.some((r) =>
        ["Admin", "Moderator"].includes(r.name),
      );
      if (!isStaff) {
        await interaction.reply({
          content: "Only staff members can generate transcripts!",
          ephemeral: true,
        });
        return;
      }

      // Reply immediately instead of deferring
      await interaction.reply({
        content: "Generating transcript...",
        ephemeral: false,
      });

      const messages = await interaction.channel.messages.fetch({ limit: 100 });

      let transcript = `# Transcript for ${interaction.channel.name}\n`;
      transcript += `Created at: ${new Date().toISOString()}\n\n`;

      const reversedMessages = Array.from(messages.values()).reverse();
      for (const message of reversedMessages) {
        const time = new Date(message.createdTimestamp).toLocaleString();
        transcript += `## ${message.author.tag} (${time})\n`;
        transcript += message.content || "(no text content)";

        if (message.embeds.length > 0) {
          transcript += "\n[Embedded content]";
        }

        if (message.attachments.size > 0) {
          transcript += "\n[Attachments]";
        }

        transcript += "\n\n";
      }

      const transcriptEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle("Ticket Transcript Generated")
        .setDescription(
          `A transcript has been generated by ${interaction.user}`,
        )
        .setTimestamp();

      // Update the initial reply with the embed
      try {
        await interaction.editReply({
          content: null,
          embeds: [transcriptEmbed],
        });
      } catch (error) {
        console.error("Error updating reply with transcript embed:", error);
      }

      const buffer = Buffer.from(transcript, "utf-8");
      await interaction.channel.send({
        content: "Here is the transcript:",
        files: [
          {
            attachment: buffer,
            name: `transcript-${interaction.channel.name}.txt`,
          },
        ],
      });
    } catch (error) {
      console.error("Error generating transcript:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "An error occurred while generating the transcript.",
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error("Error replying to interaction:", replyError);
      }
    }
    return;
  }

  if (interaction.customId === "rename_ticket") {
    try {
      await interaction.deferReply({ ephemeral: true });

      if (
        !interaction.member.roles.cache.some((r) =>
          ["Admin", "Moderator"].includes(r.name),
        )
      ) {
        await interaction.editReply({
          content: "You don't have permission to rename tickets!",
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId("rename_ticket_modal")
        .setTitle("Rename Ticket");

      const nameInput = new TextInputBuilder()
        .setCustomId("new_name")
        .setLabel("New Ticket Name")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter new ticket name")
        .setRequired(true);

      const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
    } catch (error) {
      console.error("Error showing rename modal:", error);
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === "add_member_modal") {
    try {
      // Reply immediately instead of deferring
      await interaction.reply({
        content: "Processing your request...",
        ephemeral: true,
      });

      const userId = interaction.fields.getTextInputValue("user_id");

      try {
        const member = await interaction.guild.members
          .fetch(userId)
          .catch(() => null);

        if (!member) {
          await interaction.editReply("Could not find a member with that ID.");
          return;
        }

        await interaction.channel.permissionOverwrites.edit(member, {
          ViewChannel: true,
          SendMessages: true,
        });

        await interaction.editReply(`${member} has been added to the ticket.`);

        await interaction.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#00ff00")
              .setDescription(
                `${member} has been added to the ticket by ${interaction.user}`,
              )
              .setTimestamp(),
          ],
        });
      } catch (error) {
        console.error("Error adding member to ticket:", error);
        await interaction.editReply(
          "Failed to add member. Make sure the ID is valid.",
        );
      }
    } catch (error) {
      console.error("Error processing add member modal:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "An error occurred while processing your request.",
            ephemeral: true,
          });
        } else {
          await interaction.editReply(
            "An error occurred while processing your request.",
          );
        }
      } catch (replyError) {
        console.error("Error replying to interaction:", replyError);
      }
    }
    return;
  }

  if (interaction.customId === "edit_ticket_modal") {
    const content = interaction.fields.getTextInputValue("ticket_content");
    try {
      const embed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle(interaction.channel.name)
        .setDescription(content)
        .setTimestamp();

      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({
        content: "Ticket content updated!",
        ephemeral: true,
      });
    } catch (error) {
      await interaction.reply({
        content: "Failed to edit ticket!",
        ephemeral: true,
      });
    }
  }

  if (interaction.customId === "rename_ticket_modal") {
    const newName = interaction.fields
      .getTextInputValue("new_name")
      .toLowerCase()
      .replace(/\s+/g, "-");
    try {
      await interaction.channel.setName(`ticket-${newName}`);
      await interaction.reply(`Ticket renamed to: ${newName}`);
    } catch (error) {
      await interaction.reply({
        content: "Failed to rename ticket!",
        ephemeral: true,
      });
    }
  }
});

// Fishing Game Data
const fishingAreas = {
  pond: {
    id: "pond",
    name: "Peaceful Pond",
    emoji: "🏞️",
    description: "A calm pond perfect for beginners",
    unlockLevel: 0,
    fishMultiplier: 1.0,
    rareBonus: 0,
    allowedFish: ["minnow", "bass", "trout", "catfish", "perch", "bluegill"],
    travelCost: 0,
  },
  lake: {
    id: "lake",
    name: "Crystal Lake",
    emoji: "🏔️",
    description: "A large lake with diverse fish species",
    unlockLevel: 5,
    fishMultiplier: 1.2,
    rareBonus: 5,
    allowedFish: ["bass", "trout", "salmon", "pike", "walleye", "muskie", "carp"],
    travelCost: 50,
  },
  river: {
    id: "river",
    name: "Wild River",
    emoji: "🏞️",
    description: "Fast-flowing river with unique catches",
    unlockLevel: 10,
    fishMultiplier: 1.3,
    rareBonus: 8,
    allowedFish: ["salmon", "trout", "sturgeon", "steelhead", "rainbow_trout"],
    travelCost: 75,
  },
  ocean: {
    id: "ocean",
    name: "Deep Ocean",
    emoji: "🌊",
    description: "Vast ocean waters with big game fish",
    unlockLevel: 15,
    fishMultiplier: 1.5,
    rareBonus: 12,
    allowedFish: ["tuna", "swordfish", "marlin", "shark", "mahi_mahi", "sailfish"],
    travelCost: 100,
  },
  arctic: {
    id: "arctic",
    name: "Arctic Waters",
    emoji: "🧊",
    description: "Frigid waters hiding rare species",
    unlockLevel: 25,
    fishMultiplier: 1.8,
    rareBonus: 20,
    allowedFish: ["arctic_char", "king_salmon", "halibut", "arctic_cod"],
    travelCost: 200,
  },
  abyss: {
    id: "abyss",
    name: "Abyssal Depths",
    emoji: "🕳️",
    description: "Mysterious depths with legendary creatures",
    unlockLevel: 35,
    fishMultiplier: 2.0,
    rareBonus: 30,
    allowedFish: ["kraken", "ancient_leviathan", "deep_sea_anglerfish", "colossal_squid"],
    travelCost: 500,
  },
  mystical: {
    id: "mystical",
    name: "Mystical Realm",
    emoji: "✨",
    description: "Otherworldly waters with mythical beings",
    unlockLevel: 50,
    fishMultiplier: 3.0,
    rareBonus: 50,
    allowedFish: ["golden_fish", "phoenix_fish", "dragon_fish", "celestial_whale"],
    travelCost: 1000,
  },
};

const fishTypes = {
  // Pond Fish (Common)
  minnow: {
    id: "minnow",
    name: "Minnow",
    emoji: "🐟",
    rarity: "Common",
    value: 5,
    experience: 10,
    size: "Tiny",
    preferredBait: ["worms"],
  },
  bass: {
    id: "bass",
    name: "Largemouth Bass",
    emoji: "🐠",
    rarity: "Common",
    value: 15,
    experience: 20,
    size: "Small",
    preferredBait: ["worms", "lures"],
  },
  trout: {
    id: "trout",
    name: "Rainbow Trout",
    emoji: "🎣",
    rarity: "Common",
    value: 25,
    experience: 30,
    size: "Small",
    preferredBait: ["flies", "worms"],
  },
  catfish: {
    id: "catfish",
    name: "Channel Catfish",
    emoji: "🐡",
    rarity: "Common",
    value: 20,
    experience: 25,
    size: "Medium",
    preferredBait: ["stink_bait", "worms"],
  },
  perch: {
    id: "perch",
    name: "Yellow Perch",
    emoji: "🟡",
    rarity: "Common",
    value: 12,
    experience: 18,
    size: "Small",
    preferredBait: ["worms", "small_lures"],
  },
  bluegill: {
    id: "bluegill",
    name: "Bluegill",
    emoji: "🔵",
    rarity: "Common",
    value: 8,
    experience: 15,
    size: "Tiny",
    preferredBait: ["worms", "crickets"],
  },

  // Lake Fish (Common-Uncommon)
  salmon: {
    id: "salmon",
    name: "Atlantic Salmon",
    emoji: "🐸",
    rarity: "Uncommon",
    value: 50,
    experience: 50,
    size: "Medium",
    preferredBait: ["flies", "spoons"],
  },
  pike: {
    id: "pike",
    name: "Northern Pike",
    emoji: "🦖",
    rarity: "Uncommon",
    value: 45,
    experience: 45,
    size: "Large",
    preferredBait: ["spoons", "large_lures"],
  },
  walleye: {
    id: "walleye",
    name: "Walleye",
    emoji: "👁️",
    rarity: "Uncommon",
    value: 40,
    experience: 40,
    size: "Medium",
    preferredBait: ["jigs", "minnows"],
  },
  muskie: {
    id: "muskie",
    name: "Muskellunge",
    emoji: "🐊",
    rarity: "Rare",
    value: 120,
    experience: 90,
    size: "Huge",
    preferredBait: ["large_lures", "bucktails"],
  },
  carp: {
    id: "carp",
    name: "Common Carp",
    emoji: "🟤",
    rarity: "Common",
    value: 18,
    experience: 22,
    size: "Medium",
    preferredBait: ["corn", "dough_balls"],
  },

  // River Fish (Uncommon-Rare)
  sturgeon: {
    id: "sturgeon",
    name: "Lake Sturgeon",
    emoji: "🦕",
    rarity: "Rare",
    value: 180,
    experience: 120,
    size: "Massive",
    preferredBait: ["worms", "cut_bait"],
  },
  steelhead: {
    id: "steelhead",
    name: "Steelhead Trout",
    emoji: "🌈",
    rarity: "Uncommon",
    value: 60,
    experience: 55,
    size: "Medium",
    preferredBait: ["roe", "spoons"],
  },
  rainbow_trout: {
    id: "rainbow_trout",
    name: "Wild Rainbow Trout",
    emoji: "🌈",
    rarity: "Uncommon",
    value: 35,
    experience: 38,
    size: "Small",
    preferredBait: ["flies", "spinners"],
  },

  // Ocean Fish (Uncommon-Epic)
  tuna: {
    id: "tuna",
    name: "Bluefin Tuna",
    emoji: "🐋",
    rarity: "Rare",
    value: 200,
    experience: 150,
    size: "Huge",
    preferredBait: ["live_bait", "jigs"],
  },
  swordfish: {
    id: "swordfish",
    name: "Swordfish",
    emoji: "⚔️",
    rarity: "Epic",
    value: 400,
    experience: 300,
    size: "Massive",
    preferredBait: ["live_bait", "squid"],
  },
  marlin: {
    id: "marlin",
    name: "Blue Marlin",
    emoji: "🔱",
    rarity: "Epic",
    value: 500,
    experience: 350,
    size: "Massive",
    preferredBait: ["live_bait", "trolling_lures"],
  },
  shark: {
    id: "shark",
    name: "Tiger Shark",
    emoji: "🦈",
    rarity: "Rare",
    value: 300,
    experience: 200,
    size: "Huge",
    preferredBait: ["cut_bait", "live_bait"],
  },
  mahi_mahi: {
    id: "mahi_mahi",
    name: "Mahi Mahi",
    emoji: "🐬",
    rarity: "Uncommon",
    value: 80,
    experience: 65,
    size: "Medium",
    preferredBait: ["trolling_lures", "flying_fish"],
  },
  sailfish: {
    id: "sailfish",
    name: "Sailfish",
    emoji: "⛵",
    rarity: "Rare",
    value: 250,
    experience: 180,
    size: "Large",
    preferredBait: ["live_bait", "trolling_lures"],
  },

  // Arctic Fish (Rare-Epic)
  arctic_char: {
    id: "arctic_char",
    name: "Arctic Char",
    emoji: "🧊",
    rarity: "Rare",
    value: 150,
    experience: 110,
    size: "Medium",
    preferredBait: ["arctic_flies", "spoons"],
  },
  king_salmon: {
    id: "king_salmon",
    name: "King Salmon",
    emoji: "👑",
    rarity: "Epic",
    value: 350,
    experience: 250,
    size: "Huge",
    preferredBait: ["herring", "spoons"],
  },
  halibut: {
    id: "halibut",
    name: "Pacific Halibut",
    emoji: "🐟",
    rarity: "Epic",
    value: 400,
    experience: 280,
    size: "Massive",
    preferredBait: ["live_bait", "large_jigs"],
  },
  arctic_cod: {
    id: "arctic_cod",
    name: "Arctic Cod",
    emoji: "❄️",
    rarity: "Uncommon",
    value: 70,
    experience: 60,
    size: "Small",
    preferredBait: ["small_jigs", "arctic_worms"],
  },

  // Abyssal Fish (Epic-Legendary)
  kraken: {
    id: "kraken",
    name: "Kraken",
    emoji: "🐙",
    rarity: "Legendary",
    value: 2000,
    experience: 1000,
    size: "Colossal",
    preferredBait: ["giant_squid", "mystical_lures"],
  },
  ancient_leviathan: {
    id: "ancient_leviathan",
    name: "Ancient Leviathan",
    emoji: "🐲",
    rarity: "Mythical",
    value: 8000,
    experience: 3000,
    size: "Colossal",
    preferredBait: ["ancient_bait", "mythical_essence"],
  },
  deep_sea_anglerfish: {
    id: "deep_sea_anglerfish",
    name: "Deep Sea Anglerfish",
    emoji: "🔦",
    rarity: "Epic",
    value: 600,
    experience: 400,
    size: "Large",
    preferredBait: ["bioluminescent_lures", "deep_sea_worms"],
  },
  colossal_squid: {
    id: "colossal_squid",
    name: "Colossal Squid",
    emoji: "🦑",
    rarity: "Legendary",
    value: 1500,
    experience: 800,
    size: "Massive",
    preferredBait: ["giant_hooks", "deep_sea_bait"],
  },

  // Mystical Fish (Legendary-Mythical)
  golden_fish: {
    id: "golden_fish",
    name: "Golden Fish",
    emoji: "🏆",
    rarity: "Legendary",
    value: 3000,
    experience: 1500,
    size: "Medium",
    preferredBait: ["golden_bait", "mystical_essence"],
  },
  phoenix_fish: {
    id: "phoenix_fish",
    name: "Phoenix Fish",
    emoji: "🔥",
    rarity: "Mythical",
    value: 10000,
    experience: 4000,
    size: "Large",
    preferredBait: ["phoenix_feathers", "flame_essence"],
  },
  dragon_fish: {
    id: "dragon_fish",
    name: "Dragon Fish",
    emoji: "🐉",
    rarity: "Mythical",
    value: 12000,
    experience: 5000,
    size: "Massive",
    preferredBait: ["dragon_scales", "mystical_essence"],
  },
  celestial_whale: {
    id: "celestial_whale",
    name: "Celestial Whale",
    emoji: "🌟",
    rarity: "Mythical",
    value: 15000,
    experience: 6000,
    size: "Colossal",
    preferredBait: ["stardust", "celestial_essence"],
  },
};

const baitTypes = {
  // Basic Baits
  worms: {
    id: "worms",
    name: "Earthworms",
    emoji: "🪱",
    description: "Classic bait that works everywhere",
    price: 5,
    catchBonus: 10,
    rareBonus: 0,
    quantity: 10,
  },
  crickets: {
    id: "crickets",
    name: "Crickets",
    emoji: "🦗",
    description: "Small insects perfect for panfish",
    price: 8,
    catchBonus: 8,
    rareBonus: 2,
    quantity: 8,
  },
  corn: {
    id: "corn",
    name: "Sweet Corn",
    emoji: "🌽",
    description: "Vegetarian option for carp and catfish",
    price: 3,
    catchBonus: 5,
    rareBonus: 0,
    quantity: 15,
  },

  // Intermediate Baits
  lures: {
    id: "lures",
    name: "Artificial Lures",
    emoji: "🎣",
    description: "Shiny lures that attract predatory fish",
    price: 25,
    catchBonus: 15,
    rareBonus: 5,
    quantity: 5,
  },
  flies: {
    id: "flies",
    name: "Dry Flies",
    emoji: "🪰",
    description: "Perfect for trout and salmon",
    price: 20,
    catchBonus: 12,
    rareBonus: 8,
    quantity: 6,
  },
  spoons: {
    id: "spoons",
    name: "Metal Spoons",
    emoji: "🥄",
    description: "Flash and vibration attract big fish",
    price: 30,
    catchBonus: 18,
    rareBonus: 7,
    quantity: 4,
  },

  // Advanced Baits
  live_bait: {
    id: "live_bait",
    name: "Live Minnows",
    emoji: "🐠",
    description: "Nothing beats live bait for big game",
    price: 50,
    catchBonus: 25,
    rareBonus: 12,
    quantity: 3,
  },
  cut_bait: {
    id: "cut_bait",
    name: "Cut Bait",
    emoji: "🔪",
    description: "Fresh cut fish for bottom feeders",
    price: 35,
    catchBonus: 20,
    rareBonus: 8,
    quantity: 5,
  },
  squid: {
    id: "squid",
    name: "Fresh Squid",
    emoji: "🦑",
    description: "Ocean predators love squid",
    price: 60,
    catchBonus: 22,
    rareBonus: 15,
    quantity: 3,
  },

  // Premium Baits
  golden_bait: {
    id: "golden_bait",
    name: "Golden Bait",
    emoji: "✨",
    description: "Mystical bait that attracts rare fish",
    price: 200,
    catchBonus: 35,
    rareBonus: 25,
    quantity: 2,
  },
  mystical_essence: {
    id: "mystical_essence",
    name: "Mystical Essence",
    emoji: "🌟",
    description: "Otherworldly substance for mythical catches",
    price: 500,
    catchBonus: 50,
    rareBonus: 40,
    quantity: 1,
  },
  phoenix_feathers: {
    id: "phoenix_feathers",
    name: "Phoenix Feathers",
    emoji: "🪶",
    description: "Legendary bait from the phoenix itself",
    price: 1000,
    catchBonus: 60,
    rareBonus: 50,
    quantity: 1,
  },
};

const fishingRods = {
  basic: {
    id: "basic",
    name: "Basic Rod",
    emoji: "🎣",
    description: "A simple fishing rod for beginners",
    price: 0,
    catchRate: 35,
    rareBonus: 0,
    durability: 100,
  },
  bamboo: {
    id: "bamboo",
    name: "Bamboo Rod",
    emoji: "🎋",
    description: "Lightweight bamboo fishing rod",
    price: 200,
    catchRate: 45,
    rareBonus: 5,
    durability: 150,
  },
  carbon: {
    id: "carbon",
    name: "Carbon Fiber Rod",
    emoji: "⚡",
    description: "Modern carbon fiber construction",
    price: 500,
    catchRate: 55,
    rareBonus: 10,
    durability: 200,
  },
  spinning: {
    id: "spinning",
    name: "Spinning Rod",
    emoji: "🌀",
    description: "Versatile rod for various techniques",
    price: 750,
    catchRate: 60,
    rareBonus: 12,
    durability: 180,
  },
  baitcasting: {
    id: "baitcasting",
    name: "Baitcasting Rod",
    emoji: "🎯",
    description: "Precision rod for accurate casting",
    price: 1200,
    catchRate: 68,
    rareBonus: 18,
    durability: 220,
  },
  premium: {
    id: "premium",
    name: "Premium Rod",
    emoji: "💎",
    description: "High-end fishing equipment",
    price: 2000,
    catchRate: 72,
    rareBonus: 22,
    durability: 250,
  },
  master: {
    id: "master",
    name: "Master Angler Rod",
    emoji: "🏆",
    description: "For the most skilled fishermen",
    price: 4000,
    catchRate: 78,
    rareBonus: 28,
    durability: 300,
  },
  deep_sea: {
    id: "deep_sea",
    name: "Deep Sea Rod",
    emoji: "🌊",
    description: "Built for deep ocean fishing",
    price: 6000,
    catchRate: 82,
    rareBonus: 35,
    durability: 350,
  },
  legendary: {
    id: "legendary",
    name: "Legendary Rod of Depths",
    emoji: "✨",
    description: "Forged by the sea gods themselves",
    price: 15000,
    catchRate: 88,
    rareBonus: 45,
    durability: 500,
  },
  mythical: {
    id: "mythical",
    name: "Mythical Angler's Dream",
    emoji: "🌟",
    description: "A rod of legends, unbreakable and perfect",
    price: 50000,
    catchRate: 95,
    rareBonus: 60,
    durability: 999,
  },
};

const boatTypes = {
  none: {
    id: "none",
    name: "Shore Fishing",
    emoji: "🏖️",
    description: "Fishing from the shore",
    price: 0,
    areaBonus: 0,
    catchBonus: 0,
    unlockLevel: 0,
  },
  canoe: {
    id: "canoe",
    name: "Wooden Canoe",
    emoji: "🛶",
    description: "Small boat for lakes and rivers",
    price: 1000,
    areaBonus: 10,
    catchBonus: 5,
    unlockLevel: 8,
    allowedAreas: ["pond", "lake", "river"],
  },
  motorboat: {
    id: "motorboat",
    name: "Motor Boat",
    emoji: "🚤",
    description: "Fast boat for reaching distant spots",
    price: 5000,
    areaBonus: 20,
    catchBonus: 12,
    unlockLevel: 15,
    allowedAreas: ["pond", "lake", "river", "ocean"],
  },
  yacht: {
    id: "yacht",
    name: "Luxury Yacht",
    emoji: "🛥️",
    description: "High-end vessel with advanced equipment",
    price: 25000,
    areaBonus: 35,
    catchBonus: 25,
    unlockLevel: 25,
    allowedAreas: ["lake", "river", "ocean", "arctic"],
  },
  submarine: {
    id: "submarine",
    name: "Deep Sea Submarine",
    emoji: "🚚",
    description: "Explore the deepest waters",
    price: 100000,
    areaBonus: 50,
    catchBonus: 40,
    unlockLevel: 40,
    allowedAreas: ["ocean", "arctic", "abyss"],
  },
  mystical_vessel: {
    id: "mystical_vessel",
    name: "Mystical Vessel",
    emoji: "🌌",
    description: "Transcends reality to reach mystical waters",
    price: 500000,
    areaBonus: 75,
    catchBonus: 60,
    unlockLevel: 50,
    allowedAreas: ["abyss", "mystical"],
  },
};

// Fishing game helper functions
function getFishingData(userKey) {
  let allFishingData = {};
  try {
    allFishingData = JSON.parse(fs.readFileSync("fishing.json", "utf8"));
  } catch (err) {
    allFishingData = {};
  }

  if (!allFishingData[userKey]) {
    allFishingData[userKey] = {
      level: 0,
      experience: 0,
      coins: 100,
      totalFish: 0,
      totalCasts: 0,
      fishCaught: {},
      currentRod: { ...fishingRods.basic },
      ownedRods: ["basic"],
      currentArea: "pond",
      currentBoat: boatTypes.none,
      ownedBoats: ["none"],
      baitInventory: {
        worms: 5,
      },
      currentBait: null,
      lastFished: 0,
      biggestCatch: null,
      fishingStreak: 0,
      lastStreakDate: null,
      luckyBoxes: {},
      workers: {},
      lastWorkerCollection: null,
    };
  }

  // Ensure backwards compatibility
  if (!allFishingData[userKey].currentArea) allFishingData[userKey].currentArea = "pond";
  if (!allFishingData[userKey].currentBoat) allFishingData[userKey].currentBoat = boatTypes.none;
  if (!allFishingData[userKey].ownedBoats) allFishingData[userKey].ownedBoats = ["none"];
  if (!allFishingData[userKey].baitInventory) allFishingData[userKey].baitInventory = { worms: 5 };
  if (!allFishingData[userKey].fishingStreak) allFishingData[userKey].fishingStreak = 0;

  return allFishingData[userKey];
}

function saveFishingData(userKey, data) {
  let allFishingData = {};
  try {
    allFishingData = JSON.parse(fs.readFileSync("fishing.json", "utf8"));
  } catch (err) {
    allFishingData = {};
  }

  allFishingData[userKey] = data;
  fs.writeFileSync("fishing.json", JSON.stringify(allFishingData, null, 2));
}

function simulateFishing(fishingData) {
  const rod = fishingData.currentRod;
  const area = fishingAreas[fishingData.currentArea];
  const boat = fishingData.currentBoat;
  const bait = fishingData.currentBait ? baitTypes[fishingData.currentBait] : null;
  const fishingLevel = Math.floor(fishingData.experience / 1000);

  // Calculate base catch rate
  let catchRate = rod.catchRate + fishingLevel * 1.5;
  
  // Area multiplier
  catchRate *= area.fishMultiplier;
  
  // Boat bonus
  if (boat && boat.catchBonus) {
    catchRate += boat.catchBonus;
  }
  
  // Bait bonus
  if (bait) {
    catchRate += bait.catchBonus;
  }
  
  // Fishing streak bonus
  if (fishingData.fishingStreak >= 5) {
    catchRate += Math.min(fishingData.fishingStreak * 0.5, 10);
  }

  const finalCatchRate = Math.min(catchRate, 98);
  const catchRoll = Math.random() * 100;

  if (catchRoll > finalCatchRate) {
    return { caught: false };
  }

  // Calculate rare bonus
  let rareBonus = rod.rareBonus + area.rareBonus + fishingLevel * 0.5;
  if (boat && boat.areaBonus) {
    rareBonus += boat.areaBonus * 0.3;
  }
  if (bait) {
    rareBonus += bait.rareBonus;
  }

  // Get available fish for this area
  const availableFishIds = area.allowedFish;
  const availableFish = availableFishIds.map(id => fishTypes[id]).filter(Boolean);

  if (availableFish.length === 0) {
    return { caught: false };
  }

  // Determine rarity
  const rarityRoll = Math.random() * 100;
  let targetRarity = "Common";
  
  if (rarityRoll < 0.05 + rareBonus * 0.05) {
    targetRarity = "Mythical";
  } else if (rarityRoll < 0.5 + rareBonus * 0.1) {
    targetRarity = "Legendary";
  } else if (rarityRoll < 3 + rareBonus * 0.3) {
    targetRarity = "Epic";
  } else if (rarityRoll < 12 + rareBonus * 0.5) {
    targetRarity = "Rare";
  } else if (rarityRoll < 30 + rareBonus * 0.7) {
    targetRarity = "Uncommon";
  }

  // Filter fish by rarity and check bait preference
  let eligibleFish = availableFish.filter(fish => fish.rarity === targetRarity);
  
  // If no fish of target rarity, fall back to available fish
  if (eligibleFish.length === 0) {
    eligibleFish = availableFish;
  }

  // Bait preference bonus
  if (bait && fishingData.currentBait) {
    const preferredFish = eligibleFish.filter(fish => 
      fish.preferredBait && fish.preferredBait.includes(fishingData.currentBait)
    );
    if (preferredFish.length > 0 && Math.random() < 0.7) {
      eligibleFish = preferredFish;
    }
  }

  const caughtFish = eligibleFish[Math.floor(Math.random() * eligibleFish.length)];
  
  // Calculate fish size variation
  const sizeVariation = (Math.random() - 0.5) * 0.4; // ±20% size variation
  const fishValue = Math.round(caughtFish.value * (1 + sizeVariation));
  const fishExp = Math.round(caughtFish.experience * (1 + sizeVariation));

  return { 
    caught: true, 
    fish: { ...caughtFish, value: fishValue, experience: fishExp },
    sizeVariation
  };
}

function getRarityEmoji(rarity) {
  const rarityEmojis = {
    Common: "🟢",
    Uncommon: "🔵",
    Rare: "🟣",
    Epic: "🟠",
    Legendary: "🟡",
    Mythical: "✨",
  };
  return rarityEmojis[rarity] || "⚪";
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
  let rarestRarity = -1;
  let rarestFish = "None";

  for (const fishId of Object.keys(fishingData.fishCaught)) {
    const fish = fishTypes[fishId];
    if (fish) {
      const rarityIndex = rarityOrder.indexOf(fish.rarity);
      if (rarityIndex > rarestRarity) {
        rarestRarity = rarityIndex;
        rarestFish = `${fish.emoji} ${fish.name}`;
      }
    }
  }

  return rarestFish;
}

function countRareFish(fishingData) {
  let rareCount = 0;
  for (const [fishId, count] of Object.entries(fishingData.fishCaught)) {
    const fish = fishTypes[fishId];
    if (
      fish &&
      ["Rare", "Epic", "Legendary", "Mythical"].includes(fish.rarity)
    ) {
      rareCount += count;
    }
  }
  return rareCount;
}

// Lucky Box and Worker helper functions
function openLuckyBox(boxType, fishingData) {
  const rewards = {
    basic: {
      coins: { min: 50, max: 200 },
      bait: ['worms', 'crickets'],
      xpBonus: { min: 20, max: 50 },
      successRate: 85,
    },
    premium: {
      coins: { min: 200, max: 800 },
      bait: ['lures', 'flies', 'spoons'],
      xpBonus: { min: 50, max: 150 },
      successRate: 90,
      specialItems: ['bamboo_rod', 'carbon_rod'],
    },
    legendary: {
      coins: { min: 1000, max: 5000 },
      bait: ['live_bait', 'squid', 'golden_bait'],
      xpBonus: { min: 200, max: 500 },
      successRate: 95,
      specialItems: ['premium_rod', 'master_rod'],
      rareFish: ['swordfish', 'marlin', 'tuna'],
    },
    mythical: {
      coins: { min: 5000, max: 15000 },
      bait: ['mystical_essence', 'phoenix_feathers'],
      xpBonus: { min: 500, max: 1500 },
      successRate: 98,
      specialItems: ['deep_sea_rod', 'legendary_rod'],
      rareFish: ['kraken', 'golden_fish', 'dragon_fish'],
      workers: ['novice', 'experienced'],
    },
  };

  const reward = rewards[boxType];
  const roll = Math.random() * 100;

  if (roll > reward.successRate) {
    return {
      color: "#FF6B6B",
      description: "💔 **Box was empty!** Better luck next time...",
      fields: [{ name: "Result", value: "Nothing gained", inline: true }],
    };
  }

  const results = [];
  let color = "#FFD700";

  // Always give coins
  const coinsEarned = Math.floor(Math.random() * (reward.coins.max - reward.coins.min + 1)) + reward.coins.min;
  fishingData.coins += coinsEarned;
  results.push(`💰 ${coinsEarned} coins`);

  // Random bait
  if (Math.random() < 0.7) {
    const baitType = reward.bait[Math.floor(Math.random() * reward.bait.length)];
    const baitAmount = Math.floor(Math.random() * 5) + 3;
    if (!fishingData.baitInventory) fishingData.baitInventory = {};
    fishingData.baitInventory[baitType] = (fishingData.baitInventory[baitType] || 0) + baitAmount;
    const baitInfo = baitTypes[baitType];
    results.push(`🪱 ${baitAmount}x ${baitInfo ? baitInfo.name : baitType}`);
  }

  // XP bonus
  const xpGained = Math.floor(Math.random() * (reward.xpBonus.max - reward.xpBonus.min + 1)) + reward.xpBonus.min;
  fishingData.experience += xpGained;
  results.push(`✨ ${xpGained} XP`);

  // Special items (premium+)
  if (reward.specialItems && Math.random() < 0.3) {
    const item = reward.specialItems[Math.floor(Math.random() * reward.specialItems.length)];
    if (fishingRods[item] && !fishingData.ownedRods.includes(item)) {
      fishingData.ownedRods.push(item);
      results.push(`🎣 ${fishingRods[item].name}!`);
      color = "#9932CC";
    }
  }

  // Rare fish (legendary+)
  if (reward.rareFish && Math.random() < 0.2) {
    const fishId = reward.rareFish[Math.floor(Math.random() * reward.rareFish.length)];
    const fish = fishTypes[fishId];
    if (fish) {
      fishingData.fishCaught[fishId] = (fishingData.fishCaught[fishId] || 0) + 1;
      fishingData.totalFish++;
      results.push(`${fish.emoji} **${fish.name}** (${fish.rarity})!`);
      color = "#FF69B4";
    }
  }

  // Workers (mythical only)
  if (reward.workers && Math.random() < 0.15) {
    const workerType = reward.workers[Math.floor(Math.random() * reward.workers.length)];
    if (!fishingData.workers) fishingData.workers = {};
    fishingData.workers[workerType] = (fishingData.workers[workerType] || 0) + 1;
    if (!fishingData.lastWorkerCollection) fishingData.lastWorkerCollection = Date.now();
    results.push(`👷 1x ${workerType} worker!`);
    color = "#FFD700";
  }

  return {
    color,
    description: `🎊 **Great success!** You found amazing rewards:`,
    fields: [{ name: "🎁 Rewards", value: results.join("\n"), inline: false }],
  };
}

function calculateWorkerIncome(workers) {
  const incomeRates = {
    novice: 5,
    experienced: 25,
    master: 100,
    legendary: 400,
  };

  let totalIncome = 0;
  for (const [type, count] of Object.entries(workers || {})) {
    totalIncome += (incomeRates[type] || 0) * count;
  }
  
  return totalIncome;
}

function processWorkerIncome(fishingData) {
  if (!fishingData.workers || Object.keys(fishingData.workers).length === 0) {
    return 0;
  }

  const now = Date.now();
  const lastCollection = fishingData.lastWorkerCollection || now;
  const hoursPassed = Math.max(0, (now - lastCollection) / (1000 * 60 * 60)); // Convert ms to hours

  if (hoursPassed < 0.1) { // Less than 6 minutes
    return 0;
  }

  const hourlyIncome = calculateWorkerIncome(fishingData.workers);
  const totalIncome = Math.floor(hourlyIncome * hoursPassed);

  if (totalIncome > 0) {
    fishingData.coins += totalIncome;
    fishingData.lastWorkerCollection = now;
  }

  return totalIncome;
}

// Global error handlers
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

// Handle client errors
client.on("error", (error) => {
  console.error("Discord client error:", error);
});

if (!token) {
  console.error("DISCORD_BOT_TOKEN environment variable is not set!");
  process.exit(1);
}

client.login(token);

process.on("exit", () => {
  db.close();
});