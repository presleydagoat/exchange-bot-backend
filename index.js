onst { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');
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

// Initialize Independent Client Instances
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

// Administrative Command Registry
const ADMINISTRATIVE_COMMANDS = [
    { name: "!purge [amount]", dept: "Admin Operations", desc: "Deletes a designated batch of messages from channel history." },
    { name: "!kick [user] [reason]", dept: "Admin Operations", desc: "Removes specified member from the server." },
    { name: "!ban [user] [reason]", dept: "Admin Operations", desc: "Permanently bans specified member from the server." },
    { name: "!mute [user] [duration]", dept: "Admin Operations", desc: "Restricts member communication permissions." },
    { name: "!unmute [user]", dept: "Admin Operations", desc: "Restores member communication privileges." },
    { name: "!warn [user] [reason]", dept: "Security Operations", desc: "Issues formal administrative warning to a user." },
    { name: "!lockdown [channel/all]", dept: "Security Operations", desc: "Locks channel send privileges for standard users." },
    { name: "!unlock [channel/all]", dept: "Security Operations", desc: "Restores standard send privileges in locked channels." },
    { name: "!role add [user] [role]", dept: "Personnel Control", desc: "Assigns designated role permissions to target user." },
    { name: "!role remove [user] [role]", dept: "Personnel Control", desc: "Revokes designated role permissions from target user." },
    { name: "!slowmode [seconds]", dept: "Channel Operations", desc: "Sets message rate-limiting interval for active channel." },
    { name: "!nick [user] [nickname]", dept: "Personnel Control", desc: "Modifies display identity for specified member." }
];

// Start Handlers
clients.exchange.once('ready', () => console.log(`[EXCHANGE BOT] Active: ${clients.exchange.user.tag}`));
clients.gsc.once('ready', () => console.log(`[GSC BOT] Active: ${clients.gsc.user.tag}`));
clients.afsf.once('ready', () => console.log(`[AFSF BOT] Active: ${clients.afsf.user.tag}`));

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

// Fetch Servers Associated with Chosen Unit
app.get('/api/servers', requireAuth, (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = clients[botType];

    if (!activeClient || !activeClient.isReady()) {
        return res.status(503).json({ error: `Unit [${botType.toUpperCase()}] Offline or Unreachable.` });
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

// Fetch Channels for Specific Server and Unit
app.get('/api/servers/:guildId/channels', requireAuth, async (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = clients[botType];

    try {
        const guild = await activeClient.guilds.fetch(req.params.guildId);
        if (!guild) return res.status(404).json({ error: 'SERVER ACCESS DENIED' });

        const channels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .map(c => ({ id: c.id, name: c.name }));

        res.json({ channels });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deep History Channel Message Fetching
app.get('/api/channels/:channelId/messages', requireAuth, async (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = clients[botType];

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

// Transmit New Message
app.post('/api/send-message', requireAuth, async (req, res) => {
    const { channelId, message, botType } = req.body;
    const activeClient = clients[botType || 'exchange'];

    try {
        const channel = await activeClient.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: 'TARGET_CHANNEL_NOT_FOUND' });

        await channel.send(message);
        res.json({ success: true, status: 'MESSAGE TRANSMITTED' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Forward Message
app.post('/api/forward-message', requireAuth, async (req, res) => {
    const { targetChannelId, content, botType } = req.body;
    const activeClient = clients[botType || 'exchange'];

    try {
        const channel = await activeClient.channels.fetch(targetChannelId);
        if (!channel) return res.status(404).json({ error: 'FORWARD_TARGET_NOT_FOUND' });

        await channel.send(`⏩ **[FORWARDED TRANSMISSION]**\n${content}`);
        res.json({ success: true, status: 'TRANSMISSION FORWARDED' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Universal Delete (Any User or Bot Message)
app.delete('/api/messages/:channelId/:messageId', requireAuth, async (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = clients[botType];

    try {
        const channel = await activeClient.channels.fetch(req.params.channelId);
        const targetMessage = await channel.messages.fetch(req.params.messageId);

        await targetMessage.delete();
        res.json({ success: true, status: 'MESSAGE PURGED' });
    } catch (err) {
        res.status(500).json({ error: 'PERMISSIONS INSUFFICIENT OR MESSAGE NOT FOUND: ' + err.message });
    }
});

// Get Administrative Command Registry
app.get('/api/commands', requireAuth, (req, res) => {
    res.json({ commands: ADMINISTRATIVE_COMMANDS });
});

// Isolated Status Changer per Bot
app.post('/api/set-status', requireAuth, async (req, res) => {
    const { status, botType } = req.body;
    const activeClient = clients[botType];

    if (!activeClient || !activeClient.isReady()) {
        return res.status(400).json({ error: `Unit [${botType}] Unavailable.` });
    }

    try {
        activeClient.user.setPresence({ status });
        res.json({ success: true, status: `[${botType.toUpperCase()}] presence set to ${status}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Independent Token Authentications
if (BOT_TOKEN) clients.exchange.login(BOT_TOKEN);
if (GSC_BOT_TOKEN) clients.gsc.login(GSC_BOT_TOKEN);
if (AFSF_BOT_TOKEN) clients.afsf.login(AFSF_BOT_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend server active on port ${PORT}`));
