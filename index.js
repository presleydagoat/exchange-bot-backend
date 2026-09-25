const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const DASHBOARD_USER = process.env.DASHBOARD_USER || "admin";
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || "2026";

const SESSION_TOKEN = crypto.randomBytes(32).toString('hex');

client.once('ready', () => {
    console.log(`System active. Discord gateway connected as ${client.user.tag}`);
});

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
        const guilds = client.guilds.cache.map(g => ({
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
        const guild = await client.guilds.fetch(req.params.guildId);
        if (!guild) return res.status(404).json({ error: 'SERVER ACCESS DENIED' });

        const channels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .map(c => ({ id: c.id, name: c.name }));

        res.json({ channels });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/send-message', requireAuth, async (req, res) => {
    const { channelId, message } = req.body;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: 'TARGET_CHANNEL_NOT_FOUND' });
        
        await channel.send(message);
        res.json({ success: true, status: 'MESSAGE TRANSMITTED' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/set-status', requireAuth, async (req, res) => {
    const { status } = req.body;
    try {
        client.user.setPresence({ status: status });
        res.json({ success: true, status: `Presence updated to ${status}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shutdown', requireAuth, (req, res) => {
    res.json({ success: true, message: 'Terminating bot session...' });
    setTimeout(() => {
        client.destroy();
        process.exit(0);
    }, 1000);
});

client.login(MTUzNDQwNDM4MzYxNjUzMjYyMg.GDPcSx.whuIwD7Baejy8FX2OKwoFjj1ShydRku4TGOF3I);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend server active on port ${PORT}`));
