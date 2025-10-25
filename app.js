// Game State
let gameState = {
    currentScreen: 'loginScreen',
    currentUser: null,
    userType: null, // 'guest' or 'registered'
    gameTitle: '',
    players: [],
    currentPlayerIndex: 0,
    rankingItems: [],
    completedGames: [],
    savedTitles: [],
    sortOrder: 'date-new',
    lobby: {
        players: [],
        host: null,
        gameTitle: '',
        rowAmount: 10
    }
};

// Active lobbies database (stored on server)
let activeLobbies = [];

// Color palette for players
const playerColors = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
    '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4',
    '#84cc16', '#f97316', '#14b8a6', '#a855f7'
];

// Shuffled colors for current game
let shuffledColors = [];

// Initialize app
async function init() {
    await loadLobbiesFromStorage();
    setupModalKeyboardSupport();

    // Check if user is already logged in (guest only - registered must login each time)
    const savedUser = localStorage.getItem('currentUser');
    const savedUserType = localStorage.getItem('userType');
    if (savedUser && savedUserType && savedUserType === 'guest') {
        gameState.currentUser = savedUser;
        gameState.userType = savedUserType;
        showHomepage();
    } else {
        // Clear any registered user sessions (require re-login for server validation)
        if (savedUserType === 'registered') {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('userType');
        }
        showScreen('loginScreen');
    }

    // Set up periodic lobby refresh
    // Homepage: every 5 seconds
    // Lobby screen: every 2 seconds (faster for real-time feel)
    setInterval(() => {
        if (gameState.currentScreen === 'lobbyScreen') {
            refreshLobbies();
        }
    }, 2000);

    setInterval(() => {
        if (gameState.currentScreen === 'homepage') {
            refreshLobbies();
        }
    }, 5000);
}

// Refresh lobbies from server
async function refreshLobbies() {
    await loadLobbiesFromStorage();

    if (gameState.currentScreen === 'homepage') {
        renderActiveLobbies();
    } else if (gameState.currentScreen === 'lobbyScreen' && gameState.lobby) {
        // Update current lobby from server data
        const updatedLobby = activeLobbies.find(l => l.id === gameState.lobby.id);

        if (updatedLobby) {
            // Check if game has started
            if (updatedLobby.gameState && updatedLobby.gameState.phase === 'setup') {
                // Game started! Transition to setup screen
                gameState.lobby = updatedLobby;
                gameState.gameTitle = updatedLobby.gameState.gameTitle;
                gameState.players = updatedLobby.gameState.players;
                gameState.currentPlayerIndex = updatedLobby.gameState.currentPlayerIndex;
                gameState.rankingItems = updatedLobby.gameState.rankingItems;

                renderSetupScreen();
                showScreen('setupScreen');
                return;
            }

            // Update local lobby state
            gameState.lobby = updatedLobby;

            // Update UI elements (only if not currently focused to prevent overwriting user input)
            const titleInput = document.getElementById('lobbyGameTitle');
            if (titleInput && document.activeElement !== titleInput) {
                titleInput.value = updatedLobby.gameTitle;
            }

            const rowInput = document.getElementById('lobbyRowAmount');
            if (rowInput && document.activeElement !== rowInput) {
                rowInput.value = updatedLobby.rowAmount;
            }

            document.getElementById('lobbyJoinCode').textContent = updatedLobby.joinCode;

            // Check current user's ready status
            const currentPlayer = updatedLobby.players.find(p => p.username === gameState.currentUser);
            if (currentPlayer) {
                const readyButton = document.getElementById('readyButton');
                if (currentPlayer.ready) {
                    readyButton.classList.add('is-ready');
                    readyButton.textContent = 'Not Ready';
                } else {
                    readyButton.classList.remove('is-ready');
                    readyButton.textContent = 'Ready Up';
                }
            }

            // Re-render players and ready count
            renderLobbyPlayers();
            updateReadyCount();
        } else {
            // Lobby was deleted, return to homepage
            showModal('Lobby Closed', 'The host has closed this lobby.');
            showHomepage();
        }
    } else if ((gameState.currentScreen === 'setupScreen' || gameState.currentScreen === 'gameScreen') && gameState.lobby) {
        // Check for game state updates during setup/gameplay
        const updatedLobby = activeLobbies.find(l => l.id === gameState.lobby.id);

        if (updatedLobby && updatedLobby.gameState) {
            gameState.lobby = updatedLobby;

            // If we're in setup and game phase changed to playing, transition
            if (gameState.currentScreen === 'setupScreen' && updatedLobby.gameState.phase === 'playing') {
                gameState.rankingItems = updatedLobby.gameState.rankingItems;
                renderGameScreen();
                showScreen('gameScreen');
                return;
            }

            // Sync game state if in game screen
            if (gameState.currentScreen === 'gameScreen') {
                gameState.rankingItems = updatedLobby.gameState.rankingItems;
                gameState.currentPlayerIndex = updatedLobby.gameState.currentPlayerIndex;
                renderGameScreen();
            }
        }
    }
}

// Utility function to shuffle an array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Shuffle colors for a new game
function shuffleColors() {
    shuffledColors = shuffleArray(playerColors);
}

// Get player initials (first letter of each word, max 2)
function getPlayerInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    }
    return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// Custom Modal Functions
function showModal(title, message, buttons = null) {
    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalFooter = document.getElementById('modalFooter');

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    // Custom buttons or default OK button
    if (buttons) {
        modalFooter.innerHTML = '';
        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.className = button.class || 'btn-primary';
            btn.textContent = button.text;
            btn.onclick = button.onclick;
            modalFooter.appendChild(btn);
        });
    } else {
        // Reset to default OK button
        modalFooter.innerHTML = '<button class="btn-primary" onclick="closeModal()" id="modalOkButton">OK</button>';
    }

    modal.classList.add('active');
}

function closeModal() {
    const modal = document.getElementById('customModal');
    modal.classList.remove('active');
}

function setupModalKeyboardSupport() {
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('customModal');
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

// User Management Functions (server-side only now)

// Guest login
function loginAsGuest() {
    const username = document.getElementById('guestUsernameInput').value.trim();

    if (!username) {
        showModal('Error', 'Please enter a display name!');
        return;
    }

    if (username.length < 3) {
        showModal('Error', 'Display name must be at least 3 characters!');
        return;
    }

    // Set current user as guest
    gameState.currentUser = username + ' (Guest)';
    gameState.userType = 'guest';
    localStorage.setItem('currentUser', gameState.currentUser);
    localStorage.setItem('userType', 'guest');

    showHomepage();
}

// Registered user login
async function loginRegistered() {
    const username = document.getElementById('loginUsernameInput').value.trim();
    const password = document.getElementById('loginPasswordInput').value;

    if (!username) {
        showModal('Error', 'Please enter your username!');
        return;
    }

    if (!password) {
        showModal('Error', 'Please enter your password!');
        return;
    }

    try {
        // Validate credentials with server
        const response = await fetch('/api/users/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Set current user
            gameState.currentUser = username;
            gameState.userType = 'registered';
            localStorage.setItem('currentUser', username);
            localStorage.setItem('userType', 'registered');

            await loadUserData();
            showHomepage();
        } else {
            showModal('Login Failed', result.error || 'Invalid username or password!');
        }
    } catch (error) {
        console.error('Login error:', error);
        showModal('Connection Error', 'Cannot connect to server. Please make sure the server is running.');
    }
}

// Register new user
async function registerUser() {
    const username = document.getElementById('loginUsernameInput').value.trim();
    const password = document.getElementById('loginPasswordInput').value;

    if (!username) {
        showModal('Error', 'Please enter a username!');
        return;
    }

    if (username.length < 3) {
        showModal('Error', 'Username must be at least 3 characters!');
        return;
    }

    // Validate password requirement
    if (!password || password.trim().length === 0) {
        showModal('Error', 'Password is required for registered accounts!');
        return;
    }

    if (password.length < 6) {
        showModal('Error', 'Password must be at least 6 characters!');
        return;
    }

    try {
        // Register with server
        const response = await fetch('/api/users/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showModal('Success!', `Account "${username}" created successfully!\n\nYou can now login.`);

            // Clear inputs
            document.getElementById('loginUsernameInput').value = '';
            document.getElementById('loginPasswordInput').value = '';
        } else {
            showModal('Registration Failed', result.error || 'Unable to register account!');
        }
    } catch (error) {
        showModal('Connection Error', 'Cannot connect to server. Please make sure the server is running.');
    }
}

function logout() {
    gameState.currentUser = null;
    gameState.userType = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userType');
    showScreen('loginScreen');

    // Clear inputs
    document.getElementById('guestUsernameInput').value = '';
    document.getElementById('loginUsernameInput').value = '';
    document.getElementById('loginPasswordInput').value = '';
}

async function loadUserData() {
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        const user = users.find(u => u.username === gameState.currentUser);
        if (user) {
            gameState.completedGames = user.completedGames || [];
            gameState.savedTitles = user.savedTitles || [];
        }
    } catch (error) {
        console.error('Failed to load user data:', error);
        gameState.completedGames = [];
        gameState.savedTitles = [];
    }
}

async function saveUserData() {
    try {
        // Get all users
        const response = await fetch('/api/users');
        const users = await response.json();

        // Update the current user's data
        const userIndex = users.findIndex(u => u.username === gameState.currentUser);
        if (userIndex !== -1) {
            users[userIndex].completedGames = gameState.completedGames;
            users[userIndex].savedTitles = gameState.savedTitles;

            // Save back to server
            await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(users)
            });
        }
    } catch (error) {
        console.error('Failed to save user data:', error);
    }
}

// Lobby Storage Functions (Server-based)
async function loadLobbiesFromStorage() {
    try {
        const response = await fetch('/api/lobbies');
        if (response.ok) {
            activeLobbies = await response.json();
        }
    } catch (error) {
        console.error('Failed to load lobbies:', error);
        // Fallback to localStorage
        const saved = localStorage.getItem('reverseRankingLobbies');
        if (saved) {
            activeLobbies = JSON.parse(saved);
        }
    }
}

async function saveLobbies() {
    try {
        await fetch('/api/lobbies', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(activeLobbies)
        });
    } catch (error) {
        console.error('Failed to save lobbies:', error);
        // Fallback to localStorage
        localStorage.setItem('reverseRankingLobbies', JSON.stringify(activeLobbies));
    }
}

// Generate 6-character join code
function generateJoinCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar chars
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

function copyJoinCode() {
    const code = document.getElementById('lobbyJoinCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showModal('Copied!', `Join code "${code}" copied to clipboard!`);
    }).catch(() => {
        showModal('Join Code', `Share this code with friends:\n\n${code}`);
    });
}

function joinByCode() {
    const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();

    if (!code) {
        showModal('Error', 'Please enter a join code!');
        return;
    }

    const lobby = activeLobbies.find(l => l.joinCode === code);

    if (!lobby) {
        showModal('Not Found', 'No lobby found with that join code!');
        return;
    }

    joinLobby(lobby.id);
}

// Homepage Functions
function showHomepage() {
    document.getElementById('currentUsername').textContent = gameState.currentUser;

    // Update user badge
    const badgeEl = document.getElementById('userBadge');
    badgeEl.textContent = gameState.userType;
    badgeEl.className = `user-badge ${gameState.userType}`;

    // Hide features based on user type
    if (gameState.userType === 'guest') {
        // Hide Rankings and Presets for guests
        const gameModes = document.querySelectorAll('.game-mode-card');
        gameModes.forEach(card => {
            const text = card.textContent;
            if (text.includes('Rankings') || text.includes('Preset')) {
                card.style.opacity = '0.5';
                card.style.pointerEvents = 'none';
                card.style.filter = 'grayscale(50%)';
            }
        });
    } else {
        // Show all features for registered users
        const gameModes = document.querySelectorAll('.game-mode-card');
        gameModes.forEach(card => {
            card.style.opacity = '1';
            card.style.pointerEvents = 'auto';
            card.style.filter = 'none';
        });
    }

    renderActiveLobbies();
    showScreen('homepage');
}

function renderActiveLobbies() {
    const container = document.getElementById('activeLobbiesList');
    if (!container) return;

    container.innerHTML = '';

    if (activeLobbies.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No active lobbies. Create one to get started!</p>';
        return;
    }

    activeLobbies.forEach(lobby => {
        const card = document.createElement('div');
        card.className = 'lobby-card';

        const readyCount = lobby.players.filter(p => p.ready).length;
        const totalCount = lobby.players.length;

        card.innerHTML = `
            <div class="lobby-card-header">
                <h3 class="lobby-card-title">${lobby.gameTitle || 'Untitled Game'}</h3>
                <span class="lobby-card-badge">${lobby.joinCode}</span>
            </div>
            <div class="lobby-card-info">
                <div class="lobby-card-detail">
                    <strong>Host:</strong> ${lobby.host}
                </div>
                <div class="lobby-card-detail">
                    <strong>Rows:</strong> ${lobby.rowAmount}
                </div>
            </div>
            <div class="lobby-card-footer">
                <span class="lobby-player-count">${totalCount} player${totalCount !== 1 ? 's' : ''}</span>
                <span class="lobby-ready-count">${readyCount} ready</span>
            </div>
        `;

        card.onclick = () => joinLobby(lobby.id);
        container.appendChild(card);
    });
}

function startNewGame() {
    shuffleColors();
    gameState.players = [];
    const playerList = document.getElementById('playerList');
    if (playerList) {
        playerList.innerHTML = '';
    }
    addPlayer();
    showScreen('mainMenu');
}

function startRandomGame() {
    const randomTitles = ['Top 10 Movies', 'Best Songs', 'Favorite Foods', 'Dream Destinations', 'Coolest Cars', 'Best Video Games', 'Favorite TV Shows', 'Greatest Athletes', 'Best Restaurants', 'Top Vacation Spots'];
    const randomTitle = randomTitles[Math.floor(Math.random() * randomTitles.length)];
    const randomRows = Math.floor(Math.random() * 11) + 5; // 5-15 rows

    // Set random title and rows in the main menu
    shuffleColors();
    gameState.players = [];
    const playerList = document.getElementById('playerList');
    if (playerList) {
        playerList.innerHTML = '';
    }
    addPlayer();

    document.getElementById('gameTitle').value = randomTitle;
    document.getElementById('rowAmount').value = randomRows;

    showScreen('mainMenu');
}

function loadPresetGame() {
    // Check if user is registered
    if (gameState.userType === 'guest') {
        showModal('Registered Only', 'This feature is only available for registered users.\n\nRegister an account to create and use presets!');
        return;
    }

    const user = usersDB.find(u => u.username === gameState.currentUser);
    if (!user || !user.presetGames || user.presetGames.length === 0) {
        showModal('No Presets', 'You haven\'t saved any preset games yet!\n\nComplete a game to save it as a preset.');
        return;
    }

    // Show preset games in modal
    const presetList = user.presetGames.map((preset, index) =>
        `${index + 1}. ${preset.title} (${preset.allItems.length} items)`
    ).join('\n');

    showModal('Preset Games', `Available presets:\n\n${presetList}\n\nThis feature is coming soon!`);
}

// Party Mode Functions
function startPartyMode() {
    // Initialize party mode
    gameState.players = [];
    const partyPlayerList = document.getElementById('partyPlayerList');
    if (partyPlayerList) {
        partyPlayerList.innerHTML = '';
    }
    document.getElementById('partyGameTitle').value = '';
    document.getElementById('partyRowAmount').value = '10';

    // Add first player
    addPartyPlayer();
    showScreen('partyModeScreen');
}

function addPartyPlayer() {
    const playerList = document.getElementById('partyPlayerList');
    const playerIndex = gameState.players.length;

    const playerEntry = document.createElement('div');
    playerEntry.className = 'player-entry';
    playerEntry.innerHTML = `
        <span class="player-label">Player ${playerIndex + 1}</span>
        <input type="text" placeholder="Enter player name" maxlength="20" data-player-index="${playerIndex}">
        ${playerIndex > 0 ? '<button class="btn-remove" onclick="removePartyPlayer(' + playerIndex + ')">×</button>' : ''}
    `;
    playerList.appendChild(playerEntry);

    gameState.players.push({ name: '', color: '' });
}

function removePartyPlayer(index) {
    gameState.players.splice(index, 1);
    renderPartyPlayerList();
}

function renderPartyPlayerList() {
    const playerList = document.getElementById('partyPlayerList');
    playerList.innerHTML = '';

    gameState.players.forEach((player, index) => {
        const playerEntry = document.createElement('div');
        playerEntry.className = 'player-entry';
        playerEntry.innerHTML = `
            <span class="player-label">Player ${index + 1}</span>
            <input type="text" placeholder="Enter player name" maxlength="20" data-player-index="${index}" value="${player.name}">
            ${index > 0 ? '<button class="btn-remove" onclick="removePartyPlayer(' + index + ')">×</button>' : ''}
        `;
        playerList.appendChild(playerEntry);
    });
}

function adjustPartyRows(delta) {
    const input = document.getElementById('partyRowAmount');
    let value = parseInt(input.value) || 10;
    value = Math.max(1, Math.min(100, value + delta));
    input.value = value;
}

function setupPartyGame() {
    const title = document.getElementById('partyGameTitle').value.trim();
    const rowAmount = parseInt(document.getElementById('partyRowAmount').value);

    if (!title) {
        showModal('Error', 'Please enter a game title!');
        return;
    }

    // Get player names from inputs
    const playerInputs = document.querySelectorAll('#partyPlayerList input[data-player-index]');
    gameState.players = [];

    playerInputs.forEach((input, index) => {
        const name = input.value.trim();
        if (!name) {
            showModal('Error', `Please enter a name for Player ${index + 1}!`);
            return;
        }
        gameState.players.push({ name: name, color: '' });
    });

    if (gameState.players.length < 2) {
        showModal('Error', 'Party Mode requires at least 2 players!');
        return;
    }

    // Assign colors
    shuffleColors();
    gameState.players.forEach((player, index) => {
        player.color = shuffledColors[index % shuffledColors.length];
    });

    gameState.gameTitle = title;
    gameState.currentPlayerIndex = 0;
    gameState.rankingItems = [];

    // Initialize ranking items
    for (let i = 1; i <= rowAmount; i++) {
        gameState.rankingItems.push({
            number: i,
            value: '',
            removed: false
        });
    }

    renderSetupScreen();
    showScreen('setupScreen');
}

function returnToHomepage() {
    showHomepage();
}

// Quick Lobby Functions
function createNewLobby() {
    // Create new lobby
    const newLobby = {
        id: Date.now(),
        joinCode: generateJoinCode(),
        host: gameState.currentUser,
        gameTitle: '',
        rowAmount: 10,
        players: [{
            username: gameState.currentUser,
            ready: false,
            isHost: true
        }],
        createdAt: new Date().toISOString()
    };

    // Add to active lobbies
    activeLobbies.push(newLobby);
    saveLobbies();

    // Set current lobby
    gameState.lobby = newLobby;

    // Display join code
    document.getElementById('lobbyJoinCode').textContent = newLobby.joinCode;

    // Show dev button for simulating players
    document.getElementById('addPlayerBtn').style.display = 'inline-block';

    renderLobbyPlayers();
    updateReadyCount();
    showScreen('lobbyScreen');
}

function joinLobby(lobbyId) {
    const lobby = activeLobbies.find(l => l.id === lobbyId);

    if (!lobby) {
        showModal('Error', 'Lobby not found!');
        return;
    }

    // Check if user already in lobby
    if (lobby.players.some(p => p.username === gameState.currentUser)) {
        showModal('Already Joined', 'You are already in this lobby!');
        // Still show the lobby
        gameState.lobby = lobby;
        document.getElementById('lobbyGameTitle').value = lobby.gameTitle;
        document.getElementById('lobbyRowAmount').value = lobby.rowAmount;
        document.getElementById('lobbyJoinCode').textContent = lobby.joinCode;

        // Hide dev button if not host
        if (lobby.host !== gameState.currentUser) {
            document.getElementById('addPlayerBtn').style.display = 'none';
        } else {
            document.getElementById('addPlayerBtn').style.display = 'inline-block';
        }

        renderLobbyPlayers();
        updateReadyCount();
        showScreen('lobbyScreen');
        return;
    }

    // Add player to lobby
    lobby.players.push({
        username: gameState.currentUser,
        ready: false,
        isHost: false
    });

    saveLobbies();
    gameState.lobby = lobby;

    // Set lobby values
    document.getElementById('lobbyGameTitle').value = lobby.gameTitle;
    document.getElementById('lobbyRowAmount').value = lobby.rowAmount;
    document.getElementById('lobbyJoinCode').textContent = lobby.joinCode;

    // Hide dev button if not host
    document.getElementById('addPlayerBtn').style.display = 'none';

    renderLobbyPlayers();
    updateReadyCount();
    showScreen('lobbyScreen');
}

// Simulate adding a player (for development/testing)
async function simulateAddPlayer() {
    const randomNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
    const usedNames = gameState.lobby.players.map(p => p.username);
    const availableNames = randomNames.filter(n => !usedNames.includes(n));

    if (availableNames.length === 0) {
        showModal('Lobby Full', 'No more simulated players available!');
        return;
    }

    const randomName = availableNames[Math.floor(Math.random() * availableNames.length)];

    gameState.lobby.players.push({
        username: randomName,
        ready: false,
        isHost: false
    });

    // Update the lobby in activeLobbies
    const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
    if (lobbyIndex !== -1) {
        activeLobbies[lobbyIndex] = gameState.lobby;
        await saveLobbies();
    }

    renderLobbyPlayers();
    updateReadyCount();
}

function renderLobbyPlayers() {
    const container = document.getElementById('lobbyPlayersList');
    container.innerHTML = '';

    if (gameState.lobby.players.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No players in lobby</p>';
        return;
    }

    gameState.lobby.players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = `lobby-player ${player.ready ? 'ready' : ''}`;
        playerDiv.innerHTML = `
            <span class="lobby-player-name">${player.username}${player.isHost ? ' 👑' : ''}</span>
            <span class="lobby-player-status ${player.ready ? 'ready' : ''}">${player.ready ? 'Ready' : 'Not Ready'}</span>
        `;
        container.appendChild(playerDiv);
    });
}

async function adjustLobbyRows(delta) {
    const input = document.getElementById('lobbyRowAmount');
    const newValue = parseInt(input.value) + delta;
    if (newValue >= 1 && newValue <= 100) {
        input.value = newValue;
        gameState.lobby.rowAmount = newValue;

        // Update in activeLobbies
        const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
        if (lobbyIndex !== -1) {
            activeLobbies[lobbyIndex] = gameState.lobby;
            await saveLobbies();
        }
    }
}

async function updateLobbyTitle() {
    const title = document.getElementById('lobbyGameTitle').value;
    gameState.lobby.gameTitle = title;

    // Update in activeLobbies
    const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
    if (lobbyIndex !== -1) {
        activeLobbies[lobbyIndex] = gameState.lobby;
        await saveLobbies();
    }
}

async function toggleReady() {
    const currentPlayer = gameState.lobby.players.find(p => p.username === gameState.currentUser);
    if (currentPlayer) {
        currentPlayer.ready = !currentPlayer.ready;

        const readyButton = document.getElementById('readyButton');
        if (currentPlayer.ready) {
            readyButton.classList.add('is-ready');
            readyButton.textContent = 'Not Ready';
        } else {
            readyButton.classList.remove('is-ready');
            readyButton.textContent = 'Ready Up';
        }

        // Update in activeLobbies array
        const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
        if (lobbyIndex !== -1) {
            // Update the entire lobby object to ensure sync
            activeLobbies[lobbyIndex] = gameState.lobby;
            await saveLobbies();
        }

        renderLobbyPlayers();
        updateReadyCount();
    }
}

function updateReadyCount() {
    const readyPlayers = gameState.lobby.players.filter(p => p.ready).length;
    const totalPlayers = gameState.lobby.players.length;

    document.getElementById('readyCount').textContent = `${readyPlayers} / ${totalPlayers} players ready`;

    // Enable start button if all players are ready and at least 1 player
    const startButton = document.getElementById('startLobbyButton');
    if (totalPlayers > 0 && readyPlayers === totalPlayers) {
        startButton.disabled = false;
    } else {
        startButton.disabled = true;
    }
}

async function startLobbyGame() {
    // Only host can start the game
    const currentPlayer = gameState.lobby.players.find(p => p.username === gameState.currentUser);
    if (!currentPlayer || !currentPlayer.isHost) {
        showModal('Permission Denied', 'Only the lobby host can start the game!');
        return;
    }

    const title = document.getElementById('lobbyGameTitle').value.trim() || 'Lobby Game';
    const rows = parseInt(document.getElementById('lobbyRowAmount').value);

    shuffleColors();
    const lobbyPlayers = gameState.lobby.players.map((player, index) => ({
        name: player.username,
        color: shuffledColors[index % shuffledColors.length]
    }));

    const rankingItems = [];
    for (let i = 1; i <= rows; i++) {
        rankingItems.push({
            number: i,
            value: '',
            removed: false
        });
    }

    // Update lobby with game state
    const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
    if (lobbyIndex !== -1) {
        activeLobbies[lobbyIndex].gameState = {
            gameTitle: title,
            players: lobbyPlayers,
            currentPlayerIndex: 0,
            rankingItems: rankingItems,
            phase: 'setup' // setup, playing, completed
        };
        await saveLobbies();
    }

    // Set local game state
    gameState.gameTitle = title;
    gameState.players = lobbyPlayers;
    gameState.currentPlayerIndex = 0;
    gameState.rankingItems = rankingItems;

    renderSetupScreen();
    showScreen('setupScreen');
}

function leaveLobby() {
    // Remove player from lobby
    const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);

    if (lobbyIndex !== -1) {
        const lobby = activeLobbies[lobbyIndex];

        // Remove current user from players
        lobby.players = lobby.players.filter(p => p.username !== gameState.currentUser);

        // If lobby is empty or host left, delete the lobby
        if (lobby.players.length === 0 || lobby.host === gameState.currentUser) {
            activeLobbies.splice(lobbyIndex, 1);
        } else {
            // Update the lobby
            activeLobbies[lobbyIndex] = lobby;
        }

        saveLobbies();
    }

    showHomepage();
}

// Local Storage Functions (Updated)
function loadFromLocalStorage() {
    loadUserData();
    renderSavedTitles();
}

function saveToLocalStorage() {
    saveUserData();
}

// Screen Navigation
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenName).classList.add('active');
    gameState.currentScreen = screenName;
}

function returnToMenu() {
    // Return to homepage
    showHomepage();
}

// Player Management
function addPlayer() {
    const playerList = document.getElementById('playerList');
    const playerNumber = gameState.players.length + 1;
    const color = shuffledColors[gameState.players.length % shuffledColors.length];

    const playerEntry = document.createElement('div');
    playerEntry.className = 'player-entry';
    playerEntry.innerHTML = `
        <input type="text" class="player-name" placeholder="Player ${playerNumber} name" value="Player ${playerNumber}">
        <div class="player-color" style="background-color: ${color}"></div>
        ${playerNumber > 1 ? '<button class="player-remove" onclick="removePlayer(this)">×</button>' : ''}
    `;

    playerList.appendChild(playerEntry);
    gameState.players.push({ name: `Player ${playerNumber}`, color: color });
}

function removePlayer(button) {
    const playerEntry = button.parentElement;
    const index = Array.from(playerEntry.parentElement.children).indexOf(playerEntry);

    if (gameState.players.length > 1) {
        playerEntry.remove();
        gameState.players.splice(index, 1);
    }
}

function adjustRows(delta) {
    const input = document.getElementById('rowAmount');
    const newValue = parseInt(input.value) + delta;
    if (newValue >= 1 && newValue <= 100) {
        input.value = newValue;
    }
}

// Saved Titles
function renderSavedTitles() {
    const container = document.getElementById('savedTitlesList');
    container.innerHTML = '';

    gameState.savedTitles.forEach(title => {
        const chip = document.createElement('div');
        chip.className = 'saved-title-chip';
        chip.textContent = title;
        chip.onclick = () => {
            document.getElementById('gameTitle').value = title;
        };
        container.appendChild(chip);
    });
}

function saveGameTitle(title) {
    if (title && !gameState.savedTitles.includes(title)) {
        gameState.savedTitles.push(title);
        saveToLocalStorage();
        renderSavedTitles();
    }
}

// Setup Game - Go to setup screen
function setupGame() {
    const gameTitleInput = document.getElementById('gameTitle').value.trim();
    const rowAmount = parseInt(document.getElementById('rowAmount').value);

    if (!gameTitleInput) {
        showModal('Missing Information', 'Please enter a game title!');
        return;
    }

    if (rowAmount < 1) {
        showModal('Invalid Input', 'Please enter a valid number of rows!');
        return;
    }

    // Get player names from inputs
    const playerNameInputs = document.querySelectorAll('.player-name');
    gameState.players = Array.from(playerNameInputs).map((input, index) => ({
        name: input.value.trim() || `Player ${index + 1}`,
        color: playerColors[index % playerColors.length]
    }));

    gameState.gameTitle = gameTitleInput;
    gameState.currentPlayerIndex = 0;
    gameState.rankingItems = [];

    // Create ranking items
    for (let i = 1; i <= rowAmount; i++) {
        gameState.rankingItems.push({
            number: i,
            value: '',
            removed: false
        });
    }

    saveGameTitle(gameTitleInput);
    renderSetupScreen();
    showScreen('setupScreen');
}

// Render Setup Screen
function renderSetupScreen() {
    document.getElementById('setupTitle').textContent = gameState.gameTitle;
    const container = document.getElementById('setupList');
    container.innerHTML = '';

    gameState.rankingItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'setup-item';
        itemDiv.innerHTML = `
            <div class="setup-number">#${item.number}</div>
            <input type="text"
                   class="setup-input"
                   placeholder="Enter item ${item.number}..."
                   value="${item.value}"
                   onchange="updateSetupItem(${index}, this.value)">
        `;
        container.appendChild(itemDiv);
    });
}

function updateSetupItem(index, value) {
    gameState.rankingItems[index].value = value;
}

// Start Game from Setup Screen
async function startGameFromSetup() {
    // If this is a lobby game, update the phase to 'playing'
    if (gameState.lobby && gameState.lobby.gameState) {
        const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
        if (lobbyIndex !== -1) {
            activeLobbies[lobbyIndex].gameState.phase = 'playing';
            activeLobbies[lobbyIndex].gameState.rankingItems = gameState.rankingItems;
            await saveLobbies();
        }
    }

    renderGameScreen();
    showScreen('gameScreen');
}

// Render Game Screen
function renderGameScreen() {
    document.getElementById('gameCurrentTitle').textContent = gameState.gameTitle;
    renderRankingList();
    renderPlayersDisplay();
    renderTopRemaining();
    updateCurrentPlayerTurn();
}

function renderRankingList() {
    const container = document.getElementById('rankingList');
    container.innerHTML = '';

    gameState.rankingItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `ranking-item ${item.removed ? 'removed' : ''}`;
        itemDiv.innerHTML = `
            <div class="ranking-number">#${item.number}</div>
            <input type="text"
                   class="ranking-input"
                   placeholder="Enter item ${item.number}..."
                   value="${item.value}"
                   ${item.removed ? 'disabled' : ''}
                   onchange="updateRankingItem(${index}, this.value)">
            <button class="btn-remove"
                    onclick="removeRankingItem(${index})"
                    ${item.removed ? 'disabled' : ''}>
                Remove
            </button>
        `;
        container.appendChild(itemDiv);
    });
}

function updateRankingItem(index, value) {
    gameState.rankingItems[index].value = value;
}

async function removeRankingItem(index) {
    if (gameState.rankingItems[index].removed) return;

    gameState.rankingItems[index].removed = true;

    const remainingCount = gameState.rankingItems.filter(item => !item.removed).length;

    // Sync to lobby if in lobby game
    if (gameState.lobby && gameState.lobby.gameState) {
        const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
        if (lobbyIndex !== -1) {
            activeLobbies[lobbyIndex].gameState.rankingItems = gameState.rankingItems;
            activeLobbies[lobbyIndex].gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
            await saveLobbies();
        }
    }

    if (remainingCount === 1) {
        completeGame();
        return;
    }

    nextPlayer();
    renderRankingList();
    renderTopRemaining();
}

function renderPlayersDisplay() {
    const container = document.getElementById('playersDisplay');
    container.innerHTML = '';

    gameState.players.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = `player-display ${index === gameState.currentPlayerIndex ? 'active' : ''}`;
        const initials = getPlayerInitials(player.name);
        playerDiv.innerHTML = `
            <div class="player-display-color" style="background-color: ${player.color}">
                <span class="player-initials">${initials}</span>
            </div>
            <div class="player-display-name">${player.name}</div>
        `;
        container.appendChild(playerDiv);
    });
}

function updateCurrentPlayerTurn() {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const turnIndicator = document.getElementById('currentPlayerTurn');
    const initials = getPlayerInitials(currentPlayer.name);
    turnIndicator.innerHTML = `<span class="turn-initials">${initials}</span> ${currentPlayer.name}'s Turn`;
    turnIndicator.style.backgroundColor = currentPlayer.color;
    turnIndicator.style.color = '#fff';
}

function nextPlayer() {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    updateCurrentPlayerTurn();
    renderPlayersDisplay();
}

function renderTopRemaining() {
    const container = document.getElementById('topRemainingList');
    const remaining = gameState.rankingItems.filter(item => !item.removed);
    const count = remaining.length;

    // Update title
    const title = document.getElementById('topRemainingTitle');
    if (count <= 5) {
        title.textContent = count === 1 ? 'Top 1 - Winner!' : `Top ${count}`;
    } else {
        title.textContent = 'Remaining Items';
    }

    container.innerHTML = '';

    // Show only top 5 or less
    const itemsToShow = count <= 5 ? remaining : remaining.slice(0, 5);

    itemsToShow.forEach((item, index) => {
        const topItem = document.createElement('div');
        topItem.className = `top-item ${count === 1 ? 'winner' : ''}`;
        topItem.textContent = item.value || `#${item.number}`;
        container.appendChild(topItem);
    });

    if (count > 5) {
        const moreItem = document.createElement('div');
        moreItem.className = 'top-item';
        moreItem.style.opacity = '0.5';
        moreItem.textContent = `+ ${count - 5} more...`;
        container.appendChild(moreItem);
    }
}

// Complete Game
function completeGame() {
    const winner = gameState.rankingItems.find(item => !item.removed);

    const completedGame = {
        id: Date.now(),
        title: gameState.gameTitle,
        date: new Date().toISOString(),
        winner: winner.value || `#${winner.number}`,
        allItems: gameState.rankingItems.map(item => ({
            number: item.number,
            value: item.value,
            rank: item.removed ? null : 1
        })),
        players: gameState.players
    };

    gameState.completedGames.unshift(completedGame);
    saveToLocalStorage();

    // Store the completed game data for replay
    gameState.lastCompletedGame = completedGame;

    setTimeout(() => {
        showModal(
            '🎉 Game Complete!',
            `Winner: ${completedGame.winner}\n\nThis game has been saved to Completed Rankings.`,
            [
                {
                    text: 'New Game',
                    class: 'btn-primary',
                    onclick: () => {
                        closeModal();
                        returnToMenu();
                    }
                },
                {
                    text: 'Replay Game',
                    class: 'btn-secondary',
                    onclick: () => {
                        closeModal();
                        replayGame();
                    }
                },
                {
                    text: 'View Rankings',
                    class: 'btn-secondary',
                    onclick: () => {
                        closeModal();
                        showCompletedRankings();
                    }
                }
            ]
        );
    }, 500);
}

// Replay Game - Restart with same settings
function replayGame() {
    if (!gameState.lastCompletedGame) {
        returnToMenu();
        return;
    }

    const lastGame = gameState.lastCompletedGame;

    // Reset game state with same settings
    gameState.gameTitle = lastGame.title;
    gameState.players = lastGame.players.map(p => ({...p})); // Clone players
    gameState.currentPlayerIndex = 0;
    gameState.rankingItems = lastGame.allItems.map(item => ({
        number: item.number,
        value: item.value,
        removed: false
    }));

    // Render the game screen directly (skip setup since items are already filled)
    renderGameScreen();
    showScreen('gameScreen');
}

// Completed Rankings
function showCompletedRankings() {
    // Check if user is registered
    if (gameState.userType === 'guest') {
        showModal('Registered Only', 'This feature is only available for registered users.\n\nRegister an account to access game history!');
        return;
    }

    // Set select value to current sort order
    document.getElementById('sortSelect').value = gameState.sortOrder;
    renderCompletedRankings();
    showScreen('completedScreen');
}

function changeSortOrder(sortOrder) {
    gameState.sortOrder = sortOrder;
    renderCompletedRankings();
}

function sortCompletedGames(games, sortOrder) {
    const sorted = [...games];

    switch (sortOrder) {
        case 'date-new':
            sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
            break;
        case 'date-old':
            sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
            break;
        case 'title-asc':
            sorted.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'title-desc':
            sorted.sort((a, b) => b.title.localeCompare(a.title));
            break;
        default:
            sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return sorted;
}

function renderCompletedRankings() {
    const container = document.getElementById('completedList');
    container.innerHTML = '';

    if (gameState.completedGames.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No completed games yet. Start playing to see results here!</p>';
        return;
    }

    const sortedGames = sortCompletedGames(gameState.completedGames, gameState.sortOrder);

    sortedGames.forEach(game => {
        const card = document.createElement('div');
        card.className = 'completed-card';

        const date = new Date(game.date);
        const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

        card.innerHTML = `
            <h3>${game.title}</h3>
            <div class="completed-date">${formattedDate}</div>
            <div class="completed-winner">
                <div class="winner-label">Winner</div>
                <div class="winner-value">${game.winner}</div>
            </div>
        `;

        card.onclick = () => showGameDetails(game);
        container.appendChild(card);
    });
}

function showGameDetails(game) {
    const details = `Game: ${game.title}
Date: ${new Date(game.date).toLocaleString()}
Winner: ${game.winner}
Players: ${game.players.map(p => p.name).join(', ')}

All Items:
${game.allItems.map(item => `#${item.number}: ${item.value || '(unnamed)'}`).join('\n')}`;

    showModal('Game Details', details);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
