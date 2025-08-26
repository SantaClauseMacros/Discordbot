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
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('bot.db');
const fs = require('fs');

// Load or initialize counters
let counters = { ticketCount: 0, banCount: 0 };
try {
  counters = JSON.parse(fs.readFileSync('counter.json', 'utf8'));
} catch (err) {
  fs.writeFileSync('counter.json', JSON.stringify(counters));
}

function saveCounters() {
  fs.writeFileSync('counter.json', JSON.stringify(counters));
}



// Bot settings with automod defaults
let botSettings = {
  autoModEnabled: true,
  badWordsFilterEnabled: true,
  capsFilterEnabled: true,
  spamFilterEnabled: true,
  messageRateLimit: 5,
  messageDuplicateLimit: 3
};

try {
  botSettings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
} catch (err) {
  fs.writeFileSync('settings.json', JSON.stringify(botSettings));
}

function saveSettings() {
  fs.writeFileSync('settings.json', JSON.stringify(botSettings));
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


// Leveling system data
let userLevels = new Map();
try {
  const levelData = JSON.parse(fs.readFileSync('levels.json', 'utf8'));
  userLevels = new Map(Object.entries(levelData));
} catch (err) {
  userLevels = new Map();
  fs.writeFileSync('levels.json', JSON.stringify({}));
}

function saveLevels() {
  fs.writeFileSync('levels.json', JSON.stringify(Object.fromEntries(userLevels)));
}

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
  const ticketsData = JSON.parse(fs.readFileSync('tickets.json', 'utf8'));
  tickets = new Map(Object.entries(ticketsData));
} catch (err) {
  tickets = new Map();
  fs.writeFileSync('tickets.json', JSON.stringify(Object.fromEntries(tickets)));
}

function saveTickets() {
  fs.writeFileSync('tickets.json', JSON.stringify(Object.fromEntries(tickets)));
}

db.get("SELECT MAX(id) as max_id FROM tickets", (err, row) => {
  if (!err && row.max_id) ticketCount = row.max_id;
});

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
  const userData = userLevels.get(userKey) || { xp: 0, level: 1, totalXP: 0, messages: 0 };

  // Add XP
  const xpToAdd = getRandomXP();
  userData.xp += xpToAdd;
  userData.totalXP += xpToAdd;
  userData.messages += 1;

  // Check for level up
  let leveledUp = false;
  let newLevel = userData.level;

  while (userData.xp >= calculateXPForLevel(newLevel + 1) - calculateXPForLevel(newLevel)) {
    userData.xp -= (calculateXPForLevel(newLevel + 1) - calculateXPForLevel(newLevel));
    newLevel++;
    leveledUp = true;
  }

  // If user leveled up, send level up message
  if (leveledUp) {
    userData.level = newLevel;

    // Get guild settings
    const guildSettings = serverSettings[guildId] || {};

    // Get the level channel if set, otherwise send in current channel
    const levelChannel = guildSettings.levelChannelId 
      ? message.guild.channels.cache.get(guildSettings.levelChannelId)
      : message.channel;

    if (levelChannel) {
      const levelUpEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🐠 Aquarium Builder Level Up!')
        .setDescription(`Congratulations ${message.author}! Your aquarium building skills have improved to level **${newLevel}**! 🎉`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '🏆 New Builder Level', value: `${newLevel}`, inline: true },
          { name: '✨ Total Experience', value: `${userData.totalXP}`, inline: true }
        )
        .setTimestamp();

      levelChannel.send({ embeds: [levelUpEmbed] }).catch(error => {
        console.error('Error sending level up message:', error);
      });
    }
  }

  // Save updated user data
  userLevels.set(userKey, userData);
  saveLevels();
}

const token =
  "MTM4MzUzNDg0MTg3MzY5ODkyOA.Ga_1_g.32OuMx4RjpyE_bLCiMj0U0OAhReDwXwGNF73lQ";

const client = new Client({
  intents: Object.values(GatewayIntentBits),
  partials: Object.values(Partials),
  allowedMentions: { parse: ['users', 'roles'], repliedUser: true },
  restTimeOffset: 0,
  failIfNotExists: false,
  presence: {
    activities: [{ name: `Build a Aquarium`, type: ActivityType.Playing }],
    status: 'online'
  }
});

const prefix = "!";

// Server settings with defaults
let serverSettings = {};

try {
  serverSettings = JSON.parse(fs.readFileSync('serverSettings.json', 'utf8'));
} catch (err) {
  serverSettings = {};
  fs.writeFileSync('serverSettings.json', JSON.stringify(serverSettings));
}

function saveServerSettings() {
  fs.writeFileSync('serverSettings.json', JSON.stringify(serverSettings));
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} servers`);
  console.log(`Watching ${client.users.cache.size} users`);

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
      { name: `Build a Aquarium`, type: ActivityType.Playing },
      { name: `${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)} aquarium builders`, type: ActivityType.Watching },
      { name: `${client.guilds.cache.size} aquarium communities`, type: ActivityType.Competing }
    ];
    client.user.setPresence({
      activities: [activities[Math.floor(Math.random() * activities.length)]],
      status: "online"
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
        : guild.channels.cache.find((channel) => channel.name.startsWith("👥┃all-members-"));

      const membersChannel = guildSettings.membersChannelId 
        ? guild.channels.cache.get(guildSettings.membersChannelId)
        : guild.channels.cache.find((channel) => channel.name.startsWith("👤┃members-"));

      const botsChannel = guildSettings.botsChannelId 
        ? guild.channels.cache.get(guildSettings.botsChannelId)
        : guild.channels.cache.find((channel) => channel.name.startsWith("🤖┃bots-"));

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
    // Get guild settings
    const guildSettings = serverSettings[member.guild.id] || {};

    // Use custom welcome channel if set, otherwise find by default name
    const welcomeChannel = guildSettings.welcomeChannelId 
      ? member.guild.channels.cache.get(guildSettings.welcomeChannelId)
      : member.guild.channels.cache.find((channel) => channel.name === "👋┃welcome");

    if (welcomeChannel) {
      const welcomeEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("New Member!")
        .setDescription(
          `Welcome to our aquarium community, ${member}! Ready to build amazing aquariums together?`,
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({
          text: `We now have ${member.guild.memberCount} members!`,
        });

      welcomeChannel.send({ embeds: [welcomeEmbed] });
    }

    const memberRole = member.guild.roles.cache.find(
      (role) => role.name === "Member",
    );
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

    updateMemberCountChannels();
  } catch (error) {
    console.error("Error in welcoming new member:", error);
  }
});

client.on("guildMemberRemove", async (member) => {
  updateMemberCountChannels();
});


client.on("messageDelete", async (message) => {
  const logsChannel = message.guild?.channels.cache.find(
    (channel) => channel.name === "📝┃message-logs",
  );

  if (logsChannel && message.content) {
    const logEmbed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("Message Deleted")
      .setDescription(
        `Message by ${message.author} was deleted in ${message.channel}`,
      )
      .addFields({ name: "Content", value: message.content })
      .setTimestamp();

    await logsChannel.send({ embeds: [logEmbed] });
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (oldMessage.content === newMessage.content) return;

  const logsChannel = oldMessage.guild?.channels.cache.find(
    (channel) => channel.name === "📝┃message-logs",
  );

  if (logsChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor("#FFA500")
      .setTitle("Message Edited")
      .setDescription(
        `Message by ${oldMessage.author} was edited in ${oldMessage.channel}`,
      )
      .addFields(
        { name: "Before", value: oldMessage.content || "No content" },
        { name: "After", value: newMessage.content || "No content" },
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [logEmbed] });
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const logsChannel = oldMember.guild?.channels.cache.find(
    (channel) => channel.name === "📝┃user-logs",
  );

  if (logsChannel) {
    const oldRoles = oldMember.roles.cache.map((role) => role.name).join(", ");
    const newRoles = newMember.roles.cache.map((role) => role.name).join(", ");

    if (oldRoles !== newRoles) {
      const logEmbed = new EmbedBuilder()
        .setColor("#0000FF")
        .setTitle("Member Roles Updated")
        .setDescription(`Roles updated for ${newMember.user.tag}`)
        .addFields(
          { name: "Old Roles", value: oldRoles },
          { name: "New Roles", value: newRoles },
        )
        .setTimestamp();

      await logsChannel.send({ embeds: [logEmbed] });
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (isOnCooldown(message.author.id)) {
    return; // Ignore message if on cooldown
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
  if (botSettings.autoModEnabled && !message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const badWords = require('./badwords.js');
    const content = message.content.toLowerCase();

    // Check for banned words
    if (botSettings.badWordsFilterEnabled && badWords.some(word => content.includes(word))) {
        try {
          await message.delete().catch(err => console.error('Could not delete message:', err));
          await message.member.timeout(30 * 1000, 'Using inappropriate language').catch(err => console.error('Could not timeout member:', err));
          const warning = await message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ Language Warning')
                .setDescription(`${message.author} has been muted for 30 seconds for using inappropriate language.`)
            ]
          });
          setTimeout(async () => {
            try {
              await warning.delete().catch(() => {});
            } catch (error) {
              console.error('Error deleting warning message:', error);
            }
          }, 5000);
        } catch (error) {
          console.error('Error handling banned word:', error);
        }
        return;
      }

    // Enhanced spam detection
    const userMessages = messages.get(message.author.id) || [];
    const now = Date.now();

    // Remove messages older than 30 seconds
    while (userMessages.length > 0 && now - userMessages[0].timestamp > 30000) {
      userMessages.shift();
    }

    // Add current message
    userMessages.push({
      content: message.content,
      timestamp: now
    });
    messages.set(message.author.id, userMessages);

    // Check for repeated messages
    const repeatedMessages = userMessages.filter(msg => msg.content === message.content);
    if (botSettings.spamFilterEnabled && repeatedMessages.length >= botSettings.messageDuplicateLimit) {
      try {
        await message.delete();
        await message.member.timeout(15 * 1000, 'Spamming same message');
        const warning = await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('⚠️ Spam Warning')
              .setDescription(`${message.author} has been muted for 15 seconds for spamming.`)
          ]
        });
        setTimeout(() => warning.delete(), 5000);
        messages.delete(message.author.id); // Reset their message history
        return;
      } catch (error) {
        console.error('Error handling spam:', error);
      }
    }

    // Check for excessive caps
    if (message.content.length > 10) {
      const upperCount = message.content.replace(/[^A-Z]/g, '').length;
      const totalCount = message.content.length;
      if (botSettings.capsFilterEnabled && upperCount / totalCount > 0.7) {
        await message.delete();
        const warning = await message.channel.send(`${message.author}, please don't use excessive caps!`);
        setTimeout(() => warning.delete(), 5000);
        return;
      }
    }

    // Check for spam/repeated messages
    const lastMessages = messages.get(message.author.id) || [];
    lastMessages.push({
      content: message.content,
      timestamp: now // Using the 'now' variable from earlier in the code
    });

    // Keep only messages from last 5 seconds
    const recentMessages = lastMessages.filter(msg => now - msg.timestamp < 5000);
    messages.set(message.author.id, recentMessages);

    // Check for spam (more than 5 messages in 5 seconds or repeated content)
    if (botSettings.spamFilterEnabled && (recentMessages.length >= botSettings.messageRateLimit || recentMessages.filter(msg => msg.content === message.content).length >= botSettings.messageDuplicateLimit)) {
      await message.delete().catch(err => console.error('Could not delete spam message:', err));
      const warning = await message.channel.send(`${message.author}, you are being muted for spamming!`);
      await message.member.timeout(10 * 1000, 'Spamming').catch(err => console.error('Could not timeout member for spam:', err));
      setTimeout(() => warning.delete().catch(() => {}), 5000);
      return;
    }

    // Check for banned words
    if (botSettings.badWordsFilterEnabled && badWords.some(word => content.includes(word))) {
      await message.delete().catch(err => console.error('Could not delete message:', err));
      const warning = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ Language Warning')
            .setDescription(`${message.author}, please watch your language! You have been muted for 30 seconds.`)
        ]
      });
      await message.member.timeout(30 * 1000, 'Inappropriate language').catch(err => console.error('Could not timeout member:', err));
      setTimeout(() => warning.delete().catch(() => {}), 5000);
      return;
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
      const deleted = await message.channel.bulkDelete(amount + 1);
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🧹 Messages Purged")
        .setDescription(`Successfully deleted ${deleted.size - 1} messages.`)
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();

      const reply = await message.channel.send({ embeds: [embed] });
      setTimeout(() => reply.delete(), 5000);
    } catch (error) {
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error")
            .setDescription("Can't delete messages older than 14 days."),
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

  if (command === "setup" || command === "serversetup") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You need administrator permissions to use this command!");
    }

    const guild = message.guild;

    // Define roles
    const roles = {
      owner: guild.roles.cache.find((role) => role.name === "Owner"),
      admin: guild.roles.cache.find((role) => role.name === "Admin"),
      moderator: guild.roles.cache.find((role) => role.name === "Moderator"),
      clanOfficer: guild.roles.cache.find((role) => role.name === "Clan Officer"),
      clanMember: guild.roles.cache.find((role) => role.name === "Clan Member"),
      member: guild.roles.cache.find((role) => role.name === "Member"),
    };

    // Check if the roles exist, create them if they don't
    for (const roleName in roles) {
      if (!roles[roleName]) {
        try {
          const newRole = await guild.roles.create({
            name: roleName.charAt(0).toUpperCase() + roleName.slice(1), // Capitalize the first letter
            reason: "Creating default roles for the server setup",
          });
          roles[roleName] = newRole;
          console.log(`Created role: ${roleName}`);
        } catch (error) {
          console.error(`Error creating role ${roleName}:`, error);
          return message.reply(`Failed to create the ${roleName} role.`);
        }
      }
    }

    try {
      await setupRolesChannel(guild, roles); // Call function to set up channels and categories
      await message.reply("Server setup complete!");
    } catch (error) {
      console.error("Error setting up server:", error);
      await message.reply("An error occurred while setting up the server.");
    }
  }


  if (command === "deletealltickets") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.channel.send("You need administrator permissions to use this command!");
    }

    try {
      const ticketChannels = message.guild.channels.cache.filter(channel => 
        channel.name.startsWith('ticket-') && channel.type === ChannelType.GuildText
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

      await message.channel.send(`All ticket channels (${deletedCount}) have been deleted and counter reset!`);
    } catch (error) {
      console.error("Error deleting tickets:", error);
      await message.channel.send("An error occurred while deleting tickets.");
    }
    return;
  }

  if (command === "help") {
    const isBotCommandsChannel = message.channel.name === "🤖┃bot-commands";
    const hasPermission = message.member.roles.cache.some((r) =>
      ["Owner", "Admin", "Moderator", "Clan Officer"].includes(r.name),
    ) || message.author.id === message.guild.ownerId;

    if (!isBotCommandsChannel && !hasPermission) {
      return message.reply(
        "This command can only be used in the bot-commands channel or by staff members.",
      );
    }

    const helpEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("🐠 Build a Aquarium Bot Commands")
      .setDescription("Here are all available commands for managing your aquarium community:")
      .addFields(
        {
          name: "🛠️ Admin Commands",
          value: `
!purge <number> - Delete messages (Staff+)
!editpanel "Title" Description - Edit support panel (Admin only)
!lock - Lock the current channel (Staff+)
!unlock - Unlock the current channel (Staff+)
!deletealltickets - Delete all tickets and reset counter (Admin only)
!toggleautomod - Toggle auto-moderation (Admin only)
!togglebadwords - Toggle bad words filter (Admin only)
!togglecaps - Toggle caps filter (Admin only)
!togglespam - Toggle spam filter (Admin only)
!set allmemberschannel #channel - Set total members count channel (Admin only)
!set memberschannel #channel - Set human members count channel (Admin only)
!set botschannel #channel - Set bot members count channel (Admin only)
!set welcomechannel #channel - Set welcome messages channel (Admin only)
!rr - Create a reaction roles panel for notification roles (Admin only)
!setlvlchannel #channel - Set level up notification channel (Admin only)
!serversetup - setup the channels and roles (Admin only)`,
          inline: false,
        },
        {
          name: "🔨 Moderation",
          value: `
!kick @user [reason] - Kick a member (Staff+)
!ban @user [reason] - Ban a member (Staff+)
!unban userID [reason] - Unban a member (Staff+)
!warn @user [reason] - Warn a member (Staff+)
!mute @user [time][m/h/d] [reason] - Timeout a member (Staff+)
!unmute @user - Remove timeout from a member (Staff+)`,
          inline: false,
        },
        {
          name: "🐠 Aquarium Leveling",
          value: `
!lvl - View your aquarium builder level and XP
!lvl @user - View another user's aquarium level
!leaderboard - View top aquarium builders
!givexp @user amount - Give XP to a user (Owner only)
!resetlevel @user - Reset a user's level (Owner only)`,
          inline: false,
        },
        {
          name: "ℹ️ General Commands",
          value: `
!ping - Check bot latency
!rules - Display community rules
!help - Show this message`,
          inline: false,
        },
      )
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({ text: "Tip: All commands start with !" })
      .setTimestamp();

    message.channel.send({ embeds: [helpEmbed] });
  }

  if (command === "rules") {
    const rulesEmbed = new EmbedBuilder()
      .setColor("#ff9900")
      .setTitle("🐠 Build a Aquarium Community Rules")
      .setDescription("Please follow these rules to keep our aquarium community friendly and helpful:")
      .addFields(
        {
          name: "1. Be Respectful",
          value:
            "Treat all aquarium builders with respect. No harassment, hate speech, or bullying.",
        },
        {
          name: "2. No Spamming",
          value: "Don't spam messages, emotes, or mentions. Keep chat clean like your aquarium!",
        },
        {
          name: "3. Use Appropriate Channels",
          value: "Post aquarium builds, tips, and discussions in the right channels.",
        },
        {
          name: "4. Keep Content Appropriate",
          value: "Keep all content family-friendly and aquarium-related.",
        },
        {
          name: "5. Follow Discord TOS",
          value: "Adhere to Discord's Terms of Service.",
        },
        {
          name: "6. Listen to Staff",
          value: "Follow instructions from server moderators and admins.",
        },
        {
          name: "7. Share Your Builds",
          value: "Feel free to share your amazing aquarium creations with the community!",
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
            .setDescription("You don't have permission to ban members.")
        ]
      });
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing User")
            .setDescription("Please mention a member to ban.")
        ]
      });
    }

    if (member.id === message.author.id) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Action")
            .setDescription("You cannot ban yourself.")
        ]
      });
    }

    if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Action")
            .setDescription("You cannot ban someone with a higher or equal role.")
        ]
      });
    }

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      await member.ban({ reason });

      db.run(`INSERT INTO bans (user_id, user_tag, reason, banned_by, status) VALUES (?, ?, ?, ?, 'active')`, 
        [member.id, member.user.tag, reason, message.author.id], 
        function(err) {
          if (err) {
            console.error("Error inserting ban into database:", err);
            message.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor("#FF0000")
                  .setTitle("❌ Database Error")
                  .setDescription("Member was banned but failed to log to database.")
              ]
            });
          } else {
            const banEmbed = new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("🔨 Member Banned")
              .setDescription(`${member.user.tag} has been banned`)
              .addFields({ name: "Reason", value: reason })
              .setTimestamp()
              .setFooter({ text: `Banned by ${message.author.tag} | Ban ID: ${this.lastID}` });

            message.channel.send({ embeds: [banEmbed] });

            const logsChannel = message.guild?.channels.cache.find(
              (channel) => channel.name === "📝┃user-logs"
            );

            if (logsChannel) {
              const logEmbed = new EmbedBuilder()
                .setColor("#FF0000")
                .setTitle(`Member Banned`)
                .setDescription(`${member.user.tag} was banned by ${message.author.tag}`)
                .addFields(
                  { name: "User ID", value: member.id, inline: true },
                  { name: "Ban ID", value: `${this.lastID}`, inline: true },
                  { name: "Reason", value: reason }
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
        }
      );
    } catch (error) {
      console.error("Error banning member:", error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error")
            .setDescription("Failed to ban member.")
        ]
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
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
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
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to mute members.")
        ]
      });
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing User")
            .setDescription("Please mention a member to mute.")
        ]
      });
    }

    if (member.id === message.author.id) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Action")
            .setDescription("You cannot mute yourself.")
        ]
      });
    }

    if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Action")
            .setDescription("You cannot mute someone with a higher or equal role.")
        ]
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
            .setDescription("Please specify a time duration (e.g., 5m, 2h, 1d)")
        ]
      });
    }

    if (timeArg.endsWith('d')) {
      const days = parseInt(timeArg.slice(0, -1));
      if (isNaN(days)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Invalid Time")
              .setDescription("Please provide a valid number of days.")
          ]
        });
      }
      timeMs += days * 24 * 60 * 60 * 1000;
      timeString += `${days} day${days !== 1 ? 's' : ''}`;
    } else if (timeArg.endsWith('h')) {
      const hours = parseInt(timeArg.slice(0, -1));
      if (isNaN(hours)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Invalid Time")
              .setDescription("Please provide a valid number of hours.")
          ]
        });
      }
      timeMs += hours * 60 * 60 * 1000;
      timeString += `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (timeArg.endsWith('m')) {
      const minutes = parseInt(timeArg.slice(0, -1));
      if (isNaN(minutes)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Invalid Time")
              .setDescription("Please provide a valid number of minutes.")
          ]
        });
      }
      timeMs += minutes * 60 * 1000;
      timeString += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      const minutes = parseInt(timeArg);
      if (isNaN(minutes)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Invalid Time")
              .setDescription("Please provide a valid time duration (e.g., 5m, 2h, 1d)")
          ]
        });
      }
      timeMs += minutes * 60 * 1000;
      timeString += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }

    // Discord has a maximum timeout of 28 days
    if (timeMs > 28 * 24 * 60 * 60 * 1000) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Invalid Duration")
            .setDescription("Timeout duration cannot exceed 28 days.")
        ]
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
        (channel) => channel.name === "📝┃user-logs"
      );

      if (logsChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle("Member Muted")
          .setDescription(`${member.user.tag} was muted by ${message.author.tag}`)
          .addFields(
            { name: "Duration", value: timeString, inline: true },
            { name: "Reason", value: reason, inline: true }
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
            .setDescription("Failed to mute member.")
        ]
      });
    }
  }

  if (command === "unmute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to unmute members.")
        ]
      });
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing User")
            .setDescription("Please mention a member to unmute.")
        ]
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
        (channel) => channel.name === "📝┃user-logs"
      );

      if (logsChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("Member Unmuted")
          .setDescription(`${member.user.tag} was unmuted by ${message.author.tag}`)
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
            .setDescription("Failed to unmute member.")
        ]
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
            .setDescription("You don't have permission to unban members.")
        ]
      });
    }

    const userId = args[0];
    if (!userId) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Missing User ID")
            .setDescription("Please provide a user ID to unban.")
        ]
      });
    }

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      // First check if the user is actually banned
      const banList = await message.guild.bans.fetch();
      const bannedUser = banList.find(ban => ban.user.id === userId);

      if (!bannedUser) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ User Not Found")
              .setDescription("This user is not banned.")
          ]
        });
      }

      await message.guild.members.unban(userId, reason);

      const unbanEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🔓 User Unbanned")
        .setDescription(`<@${userId}> (${bannedUser.user.tag}) has been unbanned`)
        .addFields({ name: "Reason", value: reason })
        .setTimestamp()
        .setFooter({ text: `Unbanned by ${message.author.tag}` });

      message.channel.send({ embeds: [unbanEmbed] });

      // Update database
      db.run(`UPDATE bans SET status = 'unbanned', unbanned_by = ?, unbanned_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'active'`, 
        [message.author.id, userId], function(err) {
          if (err) {
            console.error("Error updating ban status in database:", err);
          }
        });

      const logsChannel = message.guild?.channels.cache.find(
        (channel) => channel.name === "📝┃user-logs"
      );

      if (logsChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("User Unbanned")
          .setDescription(`${bannedUser.user.tag} was unbanned by ${message.author.tag}`)
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
            .setDescription("Failed to unban user. Make sure the ID is valid.")
        ]
      });
    }
  }

  if (command === "lock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("You don't have permission to lock channels.");
    }

    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        SendMessages: false
      });
      message.channel.send("🔒 Channel has been locked.");
    } catch (error) {
      message.reply("Failed to lock channel.");
    }
  }

  if (command === "unlock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("You don't have permission to unlock channels.");
    }

    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        SendMessages: true
      });
      message.channel.send("🔓 Channel has been unlocked.");
    } catch (error) {
      message.reply("Failed to unlock channel.");
    }
  }

  if (command === "poll") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("You don't have permission to create polls.");
    }

    const question = args.join(" ");
    if (!question) return message.reply("Please provide a question for the poll.");

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
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You need administrator permissions to use this command!");
    }
    botSettings.autoModEnabled = !botSettings.autoModEnabled;
    saveSettings();
    message.reply(`Auto-moderation is now ${botSettings.autoModEnabled ? 'enabled' : 'disabled'}.`);
  }

  if (command === "togglebadwords") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You need administrator permissions to use this command!");
    }
    botSettings.badWordsFilterEnabled = !botSettings.badWordsFilterEnabled;
    saveSettings();
    message.reply(`Bad words filter is now ${botSettings.badWordsFilterEnabled ? 'enabled' : 'disabled'}.`);
  }

  if (command === "togglecaps") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You need administrator permissions to use this command!");
    }
    botSettings.capsFilterEnabled = !botSettings.capsFilterEnabled;
    saveSettings();
    message.reply(`Caps filter is now ${botSettings.capsFilterEnabled ? 'enabled' : 'disabled'}.`);
  }

  if (command === "togglespam") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You need administrator permissions to use this command!");
    }
    botSettings.spamFilterEnabled = !botSettings.spamFilterEnabled;
    saveSettings();
    message.reply(`Spam filter is now ${botSettings.spamFilterEnabled ? 'enabled' : 'disabled'}.`);
  }

  if (command === "lvl" || command === "level" || command === "rank") {
    const target = message.mentions.users.first() || message.author;
    const userKey = `${target.id}-${message.guild.id}`;
    const userData = userLevels.get(userKey) || { xp: 0, level: 1, totalXP: 0, messages: 0 };

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🐠 Aquarium Builder Level')
      .setDescription(`**${target.username}**'s aquarium building progress:`)
      .addFields(
        { name: '🏆 Builder Level', value: `${userData.level}`, inline: true },
        { name: '✨ Current XP', value: `${userData.xp}/${calculateXPForLevel(userData.level + 1) - calculateXPForLevel(userData.level)}`, inline: true },
        { name: '💫 Total XP', value: `${userData.totalXP}`, inline: true },
        { name: '💬 Messages Sent', value: `${userData.messages}`, inline: true }
      )
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "leaderboard" || command === "lb") {
    const guildUsers = Array.from(userLevels.entries())
      .filter(([key]) => key.endsWith(`-${message.guild.id}`))
      .map(([key, data]) => ({
        userId: key.split('-')[0],
        ...data
      }))
      .sort((a, b) => b.totalXP - a.totalXP)
      .slice(0, 10);

    if (guildUsers.length === 0) {
      return message.channel.send("No users found in the leaderboard yet!");
    }

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏆 Top Aquarium Builders')
      .setDescription('Here are the top aquarium builders in this community:')
      .setTimestamp();

    let description = '';
    for (let i = 0; i < guildUsers.length; i++) {
      const user = guildUsers[i];
      try {
        const member = await message.guild.members.fetch(user.userId).catch(() => null);
        const username = member ? member.user.username : 'Unknown User';
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        description += `${medal} **${username}** - Level ${user.level} (${user.totalXP} XP)\n`;
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    }

    embed.setDescription(description);
    message.channel.send({ embeds: [embed] });
  }

  if (command === "givexp") {
    if (!message.member.roles.cache.some(r => r.name === "Owner")) {
      return message.reply("Only owners can give XP to users!");
    }

    const target = message.mentions.users.first();
    if (!target) {
      return message.reply("Please mention a user to give XP to.");
    }

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) {
      return message.reply("Please provide a valid XP amount.");
    }

    const userKey = `${target.id}-${message.guild.id}`;
    const userData = userLevels.get(userKey) || { xp: 0, level: 1, totalXP: 0, messages: 0 };

    userData.xp += amount;
    userData.totalXP += amount;

    // Check for level ups
    let leveledUp = false;
    let newLevel = userData.level;

    while (userData.xp >= calculateXPForLevel(newLevel + 1) - calculateXPForLevel(newLevel)) {
      userData.xp -= (calculateXPForLevel(newLevel + 1) - calculateXPForLevel(newLevel));
      newLevel++;
      leveledUp = true;
    }

    if (leveledUp) {
      userData.level = newLevel;
    }

    userLevels.set(userKey, userData);
    saveLevels();

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✨ XP Given')
      .setDescription(`Gave ${amount} XP to ${target}!`)
      .addFields(
        { name: 'New Level', value: `${userData.level}`, inline: true },
        { name: 'Total XP', value: `${userData.totalXP}`, inline: true }
      );

    if (leveledUp) {
      embed.addFields({ name: 'Level Up!', value: `${target} leveled up to ${userData.level}!` });
    }

    message.channel.send({ embeds: [embed] });
  }

  if (command === "resetlevel") {
    if (!message.member.roles.cache.some(r => r.name === "Owner")) {
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
      .setColor('#FF0000')
      .setTitle('🔄 Level Reset')
      .setDescription(`Reset ${target}'s level back to 1!`);

    message.channel.send({ embeds: [embed] });
  }

  if (command === "setlvlchannel") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You need administrator permissions to use this command!");
    }

    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply("Please mention a channel to set for level notifications.");
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
          .setDescription(`Level up notifications will now be sent to ${channel}`)
      ]
    });
  }

  if (command === "set") {
    // Check for admin permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription("You need Administrator permission to use this command.")
        ]
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
        return message.reply("Please mention a channel to set for all members count.");
      }

      guildSettings.allMembersChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`All members count channel set to ${channel}`)
        ]
      });
    } 
    else if (subCommand === "memberschannel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply("Please mention a channel to set for human members count.");
      }

      guildSettings.membersChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`Human members count channel set to ${channel}`)
        ]
      });
    } 
    else if (subCommand === "botschannel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply("Please mention a channel to set for bot members count.");
      }

      guildSettings.botsChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`Bot members count channel set to ${channel}`)
        ]
      });
    }
    else if (subCommand === "welcomechannel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply("Please mention a channel to set for welcome messages.");
      }

      guildSettings.welcomeChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`Welcome channel set to ${channel}`)
        ]
      });
    }
    else {
      // Show help message for !set command
      const setHelpEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("!set Command Help")
        .setDescription("Configure server settings with the following options:")
        .addFields(
          { name: "!set allmemberschannel #channel", value: "Set the total members count channel" },
          { name: "!set memberschannel #channel", value: "Set the human members count channel" },
          { name: "!set botschannel #channel", value: "Set the bot members count channel" },
          { name: "!set welcomechannel #channel", value: "Set the welcome messages channel" }
        )
        .setFooter({ text: "Only administrators can use these commands" });

      message.channel.send({ embeds: [setHelpEmbed] });
    }
  }

  if (command === "rr") {
    // Check for admin permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Permission Denied")
            .setDescription("You need Administrator permission to use this command.")
        ]
      });
    }

    // First, create the roles if they don't exist
    let announcementRole = message.guild.roles.cache.find(r => r.name === "Announcement Ping");
    let giveawayRole = message.guild.roles.cache.find(r => r.name === "Giveaway Ping");

    if (!announcementRole) {
      try {
        announcementRole = await message.guild.roles.create({
          name: "Announcement Ping",
          color: "#3498DB",
          reason: "Role for announcement notifications"
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
          reason: "Role for giveaway notifications"
        });
      } catch (error) {
        console.error("Error creating Giveaway Ping role:", error);
        return message.reply("Failed to create Giveaway Ping role.");
      }
    }

    // Create the reaction roles panel
    const rolesEmbed = new EmbedBuilder()
      .setColor("#9C59B6")
      .setTitle("🐠 Aquarium Community Roles")
      .setDescription("React to the buttons below to get notification roles:")
      .addFields(
        {
          name: "📢 Announcement Ping",
          value: "Get notified for important community updates and game news",
          inline: false,
        },
        {
          name: "🎁 Giveaway Ping",
          value: "Get notified when we host aquarium-themed giveaways and events",
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
      components: [row] 
    });

    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("✅ Reaction Roles Setup")
          .setDescription("Reaction roles panel has been created!")
      ]
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
    const roleName =
      interaction.customId === "role-announcement"
        ? "Announcement Ping"
        : "Giveaway Ping";

    const role = interaction.guild.roles.cache.find((r) => r.name === roleName);

    if (!role) {
      return interaction.reply({
        content: "Role not found. Please contact an administrator.",
        ephemeral: true,
      });
    }

    try {
      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        await interaction.reply({
          content: `You no longer have the ${roleName} role.`,
          ephemeral: true,
        });
      } else {
        await interaction.member.roles.add(role);
        await interaction.reply({
          content: `You now have the ${roleName} role!`,
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error(`Error toggling role ${roleName}:`, error);
      await interaction.reply({
        content: "An error occurred while updating your roles.",
        ephemeral: true,
      });
    }
  }
});

async function setupRolesChannel(guild, roles) {
  const categories = [
    {
      name: "🏆 CLAN ZONE 🏆",
      channels: [
        { name: "💬┃clan-chat", type: ChannelType.GuildText },
        { name: "🎁┃clan-giveaways", type: ChannelType.GuildText },
        { name: "📝┃clan-vouches", type: ChannelType.GuildText },
        { name: "📜┃clan-rules", type: ChannelType.GuildText },
        { name: "🔍┃clan-logs", type: ChannelType.GuildText },
        { name: "⚔️┃clan-wars", type: ChannelType.GuildText },
        { name: "🔒┃clan-private", type: ChannelType.GuildText },
        { name: "🔊┃clan-voice", type: ChannelType.GuildVoice },
      ],
      permissions: [
        {
          role:roles.owner,
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
        { role: roles.clanOfficer, allow: ["ViewChannel", "SendMessages"] },
        { role: roles.clanMember, allow: ["ViewChannel", "SendMessages"] },
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
        { name: "⚡┃join-clan", type: ChannelType.GuildText },
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
        { name: "🐣┃huge-hatched", type: ChannelType.GuildText },
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
        { name: "🏆 Clan Wars", type: ChannelType.GuildVoice },
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


db.get("SELECT MAX(id) as max_id FROM tickets", (err, row) => {
  if (!err && row.max_id) ticketCount = row.max_id;
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "add_member") {
    try {
      if (!interaction.channel.name.startsWith('ticket-')) {
        await interaction.reply({
          content: "This command can only be used in ticket channels.",
          ephemeral: true
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
            ephemeral: true
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
        ticket => ticket.userId === interaction.user.id
      );

      if (existingTicket) {
        await interaction.reply({
          content: "You already have an open ticket! Please close your existing ticket first.",
          ephemeral: true
        });
        return;
      }

      // Check cooldown
      const cooldownKey = `ticket_cooldown_${interaction.user.id}`;
      const cooldownTime = cooldowns.get(cooldownKey);
      const now = Date.now();

      if (cooldownTime && now - cooldownTime < 300000) { // 5 minutes = 300000ms
        const remainingTime = Math.ceil((300000 - (now - cooldownTime)) / 1000 / 60);
        await interaction.reply({
          content: `Please wait ${remainingTime} minutes before creating another ticket.`,
          ephemeral: true
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
        (c) => c.name === "🎫 TICKETS 🎫" && c.type === ChannelType.GuildCategory
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
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
          },
        ],
      });

      // Add role permissions after channel creation
      const adminRole = interaction.guild.roles.cache.find(r => r.name === "Admin");
      const modRole = interaction.guild.roles.cache.find(r => r.name === "Moderator");

      if (adminRole) {
        await ticketChannel.permissionOverwrites.edit(adminRole, {
          ViewChannel: true,
          SendMessages: true,
          ManageChannels: true
        });
      }

      if (modRole) {
        await ticketChannel.permissionOverwrites.edit(modRole, {
          ViewChannel: true,
          SendMessages: true
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
          .setEmoji("🔒")
      );

      // Send welcome message and ping notifications
      const welcomeEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle("🐠 Welcome to Your Aquarium Support Ticket")
        .setDescription("Our aquarium community support team will assist you shortly.\n\n**Tips:**\n• Describe your aquarium building issue or question clearly\n• You can ping other members to add them to the ticket\n• Staff will claim the ticket when available\n• Feel free to share screenshots of your aquarium builds if relevant")
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
      collector.on('collect', async (message) => {
        try {
          const mentions = message.mentions.members;
          if (mentions.size > 0) {
            mentions.forEach(async (member) => {
              if (!member.user.bot && !ticketChannel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
                await ticketChannel.permissionOverwrites.edit(member, {
                  ViewChannel: true,
                  SendMessages: true
                });
                await ticketChannel.send({
                  embeds: [new EmbedBuilder()
                    .setColor("#00ff00")
                    .setDescription(`${member} has been added to the ticket by ${message.author}`)
                    .setTimestamp()]
                });
              }
            });
          }
        } catch (error) {
          console.error("Error in message collector:", error);
        }
      });

      await db.run(
        "INSERT INTO tickets (user_id, status) VALUES (?, ?)",
        [interaction.user.id, "open"]
      );

      tickets.set(channelName, {
        id: ticketId,
        userId: interaction.user.id,
        claimed: false,
        claimedBy: null,
        channelId: ticketChannel.id
      });

      // Save tickets to file
      saveTickets();

      await interaction.editReply({
        content: `Ticket created! Check ${ticketChannel}`
      });

    } catch (error) {
      console.error("Error creating ticket:", error);
      try {
        // Only attempt to editReply if the interaction has been deferred
        await interaction.editReply({
          content: "Failed to create ticket!"
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
          ephemeral: true
        });
        return;
      }

      if (ticket.claimed) {
        await interaction.reply({
          content: "This ticket has already been claimed!",
          ephemeral: true
        });
        return;
      }

      const isStaff = interaction.member.roles.cache.some(r => ["Admin", "Moderator"].includes(r.name));
      if (!isStaff) {
        await interaction.reply({
          content: "Only staff members can claim tickets!",
          ephemeral: true
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
            ephemeral: true 
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
          ephemeral: true
        });
        return;
      }

      const isStaff = interaction.member.roles.cache.some(r => ["Admin", "Moderator"].includes(r.name));
      const isTicketCreator = interaction.user.id === ticket.userId;

      if (!isStaff && !isTicketCreator) {
        await interaction.reply({
          content: "You don't have permission to close this ticket!",
          ephemeral: true
        });
        return;
      }

      // Reply immediately instead of deferring to avoid timeout issues
      await interaction.reply({
        content: "Closing ticket in 5 seconds...",
        ephemeral: false
      });

      db.run(
        "UPDATE tickets SET status = ? WHERE id = ?",
        ["closed", ticket.id],
        function (err) {
          if (err) {
            console.error("Error closing ticket in database:", err);
          }
        }
      );

      setTimeout(async () => {
        try {
          const channel = interaction.guild.channels.cache.get(ticket.channelId);
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
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error("Error replying to interaction:", replyError);
      }
    }
  }

  if (interaction.customId === "transcript") {
    try {
      if (!interaction.channel.name.startsWith('ticket-')) {
        await interaction.reply({
          content: "This command can only be used in ticket channels.",
          ephemeral: true
        });
        return;
      }

      const isStaff = interaction.member.roles.cache.some(r => ["Admin", "Moderator"].includes(r.name));
      if (!isStaff) {
        await interaction.reply({
          content: "Only staff members can generate transcripts!",
          ephemeral: true
        });
        return;
      }

      // Reply immediately instead of deferring
      await interaction.reply({
        content: "Generating transcript...",
        ephemeral: false
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
        .setDescription(`A transcript has been generated by ${interaction.user}`)
        .setTimestamp();

      // Update the initial reply with the embed
      try {
        await interaction.editReply({ 
          content: null,
          embeds: [transcriptEmbed] 
        });
      } catch (error) {
        console.error("Error updating reply with transcript embed:", error);
      }

      const buffer = Buffer.from(transcript, 'utf-8');
      await interaction.channel.send({
        content: "Here is the transcript:",
        files: [{
          attachment: buffer,
          name: `transcript-${interaction.channel.name}.txt`
        }]
      });

    } catch (error) {
      console.error("Error generating transcript:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "An error occurred while generating the transcript.",
            ephemeral: true
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
          content: "You don't have permission to rename tickets!"
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
        ephemeral: true 
      });

      const userId = interaction.fields.getTextInputValue("user_id");

      try {
        const member = await interaction.guild.members.fetch(userId).catch(() => null);

        if (!member) {
          await interaction.editReply("Could not find a member with that ID.");
          return;
        }

        await interaction.channel.permissionOverwrites.edit(member, {
          ViewChannel: true,
          SendMessages: true
        });

        await interaction.editReply(`${member} has been added to the ticket.`);

        await interaction.channel.send({
          embeds: [new EmbedBuilder()
            .setColor("#00ff00")
            .setDescription(`${member} has been added to the ticket by ${interaction.user}`)
            .setTimestamp()]
        });

      } catch (error) {
        console.error("Error adding member to ticket:", error);
        await interaction.editReply("Failed to add member. Make sure the ID is valid.");
      }
    } catch (error) {
      console.error("Error processing add member modal:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "An error occurred while processing your request.",
            ephemeral: true
          });
        } else {
          await interaction.editReply("An error occurred while processing your request.");
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

client.login(token);

process.on('exit', () => {
  db.close();
});