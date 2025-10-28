const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Configuration via environment variables (for Docker/unRAID)
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || __dirname;
const LOG_DIR = process.env.LOG_DIR || '';

// Server boot identifier to detect restarts from clients
const BOOT_ID = (() => {
    try {
        if (crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return String(Date.now());
})();

// Ensure data directory exists (supports mounted volumes)
try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (_) {}

// Optional file logging if LOG_DIR is provided
if (LOG_DIR) {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        const logPath = path.join(LOG_DIR, 'server.log');
        const logStream = fs.createWriteStream(logPath, { flags: 'a' });
        const origLog = console.log;
        const origError = console.error;
        const safe = (v) => {
            try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { return String(v); }
        };
        const write = (prefix, args) => {
            const line = `[${new Date().toISOString()}] ${prefix}${args.map(safe).join(' ')}\n`;
            try { logStream.write(line); } catch (_) {}
        };
        console.log = (...args) => { write('', args); origLog(...args); };
        console.error = (...args) => { write('ERROR: ', args); origError(...args); };
        process.on('exit', () => { try { logStream.end(); } catch (_) {} });
    } catch (e) {
        console.error('Failed to initialize file logging:', e && e.message ? e.message : e);
    }
}

// MIME types for different file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Get local IP addresses
function getLocalIPAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }

    return addresses;
}

// File paths
const lobbiesFilePath = path.join(DATA_DIR, 'lobbies.json');
const usersFilePath = path.join(DATA_DIR, 'users.json');
const presetsPath = path.join(DATA_DIR, 'presets.json');
const suggestionsPath = path.join(DATA_DIR, 'suggestions.json');

// Seed or create data files if missing
function ensureJsonFile(targetPath, fallbackBasename, defaultContent = '[]') {
    if (!fs.existsSync(targetPath)) {
        try {
            const fallback = path.join(__dirname, fallbackBasename);
            if (fs.existsSync(fallback)) {
                fs.copyFileSync(fallback, targetPath);
                return;
            }
        } catch (_) {}
        try { fs.writeFileSync(targetPath, defaultContent); } catch (_) {}
    }
}

ensureJsonFile(lobbiesFilePath, 'lobbies.json');
ensureJsonFile(usersFilePath, 'users.json');
ensureJsonFile(presetsPath, 'presets.json');
ensureJsonFile(suggestionsPath, 'suggestions.json', '[]');

// On server startup, clear any persisted lobbies so that
// all lobbies are closed after a reboot, as requested.
try {
    fs.writeFileSync(lobbiesFilePath, '[]');
    console.log('Cleared active lobbies on startup');
} catch (e) {
    console.error('Failed to clear lobbies on startup:', e && e.message ? e.message : e);
}

// Password hashing function
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Security: Server-side admin validation function
// NEVER trust client-side headers - always verify against actual user database
function isUserAdmin(username) {
    if (!username) return false;

    // CRITICAL SECURITY: Guest users can NEVER be admins
    // Guest usernames contain "(Guest-" pattern
    if (username.includes('(Guest-')) {
        console.warn('Admin check blocked for guest user:', username);
        return false;
    }

    try {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        const users = JSON.parse(data);
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

        // User must exist, be registered, and have isAdmin flag set to true
        return user && user.isRegistered === true && user.isAdmin === true;
    } catch (err) {
        console.error('Error validating admin status:', err);
        return false;
    }
}

// API endpoint handlers
function handleAPIRequest(req, res) {
    const url = req.url;

    // GET /api/status - Return server boot ID and started time
    if (url === '/api/status' && req.method === 'GET') {
        const payload = {
            bootId: BOOT_ID,
            startedAt: new Date().toISOString()
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return true;
    }

    // GET /api/lobbies - Get all lobbies
    if (url === '/api/lobbies' && req.method === 'GET') {
        fs.readFile(lobbiesFilePath, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('[]');
                    return;
                }
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to read lobbies' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data || '[]');
        });
        return true;
    }

    // POST /api/lobbies - Save lobbies
    if (url === '/api/lobbies' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            fs.writeFile(lobbiesFilePath, body, (err) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to save lobbies' }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
        });
        return true;
    }

    // GET /api/users - Get all users
    if (url === '/api/users' && req.method === 'GET') {
        try {
            const users = loadUsers();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(users));
        } catch (err) {
            console.error('Failed to load users:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to read users' }));
        }
        return true;
    }

    // POST /api/users - Save all users (for updating user data)
    if (url === '/api/users' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '[]');
                if (!Array.isArray(payload)) {
                    throw new Error('Payload must be an array');
                }
                saveUsers(payload);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.error('Failed to save users payload:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid users payload' }));
            }
        });
        return true;
    }

    // POST /api/users/register - Register new user
    if (url === '/api/users/register' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { username, password } = JSON.parse(body);

                // Read existing users
                let users = [];
                try {
                    users = loadUsers();
                } catch (err) {
                    console.error('Failed to load users during registration:', err);
                }

                // Check if username exists
                const existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
                if (existingUser) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Username already exists' }));
                    return;
                }

                const tagSet = new Set(users.map(u => u.tag));
                const newTag = generateTagNumber(tagSet);

                // Check if this is the first registered user
                const registeredUsers = users.filter(u => u.isRegistered === true);
                const isFirstUser = registeredUsers.length === 0;

                // Create new user with hashed password
                const newUser = {
                    username: username,
                    password: hashPassword(password),
                    isRegistered: true,
                    isAdmin: isFirstUser, // First registered user becomes admin
                    completedGames: [],
                    savedTitles: [],
                    presetGames: [],
                    createdAt: new Date().toISOString(),
                    tag: newTag,
                    stats: createDefaultStats(),
                    friends: [],
                    avatar: {
                        color: '#10b981',
                        initial: username.charAt(0).toUpperCase()
                    }
                };

                if (isFirstUser) {
                    console.log(`First user registered: ${username} - granted admin privileges`);
                }

                users.push(newUser);

                try {
                    saveUsers(users);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, user: newUser }));
                } catch (err) {
                    console.error('Failed to save user:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to save user' }));
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return true;
    }

    // POST /api/users/login - Validate user login
    if (url === '/api/users/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { username, password } = JSON.parse(body);

                const users = loadUsers();
                const hashedPassword = hashPassword(password);
                const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === hashedPassword);

                if (user) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, user: user }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid credentials' }));
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return true;
    }

    // POST /api/users/change-password - Change user password
    if (url === '/api/users/change-password' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { username, currentPassword, newPassword } = JSON.parse(body);

                const users = loadUsers();
                const hashedCurrentPassword = hashPassword(currentPassword);
                const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase() && u.password === hashedCurrentPassword);

                if (userIndex === -1) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Current password is incorrect' }));
                    return;
                }

                users[userIndex].password = hashPassword(newPassword);
                users[userIndex].mustChangePassword = false;

                saveUsers(users);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return true;
    }

    if (url === '/api/friends/add' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const { requester, friendTag } = JSON.parse(body || '{}');
                if (!requester || !friendTag) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing requester or friend tag' }));
                    return;
                }

                const users = loadUsers();
                const requesterUser = findUser(users, requester);
                if (!requesterUser) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Requester not found' }));
                    return;
                }

                const friendUser = findUserByTag(users, friendTag);
                if (!friendUser) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No user found with that tag' }));
                    return;
                }

                if (friendUser.username.toLowerCase() === requesterUser.username.toLowerCase()) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'You cannot add yourself' }));
                    return;
                }

                const alreadyFriends = requesterUser.friends.some(f => f.username.toLowerCase() === friendUser.username.toLowerCase());
                if (!alreadyFriends) {
                    const since = new Date().toISOString();
                    requesterUser.friends.push({
                        username: friendUser.username,
                        tag: friendUser.tag,
                        since,
                        gamesPlayedTogether: requesterUser.stats.gamesWithFriends[friendUser.tag] || 0
                    });
                    friendUser.friends = friendUser.friends || [];
                    const reciprocal = friendUser.friends.some(f => f.username.toLowerCase() === requesterUser.username.toLowerCase());
                    if (!reciprocal) {
                        friendUser.friends.push({
                            username: requesterUser.username,
                            tag: requesterUser.tag,
                            since,
                            gamesPlayedTogether: friendUser.stats.gamesWithFriends[requesterUser.tag] || 0
                        });
                    }
                }

                saveUsers(users);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, friends: requesterUser.friends }));
            } catch (err) {
                console.error('Failed to add friend:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return true;
    }

    if (url === '/api/friends/remove' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const { requester, friendTag } = JSON.parse(body || '{}');
                if (!requester || !friendTag) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing requester or friend tag' }));
                    return;
                }

                const users = loadUsers();
                const requesterUser = findUser(users, requester);
                const friendUser = findUserByTag(users, friendTag);

                if (!requesterUser || !friendUser) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'User not found' }));
                    return;
                }

                requesterUser.friends = requesterUser.friends.filter(f => f.tag !== friendUser.tag);
                friendUser.friends = (friendUser.friends || []).filter(f => f.tag !== requesterUser.tag);

                saveUsers(users);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, friends: requesterUser.friends }));
            } catch (err) {
                console.error('Failed to remove friend:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return true;
    }

    if (url === '/api/suggestions' && req.method === 'GET') {
        const requester = req.headers['x-username'];
        if (!requester || !isUserAdmin(requester)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Admin access required' }));
            return true;
        }
        const suggestions = loadSuggestions();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(suggestions));
        return true;
    }

    if (url === '/api/suggestions' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const { username, tag, message } = JSON.parse(body || '{}');
                if (!username || !message) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing username or message' }));
                    return;
                }

                const trimmed = String(message || '').trim();
                if (trimmed.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Message cannot be empty' }));
                    return;
                }

                const users = loadUsers();
                const user = findUser(users, username);
                if (!user) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'User not found' }));
                    return;
                }

                const suggestions = loadSuggestions();
                suggestions.unshift({
                    id: Date.now(),
                    username: user.username,
                    tag: user.tag,
                    displayTag: formatUserTag(user),
                    message: trimmed,
                    createdAt: new Date().toISOString(),
                    status: 'pending' // pending, in_progress, completed
                });
                saveSuggestions(suggestions);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.error('Failed to save suggestion:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return true;
    }

    // PATCH /api/suggestions/:id - Update suggestion status (admin only)
    if (url.match(/^\/api\/suggestions\/\d+$/) && req.method === 'PATCH') {
        const requester = req.headers['x-username'];
        if (!requester || !isUserAdmin(requester)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Admin access required' }));
            return true;
        }

        const suggestionId = parseInt(url.split('/')[3]);
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const { status } = JSON.parse(body || '{}');
                if (!status || !['pending', 'in_progress', 'completed'].includes(status)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid status' }));
                    return;
                }

                const suggestions = loadSuggestions();
                const suggestion = suggestions.find(s => s.id === suggestionId);
                if (!suggestion) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Suggestion not found' }));
                    return;
                }

                suggestion.status = status;
                suggestion.updatedAt = new Date().toISOString();
                saveSuggestions(suggestions);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.error('Failed to update suggestion:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return true;
    }

    // DELETE /api/users/:username/games/:gameId - Delete a completed game (requires same user or admin)
    if (url.match(/^\/api\/users\/[^\/]+\/games\/\d+$/) && req.method === 'DELETE') {
        const parts = url.split('/');
        const urlUsername = decodeURIComponent(parts[3]);
        const gameId = parseInt(parts[5]);

        // Get requesting user info from headers
        const requestingUser = req.headers['x-username'];

        if (!requestingUser) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Authentication required' }));
            return true;
        }

        // Security: Server-side admin validation - NEVER trust client headers
        const isAdmin = isUserAdmin(requestingUser);

        // Check permission: must be same user or admin
        if (requestingUser.toLowerCase() !== urlUsername.toLowerCase() && !isAdmin) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'You do not have permission to delete this game' }));
            return true;
        }

        fs.readFile(usersFilePath, 'utf8', (err, data) => {
            if (err || !data) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to read users' }));
                return;
            }

            let users = JSON.parse(data);
            const userIndex = users.findIndex(u => u.username.toLowerCase() === urlUsername.toLowerCase());

            if (userIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'User not found' }));
                return;
            }

            const user = users[userIndex];
            if (!user.completedGames) {
                user.completedGames = [];
            }

            const initialLength = user.completedGames.length;
            user.completedGames = user.completedGames.filter(g => g.id !== gameId);

            if (user.completedGames.length === initialLength) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Game not found' }));
                return;
            }

            // Save updated users
            fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), (err) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to delete game' }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
        });
        return true;
    }

    // GET /api/presets - Get all presets
    if (url === '/api/presets' && req.method === 'GET') {
        try {
            const data = fs.readFileSync(presetsPath, 'utf8');
            const presets = JSON.parse(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(presets));
        } catch (error) {
            // If file doesn't exist, return empty array
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
        }
        return true;
    }

    // POST /api/presets - Save a new preset
    if (url === '/api/presets' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const newPreset = JSON.parse(body);

                // Validate preset
                if (!newPreset.title || !newPreset.items || !Array.isArray(newPreset.items) || newPreset.items.length < 5) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid preset data' }));
                    return;
                }

                // Load existing presets
                let presets = [];
                try {
                    const data = fs.readFileSync(presetsPath, 'utf8');
                    presets = JSON.parse(data);
                } catch (error) {
                    // File doesn't exist yet, start with empty array
                    presets = [];
                }

                // Add new preset
                presets.push(newPreset);

                // Save to file
                fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, preset: newPreset }));
            } catch (error) {
                console.error('Error saving preset:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to save preset' }));
            }
        });
        return true;
    }

    // DELETE /api/presets/:id - Delete a preset (requires creator or admin)
    if (url.startsWith('/api/presets/') && req.method === 'DELETE') {
        const presetId = parseInt(url.split('/')[3]);

        // Get username from headers
        const username = req.headers['x-username'];

        if (!username) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Authentication required' }));
            return true;
        }

        // Security: Server-side admin validation - NEVER trust client headers
        const isAdmin = isUserAdmin(username);

        try {
            let presets = [];
            try {
                const data = fs.readFileSync(presetsPath, 'utf8');
                presets = JSON.parse(data);
            } catch (error) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Presets not found' }));
                return true;
            }

            const preset = presets.find(p => p.id === presetId);

            if (!preset) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Preset not found' }));
                return true;
            }

            // Check permission: must be creator or admin
            if (preset.creator !== username && !isAdmin) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'You do not have permission to delete this preset' }));
                return true;
            }

            const initialLength = presets.length;
            presets = presets.filter(p => p.id !== presetId);

            if (presets.length === initialLength) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Preset not found' }));
                return true;
            }

            fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error('Error deleting preset:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to delete preset' }));
        }
        return true;
    }

    // PUT /api/presets/:id - Update a preset
    if (url.startsWith('/api/presets/') && req.method === 'PUT') {
        const presetId = parseInt(url.split('/')[3]);
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const updatedPreset = JSON.parse(body);

                // Validate preset
                if (!updatedPreset.title || !updatedPreset.items || !Array.isArray(updatedPreset.items) || updatedPreset.items.length < 5) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid preset data' }));
                    return;
                }

                let presets = [];
                try {
                    const data = fs.readFileSync(presetsPath, 'utf8');
                    presets = JSON.parse(data);
                } catch (error) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Presets not found' }));
                    return;
                }

                const presetIndex = presets.findIndex(p => p.id === presetId);
                if (presetIndex === -1) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Preset not found' }));
                    return;
                }

                // Update preset while preserving id and creator
                presets[presetIndex] = {
                    ...presets[presetIndex],
                    title: updatedPreset.title,
                    description: updatedPreset.description,
                    items: updatedPreset.items
                };

                fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, preset: presets[presetIndex] }));
            } catch (error) {
                console.error('Error updating preset:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to update preset' }));
            }
        });
        return true;
    }

    return false;
}

// Create HTTP server
const server = http.createServer((req, res) => {
    // Handle API requests first
    if (req.url.startsWith('/api/')) {
        if (handleAPIRequest(req, res)) {
            return;
        }
    }

    // Handle favicon.ico to prevent 404 errors
    if (req.url === '/favicon.ico' || req.url.startsWith('/favicon.ico?')) {
        res.writeHead(204, { 'Content-Type': 'image/x-icon' });
        res.end();
        return;
    }

    // Parse URL for static files (strip query parameters)
    let urlPath = req.url.split('?')[0]; // Remove query string
    let filePath = urlPath === '/' ? '/index.html' : urlPath;
    filePath = path.join(__dirname, filePath);

    // Get file extension
    const extname = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    // Read and serve the file
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // File not found
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                // Server error
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            // Success - Add cache-control headers to prevent caching during development
            const headers = {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0'
            };

            // Extra strong cache busting for JavaScript and CSS files
            if (extname === '.js' || extname === '.css') {
                headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0';
                headers['Surrogate-Control'] = 'no-store';
                headers['ETag'] = `"${Date.now()}"`;
            }

            res.writeHead(200, headers);
            res.end(content, 'utf-8');
        }
    });
});

// Start server
server.listen(PORT, HOST, () => {
    console.log('\n========================================');
    console.log('🎮 Reverse Ranking Game Server');
    console.log('========================================\n');

    console.log('Server is running on:\n');
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`           http://127.0.0.1:${PORT}\n`);

    const localIPs = getLocalIPAddresses();
    if (localIPs.length > 0) {
        console.log('  Network: (for other devices on your network)\n');
        localIPs.forEach(ip => {
            console.log(`           http://${ip}:${PORT}`);
        });
        console.log('\n');
    }

    console.log('========================================');
    console.log('📱 Mobile & Tablet friendly!');
    console.log('🌐 Share the Network URL with others');
    console.log('❌ Press Ctrl+C to stop the server');
    console.log('========================================\n');
});

// Handle server errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${PORT} is already in use.`);
        console.error('Please close the other application or change the PORT in server.js\n');
    } else {
        console.error('\n❌ Server error:', error);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down server...');
    server.close(() => {
        console.log('✅ Server stopped successfully\n');
        process.exit(0);
    });
});
function generateTagNumber(existingTags = new Set()) {
    for (let attempts = 0; attempts < 1000; attempts++) {
        const useFiveDigits = Math.random() < 0.3; // allow some 5-digit tags
        const min = useFiveDigits ? 10000 : 1000;
        const max = useFiveDigits ? 99999 : 9999;
        const candidate = String(Math.floor(Math.random() * (max - min + 1)) + min);
        if (!existingTags.has(candidate)) {
            return candidate;
        }
    }
    return String(Date.now()).slice(-4);
}

function createDefaultStats() {
    return {
        rankingsCompleted: 0,
        rankingsHosted: 0,
        points: 0,
        gameModesCompleted: {
            singleDevice: 0,
            random: 0,
            preset: 0,
            lobby: 0,
            party: 0
        },
        lobbiesCreated: 0,
        lobbiesSaved: 0,
        incompleteGames: 0,
        gamesWithFriends: {}
    };
}

function ensureUserShape(users) {
    const existingTags = new Set();
    let mutated = false;

    users.forEach(user => {
        if (!user || typeof user !== 'object') {
            return;
        }

        if (!user.isRegistered && user.isRegistered !== false) {
            user.isRegistered = true;
            mutated = true;
        }

        if (!user.tag || existingTags.has(user.tag)) {
            const newTag = generateTagNumber(existingTags);
            user.tag = newTag;
            mutated = true;
        }
        existingTags.add(user.tag);

        if (!user.stats || typeof user.stats !== 'object') {
            user.stats = createDefaultStats();
            mutated = true;
        } else {
            user.stats.rankingsCompleted = user.stats.rankingsCompleted || 0;
            user.stats.rankingsHosted = user.stats.rankingsHosted || 0;
            user.stats.points = user.stats.points || 0;
            user.stats.gameModesCompleted = Object.assign({
                singleDevice: 0,
                random: 0,
                preset: 0,
                lobby: 0,
                party: 0
            }, user.stats.gameModesCompleted || {});
            user.stats.lobbiesCreated = user.stats.lobbiesCreated || 0;
            user.stats.lobbiesSaved = user.stats.lobbiesSaved || 0;
            user.stats.incompleteGames = user.stats.incompleteGames || 0;
            user.stats.gamesWithFriends = user.stats.gamesWithFriends || {};
        }

        if (!Array.isArray(user.completedGames)) {
            user.completedGames = [];
            mutated = true;
        }
        if (!Array.isArray(user.savedTitles)) {
            user.savedTitles = [];
            mutated = true;
        }
        if (!Array.isArray(user.presetGames)) {
            user.presetGames = [];
            mutated = true;
        }
        if (!Array.isArray(user.friends)) {
            user.friends = [];
            mutated = true;
        } else {
            user.friends = user.friends.map(friend => {
                if (!friend || typeof friend !== 'object') {
                    return null;
                }
                return {
                    username: friend.username,
                    tag: friend.tag,
                    since: friend.since || new Date().toISOString(),
                    gamesPlayedTogether: friend.gamesPlayedTogether || 0
                };
            }).filter(Boolean);
        }

        if (!user.avatar || typeof user.avatar !== 'object') {
            user.avatar = {
                color: '#3b82f6',
                initial: user.username ? user.username.charAt(0).toUpperCase() : '?'
            };
            mutated = true;
        } else {
            user.avatar.initial = user.avatar.initial || (user.username ? user.username.charAt(0).toUpperCase() : '?');
            user.avatar.color = user.avatar.color || '#3b82f6';
        }
    });

    return mutated;
}

function loadUsers() {
    try {
        const raw = fs.readFileSync(usersFilePath, 'utf8');
        const users = raw ? JSON.parse(raw) : [];
        const mutated = ensureUserShape(users);
        if (mutated) {
            try {
                fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
            } catch (err) {
                console.error('Failed to persist user shape normalization:', err);
            }
        }
        return users;
    } catch (err) {
        console.error('Failed to read users file:', err);
        return [];
    }
}

function saveUsers(users) {
    const snapshot = Array.isArray(users) ? users : [];
    ensureUserShape(snapshot);
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(snapshot, null, 2));
    } catch (err) {
        console.error('Failed to write users file:', err);
        throw err;
    }
}

function findUser(users, username) {
    return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

function findUserByTag(users, tag) {
    return users.find(u => u.tag === tag);
}

function formatUserTag(user) {
    if (!user) return '';
    return `${user.username}#${user.tag}`;
}

function loadSuggestions() {
    try {
        const raw = fs.readFileSync(suggestionsPath, 'utf8');
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.error('Failed to read suggestions:', err);
        return [];
    }
}

function saveSuggestions(suggestions) {
    fs.writeFileSync(suggestionsPath, JSON.stringify(suggestions, null, 2));
}
