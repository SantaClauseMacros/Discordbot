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

// Leveling system data - moved to top to fix reference error
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
  botSettings = {};
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

// Voting system
let votes = new Map();
let voteCounter = 0;
try {
  const votesData = JSON.parse(fs.readFileSync('votes.json', 'utf8'));
  votes = new Map(Object.entries(votesData.votes || {}));
  voteCounter = votesData.counter || 0;
} catch (err) {
  fs.writeFileSync('votes.json', JSON.stringify({ votes: {}, counter: 0 }));
}

function saveVotes() {
  fs.writeFileSync('votes.json', JSON.stringify({ 
    votes: Object.fromEntries(votes), 
    counter: voteCounter 
  }));
}

// Invite tracking
let inviteTracker = new Map();
try {
  const inviteData = JSON.parse(fs.readFileSync('invites.json', 'utf8'));
  inviteTracker = new Map(Object.entries(inviteData));
} catch (err) {
  fs.writeFileSync('invites.json', JSON.stringify({}));
}

function saveInvites() {
  fs.writeFileSync('invites.json', JSON.stringify(Object.fromEntries(inviteTracker)));
}

// Achievements system
let achievements = new Map();
try {
  const achievementData = JSON.parse(fs.readFileSync('achievements.json', 'utf8'));
  achievements = new Map(Object.entries(achievementData));
} catch (err) {
  fs.writeFileSync('achievements.json', JSON.stringify({}));
}

function saveAchievements() {
  fs.writeFileSync('achievements.json', JSON.stringify(Object.fromEntries(achievements)));
}

const achievementList = {
  // First steps and early achievements
  'first_message': { name: 'First Steps', description: 'Send your first message', emoji: '👋', xp: 50 },
  'early_bird': { name: 'Early Bird', description: 'Send a message before 8 AM', emoji: '🌅', xp: 75 },
  'night_owl': { name: 'Night Owl', description: 'Send a message after 11 PM', emoji: '🦉', xp: 75 },
  'weekend_warrior': { name: 'Weekend Warrior', description: 'Be active on weekends', emoji: '⚔️', xp: 100 },
  
  // Level achievements
  'level_5': { name: 'Getting Started', description: 'Reach level 5', emoji: '🌟', xp: 100 },
  'level_10': { name: 'Active Member', description: 'Reach level 10', emoji: '🔥', xp: 200 },
  'level_15': { name: 'Regular', description: 'Reach level 15', emoji: '⭐', xp: 300 },
  'level_20': { name: 'Dedicated', description: 'Reach level 20', emoji: '💎', xp: 400 },
  'level_25': { name: 'Veteran', description: 'Reach level 25', emoji: '👑', xp: 500 },
  'level_30': { name: 'Elite', description: 'Reach level 30', emoji: '🏆', xp: 600 },
  'level_40': { name: 'Master', description: 'Reach level 40', emoji: '🎖️', xp: 800 },
  'level_50': { name: 'Legend', description: 'Reach level 50', emoji: '🌟', xp: 1000 },
  'level_75': { name: 'Mythical', description: 'Reach level 75', emoji: '🔮', xp: 1500 },
  'level_100': { name: 'Godlike', description: 'Reach level 100', emoji: '⚡', xp: 2000 },
  
  // Activity achievements
  'chatterer': { name: 'Chatterer', description: 'Send 100 messages', emoji: '💬', xp: 150 },
  'conversationalist': { name: 'Conversationalist', description: 'Send 500 messages', emoji: '🗣️', xp: 250 },
  'chatterbox': { name: 'Chatterbox', description: 'Send 1000 messages', emoji: '📢', xp: 400 },
  'social_butterfly': { name: 'Social Butterfly', description: 'Send 2500 messages', emoji: '🦋', xp: 600 },
  'community_pillar': { name: 'Community Pillar', description: 'Send 5000 messages', emoji: '🏛️', xp: 1000 },
  
  // Daily activity
  'daily_visitor': { name: 'Daily Visitor', description: 'Be active for 7 consecutive days', emoji: '📅', xp: 200 },
  'weekly_regular': { name: 'Weekly Regular', description: 'Be active for 30 consecutive days', emoji: '🗓️', xp: 500 },
  'monthly_member': { name: 'Monthly Member', description: 'Be active for 90 consecutive days', emoji: '📆', xp: 1000 },
  'loyal_member': { name: 'Loyal Member', description: 'Be active for 365 consecutive days', emoji: '❤️', xp: 2000 },
  
  // Social achievements
  'inviter': { name: 'Inviter', description: 'Invite 5 people to the server', emoji: '📨', xp: 250 },
  'recruiter': { name: 'Recruiter', description: 'Invite 15 people to the server', emoji: '🎯', xp: 500 },
  'ambassador': { name: 'Ambassador', description: 'Invite 30 people to the server', emoji: '👨‍💼', xp: 750 },
  'growth_catalyst': { name: 'Growth Catalyst', description: 'Invite 50 people to the server', emoji: '🚀', xp: 1000 },
  
  // Reaction and interaction achievements
  'reactor': { name: 'Reactor', description: 'React to 50 messages', emoji: '😄', xp: 100 },
  'emoji_enthusiast': { name: 'Emoji Enthusiast', description: 'Use 100 different emojis', emoji: '😍', xp: 150 },
  'mention_master': { name: 'Mention Master', description: 'Mention other users 25 times', emoji: '📣', xp: 125 },
  
  // Voting achievements
  'voter': { name: 'Voter', description: 'Participate in your first poll', emoji: '🗳️', xp: 100 },
  'poll_creator': { name: 'Poll Creator', description: 'Create your first poll', emoji: '📊', xp: 150 },
  'democratic_spirit': { name: 'Democratic Spirit', description: 'Participate in 10 polls', emoji: '🏛️', xp: 300 },
  'poll_master': { name: 'Poll Master', description: 'Create 10 polls', emoji: '📈', xp: 400 },
  'voice_of_people': { name: 'Voice of the People', description: 'Participate in 25 polls', emoji: '📢', xp: 500 },
  
  // Time-based achievements
  'speed_demon': { name: 'Speed Demon', description: 'Send 10 messages in 1 minute', emoji: '💨', xp: 200 },
  'marathon_chatter': { name: 'Marathon Chatter', description: 'Chat for 3 hours straight', emoji: '🏃‍♂️', xp: 300 },
  'persistent': { name: 'Persistent', description: 'Send messages 7 days in a row', emoji: '🔄', xp: 250 },
  
  // Special achievements
  'lucky_number': { name: 'Lucky Number', description: 'Send a message with exactly 777 characters', emoji: '🍀', xp: 777 },
  'palindrome_master': { name: 'Palindrome Master', description: 'Send a palindrome message', emoji: '🔄', xp: 200 },
  'question_asker': { name: 'Curious Mind', description: 'Ask 25 questions (messages ending with ?)', emoji: '❓', xp: 150 },
  'exclamation_enthusiast': { name: 'Enthusiastic!', description: 'Send 50 excited messages (ending with !)', emoji: '❗', xp: 125 },
  
  // Channel diversity achievements
  'channel_explorer': { name: 'Channel Explorer', description: 'Send messages in 10 different channels', emoji: '🗺️', xp: 200 },
  'omni_present': { name: 'Omnipresent', description: 'Send messages in 20 different channels', emoji: '👁️', xp: 350 },
  'channel_hopper': { name: 'Channel Hopper', description: 'Send messages in 5 channels in one day', emoji: '🦘', xp: 150 },
  
  // Gaming achievements
  'gamer': { name: 'Gamer', description: 'Mention gaming 10 times', emoji: '🎮', xp: 150 },
  'strategy_master': { name: 'Strategy Master', description: 'Discuss strategy 5 times', emoji: '🧠', xp: 200 },
  'competitive_spirit': { name: 'Competitive Spirit', description: 'Participate in gaming discussions', emoji: '🏆', xp: 175 },
  
  // Helper achievements
  'helpful_soul': { name: 'Helpful Soul', description: 'Help others 10 times', emoji: '🤝', xp: 250 },
  'problem_solver': { name: 'Problem Solver', description: 'Solve others\' problems 5 times', emoji: '🔧', xp: 300 },
  'mentor': { name: 'Mentor', description: 'Guide new members', emoji: '👨‍🏫', xp: 400 },
  
  // Content achievements
  'media_sharer': { name: 'Media Sharer', description: 'Share 25 images or videos', emoji: '📸', xp: 200 },
  'link_provider': { name: 'Link Provider', description: 'Share 50 useful links', emoji: '🔗', xp: 150 },
  'meme_lord': { name: 'Meme Lord', description: 'Share memes and get reactions', emoji: '😂', xp: 175 },
  
  // Special word achievements
  'positive_vibes': { name: 'Positive Vibes', description: 'Spread positivity 20 times', emoji: '✨', xp: 200 },
  'encourager': { name: 'Encourager', description: 'Encourage others 15 times', emoji: '💪', xp: 175 },
  'complimenter': { name: 'Complimenter', description: 'Give compliments 10 times', emoji: '🌟', xp: 150 },
  
  // Milestone achievements
  'first_week': { name: 'First Week Complete', description: 'Complete your first week in the server', emoji: '📅', xp: 150 },
  'first_month': { name: 'One Month Strong', description: 'Complete your first month in the server', emoji: '🗓️', xp: 300 },
  'anniversary': { name: 'Anniversary', description: 'Celebrate your 1-year anniversary', emoji: '🎂', xp: 1000 },
  
  // Rare achievements
  'unicorn': { name: 'Unicorn', description: 'Be the 1000th message of the day', emoji: '🦄', xp: 500 },
  'phoenix': { name: 'Phoenix', description: 'Return after 30 days of inactivity', emoji: '🔥', xp: 400 },
  'time_traveler': { name: 'Time Traveler', description: 'Send messages in every hour of the day', emoji: '⏰', xp: 600 },
  
  // Community achievements
  'event_participant': { name: 'Event Participant', description: 'Participate in server events', emoji: '🎉', xp: 250 },
  'feedback_provider': { name: 'Feedback Provider', description: 'Provide constructive feedback', emoji: '💭', xp: 200 },
  'suggestion_maker': { name: 'Suggestion Maker', description: 'Make helpful suggestions', emoji: '💡', xp: 175 }
};

function saveTickets() {
  fs.writeFileSync('tickets.json', JSON.stringify(Object.fromEntries(tickets)));
}

db.get("SELECT MAX(id) as max_id FROM tickets", (err, row) => {
  if (!err && row.max_id) ticketCount = row.max_id;
});

// Helper function to check if user has required role
function hasRequiredRole(member, requiredLevel) {
  const guildSettings = serverSettings[member.guild.id] || {};

  // Server owner always has all permissions
  if (member.id === member.guild.ownerId) return true;

  // Check custom set roles first
  if (requiredLevel === 'owner') {
    return guildSettings.ownerRoleId && member.roles.cache.has(guildSettings.ownerRoleId);
  }

  if (requiredLevel === 'admin') {
    const hasOwnerRole = guildSettings.ownerRoleId && member.roles.cache.has(guildSettings.ownerRoleId);
    const hasAdminRole = guildSettings.adminRoleId && member.roles.cache.has(guildSettings.adminRoleId);
    return hasOwnerRole || hasAdminRole;
  }

  if (requiredLevel === 'mod') {
    const hasOwnerRole = guildSettings.ownerRoleId && member.roles.cache.has(guildSettings.ownerRoleId);
    const hasAdminRole = guildSettings.adminRoleId && member.roles.cache.has(guildSettings.adminRoleId);
    const hasModRole = guildSettings.modRoleId && member.roles.cache.has(guildSettings.modRoleId);
    return hasOwnerRole || hasAdminRole || hasModRole;
  }

  // Fall back to default role names if custom roles aren't set
  const roleNames = [];
  if (requiredLevel === 'owner') roleNames.push('Owner');
  if (requiredLevel === 'admin') roleNames.push('Owner', 'Admin');
  if (requiredLevel === 'mod') roleNames.push('Owner', 'Admin', 'Moderator');

  return member.roles.cache.some(role => roleNames.includes(role.name));
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
  const userData = userLevels.get(userKey) || { xp: 0, level: 1, totalXP: 0, messages: 0 };

  // Check for first message achievement
  if (userData.messages === 0) {
    checkAchievement(userId, guildId, 'first_message', message);
  }

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

  // If user leveled up, send level up message and check achievements
  if (leveledUp) {
    userData.level = newLevel;

    // Check level achievements
    if (newLevel === 5) checkAchievement(userId, guildId, 'level_5', message);
    if (newLevel === 10) checkAchievement(userId, guildId, 'level_10', message);
    if (newLevel === 15) checkAchievement(userId, guildId, 'level_15', message);
    if (newLevel === 20) checkAchievement(userId, guildId, 'level_20', message);
    if (newLevel === 25) checkAchievement(userId, guildId, 'level_25', message);
    if (newLevel === 30) checkAchievement(userId, guildId, 'level_30', message);
    if (newLevel === 40) checkAchievement(userId, guildId, 'level_40', message);
    if (newLevel === 50) checkAchievement(userId, guildId, 'level_50', message);
    if (newLevel === 75) checkAchievement(userId, guildId, 'level_75', message);
    if (newLevel === 100) checkAchievement(userId, guildId, 'level_100', message);

    // Get guild settings
    const guildSettings = serverSettings[guildId] || {};

    // Get the level channel if set, otherwise send in current channel
    const levelChannel = guildSettings.levelChannelId 
      ? message.guild.channels.cache.get(guildSettings.levelChannelId)
      : message.channel;

    if (levelChannel) {
      const levelUpEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🔥 Level Up!')
        .setDescription(`Congratulations ${message.author}! You've reached **Level ${newLevel}**! 🎉`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '🏆 New Level', value: `${newLevel}`, inline: true },
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
      const userData = userLevels.get(userKey) || { xp: 0, level: 1, totalXP: 0, messages: 0 };
      userData.xp += achievement.xp;
      userData.totalXP += achievement.xp;
      userLevels.set(userKey, userData);
      saveLevels();

      const achievementEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 Achievement Unlocked!')
        .setDescription(`${message.author} earned: **${achievement.name}**`)
        .addFields(
          { name: 'Description', value: achievement.description, inline: true },
          { name: 'Bonus XP', value: `+${achievement.xp}`, inline: true }
        )
        .setTimestamp();

      message.channel.send({ embeds: [achievementEmbed] }).catch(error => {
        console.error('Error sending achievement message:', error);
      });
    }
  }
}

// Enhanced achievement checking functions
function checkMessageBasedAchievements(userId, guildId, message) {
  const userKey = `${userId}-${guildId}`;
  const userData = userLevels.get(userKey) || { xp: 0, level: 1, totalXP: 0, messages: 0 };
  const userAchievements = achievements.get(userKey) || [];
  
  const messageContent = message.content.toLowerCase();
  const messageLength = message.content.length;
  const currentHour = new Date().getHours();
  const currentDay = new Date().getDay(); // 0 = Sunday, 6 = Saturday
  
  // Time-based achievements
  if (currentHour < 8 && !userAchievements.includes('early_bird')) {
    checkAchievement(userId, guildId, 'early_bird', message);
  }
  
  if (currentHour >= 23 && !userAchievements.includes('night_owl')) {
    checkAchievement(userId, guildId, 'night_owl', message);
  }
  
  if ((currentDay === 0 || currentDay === 6) && !userAchievements.includes('weekend_warrior')) {
    checkAchievement(userId, guildId, 'weekend_warrior', message);
  }
  
  // Message count achievements
  if (userData.messages >= 100 && !userAchievements.includes('chatterer')) {
    checkAchievement(userId, guildId, 'chatterer', message);
  }
  
  if (userData.messages >= 500 && !userAchievements.includes('conversationalist')) {
    checkAchievement(userId, guildId, 'conversationalist', message);
  }
  
  if (userData.messages >= 1000 && !userAchievements.includes('chatterbox')) {
    checkAchievement(userId, guildId, 'chatterbox', message);
  }
  
  if (userData.messages >= 2500 && !userAchievements.includes('social_butterfly')) {
    checkAchievement(userId, guildId, 'social_butterfly', message);
  }
  
  if (userData.messages >= 5000 && !userAchievements.includes('community_pillar')) {
    checkAchievement(userId, guildId, 'community_pillar', message);
  }
  
  // Special message content achievements
  if (messageLength === 777 && !userAchievements.includes('lucky_number')) {
    checkAchievement(userId, guildId, 'lucky_number', message);
  }
  
  // Check for palindrome (simple check for words)
  const cleanMessage = messageContent.replace(/[^a-z]/g, '');
  if (cleanMessage.length > 3 && cleanMessage === cleanMessage.split('').reverse().join('') && !userAchievements.includes('palindrome_master')) {
    checkAchievement(userId, guildId, 'palindrome_master', message);
  }
  
  // Question and exclamation achievements
  if (message.content.endsWith('?')) {
    const questionCount = (userData.questionCount || 0) + 1;
    userData.questionCount = questionCount;
    userLevels.set(userKey, userData);
    
    if (questionCount >= 25 && !userAchievements.includes('question_asker')) {
      checkAchievement(userId, guildId, 'question_asker', message);
    }
  }
  
  if (message.content.endsWith('!')) {
    const exclamationCount = (userData.exclamationCount || 0) + 1;
    userData.exclamationCount = exclamationCount;
    userLevels.set(userKey, userData);
    
    if (exclamationCount >= 50 && !userAchievements.includes('exclamation_enthusiast')) {
      checkAchievement(userId, guildId, 'exclamation_enthusiast', message);
    }
  }
  
  // Gaming-related achievements
  if (messageContent.includes('gaming') || messageContent.includes('game') || messageContent.includes('play')) {
    const gamingCount = (userData.gamingCount || 0) + 1;
    userData.gamingCount = gamingCount;
    userLevels.set(userKey, userData);
    
    if (gamingCount >= 10 && !userAchievements.includes('gamer')) {
      checkAchievement(userId, guildId, 'gamer', message);
    }
  }
  
  // Positive vibes achievements
  const positiveWords = ['thanks', 'thank you', 'awesome', 'amazing', 'great', 'wonderful', 'fantastic', 'good job', 'well done', 'congratulations', 'congrats'];
  if (positiveWords.some(word => messageContent.includes(word))) {
    const positiveCount = (userData.positiveCount || 0) + 1;
    userData.positiveCount = positiveCount;
    userLevels.set(userKey, userData);
    
    if (positiveCount >= 20 && !userAchievements.includes('positive_vibes')) {
      checkAchievement(userId, guildId, 'positive_vibes', message);
    }
  }
  
  // Channel diversity tracking
  if (!userData.channelsUsed) userData.channelsUsed = new Set();
  userData.channelsUsed.add(message.channel.id);
  
  const channelCount = userData.channelsUsed.size;
  if (channelCount >= 10 && !userAchievements.includes('channel_explorer')) {
    checkAchievement(userId, guildId, 'channel_explorer', message);
  }
  
  if (channelCount >= 20 && !userAchievements.includes('omni_present')) {
    checkAchievement(userId, guildId, 'omni_present', message);
  }
  
  userLevels.set(userKey, userData);
}

const token = "MTQwOTkyNDQ0OTM1NjA5MTQ1Mg.G5dMpD.GJW4XtOC8xhXOYgKzSjN-8pUXSbzSx5YnOjVnQ";

const client = new Client({
  intents: Object.values(GatewayIntentBits),
  partials: Object.values(Partials),
  allowedMentions: { parse: ['users', 'roles'], repliedUser: true },
  restTimeOffset: 0,
  failIfNotExists: false,
  presence: {
    activities: [{ name: `Skull`, type: ActivityType.Playing }],
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

  // Cache invites for tracking
  for (const guild of client.guilds.cache.values()) {
    try {
      const guildInvites = await guild.invites.fetch();
      const inviteMap = new Map();
      guildInvites.forEach(invite => {
        inviteMap.set(invite.code, {
          uses: invite.uses,
          inviterId: invite.inviter?.id
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
      { name: `${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)} gamers`, type: ActivityType.Watching },
      { name: `${client.guilds.cache.size} gaming communities`, type: ActivityType.Competing }
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
    // Track invites
    const newInvites = await member.guild.invites.fetch();
    const oldInvites = inviteTracker.get(member.guild.id) || new Map();
    
    let inviterData = null;
    for (const [code, invite] of newInvites) {
      const oldInvite = oldInvites.get(code);
      if (oldInvite && invite.uses > oldInvite.uses) {
        inviterData = {
          code: code,
          inviterId: invite.inviter.id,
          inviterTag: invite.inviter.tag
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
        if (totalInvites >= 5 && !inviterAchievements.includes('inviter')) {
          const fakeMessage = {
            author: invite.inviter,
            channel: member.guild.channels.cache.find(c => c.type === ChannelType.GuildText),
            guild: member.guild
          };
          if (fakeMessage.channel) {
            checkAchievement(invite.inviter.id, member.guild.id, 'inviter', fakeMessage);
          }
        }
        
        break;
      }
    }
    
    // Update cached invites
    const inviteMap = new Map();
    newInvites.forEach(invite => {
      inviteMap.set(invite.code, {
        uses: invite.uses,
        inviterId: invite.inviter?.id
      });
    });
    inviteTracker.set(member.guild.id, inviteMap);
    saveInvites();

    // Get guild settings
    const guildSettings = serverSettings[member.guild.id] || {};

    // Use custom welcome channel if set, otherwise find by default name
    const welcomeChannel = guildSettings.welcomeChannelId 
      ? member.guild.channels.cache.get(guildSettings.welcomeChannelId)
      : member.guild.channels.cache.find((channel) => channel.name === "👋┃welcome");

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
          inline: true
        });
      }

      welcomeChannel.send({ embeds: [welcomeEmbed] });
    }

    // Use custom member role if set, otherwise fall back to default "Member" role
    let memberRole = null;

    if (guildSettings.memberRoleId) {
      memberRole = member.guild.roles.cache.get(guildSettings.memberRoleId);
    } else {
      memberRole = member.guild.roles.cache.find((role) => role.name === "Member");
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

    updateMemberCountChannels();
  } catch (error) {
    console.error("Error in welcoming new member:", error);
  }
});

client.on("guildMemberRemove", async (member) => {
  updateMemberCountChannels();
});

// Handle reactions for vote updates
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  
  // Handle vote reactions
  const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
  if (reactions.includes(reaction.emoji.name)) {
    await updateVoteMessage(reaction, user, 'add');
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot) return;
  
  // Handle vote reactions
  const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
  if (reactions.includes(reaction.emoji.name)) {
    await updateVoteMessage(reaction, user, 'remove');
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
    
    const reactionIndex = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'].indexOf(reaction.emoji.name);
    if (reactionIndex === -1 || reactionIndex >= voteData.options.length) return;
    
    // Update vote data
    if (action === 'add') {
      // Check if user already voted
      if (voteData.votes.has(user.id)) {
        // Remove their old vote
        const oldChoice = voteData.votes.get(user.id);
        // Remove reaction from old choice if different
        if (oldChoice !== reactionIndex) {
          try {
            const oldReaction = reaction.message.reactions.cache.get(['1️⃣', '2️⃣', '3️⃣', '4️⃣'][oldChoice]);
            if (oldReaction) {
              await oldReaction.users.remove(user.id);
            }
          } catch (error) {
            console.error('Error removing old reaction:', error);
          }
        }
      }
      voteData.votes.set(user.id, reactionIndex);
    } else if (action === 'remove') {
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
      const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
      return {
        name: `${index + 1}️⃣ ${option}`,
        value: `${voteCount} votes (${percentage}%)`,
        inline: true
      };
    });
    
    const updatedEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`📊 Poll #${voteId}`)
      .setDescription(voteData.question)
      .addFields(updatedFields)
      .setFooter({ text: `Use !vote participate ${voteId} to vote | Created by ${reaction.message.guild.members.cache.get(voteData.createdBy)?.user.tag || 'Unknown'}` })
      .setTimestamp();
    
    await reaction.message.edit({ embeds: [updatedEmbed] });
    
  } catch (error) {
    console.error('Error updating vote message:', error);
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
      .setDescription(`Message by ${message.author} was deleted in ${message.channel}`)
      .addFields(
        { name: "Content", value: message.content.length > 1024 ? message.content.substring(0, 1021) + "..." : message.content },
        { name: "Channel", value: `${message.channel}`, inline: true },
        { name: "Author", value: `${message.author}`, inline: true }
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send delete log:', err));
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
      .setDescription(`Message by ${oldMessage.author} was edited in ${oldMessage.channel}`)
      .addFields(
        { name: "Before", value: (oldMessage.content || "No content").length > 512 ? (oldMessage.content || "No content").substring(0, 509) + "..." : (oldMessage.content || "No content") },
        { name: "After", value: (newMessage.content || "No content").length > 512 ? (newMessage.content || "No content").substring(0, 509) + "..." : (newMessage.content || "No content") },
        { name: "Channel", value: `${oldMessage.channel}`, inline: true },
        { name: "Author", value: `${oldMessage.author}`, inline: true }
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send edit log:', err));
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const logsChannel = getLogsChannel(oldMember.guild);
  if (!logsChannel) return;

  const oldRoles = oldMember.roles.cache.map((role) => role.name).join(", ") || "None";
  const newRoles = newMember.roles.cache.map((role) => role.name).join(", ") || "None";

  if (oldRoles !== newRoles) {
    const logEmbed = new EmbedBuilder()
      .setColor("#0000FF")
      .setTitle("👤 Member Roles Updated")
      .setDescription(`Roles updated for ${newMember.user.tag}`)
      .addFields(
        { name: "Old Roles", value: oldRoles.length > 1024 ? oldRoles.substring(0, 1021) + "..." : oldRoles },
        { name: "New Roles", value: newRoles.length > 1024 ? newRoles.substring(0, 1021) + "..." : newRoles },
        { name: "Member", value: `${newMember.user}`, inline: true },
        { name: "User ID", value: newMember.id, inline: true }
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send member update log:', err));
  }

  // Log nickname changes
  if (oldMember.nickname !== newMember.nickname) {
    const nicknameEmbed = new EmbedBuilder()
      .setColor("#9B59B6")
      .setTitle("📝 Nickname Changed")
      .setDescription(`${newMember.user.tag}'s nickname was changed`)
      .addFields(
        { name: "Old Nickname", value: oldMember.nickname || "None", inline: true },
        { name: "New Nickname", value: newMember.nickname || "None", inline: true },
        { name: "Member", value: `${newMember.user}`, inline: true }
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [nicknameEmbed] }).catch(err => console.error('Failed to send nickname log:', err));
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
        { name: "Category", value: channel.parent ? channel.parent.name : "None", inline: true },
        { name: "Channel ID", value: channel.id, inline: true }
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send channel create log:', err));
  }
});

client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;

  const logsChannel = getLogsChannel(channel.guild);
  if (logsChannel && channel.id !== logsChannel.id) { // Don't log if logs channel itself is deleted
    const logEmbed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("🗑️ Channel Deleted")
      .setDescription(`A channel was deleted`)
      .addFields(
        { name: "Channel Name", value: channel.name, inline: true },
        { name: "Type", value: channel.type.toString(), inline: true },
        { name: "Category", value: channel.parent ? channel.parent.name : "None", inline: true },
        { name: "Channel ID", value: channel.id, inline: true }
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send channel delete log:', err));
  }
});

client.on("channelUpdate", async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  const logsChannel = getLogsChannel(newChannel.guild);
  if (logsChannel) {
    const changes = [];

    if (oldChannel.name !== newChannel.name) {
      changes.push({ name: "Name Changed", value: `${oldChannel.name} → ${newChannel.name}` });
    }

    if (oldChannel.topic !== newChannel.topic) {
      changes.push({ name: "Topic Changed", value: `${oldChannel.topic || "None"} → ${newChannel.topic || "None"}` });
    }

    if (oldChannel.parent?.id !== newChannel.parent?.id) {
      changes.push({ name: "Category Changed", value: `${oldChannel.parent?.name || "None"} → ${newChannel.parent?.name || "None"}` });
    }

    if (changes.length > 0) {
      const logEmbed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle("✏️ Channel Updated")
        .setDescription(`Channel ${newChannel} was modified`)
        .addFields(changes)
        .addFields({ name: "Channel ID", value: newChannel.id, inline: true })
        .setTimestamp();

      await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send channel update log:', err));
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
        { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
        { name: "Role ID", value: role.id, inline: true }
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send role create log:', err));
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
        { name: "Role ID", value: role.id, inline: true }
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send role delete log:', err));
  }
});

client.on("roleUpdate", async (oldRole, newRole) => {
  const logsChannel = getLogsChannel(newRole.guild);
  if (logsChannel) {
    const changes = [];

    if (oldRole.name !== newRole.name) {
      changes.push({ name: "Name Changed", value: `${oldRole.name} → ${newRole.name}` });
    }

    if (oldRole.hexColor !== newRole.hexColor) {
      changes.push({ name: "Color Changed", value: `${oldRole.hexColor} → ${newRole.hexColor}` });
    }

    if (oldRole.hoist !== newRole.hoist) {
      changes.push({ name: "Hoisted Changed", value: `${oldRole.hoist ? "Yes" : "No"} → ${newRole.hoist ? "Yes" : "No"}` });
    }

    if (oldRole.mentionable !== newRole.mentionable) {
      changes.push({ name: "Mentionable Changed", value: `${oldRole.mentionable ? "Yes" : "No"} → ${newRole.mentionable ? "Yes" : "No"}` });
    }

    if (changes.length > 0) {
      const logEmbed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle("🎭 Role Updated")
        .setDescription(`Role ${newRole} was modified`)
        .addFields(changes)
        .addFields({ name: "Role ID", value: newRole.id, inline: true })
        .setTimestamp();

      await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send role update log:', err));
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
      const target = newOverwrite.type === 0 ? newChannel.guild.roles.cache.get(id) : newChannel.guild.members.cache.get(id);
      if (target) {
        const logEmbed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("🔐 Channel Permissions Added")
          .setDescription(`New permissions set for ${newChannel}`)
          .addFields(
            { name: "Target", value: target.toString(), inline: true },
            { name: "Type", value: newOverwrite.type === 0 ? "Role" : "Member", inline: true },
            { name: "Allow", value: newOverwrite.allow.toArray().join(", ") || "None", inline: false },
            { name: "Deny", value: newOverwrite.deny.toArray().join(", ") || "None", inline: false }
          )
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send permission add log:', err));
      }
    } else if (oldOverwrite.allow.bitfield !== newOverwrite.allow.bitfield || oldOverwrite.deny.bitfield !== newOverwrite.deny.bitfield) {
      // Permission overwrite modified
      const target = newOverwrite.type === 0 ? newChannel.guild.roles.cache.get(id) : newChannel.guild.members.cache.get(id);
      if (target) {
        const logEmbed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle("🔐 Channel Permissions Updated")
          .setDescription(`Permissions updated for ${newChannel}`)
          .addFields(
            { name: "Target", value: target.toString(), inline: true },
            { name: "Type", value: newOverwrite.type === 0 ? "Role" : "Member", inline: true },
            { name: "New Allow", value: newOverwrite.allow.toArray().join(", ") || "None", inline: false },
            { name: "New Deny", value: newOverwrite.deny.toArray().join(", ") || "None", inline: false }
          )
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send permission update log:', err));
      }
    }
  });

  // Find removed overwrites
  oldOverwrites.forEach(async (oldOverwrite, id) => {
    if (!newOverwrites.has(id)) {
      // Permission overwrite removed
      const target = oldOverwrite.type === 0 ? newChannel.guild.roles.cache.get(id) : newChannel.guild.members.cache.get(id);
      if (target) {
        const logEmbed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🔐 Channel Permissions Removed")
          .setDescription(`Permissions removed for ${newChannel}`)
          .addFields(
            { name: "Target", value: target.toString(), inline: true },
            { name: "Type", value: oldOverwrite.type === 0 ? "Role" : "Member", inline: true }
          )
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send permission remove log:', err));
      }
    }
  });
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

  // Removed the !serversetup command

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
      ["Owner", "Admin", "Moderator"].includes(r.name),
    ) || message.author.id === message.guild.ownerId;

    if (!isBotCommandsChannel && !hasPermission) {
      return message.reply(
        "This command can only be used in the bot-commands channel or by staff members.",
      );
    }

    const helpEmbed = new EmbedBuilder()
      .setColor("#FF4500")
      .setTitle("🔥 Flamin' Hot Games Bot - Command Help")
      .setDescription("**Welcome to your ultimate Discord community management bot!**\n\nUse the commands below to manage your server, engage your community, and track activity.")
      .addFields(
        {
          name: "ℹ️ **General & Utility**",
          value: "```\n!help          - Show this help menu\n!ping          - Check bot response time\n!rules         - Display server rules\n!avatar [@user] - Show user avatar\n!servericon    - Show server icon```",
          inline: false,
        },
        {
          name: "🔨 **Moderation Commands** (Staff Only)",
          value: "```\n!kick @user [reason]      - Kick a member\n!ban @user [reason]       - Ban a member\n!unban <userID> [reason]  - Unban a member\n!warn @user [reason]      - Warn a member\n!mute @user <time> [reason] - Timeout member\n!unmute @user             - Remove timeout\n!purge <1-100>            - Delete messages\n!lock / !unlock           - Lock/unlock channel```",
          inline: false,
        },
        {
          name: "🛠️ **Administration** (Admin Only)",
          value: "```\n!editpanel \"Title\" Description - Edit support panel\n!deletealltickets            - Delete all tickets\n!toggleautomod               - Toggle auto-moderation\n!togglebadwords              - Toggle profanity filter\n!togglecaps                  - Toggle caps filter\n!togglespam                  - Toggle spam protection```",
          inline: false,
        },
        {
          name: "⚙️ **Server Configuration** (Admin Only)",
          value: "```\n!set allmemberschannel #ch - Total member count\n!set memberschannel #ch    - Human member count\n!set botschannel #ch       - Bot member count\n!set welcomechannel #ch    - Welcome messages\n!set logschannel #ch       - Server logs\n!set ownerrole @role       - Owner role (Owner only)\n!set adminrole @role       - Admin role (Owner only)\n!set modrole @role         - Moderator role\n!set memberrole @role      - Default member role```",
          inline: false,
        },
        {
          name: "🔥 **Leveling & XP System**",
          value: "```\n!lvl [@user]              - View level & XP stats\n!leaderboard              - Top server members\n!achievements [@user]     - View achievements\n!allachievements          - All available achievements\n!givexp @user <amount>    - Give XP (Owner only)\n!resetlevel @user         - Reset level (Owner only)\n!setlvlchannel #ch        - Set level notifications```",
          inline: false,
        },
        {
          name: "📊 **Voting & Polls**",
          value: "```\n!vote create \"Question\" \"Option1\" \"Option2\" - Create poll\n!vote participate <ID>     - Vote in a poll\n!vote end <ID>             - End a poll\n!vote                      - Show voting help```",
          inline: false,
        },
        {
          name: "📨 **Invite Tracking**",
          value: "```\n!invite stats [@user]     - View invite statistics\n!invite leaderboard       - Top server inviters\n!invite tracker           - Tracker help & info```",
          inline: false,
        },
        {
          name: "🎮 **Community Features**",
          value: "```\n!rr                       - Setup reaction roles (Admin)\n!poll <question>          - Quick poll with 👍/👎```",
          inline: false,
        }
      )
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({ 
        text: "💡 Tip: All commands start with ! | For detailed help on a specific feature, use the individual help commands",
        iconURL: message.guild.iconURL()
      })
      .setTimestamp();

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
          value: "Don't spam messages, emotes, or mentions. Keep chat as clean as your gameplay!",
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
      .setColor('#FF4500')
      .setTitle('🔥 User Level & Experience')
      .setDescription(`**${target.username}**'s progress:`)
      .addFields(
        { name: '🏆 Level', value: `${userData.level}`, inline: true },
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
      .setColor('#FF4500')
      .setTitle('🏆 Server Leaderboard')
      .setDescription('Here are the top users in this community:')
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
    if (!hasRequiredRole(message.member, 'owner')) {
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
    if (!hasRequiredRole(message.member, 'owner')) {
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

  if (command === "vote") {
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "create") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply("You need Manage Messages permission to create polls.");
      }

      // Parse the command arguments
      const content = message.content.slice(prefix.length + 5).trim(); // Remove "!vote"
      const matches = content.match(/create\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"(?:\s+"([^"]+)")?(?:\s+"([^"]+)")?/);

      if (!matches) {
        return message.reply('Usage: !vote create "Question" "Option1" "Option2" ["Option3"] ["Option4"]');
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
        channelId: message.channel.id
      };

      votes.set(voteId.toString(), voteData);
      saveVotes();
      
      // Check poll creation achievements
      const userKey = `${message.author.id}-${message.guild.id}`;
      const userData = userLevels.get(userKey) || { xp: 0, level: 1, totalXP: 0, messages: 0 };
      const userAchievements = achievements.get(userKey) || [];
      
      // First poll creation
      if (!userAchievements.includes('poll_creator')) {
        checkAchievement(message.author.id, message.guild.id, 'poll_creator', message);
      }
      
      // Track polls created
      const pollsCreated = (userData.pollsCreated || 0) + 1;
      userData.pollsCreated = pollsCreated;
      userLevels.set(userKey, userData);
      saveLevels();
      
      // Check poll creation milestones
      if (pollsCreated >= 10 && !userAchievements.includes('poll_master')) {
        checkAchievement(message.author.id, message.guild.id, 'poll_master', message);
      }

      const voteEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`📊 Poll #${voteId}`)
        .setDescription(question)
        .addFields(
          options.map((option, index) => ({
            name: `${index + 1}️⃣ ${option}`,
            value: '0 votes (0%)',
            inline: true
          }))
        )
        .setFooter({ text: `Use !vote participate ${voteId} to vote | Created by ${message.author.tag}` })
        .setTimestamp();

      const pollMessage = await message.channel.send({ embeds: [voteEmbed] });
      
      // Add reactions
      const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(reactions[i]);
      }

      voteData.messageId = pollMessage.id;
      votes.set(voteId.toString(), voteData);
      saveVotes();

    } else if (subCommand === "participate") {
      const voteId = args[1];
      if (!voteId) {
        return message.reply("Please specify a vote ID. Usage: !vote participate <vote_id>");
      }

      const voteData = votes.get(voteId);
      if (!voteData || !voteData.active) {
        return message.reply("Vote not found or no longer active.");
      }

      // Check if user already voted
      if (voteData.votes.has(message.author.id)) {
        return message.reply("You have already voted in this poll!");
      }

      const optionsText = voteData.options.map((option, index) => `${index + 1}. ${option}`).join('\n');

      const participateEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Vote in Poll #${voteId}`)
        .setDescription(`**${voteData.question}**\n\n${optionsText}`)
        .setFooter({ text: 'Reply with the number of your choice (1-' + voteData.options.length + ')' });

      await message.reply({ embeds: [participateEmbed] });

      const filter = (m) => m.author.id === message.author.id && /^[1-4]$/.test(m.content);
      const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

      collector.on('collect', (m) => {
        const choice = parseInt(m.content) - 1;
        if (choice >= 0 && choice < voteData.options.length) {
          voteData.votes.set(message.author.id, choice);
          votes.set(voteId, voteData);
          saveVotes();
          
          // Check voting achievements
          const userKey = `${message.author.id}-${message.guild.id}`;
          const userData = userLevels.get(userKey) || { xp: 0, level: 1, totalXP: 0, messages: 0 };
          const userAchievements = achievements.get(userKey) || [];
          
          // First vote achievement
          if (!userAchievements.includes('voter')) {
            checkAchievement(message.author.id, message.guild.id, 'voter', message);
          }
          
          // Track vote participation
          const voteCount = (userData.votesParticipated || 0) + 1;
          userData.votesParticipated = voteCount;
          userLevels.set(userKey, userData);
          saveLevels();
          
          // Check vote participation milestones
          if (voteCount >= 10 && !userAchievements.includes('democratic_spirit')) {
            checkAchievement(message.author.id, message.guild.id, 'democratic_spirit', message);
          }
          
          if (voteCount >= 25 && !userAchievements.includes('voice_of_people')) {
            checkAchievement(message.author.id, message.guild.id, 'voice_of_people', message);
          }

          m.reply(`✅ Your vote for "${voteData.options[choice]}" has been recorded!`);
        } else {
          m.reply("Invalid choice!");
        }
      });

      collector.on('end', (collected) => {
        if (collected.size === 0) {
          message.followUp("❌ Vote timed out.");
        }
      });

    } else if (subCommand === "end") {
      const voteId = args[1];
      if (!voteId) {
        return message.reply("Please specify a vote ID. Usage: !vote end <vote_id>");
      }

      const voteData = votes.get(voteId);
      if (!voteData) {
        return message.reply("Vote not found.");
      }

      if (voteData.createdBy !== message.author.id && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply("You can only end votes you created or you need Manage Messages permission.");
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
        const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
        return {
          name: `${index + 1}️⃣ ${option}`,
          value: `${voteCount} votes (${percentage}%)`,
          inline: true
        };
      });

      const resultsEmbed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle(`📊 Poll #${voteId} Results`)
        .setDescription(`**${voteData.question}**\n\nTotal Votes: ${totalVotes}`)
        .addFields(resultFields)
        .setFooter({ text: 'Poll ended' })
        .setTimestamp();

      message.channel.send({ embeds: [resultsEmbed] });

    } else {
      const voteHelpEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Voting System Help')
        .setDescription('Available voting commands:')
        .addFields(
          { name: 'Create Poll', value: '!vote create "Question" "Option1" "Option2" ["Option3"] ["Option4"]', inline: false },
          { name: 'Participate', value: '!vote participate <vote_id>', inline: false },
          { name: 'End Poll', value: '!vote end <vote_id>', inline: false }
        )
        .setFooter({ text: 'Polls support 2-4 options' });

      message.channel.send({ embeds: [voteHelpEmbed] });
    }
  }

  if (command === "achievements") {
    const target = message.mentions.users.first() || message.author;
    const userKey = `${target.id}-${message.guild.id}`;
    const userAchievements = achievements.get(userKey) || [];

    if (userAchievements.length === 0) {
      return message.channel.send(`${target.username} hasn't unlocked any achievements yet!`);
    }

    const achievementFields = userAchievements.map(achievementId => {
      const achievement = achievementList[achievementId];
      return achievement ? {
        name: `${achievement.emoji} ${achievement.name}`,
        value: `${achievement.description} (+${achievement.xp} XP)`,
        inline: true
      } : null;
    }).filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle(`🏆 ${target.username}'s Achievements`)
      .setDescription(`**${userAchievements.length}/${Object.keys(achievementList).length}** achievements unlocked`)
      .addFields(achievementFields)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  if (command === "allachievements" || command === "achievementslist") {
    const achievementCategories = {
      "🚀 Getting Started": ['first_message', 'early_bird', 'night_owl', 'weekend_warrior'],
      "⭐ Level Milestones": ['level_5', 'level_10', 'level_15', 'level_20', 'level_25', 'level_30', 'level_40', 'level_50', 'level_75', 'level_100'],
      "💬 Activity": ['chatterer', 'conversationalist', 'chatterbox', 'social_butterfly', 'community_pillar'],
      "📅 Daily Streaks": ['daily_visitor', 'weekly_regular', 'monthly_member', 'loyal_member'],
      "👥 Social & Invites": ['inviter', 'recruiter', 'ambassador', 'growth_catalyst'],
      "😄 Reactions & Fun": ['reactor', 'emoji_enthusiast', 'mention_master', 'meme_lord'],
      "🗳️ Voting & Polls": ['voter', 'poll_creator', 'democratic_spirit', 'poll_master', 'voice_of_people'],
      "⏰ Time-Based": ['speed_demon', 'marathon_chatter', 'persistent', 'time_traveler'],
      "🎯 Special": ['lucky_number', 'palindrome_master', 'question_asker', 'exclamation_enthusiast'],
      "🗺️ Exploration": ['channel_explorer', 'omni_present', 'channel_hopper'],
      "🎮 Gaming": ['gamer', 'strategy_master', 'competitive_spirit'],
      "🤝 Helper": ['helpful_soul', 'problem_solver', 'mentor'],
      "📸 Content": ['media_sharer', 'link_provider'],
      "✨ Positivity": ['positive_vibes', 'encourager', 'complimenter'],
      "🎉 Milestones": ['first_week', 'first_month', 'anniversary'],
      "🦄 Rare": ['unicorn', 'phoenix'],
      "🏛️ Community": ['event_participant', 'feedback_provider', 'suggestion_maker']
    };

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏆 All Available Achievements')
      .setDescription(`Here are all ${Object.keys(achievementList).length} achievements you can unlock:`)
      .setTimestamp();

    for (const [category, achievementIds] of Object.entries(achievementCategories)) {
      const categoryAchievements = achievementIds
        .filter(id => achievementList[id])
        .map(id => {
          const achievement = achievementList[id];
          return `${achievement.emoji} **${achievement.name}** - ${achievement.description} (+${achievement.xp} XP)`;
        })
        .join('\n');

      if (categoryAchievements) {
        embed.addFields({
          name: category,
          value: categoryAchievements.length > 1024 ? categoryAchievements.substring(0, 1021) + "..." : categoryAchievements,
          inline: false
        });
      }
    }

    embed.setFooter({ text: "Use !achievements [@user] to see someone's unlocked achievements" });
    message.channel.send({ embeds: [embed] });
  }

  if (command === "invite") {
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "tracker") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply("You need Manage Server permission to use invite tracker commands.");
      }

      const trackerEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📨 Invite Tracker')
        .setDescription('Invite tracking is automatically enabled! Here are the available commands:')
        .addFields(
          { name: '!invite stats', value: 'Show your invite statistics', inline: false },
          { name: '!invite stats @user', value: 'Show someone else\'s invite statistics', inline: false },
          { name: '!invite leaderboard', value: 'Show top inviters in the server', inline: false }
        )
        .setFooter({ text: 'Invites are automatically tracked when members join' });

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
              channel: invite.channel?.name || 'Unknown'
            });
          }
        }

        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle(`📊 Invite Stats for ${target.username}`)
          .setDescription(`**Total Invites:** ${totalInvites}`)
          .setThumbnail(target.displayAvatarURL({ dynamic: true }))
          .setTimestamp();

        if (inviteDetails.length > 0) {
          const detailsText = inviteDetails.map(inv => `• ${inv.code}: ${inv.uses} uses (${inv.channel})`).join('\n');
          embed.addFields({ name: 'Invite Details', value: detailsText.slice(0, 1024) });
        }

        message.channel.send({ embeds: [embed] });

      } catch (error) {
        console.error('Error fetching invite stats:', error);
        message.reply('Failed to fetch invite statistics.');
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
          return message.channel.send('No invite data available yet!');
        }

        let description = '';
        for (let i = 0; i < sortedInviters.length; i++) {
          const [userId, inviteCount] = sortedInviters[i];
          try {
            const user = await message.client.users.fetch(userId);
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            description += `${medal} **${user.username}** - ${inviteCount} invites\n`;
          } catch (error) {
            console.error('Error fetching user:', error);
          }
        }

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('📨 Top Inviters')
          .setDescription(description)
          .setTimestamp();

        message.channel.send({ embeds: [embed] });

      } catch (error) {
        console.error('Error fetching invite leaderboard:', error);
        message.reply('Failed to fetch invite leaderboard.');
      }

    } else {
      const inviteHelpEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📨 Invite Commands')
        .setDescription('Available invite commands:')
        .addFields(
          { name: '!invite tracker', value: 'Show invite tracker information', inline: false },
          { name: '!invite stats [@user]', value: 'Show invite statistics', inline: false },
          { name: '!invite leaderboard', value: 'Show top inviters', inline: false }
        );

      message.channel.send({ embeds: [inviteHelpEmbed] });
    }
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
    else if (subCommand === "logschannel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply("Please mention a channel to set for server logs.");
      }

      guildSettings.logsChannelId = channel.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Channel Set")
            .setDescription(`Server logs channel set to ${channel}`)
        ]
      });
    }
    else if (subCommand === "ownerrole") {
      // Only server owner can set this
      if (message.author.id !== message.guild.ownerId) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Permission Denied")
              .setDescription("Only the server owner can set the owner role.")
          ]
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
            .setDescription(`Owner role set to ${role}`)
        ]
      });
    }
    else if (subCommand === "adminrole") {
      // Only server owner can set this
      if (message.author.id !== message.guild.ownerId) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Permission Denied")
              .setDescription("Only the server owner can set the admin role.")
          ]
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
            .setDescription(`Admin role set to ${role}`)
        ]
      });
    }
    else if (subCommand === "modrole") {
      // Owner or admin can set this
      const hasOwnerRole = guildSettings.ownerRoleId && message.member.roles.cache.has(guildSettings.ownerRoleId);
      const hasAdminRole = guildSettings.adminRoleId && message.member.roles.cache.has(guildSettings.adminRoleId);

      if (message.author.id !== message.guild.ownerId && !hasOwnerRole && !hasAdminRole) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Permission Denied")
              .setDescription("Only owners and admins can set the moderator role.")
          ]
        });
      }

      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply("Please mention a role to set as the moderator role.");
      }

      guildSettings.modRoleId = role.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Role Set")
            .setDescription(`Moderator role set to ${role}`)
        ]
      });
    }
    else if (subCommand === "memberrole") {
      // Owner or admin can set this
      const hasOwnerRole = guildSettings.ownerRoleId && message.member.roles.cache.has(guildSettings.ownerRoleId);
      const hasAdminRole = guildSettings.adminRoleId && message.member.roles.cache.has(guildSettings.adminRoleId);

      if (message.author.id !== message.guild.ownerId && !hasOwnerRole && !hasAdminRole) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Permission Denied")
              .setDescription("Only owners and admins can set the member role.")
          ]
        });
      }

      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply("Please mention a role to set as the member role.");
      }

      guildSettings.memberRoleId = role.id;
      saveServerSettings();

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ Role Set")
            .setDescription(`Member role set to ${role}`)
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
          { name: "Channel Settings", value: "!set allmemberschannel #channel - Set total members count channel\n!set memberschannel #channel - Set human members count channel\n!set botschannel #channel - Set bot members count channel\n!set welcomechannel #channel - Set welcome messages channel\n!set logschannel #channel - Set server logs channel" },
          { name: "Role Settings", value: "!set ownerrole @role - Set owner role (Server Owner only)\n!set adminrole @role - Set admin role (Server Owner only)\n!set modrole @role - Set moderator role (Owner/Admin only)\n!set memberrole @role - Set member role (Owner/Admin only)" }
        )
        .setFooter({ text: "Role permissions determine who can use specific commands" });

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
        .setColor("#FF4500")
        .setTitle("🔥 Welcome to Your Flamin' Hot Games Support Ticket")
        .setDescription("Our staff team will assist you shortly.\n\n**Tips:**\n• Describe your issue or question clearly\n• You can ping other members to add them to the ticket\n• Staff will claim the ticket when available\n• Feel free to share screenshots/videos of your issues if relevant")
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

if (!token) {
  console.error('DISCORD_BOT_TOKEN environment variable is not set!');
  process.exit(1);
}

client.login(token);

process.on('exit', () => {
  db.close();
});
