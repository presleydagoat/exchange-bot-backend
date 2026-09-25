const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
];

// Completely Isolated Bot Clients
const clients = {
    exchange: new Client({ intents }),
    gsc: new Client({ intents }),
    afsf: new Client({ intents })
};

const BOT_TOKEN = process.env.BOT_TOKEN;
const GSC_BOT_TOKEN = process.env.GSC_BOT_TOKEN;
const AFSF_BOT_TOKEN = process.env.AFSF_BOT_TOKEN;

const DASHBOARD_USER = process.env.DASHBOARD_USER || "admin";
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || "2026";

const SESSION_TOKEN = crypto.randomBytes(32).toString('hex');

// Expanded Administrative & Moderation Command Suite
const ADMINISTRATIVE_COMMANDS = [
    { name: "!purge [amount]", dept: "Moderation", desc: "Bulk deletes up to 100 messages in the current channel." },
    { name: "!kick [user] [reason]", dept: "Moderation", desc: "Kicks a member from the server." },
    { name: "!ban [user] [reason]", dept: "Moderation", desc: "Bans a member from the server." },
    { name: "!unban [userId]", dept: "Moderation", desc: "Revokes a user ban by ID." },
    { name: "!mute [user] [time] [reason]", dept: "Moderation", desc: "Timeouts/mutes a member." },
    { name: "!unmute [user]", dept: "Moderation", desc: "Removes a timeout from a member." },
    { name: "!warn [user] [reason]", dept: "Security", desc: "Issues a logged warning to a target user." },
    { name: "!warnings [user]", dept: "Security", desc: "Displays warning history for a user." },
    { name: "!clearwarns [user]", dept: "Security", desc: "Clears all warnings assigned to a user." },
    { name: "!lockdown [channel]", dept: "Security", desc: "Locks send permissions for normal members." },
    { name: "!unlock [channel]", dept: "Security", desc: "Restores send permissions for normal members." },
    { name: "!role add [user] [role]", dept: "Role Mgmt", desc: "Assigns a specific role to a user." },
    { name: "!role remove [user] [role]", dept: "Role Mgmt", desc: "Removes a specific role from a user." },
    { name: "!slowmode [seconds]", dept: "Channel Ops", desc: "Sets channel slowmode delay (0 to disable)." },
    { name: "!nick [user] [nickname]", dept: "User Control", desc: "Changes a member's server display name." },
    { name: "!announcement [text]", dept: "Utility", desc: "Posts an official formatted server announcement." },
    { name: "!embed [title] | [text]", dept: "Utility", desc: "Sends a rich embedded message." },
    { name: "!userinfo [user]", dept: "Information", desc: "Fetches account details, roles, and join date." },
    { name: "!serverinfo", dept: "Information", desc: "Displays server statistics, owner, and member counts." },
    { name: "!botstatus", dept: "System", desc: "Outputs bot uptime, latency, and memory usage." },
    { name: "!nuke", dept: "Admin Ops", desc: "Clones and deletes channel to clear all message history." },
    { name: "!pin [messageId]", dept: "Channel Ops", desc: "Pins a target message in the current channel." },
    { name: "!unpin [messageId]", dept: "Channel Ops", desc: "Unpins a target message from the channel." },
    { name: "!dm [user] [message]", dept: "Admin Ops", desc: "Sends a direct message to a user via bot." },
    { name: "!say [message]", dept: "Admin Ops", desc: "Forces bot to repeat message directly in channel." }
];

// Startup Logs
clients.exchange.once('ready', () => console.log(`[EXCHANGE BOT] Connected: ${clients.exchange.user.tag}`));
clients.gsc.once('ready', () => console.log(`[GSC BOT] Connected: ${clients.gsc.user.tag}`));
clients.afsf.once('ready', () => console.log(`[AFSF BOT] Connected: ${clients.afsf.user.tag}`));

// Auth Middleware
const requireAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader === `Bearer ${SESSION_TOKEN}`) {
        next();
    } else {
        res.status(401).json({ error: 'AUTHENTICATION FAILURE' });
    }
};

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === DASHBOARD_USER && password === DASHBOARD_PASS) {
        res.json({ success: true, token: SESSION_TOKEN });
    } else {
        res.status(403).json({ error: 'INVALID CREDENTIALS' });
    }
});

// Helper Function: Validate and Get Selected Client
function getSelectedClient(botType) {
    const client = clients[botType || 'exchange'];
    if (!client || !client.isReady()) return null;
    return client;
}

// Get Servers FOR THE SPECIFIC SELECTED BOT ONLY
app.get('/api/servers', requireAuth, (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = getSelectedClient(botType);

    if (!activeClient) {
        return res.status(503).json({ error: `Unit [${botType.toUpperCase()}] is offline or bot token is missing.` });
    }

    try {
        const guilds = activeClient.guilds.cache.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png'
        }));
        res.json({ servers: guilds });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Channels FOR THE SPECIFIC SELECTED BOT ONLY
app.get('/api/servers/:guildId/channels', requireAuth, async (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(503).json({ error: `Unit [${botType.toUpperCase()}] Offline.` });

    try {
        const guild = await activeClient.guilds.fetch(req.params.guildId);
        if (!guild) return res.status(404).json({ error: 'SERVER ACCESS DENIED FOR THIS BOT' });

        const channels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .map(c => ({ id: c.id, name: c.name }));

        res.json({ channels });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch History FOR THE SPECIFIC SELECTED BOT
app.get('/api/channels/:channelId/messages', requireAuth, async (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(503).json({ error: `Unit [${botType.toUpperCase()}] Offline.` });

    try {
        const channel = await activeClient.channels.fetch(req.params.channelId);
        if (!channel) return res.status(404).json({ error: 'CHANNEL NOT FOUND' });

        const fetched = await channel.messages.fetch({ limit: 100 });
        const messages = fetched.map(m => ({
            id: m.id,
            author: m.author.username,
            authorId: m.author.id,
            isBot: m.author.bot,
            content: m.content,
            timestamp: m.createdAt
        }));

        res.json({ messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send Message FROM THE SPECIFIC SELECTED BOT
app.post('/api/send-message', requireAuth, async (req, res) => {
    const { channelId, message, botType } = req.body;
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(503).json({ error: `Unit [${botType.toUpperCase()}] Offline.` });

    try {
        const channel = await activeClient.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: 'TARGET_CHANNEL_NOT_FOUND' });

        await channel.send(message);
        res.json({ success: true, status: 'MESSAGE TRANSMITTED' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Forward Message FROM THE SPECIFIC SELECTED BOT
app.post('/api/forward-message', requireAuth, async (req, res) => {
    const { targetChannelId, content, botType } = req.body;
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(503).json({ error: `Unit [${botType.toUpperCase()}] Offline.` });

    try {
        const channel = await activeClient.channels.fetch(targetChannelId);
        if (!channel) return res.status(404).json({ error: 'FORWARD_TARGET_NOT_FOUND' });

        await channel.send(`⏩ **[FORWARDED TRANSMISSION]**\n${content}`);
        res.json({ success: true, status: 'TRANSMISSION FORWARDED' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete ANY Message using the Selected Bot's Permissions
app.delete('/api/messages/:channelId/:messageId', requireAuth, async (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(503).json({ error: `Unit [${botType.toUpperCase()}] Offline.` });

    try {
        const channel = await activeClient.channels.fetch(req.params.channelId);
        const targetMessage = await channel.messages.fetch(req.params.messageId);

        await targetMessage.delete();
        res.json({ success: true, status: 'MESSAGE PURGED' });
    } catch (err) {
        res.status(500).json({ error: 'PERMISSIONS INSUFFICIENT OR MESSAGE NOT FOUND: ' + err.message });
    }
});

// Get Commands List
app.get('/api/commands', requireAuth, (req, res) => {
    res.json({ commands: ADMINISTRATIVE_COMMANDS });
});

// Change Presence FOR THE SPECIFIC SELECTED BOT ONLY
app.post('/api/set-status', requireAuth, async (req, res) => {
    const { status, botType } = req.body;
    const activeClient = getSelectedClient(botType);

    if (!activeClient) {
        return res.status(400).json({ error: `Unit [${botType}] Unavailable.` });
    }

    try {
        activeClient.user.setPresence({ status });
        res.json({ success: true, status: `[${botType.toUpperCase()}] status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login Each Bot Independently
if (BOT_TOKEN) clients.exchange.login(BOT_TOKEN);
if (GSC_BOT_TOKEN) clients.gsc.login(GSC_BOT_TOKEN);
if (AFSF_BOT_TOKEN) clients.afsf.login(AFSF_BOT_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend server active on port ${PORT}`));
