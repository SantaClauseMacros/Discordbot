
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

let giveaways = {};

try {
  giveaways = JSON.parse(fs.readFileSync('giveaways.json', 'utf8'));
} catch (err) {
  giveaways = {};
}

function saveGiveaways() {
  fs.writeFileSync('giveaways.json', JSON.stringify(giveaways, null, 2));
}

async function startGiveaway(message, args) {
  // Parse time
  const timeArg = args[0];
  if (!timeArg) return message.reply("Usage: !giveaway start <time> <prize> [options]");
  
  let duration = 0;
  if (timeArg.endsWith('h')) {
    duration = parseInt(timeArg) * 60 * 60 * 1000;
  } else if (timeArg.endsWith('m')) {
    duration = parseInt(timeArg) * 60 * 1000;
  } else if (timeArg.endsWith('d')) {
    duration = parseInt(timeArg) * 24 * 60 * 60 * 1000;
  }
  
  if (duration === 0) return message.reply("Invalid time format! Use: 1h, 30m, 1d");
  
  // Parse prize
  const prizeStart = 1;
  let prizeEnd = args.findIndex((arg, i) => i > 0 && arg.startsWith('--'));
  if (prizeEnd === -1) prizeEnd = args.length;
  
  const prize = args.slice(prizeStart, prizeEnd).join(' ');
  if (!prize) return message.reply("Please specify a prize!");
  
  // Parse options
  const options = {
    winners: 1,
    image: null,
    host: message.author.id,
    requiredrole: null,
    requiredmessages: 0,
    requiredlevel: 0,
    type: 'normal',
    title: '🎉 GIVEAWAY',
    bypassroles: [],
    blacklistroles: [],
  };
  
  for (let i = prizeEnd; i < args.length; i++) {
    if (args[i] === '--winners') options.winners = parseInt(args[i + 1]);
    if (args[i] === '--image') options.image = args[i + 1];
    if (args[i] === '--requiredrole') options.requiredrole = args[i + 1].replace(/[<@&>]/g, '');
    if (args[i] === '--requiredmessages') options.requiredmessages = parseInt(args[i + 1]);
    if (args[i] === '--requiredlevel') options.requiredlevel = parseInt(args[i + 1]);
    if (args[i] === '--title') {
      const titleStart = i + 1;
      let titleEnd = args.findIndex((arg, idx) => idx > titleStart && arg.startsWith('--'));
      if (titleEnd === -1) titleEnd = args.length;
      options.title = args.slice(titleStart, titleEnd).join(' ');
    }
  }
  
  const endTime = Date.now() + duration;
  
  const embed = new EmbedBuilder()
    .setColor("#FF4500")
    .setTitle(options.title)
    .setDescription(`**Prize:** ${prize}\n\n**Winners:** ${options.winners}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>\n**Hosted by:** <@${options.host}>`)
    .setFooter({ text: `${options.winners} Winner${options.winners > 1 ? 's' : ''} | Ends at` })
    .setTimestamp(endTime);
  
  if (options.image) {
    embed.setThumbnail(options.image);
  }
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway_enter')
      .setLabel('🎉 Enter Giveaway')
      .setStyle(ButtonStyle.Success)
  );
  
  const giveawayMsg = await message.channel.send({ embeds: [embed], components: [row] });
  
  giveaways[giveawayMsg.id] = {
    messageId: giveawayMsg.id,
    channelId: message.channel.id,
    guildId: message.guild.id,
    prize: prize,
    endTime: endTime,
    winners: options.winners,
    host: options.host,
    entries: [],
    ended: false,
    options: options,
  };
  
  saveGiveaways();
  
  // Set timer to end giveaway
  setTimeout(() => endGiveaway(giveawayMsg.id), duration);
}

async function endGiveaway(messageId, client) {
  const giveaway = giveaways[messageId];
  if (!giveaway || giveaway.ended) return;
  
  giveaway.ended = true;
  
  if (giveaway.entries.length === 0) {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);
    
    const embed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("🎉 GIVEAWAY ENDED")
      .setDescription(`**Prize:** ${giveaway.prize}\n\n**Winners:** No valid entries!`)
      .setTimestamp();
    
    await message.edit({ embeds: [embed], components: [] });
    saveGiveaways();
    return;
  }
  
  // Pick winners
  const winners = [];
  const availableEntries = [...giveaway.entries];
  
  for (let i = 0; i < Math.min(giveaway.winners, availableEntries.length); i++) {
    const randomIndex = Math.floor(Math.random() * availableEntries.length);
    winners.push(availableEntries[randomIndex]);
    availableEntries.splice(randomIndex, 1);
  }
  
  const channel = await client.channels.fetch(giveaway.channelId);
  const message = await channel.messages.fetch(messageId);
  
  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("🎉 GIVEAWAY ENDED")
    .setDescription(`**Prize:** ${giveaway.prize}\n\n**Winner${winners.length > 1 ? 's' : ''}:** ${winners.map(w => `<@${w}>`).join(', ')}`)
    .setTimestamp();
  
  await message.edit({ embeds: [embed], components: [] });
  await channel.send(`🎉 Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You won **${giveaway.prize}**!`);
  
  saveGiveaways();
}

async function rerollGiveaway(messageId, client) {
  const giveaway = giveaways[messageId];
  if (!giveaway || !giveaway.ended) return { success: false, message: "Giveaway not found or not ended!" };
  
  if (giveaway.entries.length === 0) {
    return { success: false, message: "No entries to reroll!" };
  }
  
  const randomEntry = giveaway.entries[Math.floor(Math.random() * giveaway.entries.length)];
  
  const channel = await client.channels.fetch(giveaway.channelId);
  await channel.send(`🎉 New winner: <@${randomEntry}>! You won **${giveaway.prize}**!`);
  
  return { success: true };
}

module.exports = {
  startGiveaway,
  endGiveaway,
  rerollGiveaway,
  giveaways,
  saveGiveaways,
};
