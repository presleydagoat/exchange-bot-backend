const { Client, GatewayIntentBits, ChannelType, ActivityType } = require('discord.js');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '10mb' })); // Support base64 avatar uploads
app.use(cors());

const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
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

// Store DM logs in memory per bot
const dmLogs = {
    exchange: [],
    gsc: [],
    afsf: []
};

// Activity Type Mapping
const ACTIVITY_TYPES = {
    PLAYING: ActivityType.Playing,
    STREAMING: ActivityType.Streaming,
    LISTENING: ActivityType.Listening,
    WATCHING: ActivityType.Watching,
    COMPETING: ActivityType.Competing,
    CUSTOM: ActivityType.Custom
};

// Setup DM listeners for each bot
Object.keys(clients).forEach(key => {
    const client = clients[key];
    client.on('messageCreate', message => {
        if (message.channel.type === ChannelType.DM) {
            dmLogs[key].push({
                id: message.id,
                author: message.author.username,
                authorId: message.author.id,
                avatar: message.author.displayAvatarURL(),
                content: message.content,
                timestamp: message.createdAt,
                isBot: message.author.bot,
                channelId: message.channel.id
            });
        }
    });
});

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

function getSelectedClient(botType) {
    const client = clients[botType || 'exchange'];
    if (!client || !client.isReady()) return null;
    return client;
}

// Bot Profile & Customization Endpoint
app.post('/api/customize', requireAuth, async (req, res) => {
    const { botType, avatar, bio, activityType, activityText, status } = req.body;
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(503).json({ error: `Unit [${botType}] Offline.` });

    try {
        // Change Profile Picture (Base64 or URL)
        if (avatar) {
            await activeClient.user.setAvatar(avatar);
        }

        // Change Bio / About Me
        if (bio !== undefined) {
            await activeClient.user.setAboutMe(bio);
        }

        // Set Rich Presence / Activity & Status
        const options = {};
        if (status) options.status = status;
        if (activityType && activityText) {
            options.activities = [{
                name: activityText,
                type: ACTIVITY_TYPES[activityType] || ActivityType.Playing
            }];
        }

        activeClient.user.setPresence(options);

        res.json({ success: true, message: 'BOT PROFILE & PRESENCE UPDATED SUCCESSFULLY' });
    } catch (err) {
        res.status(500).json({ error: 'FAILED TO UPDATE PROFILE: ' + err.message });
    }
});

// Fetch Bot Details (Avatar, Username, Bio)
app.get('/api/bot-profile', requireAuth, async (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(503).json({ error: 'Unit Offline' });

    res.json({
        username: activeClient.user.username,
        tag: activeClient.user.tag,
        avatar: activeClient.user.displayAvatarURL(),
        id: activeClient.user.id
    });
});

// Fetch Direct Message Conversations
app.get('/api/dms', requireAuth, (req, res) => {
    const botType = req.query.bot || 'exchange';
    res.json({ dms: dmLogs[botType] || [] });
});

// Send Direct Message
app.post('/api/send-dm', requireAuth, async (req, res) => {
    const { botType, userId, message } = req.body;
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(503).json({ error: `Unit [${botType}] Offline.` });

    try {
        const user = await activeClient.users.fetch(userId);
        const sentMsg = await user.send(message);

        // Record outgoing DM
        dmLogs[botType].push({
            id: sentMsg.id,
            author: activeClient.user.username,
            authorId: activeClient.user.id,
            avatar: activeClient.user.displayAvatarURL(),
            content: message,
            timestamp: sentMsg.createdAt,
            isBot: true,
            channelId: user.dmChannel ? user.dmChannel.id : userId
        });

        res.json({ success: true, status: 'DIRECT TRANSMISSION SENT' });
    } catch (err) {
        res.status(500).json({ error: 'CANNOT DM USER: ' + err.message });
    }
});

// Get Servers
app.get('/api/servers', requireAuth, (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = getSelectedClient(botType);

    if (!activeClient) {
        return res.status(503).json({ error: `Unit [${botType.toUpperCase()}] is offline.` });
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

// Get Channels
app.get('/api/servers/:guildId/channels', requireAuth, async (req, res) => {
    const botType = req.query.bot || 'exchange';
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(503).json({ error: `Unit [${botType.toUpperCase()}] Offline.` });

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

// Fetch History
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

// Send Channel Message
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

// Forward Message
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

// Delete Message
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
        res.status(500).json({ error: 'PERMISSIONS INSUFFICIENT OR NOT FOUND: ' + err.message });
    }
});

// Commands Endpoint
app.get('/api/commands', requireAuth, (req, res) => {
    res.json({
        commands: [
            { name: "!purge [amount]", dept: "Moderation", desc: "Bulk deletes up to 100 messages." },
            { name: "!kick [user] [reason]", dept: "Moderation", desc: "Kicks a member." },
            { name: "!ban [user] [reason]", dept: "Moderation", desc: "Bans a member." },
            { name: "!unban [userId]", dept: "Moderation", desc: "Revokes a user ban by ID." },
            { name: "!mute [user] [time]", dept: "Moderation", desc: "Timeouts/mutes a member." },
            { name: "!unmute [user]", dept: "Moderation", desc: "Removes timeout from member." },
            { name: "!warn [user] [reason]", dept: "Security", desc: "Issues a logged warning." },
            { name: "!warnings [user]", dept: "Security", desc: "Displays user warning history." },
            { name: "!clearwarns [user]", dept: "Security", desc: "Clears all user warnings." },
            { name: "!lockdown", dept: "Security", desc: "Locks channel send permissions." },
            { name: "!unlock", dept: "Security", desc: "Restores channel send permissions." },
            { name: "!role add [user] [role]", dept: "Role Mgmt", desc: "Assigns a role to a user." },
            { name: "!role remove [user] [role]", dept: "Role Mgmt", desc: "Removes a role from a user." },
            { name: "!slowmode [sec]", dept: "Channel Ops", desc: "Sets channel slowmode delay." },
            { name: "!nick [user] [name]", dept: "User Control", desc: "Changes display name." },
            { name: "!announcement [text]", dept: "Utility", desc: "Posts a server announcement." },
            { name: "!embed [title] | [text]", dept: "Utility", desc: "Sends an embedded message." },
            { name: "!userinfo [user]", dept: "Information", desc: "Fetches user profile details." },
            { name: "!serverinfo", dept: "Information", desc: "Displays server statistics." },
            { name: "!botstatus", dept: "System", desc: "Outputs bot uptime & memory usage." },
            { name: "!nuke", dept: "Admin Ops", desc: "Clones and deletes channel." },
            { name: "!pin [msgId]", dept: "Channel Ops", desc: "Pins message in channel." },
            { name: "!unpin [msgId]", dept: "Channel Ops", desc: "Unpins message from channel." },
            { name: "!dm [user] [msg]", dept: "Admin Ops", desc: "Sends direct message." },
            { name: "!say [msg]", dept: "Admin Ops", desc: "Forces bot to repeat message." }
        ]
    });
});

// Set Status
app.post('/api/set-status', requireAuth, async (req, res) => {
    const { status, botType } = req.body;
    const activeClient = getSelectedClient(botType);

    if (!activeClient) return res.status(400).json({ error: `Unit [${botType}] Unavailable.` });

    try {
        activeClient.user.setPresence({ status });
        res.json({ success: true, status: `Status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login Bots
if (BOT_TOKEN) clients.exchange.login(BOT_TOKEN);
if (GSC_BOT_TOKEN) clients.gsc.login(GSC_BOT_TOKEN);
if (AFSF_BOT_TOKEN) clients.afsf.login(AFSF_BOT_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend server active on port ${PORT}`));
