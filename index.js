'use strict';

const http = require('node:http');
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} = require('discord.js');

const REQUIRED_ENV = [
  'DISCORD_TOKEN',
  'TICKET_PANEL_CHANNEL_ID',
  'SUPPORT_CATEGORY_ID',
  'TICKET_LOGS_CHANNEL_ID',
  'STAFF_ROLE_ID',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing Railway variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

const PANEL_TITLE = 'STREETS OF LA SUPPORT';
const PANEL_SELECT_ID = 'sola_ticket_category';
const CLAIM_BUTTON_ID = 'sola_ticket_claim';
const CLOSE_BUTTON_ID = 'sola_ticket_close';
const REOPEN_BUTTON_ID = 'sola_ticket_reopen';
const DELETE_BUTTON_ID = 'sola_ticket_delete';

const AUTO_CLOSE_HOURS = Number(process.env.AUTO_CLOSE_HOURS || 48);
const AUTO_CLOSE_MS = AUTO_CLOSE_HOURS * 60 * 60 * 1000;

const CATEGORIES = {
  tebex: {
    label: 'Tebex Store',
    emoji: '💎',
    channelPrefix: 'tebex-ticket',
    description: 'Missing purchases, package issues, payment questions, and Tebex support.',
  },
  general: {
    label: 'General Support',
    emoji: '🔧',
    channelPrefix: 'general-support',
    description: 'General server help, account help, Discord help, and technical support.',
  },
  report: {
    label: 'Player Report',
    emoji: '🚨',
    channelPrefix: 'player-report',
    description: 'Report rule breaks, RDM, VDM, exploiting, or serious player misconduct.',
  },
  ban: {
    label: 'BAN APPEAL',
    emoji: '🚫',
    channelPrefix: 'ban-appeal',
    description: 'Appeal a server or Discord punishment. Be honest and include useful details.',
  },
  bug: {
    label: 'IN GAME BUG',
    emoji: '🐞',
    channelPrefix: 'in-game-bug',
    description: 'Report gameplay bugs, broken scripts, missing items, or technical issues in city.',
  },
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function hasStaffRole(member) {
  return Boolean(member?.roles?.cache?.has(process.env.STAFF_ROLE_ID));
}

function sanitizeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function ticketMeta(channel) {
  try {
    if (!channel.topic || !channel.topic.startsWith('SOLA_TICKET|')) return null;
    const parts = channel.topic.split('|');
    return {
      openerId: parts[1],
      type: parts[2],
      status: parts[3] || 'open',
      claimedBy: parts[4] || '',
    };
  } catch {
    return null;
  }
}

function buildTopic(openerId, type, status = 'open', claimedBy = '') {
  return `SOLA_TICKET|${openerId}|${type}|${status}|${claimedBy}`;
}

async function nextTicketNumber(guild, type) {
  const category = CATEGORIES[type];
  const channels = guild.channels.cache.filter(
    (channel) =>
      channel.parentId === process.env.SUPPORT_CATEGORY_ID &&
      channel.type === ChannelType.GuildText &&
      channel.name.startsWith(`${category.channelPrefix}-`)
  );

  let highest = 0;
  for (const channel of channels.values()) {
    const match = channel.name.match(/-(\d+)$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

function panelPayload() {
  const background = new AttachmentBuilder('./support-background.png', {
    name: 'support-background.png',
  });

  const logo = new AttachmentBuilder('./streets-logo.png', {
    name: 'streets-logo.png',
  });

  const embed = new EmbedBuilder()
    .setColor(0x6d28d9)
    .setAuthor({
      name: 'STREETS OF LA • SUPPORT CENTER',
      iconURL: 'attachment://streets-logo.png',
    })
    .setTitle(PANEL_TITLE)
    .setDescription(
      [
        '**Welcome to the Streets of LA Support.**',
        '',
        'Please choose the category that best matches your issue.',
        '',
        '💎 **Tebex Store**',
        '🔧 **General Support**',
        '🚨 **Player Report**',
        '🚫 **BAN APPEAL**',
        '🐞 **IN GAME BUG**',
        '',
        '**Please only create one ticket per issue.**',
        '',
        'Abusing the ticket system may result in punishment.',
      ].join('\n')
    )
    .setThumbnail('attachment://streets-logo.png')
    .setImage('attachment://support-background.png')
    .setFooter({
      text: 'Streets of LA • Premium Support',
      iconURL: 'attachment://streets-logo.png',
    })
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId(PANEL_SELECT_ID)
    .setPlaceholder('Choose a support category')
    .addOptions(
      Object.entries(CATEGORIES).map(([value, category]) => ({
        label: category.label,
        value,
        description: category.description.slice(0, 100),
        emoji: category.emoji,
      }))
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    files: [background, logo],
  };
}

function ticketButtons(status = 'open') {
  if (status === 'closed') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(REOPEN_BUTTON_ID)
          .setLabel('Reopen Ticket')
          .setEmoji('🔓')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(DELETE_BUTTON_ID)
          .setLabel('Delete Ticket')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger)
      ),
    ];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CLAIM_BUTTON_ID)
        .setLabel('Claim Ticket')
        .setEmoji('🙋')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(CLOSE_BUTTON_ID)
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

async function ensurePanel() {
  const channel = await client.channels.fetch(process.env.TICKET_PANEL_CHANNEL_ID);

  if (!channel || !channel.isTextBased()) {
    throw new Error('TICKET_PANEL_CHANNEL_ID must point to a text channel.');
  }

  const recent = await channel.messages.fetch({ limit: 50 });
  const existing = recent.find(
    (message) =>
      message.author.id === client.user.id &&
      message.embeds.some((embed) => embed.title === PANEL_TITLE) &&
      message.components.some((row) =>
        row.components.some((component) => component.customId === PANEL_SELECT_ID)
      )
  );

  if (existing) {
    console.log(`Support panel already exists: ${existing.id}`);
    return;
  }

  const sent = await channel.send(panelPayload());
  console.log(`Support panel posted: ${sent.id}`);
}

async function createTicket(interaction, type) {
  const guild = interaction.guild;
  const category = CATEGORIES[type];

  const duplicate = guild.channels.cache.find((channel) => {
    const meta = ticketMeta(channel);
    return meta && meta.openerId === interaction.user.id && meta.status === 'open';
  });

  if (duplicate) {
    await interaction.reply({
      content: `You already have an open ticket: ${duplicate}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const number = await nextTicketNumber(guild, type);
  const channelName = sanitizeName(`${category.channelPrefix}-${number}`);

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: process.env.SUPPORT_CATEGORY_ID,
    topic: buildTopic(interaction.user.id, type, 'open', ''),
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: process.env.STAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
    ],
  });

  const logo = new AttachmentBuilder('./streets-logo.png', {
    name: 'streets-logo.png',
  });

  const ticketEmbed = new EmbedBuilder()
    .setColor(0x6d28d9)
    .setAuthor({
      name: 'STREETS OF LA • SUPPORT',
      iconURL: 'attachment://streets-logo.png',
    })
    .setTitle(`${category.emoji} ${category.label} #${number}`)
    .setDescription(
      [
        `Welcome ${interaction.user} to your **${category.label}** ticket.`,
        '',
        category.description,
        '',
        'Please explain your issue clearly and include any useful screenshots, clips, order IDs, or evidence.',
        '',
        `Only <@&${process.env.STAFF_ROLE_ID}> can claim or close this ticket.`,
      ].join('\n')
    )
    .setThumbnail('attachment://streets-logo.png')
    .setFooter({
      text: 'Streets of LA • Support Ticket',
      iconURL: 'attachment://streets-logo.png',
    })
    .setTimestamp();

  await ticketChannel.send({
    content: `${interaction.user} <@&${process.env.STAFF_ROLE_ID}>`,
    embeds: [ticketEmbed],
    components: ticketButtons('open'),
    files: [logo],
    allowedMentions: {
      users: [interaction.user.id],
      roles: [process.env.STAFF_ROLE_ID],
    },
  });

  await interaction.editReply({
    content: `Your ticket has been created: ${ticketChannel}`,
  });
}

async function fetchAllMessages(channel) {
  const collected = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });

    if (batch.size === 0) break;
    collected.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function makeTranscript(channel) {
  const messages = await fetchAllMessages(channel);

  const rows = messages.map((message) => {
    const attachments = [...message.attachments.values()]
      .map((a) => `<div><a href="${escapeHtml(a.url)}">${escapeHtml(a.name || a.url)}</a></div>`)
      .join('');

    const embeds = message.embeds
      .map((e) => `<div class="embed"><strong>${escapeHtml(e.title || '')}</strong><br>${escapeHtml(e.description || '')}</div>`)
      .join('');

    return `
      <div class="message">
        <div class="meta">${escapeHtml(message.author.tag)} • ${new Date(message.createdTimestamp).toLocaleString()}</div>
        <div class="content">${escapeHtml(message.content || '').replace(/\n/g, '<br>')}</div>
        ${attachments}
        ${embeds}
      </div>`;
  }).join('\n');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(channel.name)} Transcript</title>
<style>
body{font-family:Arial,sans-serif;background:#090615;color:#eee;padding:24px}
h1{color:#a78bfa}
.message{background:#15102b;border-left:4px solid #6d28d9;padding:12px;margin:10px 0;border-radius:8px}
.meta{color:#a5b4fc;font-size:12px;margin-bottom:6px}
.embed{background:#0f172a;border:1px solid #312e81;padding:10px;margin-top:8px;border-radius:6px}
a{color:#60a5fa}
</style>
</head>
<body>
<h1>Streets of LA Ticket Transcript</h1>
<p>Channel: #${escapeHtml(channel.name)}</p>
${rows}
</body>
</html>`;

  return Buffer.from(html, 'utf8');
}

async function sendTranscript(channel, reason = 'Ticket closed') {
  const meta = ticketMeta(channel);
  if (!meta) return;

  const transcript = await makeTranscript(channel);
  const filename = `${channel.name}-transcript.html`;

  const logsChannel = await client.channels.fetch(process.env.TICKET_LOGS_CHANNEL_ID).catch(() => null);
  const opener = await client.users.fetch(meta.openerId).catch(() => null);

  const logEmbed = new EmbedBuilder()
    .setColor(0x6d28d9)
    .setTitle('Ticket Transcript')
    .addFields(
      { name: 'Ticket', value: `#${channel.name}`, inline: true },
      { name: 'Opened By', value: `<@${meta.openerId}>`, inline: true },
      { name: 'Type', value: CATEGORIES[meta.type]?.label || meta.type, inline: true },
      { name: 'Reason', value: reason, inline: false }
    )
    .setTimestamp();

  if (logsChannel?.isTextBased()) {
    await logsChannel.send({
      embeds: [logEmbed],
      files: [{ attachment: transcript, name: filename }],
    }).catch(console.error);
  }

  if (opener) {
    await opener.send({
      content: `Here is your Streets of LA ticket transcript for **#${channel.name}**.`,
      files: [{ attachment: transcript, name: filename }],
    }).catch(() => {});
  }
}

async function closeTicket(interaction, automatic = false) {
  const channel = interaction.channel;
  const meta = ticketMeta(channel);
  if (!meta) return;

  // Discord requires button interactions to be acknowledged within a few seconds.
  // A transcript can take longer, so acknowledge the click before doing any work.
  if (!automatic && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  const closedBy = automatic
    ? `Automatically closed after ${AUTO_CLOSE_HOURS} hours of inactivity`
    : `Closed by ${interaction.user.tag}`;

  // Do not prevent the ticket from closing if a DM or log upload fails.
  try {
    await sendTranscript(channel, closedBy);
  } catch (error) {
    console.error('Transcript creation or delivery failed:', error);
  }

  await channel.setTopic(
    buildTopic(meta.openerId, meta.type, 'closed', meta.claimedBy)
  );

  await channel.permissionOverwrites.edit(meta.openerId, {
    ViewChannel: false,
    SendMessages: false,
  });

  const closedName = channel.name.startsWith('closed-')
    ? channel.name
    : `closed-${channel.name}`;

  await channel.setName(sanitizeName(closedName));

  if (!automatic) {
    await interaction.editReply({
      content: `🔒 Ticket closed by ${interaction.user}.`,
      embeds: interaction.message.embeds,
      components: ticketButtons('closed'),
      allowedMentions: { users: [] },
    });
  } else {
    await channel.send({
      content: `🔒 This ticket was automatically closed after ${AUTO_CLOSE_HOURS} hours of inactivity.`,
      components: ticketButtons('closed'),
    });
  }
}

client.once(Events.ClientReady, async (bot) => {
  console.log(`Streets of LA Ticket Bot is online as ${bot.user.tag}`);

  try {
    await ensurePanel();
  } catch (error) {
    console.error('Failed to create support panel:', error);
  }

  setInterval(async () => {
    try {
      const guilds = client.guilds.cache.values();

      for (const guild of guilds) {
        const ticketChannels = guild.channels.cache.filter((channel) => {
          const meta = ticketMeta(channel);
          return (
            meta &&
            meta.status === 'open' &&
            channel.parentId === process.env.SUPPORT_CATEGORY_ID &&
            channel.type === ChannelType.GuildText
          );
        });

        for (const channel of ticketChannels.values()) {
          const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
          const last = messages?.first();
          if (!last) continue;

          if (Date.now() - last.createdTimestamp >= AUTO_CLOSE_MS) {
            const fakeInteraction = {
              channel,
              user: client.user,
            };
            await closeTicket(fakeInteraction, true).catch(console.error);
          }
        }
      }
    } catch (error) {
      console.error('Auto-close check failed:', error);
    }
  }, 15 * 60 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === PANEL_SELECT_ID) {
      const type = interaction.values[0];
      if (!CATEGORIES[type]) {
        await interaction.reply({ content: 'Unknown ticket category.', ephemeral: true });
        return;
      }
      await createTicket(interaction, type);
      return;
    }

    if (!interaction.isButton()) return;
    if (![CLAIM_BUTTON_ID, CLOSE_BUTTON_ID, REOPEN_BUTTON_ID, DELETE_BUTTON_ID].includes(interaction.customId)) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!hasStaffRole(member)) {
      await interaction.reply({
        content: 'Only the configured staff role can use this button.',
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.channel;
    const meta = ticketMeta(channel);

    if (!meta) {
      await interaction.reply({ content: 'This is not a valid ticket channel.', ephemeral: true });
      return;
    }

    if (interaction.customId === CLAIM_BUTTON_ID) {
      await channel.setTopic(buildTopic(meta.openerId, meta.type, 'open', interaction.user.id));

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .addFields({ name: 'Claimed By', value: `${interaction.user}`, inline: true });

      await interaction.update({
        content: `${interaction.message.content}\n\n🙋 Claimed by ${interaction.user}`,
        embeds: [updatedEmbed],
        components: ticketButtons('open'),
        allowedMentions: { users: [] },
      });
      return;
    }

    if (interaction.customId === CLOSE_BUTTON_ID) {
      await closeTicket(interaction, false);
      return;
    }

    if (interaction.customId === REOPEN_BUTTON_ID) {
      await channel.setTopic(buildTopic(meta.openerId, meta.type, 'open', meta.claimedBy));
      await channel.permissionOverwrites.edit(meta.openerId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      const reopenedName = channel.name.replace(/^closed-/, '');
      await channel.setName(sanitizeName(reopenedName));

      await interaction.update({
        content: `🔓 Ticket reopened by ${interaction.user}. <@${meta.openerId}>`,
        embeds: interaction.message.embeds,
        components: ticketButtons('open'),
        allowedMentions: { users: [meta.openerId] },
      });
      return;
    }

    if (interaction.customId === DELETE_BUTTON_ID) {
      await interaction.reply({
        content: '🗑️ Ticket will be deleted in 5 seconds.',
        ephemeral: true,
      });
      setTimeout(() => channel.delete(`Deleted by ${interaction.user.tag}`).catch(console.error), 5000);
    }
  } catch (error) {
    console.error('Interaction error:', error);

    const response = {
      content: 'Something went wrong. Please contact an administrator.',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

const port = Number(process.env.PORT || 3000);
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(
    client.isReady()
      ? 'Streets of LA Ticket Bot is online.'
      : 'Streets of LA Ticket Bot is starting.'
  );
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Health server listening on port ${port}`);
});

client.login(process.env.DISCORD_TOKEN);

function shutdown(signal) {
  console.log(`${signal} received. Closing the bot.`);
  server.close();
  client.destroy();
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
