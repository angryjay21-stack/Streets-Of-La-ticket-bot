# Streets of LA Ticket Bot

Premium Discord ticket system for a FiveM server, prepared for GitHub and Railway.

## Ticket categories

- 💎 Tebex Store
- 🔧 General Support
- 🚨 Player Report
- 🚫 BAN APPEAL
- 🐞 IN GAME BUG

## Included features

- Premium purple and dark-blue Streets of LA support panel
- Large background artwork and small top-right logo
- Tickets created inside your configured support category
- Per-category names such as `tebex-ticket-1`
- Ticket opener and staff role are mentioned inside each ticket
- Only the configured staff role can claim, close, reopen, or delete tickets
- Claim button
- Close button
- Reopen button
- Delete button
- Automatic HTML transcript when a ticket closes
- Transcript sent to the ticket logs channel
- Transcript privately sent to the member who opened the ticket
- Automatic closing after 48 hours of inactivity
- One open ticket per member
- Duplicate support-panel protection after Railway restarts
- Flat project structure with no folders inside folders

## Discord setup

Create these channels/items first:

1. A channel where the ticket panel should sit
2. A Discord category where ticket channels should be created
3. A private ticket logs channel
4. A staff role allowed to manage tickets

The bot needs these permissions:

- View Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Manage Channels
- Manage Messages

Enable these intents in the Discord Developer Portal:

- Server Members Intent
- Message Content Intent

## Railway variables

```env
DISCORD_TOKEN=your_discord_bot_token
TICKET_PANEL_CHANNEL_ID=your_ticket_panel_channel_id
SUPPORT_CATEGORY_ID=your_support_category_id
TICKET_LOGS_CHANNEL_ID=your_ticket_logs_channel_id
STAFF_ROLE_ID=your_staff_role_id
AUTO_CLOSE_HOURS=48
```

`AUTO_CLOSE_HOURS` is optional and defaults to 48.

## GitHub and Railway deployment

1. Extract the ZIP.
2. Upload every file directly into the root of one GitHub repository.
3. Create a Railway project from that GitHub repository.
4. Add the variables shown above.
5. Deploy.

Never place your real Discord token in GitHub.

## Button color note

Discord buttons only support preset colors. This project uses Discord's blue primary buttons with purple embeds and blue-purple artwork for the closest premium neon look.

## Fixed close-button response

The close button now acknowledges the Discord interaction immediately before generating transcripts or changing channel permissions. This prevents the “application did not respond in time” error on larger tickets.
