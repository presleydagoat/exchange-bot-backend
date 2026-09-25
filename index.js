const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

// Required Intents
const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
];

// Initialize Multi-Bot Clients
const mainClient = new Client({ intents });
const gscClient = new Client({ intents });
const afsfClient = new Client({ intents });

const BOT_TOKEN = process.env.BOT_TOKEN;
const GSC_BOT_TOKEN = process.env.GSC_BOT_TOKEN;
const AFSF_BOT_TOKEN = process.env.AFSF_BOT_TOKEN;

const DASHBOARD_USER = process.env.DASHBOARD_USER || "admin";
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || "2026";

const SESSION_TOKEN = crypto.randomBytes(32).toString('hex');

// Unified Command List
const COMMANDS_LIST = [
    { name: "!strike-status", dept: "Global Strike Command", desc: "Displays strategic alert readiness state." },
    { name: "!alert-defcon", dept: "Global Strike Command", desc: "Sets defensive readiness level." },
    { name: "!sec-patrol", dept: "Air Force Security Forces", desc: "Logs base perimeter security patrol status." },
    { name: "!base-lockdown", dept: "Air Force Security Forces", desc: "Triggers installation security protocol." },
    { name: "!clearance-check", dept: "General Command", desc: "Verifies user security clearance status." }
];

// Main Bot Listeners
mainClient.once('ready', () => console.log(`[MAIN BOT] Operational: ${mainClient.user.tag}`));
mainClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content === '!clearance-check') {
        await message.reply(`🔍 **[SECURITY CLEARANCE]** User ${message.author.username} status: **ACTIVE LEVEL 4 CLEARANCE**.`);
    }
});

// GSC Bot Listeners
gscClient.once('ready', () => console.log(`[GSC BOT] Operational: ${gscClient.user.tag}`));
gscClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.trim();
    if (content === '!strike-status') {
        await message.reply("🛡️ **[GLOBAL STRIKE COMMAND]** Readiness Status: **DEFCON 3 - STANDBY**");
    } else if (content.startsWith('!alert-defcon')) {
        const level = content.split(' ')[1] || '3';
        await message.reply(`⚠️ **[GLOBAL STRIKE COMMAND]** Alert level updated to **DEFCON ${level}**.`);
    }
});

// AFSF Bot Listeners
afsfClient.once('ready', () => console.log(`[AFSF BOT] Operational: ${afsfClient.user.tag}`));
afsfClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.trim();
    if (content === '!sec-patrol') {
        await message.reply("👮 **[AIR FORCE SECURITY FORCES]** Perimeter patrol logged. All sectors secure.");
    } else if (content === '!base-lockdown') {
        await message.reply("🚨 **[AIR FORCE SECURITY FORCES]** BASE LOCKDOWN PROTOCOL INITIATED.");
    }
});

// Authentication Middleware
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

app.get('/api/servers', requireAuth, (req, res) => {
    try {
        const guilds = mainClient.guilds.cache.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png'
        }));
        res.json({ servers: guilds });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/servers/:guildId/channels', requireAuth, async (req, res) => {
    try {
        const guild = await mainClient.guilds.fetch(req.params.guildId);
        if (!guild) return res.status(404).json({ error: 'SERVER ACCESS DENIED' });

        const channels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .map(c => ({ id: c.id, name: c.name }));

        res.json({ channels });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/channels/:channelId/messages', requireAuth, async (req, res) => {
    try {
        const channel = await mainClient.channels.fetch(req.params.channelId);
        if (!channel) return res.status(404).json({ error: 'CHANNEL NOT FOUND' });

        const fetched = await channel.messages.fetch({ limit: 15 });
        const botIds = [mainClient.user?.id, gscClient.user?.id, afsfClient.user?.id];

        const messages = fetched.map(m => ({
            id: m.id,
            author: m.author.username,
            isBot: botIds.includes(m.author.id),
            content: m.content,
            timestamp: m.createdAt
        }));

        res.json({ messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/send-message', requireAuth, async (req, res) => {
    const { channelId, message, senderBot } = req.body;
    try {
        let activeClient = mainClient;
        if (senderBot === 'gsc' && gscClient.isReady()) activeClient = gscClient;
        if (senderBot === 'afsf' && afsfClient.isReady()) activeClient = afsfClient;

        const channel = await activeClient.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: 'TARGET_CHANNEL_NOT_FOUND' });
        
        await channel.send(message);
        res.json({ success: true, status: 'MESSAGE TRANSMITTED' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/messages/:channelId/:messageId', requireAuth, async (req, res) => {
    try {
        const channel = await mainClient.channels.fetch(req.params.channelId);
        const targetMessage = await channel.messages.fetch(req.params.messageId);
        const botIds = [mainClient.user?.id, gscClient.user?.id, afsfClient.user?.id];

        if (!botIds.includes(targetMessage.author.id)) {
            return res.status(403).json({ error: 'CAN ONLY DELETE BOT MESSAGES' });
        }

        await targetMessage.delete();
        res.json({ success: true, status: 'MESSAGE DELETED' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/commands', requireAuth, (req, res) => {
    res.json({ commands: COMMANDS_LIST });
});

app.post('/api/set-status', requireAuth, async (req, res) => {
    const { status } = req.body;
    try {
        if (mainClient.isReady()) mainClient.user.setPresence({ status });
        if (gscClient.isReady()) gscClient.user.setPresence({ status });
        if (afsfClient.isReady()) afsfClient.user.setPresence({ status });
        res.json({ success: true, status: `All bots updated to ${status}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login All Bots
if (BOT_TOKEN) mainClient.login(BOT_TOKEN);
if (GSC_BOT_TOKEN) gscClient.login(GSC_BOT_TOKEN);
if (AFSF_BOT_TOKEN) afsfClient.login(AFSF_BOT_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend server active on port ${PORT}`));
