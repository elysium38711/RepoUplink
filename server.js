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

// Password hashing function
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// API endpoint handlers
function handleAPIRequest(req, res) {
    const url = req.url;

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
        fs.readFile(usersFilePath, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('[]');
                    return;
                }
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to read users' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data || '[]');
        });
        return true;
    }

    // POST /api/users - Save all users (for updating user data)
    if (url === '/api/users' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            fs.writeFile(usersFilePath, body, (err) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to save users' }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
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
                fs.readFile(usersFilePath, 'utf8', (err, data) => {
                    let users = [];
                    if (!err && data) {
                        users = JSON.parse(data);
                    }

                    // Check if username exists
                    const existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
                    if (existingUser) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Username already exists' }));
                        return;
                    }

                    // Create new user with hashed password
                    const newUser = {
                        username: username,
                        password: hashPassword(password),
                        isRegistered: true,
                        completedGames: [],
                        savedTitles: [],
                        presetGames: [],
                        createdAt: new Date().toISOString()
                    };

                    users.push(newUser);

                    // Save users
                    fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Failed to save user' }));
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, user: newUser }));
                    });
                });
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

                // Read users
                fs.readFile(usersFilePath, 'utf8', (err, data) => {
                    if (err || !data) {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid credentials' }));
                        return;
                    }

                    const users = JSON.parse(data);
                    const hashedPassword = hashPassword(password);
                    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === hashedPassword);

                    if (user) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, user: user }));
                    } else {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid credentials' }));
                    }
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
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

    // Parse URL for static files
    let filePath = req.url === '/' ? '/index.html' : req.url;
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
            // Success
            res.writeHead(200, { 'Content-Type': contentType });
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
