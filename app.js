// Game State - v1.0.2.1
console.log('app.js loaded successfully - version 1.0.2.1');
let gameState = {
    currentScreen: 'loginScreen',
    currentUser: null,
    userType: null, // 'guest' or 'registered'
    userTag: null,
    avatar: {
        color: '#3b82f6',
        initial: '?'
    },
    createdAt: null,
    userStats: createDefaultUserStats(),
    friends: [],
    suggestions: [],
    userDirectory: [],
    gameTitle: '',
    players: [],
    currentPlayerIndex: 0,
    rankingItems: [],
    removalHistory: [],
    completedGames: [],
    savedTitles: [],
    sortOrder: 'date-new',
    serverBootId: null,
    // Setup typing state to prevent premature field advancement on live sync
    pendingSetupIndex: null,
    pendingSetupPlayerIndex: null,
    // Random game mode flags
    isRandomGame: false,
    randomGameTitle: null,
    // Single device mode flag (no turn-based setup)
    isSingleDeviceMode: false,
    currentGameMode: null,
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

function createDefaultUserStats() {
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

function normalizeUserStats(stats) {
    const base = createDefaultUserStats();
    if (!stats || typeof stats !== 'object') {
        return base;
    }

    base.rankingsCompleted = stats.rankingsCompleted || 0;
    base.rankingsHosted = stats.rankingsHosted || 0;
    base.points = stats.points || 0;
    base.gameModesCompleted.singleDevice = stats.gameModesCompleted?.singleDevice || 0;
    base.gameModesCompleted.random = stats.gameModesCompleted?.random || 0;
    base.gameModesCompleted.preset = stats.gameModesCompleted?.preset || 0;
    base.gameModesCompleted.lobby = stats.gameModesCompleted?.lobby || 0;
    base.gameModesCompleted.party = stats.gameModesCompleted?.party || 0;
    base.lobbiesCreated = stats.lobbiesCreated || 0;
    base.lobbiesSaved = stats.lobbiesSaved || 0;
    base.incompleteGames = stats.incompleteGames || 0;
    base.gamesWithFriends = stats.gamesWithFriends || {};
    return base;
}

function normalizeFriends(friends) {
    if (!Array.isArray(friends)) return [];
    return friends.map(friend => ({
        username: friend.username,
        tag: friend.tag,
        since: friend.since || new Date().toISOString(),
        gamesPlayedTogether: friend.gamesPlayedTogether || 0
    }));
}

function getDisplayTag(username, tag) {
    if (!username) return '';
    return tag ? `${username}#${tag}` : username;
}

function formatDateDisplay(isoString, includeTime = false) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const options = includeTime
        ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleString(undefined, options);
}

function resolveCurrentGameModeKey() {
    if (gameState.currentGameMode && gameState.currentGameMode in createDefaultUserStats().gameModesCompleted) {
        return gameState.currentGameMode;
    }
    if (gameState.isSingleDeviceMode) return 'singleDevice';
    if (gameState.isRandomGame) return 'random';
    return 'singleDevice';
}

function updateStatsAfterGame(completedGame) {
    if (gameState.userType !== 'registered') {
        return;
    }

    if (!gameState.userStats || typeof gameState.userStats !== 'object') {
        gameState.userStats = createDefaultUserStats();
    }

    const stats = gameState.userStats;
    stats.rankingsCompleted += 1;

    const modeKey = resolveCurrentGameModeKey();
    if (!stats.gameModesCompleted[modeKey] && stats.gameModesCompleted[modeKey] !== 0) {
        stats.gameModesCompleted[modeKey] = 0;
    }
    stats.gameModesCompleted[modeKey] += 1;

    const hosted = !gameState.lobby || (gameState.lobby && gameState.lobby.host === gameState.currentUser);
    if (hosted) {
        stats.rankingsHosted += 1;
    }

    const players = Array.isArray(completedGame.players) ? completedGame.players : [];
    if (players.length > 0 && Array.isArray(gameState.friends) && gameState.friends.length > 0) {
        const participantNames = new Set(players.map(p => (p.name || p.username || '').toLowerCase()).filter(Boolean));
        const updatedFriends = gameState.friends.map(friend => {
            if (!friend || !friend.username) return friend;
            if (!participantNames.has(friend.username.toLowerCase())) {
                return friend;
            }
            const current = stats.gamesWithFriends[friend.tag] || 0;
            const newTotal = current + 1;
            stats.gamesWithFriends[friend.tag] = newTotal;
            return {
                ...friend,
                gamesPlayedTogether: newTotal
            };
        });
        gameState.friends = updatedFriends;
    }
}

// Initialize app
async function init() {
    await loadLobbiesFromStorage();
    await checkServerStatus(true);
    setupModalKeyboardSupport();

    // Check if user is already logged in
    const savedUser = localStorage.getItem('currentUser');
    const savedUserType = localStorage.getItem('userType');
    if (savedUser && savedUserType) {
        gameState.currentUser = savedUser;
        gameState.userType = savedUserType;

        // For registered users, load their user data
        if (savedUserType === 'registered') {
            await loadUserData();
        }

        showHomepage();
    } else {
        showScreen('loginScreen');
    }

    // Set up periodic lobby refresh
    // Homepage: every 5 seconds
    // Lobby screen: every 2 seconds (faster for real-time feel)
    setInterval(() => {
        if (gameState.currentScreen === 'lobbyScreen' || gameState.currentScreen === 'partyWaitingScreen' || gameState.currentScreen === 'partyLobbyScreen') {
            refreshLobbies();
            checkServerStatus();
        }
    }, 2000);

    setInterval(() => {
        if (gameState.currentScreen === 'homepage') {
            refreshLobbies();
            checkServerStatus();
        }
    }, 5000);

    // Also poll during setup and gameplay to keep clients in sync
    setInterval(() => {
        if (gameState.currentScreen === 'setupScreen' || gameState.currentScreen === 'gameScreen') {
            refreshLobbies();
            checkServerStatus();
        }
    }, 1000);
}

// Check server boot ID to detect restarts and force logout
async function checkServerStatus(initial = false) {
    try {
        const resp = await fetch('/api/status');
        if (!resp.ok) return;
        const data = await resp.json();
        const bootId = data && data.bootId ? data.bootId : null;
        if (!bootId) return;

        const stored = localStorage.getItem('serverBootId');
        if (!stored) {
            // First time seeing a boot ID for this client
            localStorage.setItem('serverBootId', bootId);
            gameState.serverBootId = bootId;
            return;
        }

        if (stored !== bootId) {
            // Server restarted â€” update stored ID, then force silent logout
            localStorage.setItem('serverBootId', bootId);
            gameState.serverBootId = bootId;
            // Silently kick all users off (guests and registered) without notification
            logout();
        } else if (initial) {
            gameState.serverBootId = bootId;
        }
    } catch (e) {
        // Ignore transient errors
    }
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
            const stillInLobby = updatedLobby.players.some(p => p.username === gameState.currentUser);
            if (!stillInLobby) {
                showModal('Removed from Lobby', 'You were removed from this lobby.');
                gameState.lobby = null;
                showHomepage();
                return;
            }

            // Check if game has started
            if (updatedLobby.gameState && updatedLobby.gameState.phase === 'setup') {
                // Game started! Transition to setup screen
                gameState.lobby = updatedLobby;
                gameState.gameTitle = updatedLobby.gameState.gameTitle;
            gameState.players = updatedLobby.gameState.players;
            gameState.currentPlayerIndex = updatedLobby.gameState.currentPlayerIndex;
            gameState.rankingItems = updatedLobby.gameState.rankingItems;
            gameState.removalHistory = updatedLobby.gameState.removalHistory || [];
            // Initialize pending index for first turn
            const firstEmpty = gameState.rankingItems.findIndex(i => !i.value || i.value.trim() === '');
            gameState.pendingSetupIndex = firstEmpty === -1 ? null : firstEmpty;
            gameState.pendingSetupPlayerIndex = gameState.currentPlayerIndex;

            renderSetupScreen();
            showScreen('setupScreen');
            return;
        }

        // Check if game is in playing phase (items pre-filled, skip setup)
        if (updatedLobby.gameState && updatedLobby.gameState.phase === 'playing') {
            // Game started! Transition directly to game screen
            gameState.lobby = updatedLobby;
            gameState.gameTitle = updatedLobby.gameState.gameTitle;
            gameState.players = updatedLobby.gameState.players;
            gameState.currentPlayerIndex = updatedLobby.gameState.currentPlayerIndex;
            gameState.rankingItems = updatedLobby.gameState.rankingItems;
            gameState.removalHistory = updatedLobby.gameState.removalHistory || [];

            renderGameScreen();
            showScreen('gameScreen');
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
    } else if (gameState.currentScreen === 'partyWaitingScreen' && gameState.lobby) {
        // Update party waiting room from server data
        const updatedLobby = activeLobbies.find(l => l.id === gameState.lobby.id);

        if (updatedLobby) {
            // Check if item creation has started
            if (updatedLobby.setupPhase === 'adding_items') {
                // Item creation started! Transition to lobby screen
                gameState.lobby = updatedLobby;
                showScreen('partyLobbyScreen');
                renderPartyLobby();
                return;
            }

            // Update local lobby state and re-render
            gameState.lobby = updatedLobby;
            renderPartyWaiting();
        } else {
            // Lobby was deleted, return to homepage
            showModal('Lobby Closed', 'The party lobby has been closed.');
            showHomepage();
        }
    } else if (gameState.currentScreen === 'partyLobbyScreen' && gameState.lobby) {
        // Update party lobby from server data
        const updatedLobby = activeLobbies.find(l => l.id === gameState.lobby.id);

        if (updatedLobby) {
            // Check if game has started
            if (updatedLobby.gameState && updatedLobby.gameState.phase === 'playing') {
                // Game started! Transition to game screen
                gameState.lobby = updatedLobby;
                gameState.gameTitle = updatedLobby.gameState.gameTitle;
                gameState.players = updatedLobby.gameState.players;
                gameState.currentPlayerIndex = updatedLobby.gameState.currentPlayerIndex;
                gameState.rankingItems = updatedLobby.gameState.rankingItems;
                gameState.removalHistory = updatedLobby.gameState.removalHistory || [];

                renderGameScreen();
                showScreen('gameScreen');
                return;
            }

            // Update local lobby state and re-render
            gameState.lobby = updatedLobby;
            renderPartyLobby();
        } else {
            // Lobby was deleted, return to homepage
            showModal('Lobby Closed', 'The party lobby has been closed.');
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
                gameState.currentPlayerIndex = updatedLobby.gameState.currentPlayerIndex;
                gameState.removalHistory = updatedLobby.gameState.removalHistory || [];
                gameState.players = updatedLobby.gameState.players || gameState.players;
                gameState.gameTitle = updatedLobby.gameState.gameTitle || gameState.gameTitle;
                renderGameScreen();
                showScreen('gameScreen');
                return;
            }

            // Sync game state if in setup/game screens, but only re-render when changed
            const itemsChanged = !areRankingItemsEqual(gameState.rankingItems, updatedLobby.gameState.rankingItems);
            const turnChanged = gameState.currentPlayerIndex !== updatedLobby.gameState.currentPlayerIndex;

            if (gameState.currentScreen === 'setupScreen') {
                if (itemsChanged || turnChanged) {
                    console.log('Setup screen refresh:', {
                        itemsChanged,
                        turnChanged,
                        oldPlayerIndex: gameState.currentPlayerIndex,
                        newPlayerIndex: updatedLobby.gameState.currentPlayerIndex,
                        players: updatedLobby.gameState.players
                    });
                    gameState.rankingItems = updatedLobby.gameState.rankingItems;
                    gameState.currentPlayerIndex = updatedLobby.gameState.currentPlayerIndex;
                    gameState.removalHistory = updatedLobby.gameState.removalHistory || gameState.removalHistory;
                    gameState.players = updatedLobby.gameState.players || gameState.players;
                    // Maintain pending index across live text updates; reset only on turn change
                    if (turnChanged) {
                        const newNext = gameState.rankingItems.findIndex(i => !i.value || i.value.trim() === '');
                        gameState.pendingSetupIndex = newNext === -1 ? null : newNext;
                        gameState.pendingSetupPlayerIndex = gameState.currentPlayerIndex;
                    }
                    renderSetupScreen();
                }
            } else if (gameState.currentScreen === 'gameScreen') {
                // Check if game has been completed
                if (updatedLobby.gameState.phase === 'completed') {
                    // Game completed! Show completion modal to all players
                    const completedGameData = updatedLobby.gameState.completedGame;
                    if (completedGameData) {
                        // Save to local completed games if not already there
                        if (!gameState.completedGames.find(g => g.id === completedGameData.id)) {
                            gameState.completedGames.unshift(completedGameData);
                            saveToLocalStorage();
                        }
                        gameState.lastCompletedGame = completedGameData;
                    }

                    // Show completion modal
                    showModal(
                        '🎉 Game Complete!',
                        `Winner: ${updatedLobby.gameState.winner}`,
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
                            },
                            {
                                text: 'Home',
                                class: 'btn-secondary',
                                onclick: () => {
                                    closeModal();
                                    showHomepage();
                                }
                            }
                        ]
                    );

                    // Clear lobby reference
                    gameState.lobby = null;
                    return;
                }

                if (itemsChanged || turnChanged) {
                    gameState.rankingItems = updatedLobby.gameState.rankingItems;
                    gameState.currentPlayerIndex = updatedLobby.gameState.currentPlayerIndex;
                    gameState.removalHistory = updatedLobby.gameState.removalHistory || gameState.removalHistory;
                    gameState.players = updatedLobby.gameState.players || gameState.players;
                    renderGameScreen();
                }
            }
            // Keep interactivity accurate even if no re-render was needed
            if (gameState.currentScreen === 'gameScreen') {
                updateGameInteractivity();
            }
        } else if (!updatedLobby) {
            showModal('Lobby Closed', 'The lobby has been closed.');
            showHomepage();
        }
    }
}

function areRankingItemsEqual(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (!x || !y) return false;
        if ((x.value || '').trim() !== (y.value || '').trim()) return false;
        if (!!x.removed !== !!y.removed) return false;
        if (x.number !== y.number) return false;
    }
    return true;
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

// Normalize names for comparison (ignore case and optional ' (Guest)' or '(Guest-####)' suffix)
function normalizeName(name) {
    if (!name) return '';
    let n = String(name).trim().toLowerCase();
    // strip trailing "(guest)" or "(guest-####)" if present
    n = n.replace(/\s*\(guest(-\d+)?\)\s*$/i, '').trim();
    return n;
}

function namesEqual(a, b) {
    return normalizeName(a) === normalizeName(b);
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
    // Inject Top 3 list on Game Complete modal
    let finalMessage = message;
    let isGameComplete = false;
    try {
        if (typeof title === 'string' && title.includes('Game Complete') && gameState && Array.isArray(gameState.removalHistory)) {
            isGameComplete = true;
            const lastTwo = (gameState.removalHistory || []).slice(-2).reverse();
            if (lastTwo.length >= 2) {
                const top3Text = `Winner and Runner Ups!\n\n1. ${message.replace('Winner: ', '')}\n2. ${lastTwo[0].value || `#${lastTwo[0].number}`}\n3. ${lastTwo[1].value || `#${lastTwo[1].number}`}`;
                finalMessage = top3Text;
            }
        }
    } catch (_) {}

    // Use innerHTML for Game Complete and Preset Details to allow styling, textContent for others
    if (isGameComplete) {
        // Make winner text bold and larger
        const lines = finalMessage.split('\n');
        const styledLines = lines.map((line, index) => {
            if (index === 0 || line.startsWith('1.')) {
                return `<div style="font-weight: bold; font-size: 1.3em;">${line}</div>`;
            }
            return line;
        });
        modalMessage.innerHTML = styledLines.join('<br>');
    } else if (title === 'Preset Details') {
        // Allow HTML for preset details
        modalMessage.innerHTML = finalMessage;
    } else {
        modalMessage.textContent = finalMessage;
    }

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

function showGameStartCountdown(callback) {
    let countdown = 3;
    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalFooter = document.getElementById('modalFooter');

    modalTitle.textContent = 'Game Starting...';
    modalMessage.innerHTML = `<div style="font-size: 3rem; font-weight: bold; text-align: center; padding: 2rem;">${countdown}</div>`;
    modalFooter.innerHTML = '';
    modal.classList.add('active');

    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            modalMessage.innerHTML = `<div style="font-size: 3rem; font-weight: bold; text-align: center; padding: 2rem;">${countdown}</div>`;
        } else {
            clearInterval(countdownInterval);
            modalMessage.innerHTML = `<div style="font-size: 2rem; font-weight: bold; text-align: center; padding: 2rem;">Let's Go! 🎮</div>`;
            setTimeout(() => {
                closeModal();
                callback();
            }, 500);
        }
    }, 1000);
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

    // Generate unique guest ID using timestamp + random component to prevent collisions
    const timestamp = Date.now().toString().slice(-4);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const guestId = timestamp + random.slice(0, 2);

    // Set current user as guest with unique identifier
    gameState.currentUser = username + ` (Guest-${guestId})`;
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

            // Check if user must change password
            if (result.user.mustChangePassword) {
                showScreen('changePasswordScreen');
                // Clear password input
                document.getElementById('loginPasswordInput').value = '';
            } else {
                await loadUserData();
                showHomepage();
            }
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

async function changePassword() {
    const currentPassword = document.getElementById('currentPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    if (!currentPassword) {
        showModal('Error', 'Please enter your current password!');
        return;
    }

    if (!newPassword) {
        showModal('Error', 'Please enter a new password!');
        return;
    }

    if (newPassword.length < 4) {
        showModal('Error', 'New password must be at least 4 characters!');
        return;
    }

    if (newPassword !== confirmPassword) {
        showModal('Error', 'New passwords do not match!');
        return;
    }

    if (currentPassword === newPassword) {
        showModal('Error', 'New password must be different from current password!');
        return;
    }

    try {
        const response = await fetch('/api/users/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: gameState.currentUser,
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showModal('Success!', 'Password changed successfully!', [
                {
                    text: 'Continue',
                    class: 'btn-primary',
                    onclick: async () => {
                        closeModal();
                        // Clear password inputs
                        document.getElementById('currentPasswordInput').value = '';
                        document.getElementById('newPasswordInput').value = '';
                        document.getElementById('confirmPasswordInput').value = '';
                        // Load user data and show homepage
                        await loadUserData();
                        showHomepage();
                    }
                }
            ]);
        } else {
            showModal('Failed', result.error || 'Failed to change password!');
        }
    } catch (error) {
        console.error('Change password error:', error);
        showModal('Connection Error', 'Cannot connect to server. Please make sure the server is running.');
    }
}

function logout() {
    gameState.currentUser = null;
    gameState.userType = null;
    gameState.userTag = null;
    gameState.avatar = {
        color: '#3b82f6',
        initial: '?'
    };
    gameState.createdAt = null;
    gameState.userStats = createDefaultUserStats();
    gameState.friends = [];
    gameState.suggestions = [];
    gameState.userDirectory = [];
    gameState.currentGameMode = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userType');

    const profileButton = document.getElementById('profileButton');
    if (profileButton) {
        profileButton.style.display = 'none';
    }

    const messagesButton = document.getElementById('messagesButton');
    if (messagesButton) {
        messagesButton.style.display = 'none';
    }

    const profileNameDisplay = document.getElementById('profileNameDisplay');
    if (profileNameDisplay) profileNameDisplay.textContent = '';
    const profileTagDisplay = document.getElementById('profileTagDisplay');
    if (profileTagDisplay) profileTagDisplay.textContent = '';
    const profileOwnTag = document.getElementById('profileOwnTag');
    if (profileOwnTag) profileOwnTag.textContent = 'N/A';
    const profileCreatedAt = document.getElementById('profileCreatedAt');
    if (profileCreatedAt) profileCreatedAt.textContent = '';
    const avatarInitial = document.getElementById('profileAvatarInitial');
    if (avatarInitial) avatarInitial.textContent = '?';
    const friendsList = document.getElementById('friendsList');
    if (friendsList) friendsList.innerHTML = '';
    const suggestionStatus = document.getElementById('suggestionStatus');
    if (suggestionStatus) suggestionStatus.textContent = '';
    const friendStatus = document.getElementById('friendStatus');
    if (friendStatus) friendStatus.textContent = '';

    showScreen('loginScreen');

    // Clear inputs
    document.getElementById('guestUsernameInput').value = '';
    document.getElementById('loginUsernameInput').value = '';
    document.getElementById('loginPasswordInput').value = '';
    document.getElementById('currentPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
}

async function loadUserData() {
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        gameState.userDirectory = Array.isArray(users) ? users : [];
        const user = users.find(u => u.username === gameState.currentUser);
        if (user) {
            gameState.completedGames = user.completedGames || [];
            gameState.savedTitles = user.savedTitles || [];
            gameState.isAdmin = user.isAdmin || false;
            gameState.userTag = user.tag || null;
            const defaultAvatar = {
                color: '#3b82f6',
                initial: gameState.currentUser ? gameState.currentUser.charAt(0).toUpperCase() : '?'
            };
            gameState.avatar = Object.assign(defaultAvatar, user.avatar || {});
            gameState.avatar.initial = (gameState.avatar.initial || defaultAvatar.initial || '?').toUpperCase();
            gameState.avatar.color = gameState.avatar.color || '#3b82f6';
            gameState.userStats = normalizeUserStats(user.stats);
            gameState.friends = normalizeFriends(user.friends);
            gameState.friends.forEach(friend => {
                if (friend && friend.tag && gameState.userStats.gamesWithFriends[friend.tag] == null) {
                    gameState.userStats.gamesWithFriends[friend.tag] = friend.gamesPlayedTogether || 0;
                }
            });
            gameState.userStats.lobbiesSaved = gameState.savedTitles.length;
            gameState.createdAt = user.createdAt || null;
        }
    } catch (error) {
        console.error('Failed to load user data:', error);
        gameState.completedGames = [];
        gameState.savedTitles = [];
        gameState.isAdmin = false;
        gameState.userTag = null;
        gameState.avatar = {
            color: '#3b82f6',
            initial: '?'
        };
        gameState.userStats = createDefaultUserStats();
        gameState.friends = [];
        gameState.userDirectory = [];
        gameState.createdAt = null;
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
            const updated = { ...users[userIndex] };
            updated.completedGames = gameState.completedGames;
            updated.savedTitles = gameState.savedTitles;
            updated.stats = normalizeUserStats(gameState.userStats);
            updated.stats.lobbiesSaved = gameState.savedTitles.length;
            updated.avatar = gameState.avatar;
            updated.friends = normalizeFriends(gameState.friends);
            users[userIndex] = updated;

            // Save back to server
            await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(users)
            });

            gameState.userDirectory = users;
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
        // Read latest from server to reduce clobbering concurrent updates
        let latest = [];
        try {
            const latestResp = await fetch('/api/lobbies');
            if (latestResp.ok) {
                latest = await latestResp.json();
            }
        } catch (_) { /* ignore and fall back to local activeLobbies */ }

        const byId = new Map();
        // Seed with server view
        if (Array.isArray(latest)) {
            latest.forEach(l => byId.set(l.id, l));
        }
        // Overlay with our local changes
        if (Array.isArray(activeLobbies)) {
            activeLobbies.forEach(l => byId.set(l.id, l));
        }

        const merged = Array.from(byId.values());

        await fetch('/api/lobbies', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(merged)
        });

        // Update local cache with what we attempted to persist
        activeLobbies = merged;
    } catch (error) {
        console.error('Failed to save lobbies:', error);
        // Fallback to localStorage
        try {
            localStorage.setItem('reverseRankingLobbies', JSON.stringify(activeLobbies));
        } catch (_) {}
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
    const usernameDisplay = document.getElementById('currentUsername');
    if (usernameDisplay) {
        usernameDisplay.textContent = getDisplayTag(gameState.currentUser, gameState.userTag);
    }

    const profileButton = document.getElementById('profileButton');
    if (profileButton) {
        if (gameState.userType === 'guest') {
            profileButton.style.display = 'none';
        } else {
            profileButton.style.display = '';
        }
    }

    const messagesButton = document.getElementById('messagesButton');
    if (messagesButton) {
        if (gameState.isAdmin) {
            messagesButton.style.display = '';
        } else {
            messagesButton.style.display = 'none';
        }
    }

    // Update user badge
    const badgeEl = document.getElementById('userBadge');
    badgeEl.textContent = gameState.userType;
    badgeEl.className = `user-badge ${gameState.userType}`;

    // Hide features based on user type
    if (gameState.userType === 'guest') {
        // Hide Rankings, Presets, Create Lobby, and Party Mode for guests
        const gameModes = document.querySelectorAll('.game-mode-card');
        gameModes.forEach(card => {
            const text = card.textContent;
            if (text.includes('Rankings') || text.includes('Preset') || text.includes('Create Lobby') || text.includes('Party Mode')) {
                card.style.opacity = '0.5';
                card.style.pointerEvents = 'none';
                card.style.filter = 'grayscale(50%)';
                card.style.position = 'relative';

                // Add "Locked" overlay if not already present
                if (!card.querySelector('.locked-overlay')) {
                    const lockedOverlay = document.createElement('div');
                    lockedOverlay.className = 'locked-overlay';
                    lockedOverlay.textContent = 'Locked';
                    card.appendChild(lockedOverlay);
                }
            }
        });
    } else {
        // Show all features for registered users
        const gameModes = document.querySelectorAll('.game-mode-card');
        gameModes.forEach(card => {
            card.style.opacity = '1';
            card.style.pointerEvents = 'auto';
            card.style.filter = 'none';
            card.style.position = '';

            // Remove "Locked" overlay if present
            const lockedOverlay = card.querySelector('.locked-overlay');
            if (lockedOverlay) {
                lockedOverlay.remove();
            }
        });
    }

    // Show admin panel ONLY for registered admin users (NEVER for guests)
    const adminCard = document.querySelector('.game-mode-card.admin-only');
    console.log('Admin panel check:', {
        adminCard: !!adminCard,
        isAdmin: gameState.isAdmin,
        currentUser: gameState.currentUser,
        userType: gameState.userType
    });
    if (adminCard) {
        // Security: Admin panel requires BOTH isAdmin flag AND registered user type
        if (gameState.isAdmin && gameState.userType === 'registered') {
            adminCard.style.display = 'block';
            console.log('Admin panel shown');
        } else {
            adminCard.style.display = 'none';
            console.log('Admin panel hidden - requires registered admin user');
        }
    }

    renderActiveLobbies();
    showScreen('homepage');
}

async function showProfile() {
    if (gameState.userType !== 'registered') {
        showModal('Registered Only', 'Profiles are available for registered players. Sign up to unlock this feature!');
        return;
    }

    try {
        await loadUserData();
    } catch (err) {
        console.error('Failed to refresh user data before showing profile:', err);
    }

    const displayName = gameState.currentUser || '';
    const fullTag = getDisplayTag(gameState.currentUser, gameState.userTag);
    const stats = normalizeUserStats(gameState.userStats);

    const avatarElement = document.getElementById('profileAvatar');
    const avatarInitial = document.getElementById('profileAvatarInitial');
    if (avatarElement) {
        avatarElement.style.background = gameState.avatar?.color || '#3b82f6';
    }
    if (avatarInitial) {
        avatarInitial.textContent = (gameState.avatar?.initial || displayName.charAt(0) || '?').toUpperCase();
    }

    const nameDisplay = document.getElementById('profileNameDisplay');
    if (nameDisplay) {
        nameDisplay.textContent = displayName;
    }

    const tagDisplay = document.getElementById('profileTagDisplay');
    if (tagDisplay) {
        tagDisplay.textContent = fullTag ? `Tag: ${fullTag}` : 'Tag unavailable';
    }

    const ownTag = document.getElementById('profileOwnTag');
    if (ownTag) {
        ownTag.textContent = fullTag || 'â€”';
    }

    const created = document.getElementById('profileCreatedAt');
    if (created) {
        const formatted = formatDateDisplay(gameState.createdAt, true);
        created.textContent = formatted ? `Joined ${formatted}` : 'Joined date unavailable';
    }

    const applyStat = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        const numeric = Number(value);
        const safeValue = Number.isFinite(numeric) ? numeric : 0;
        el.textContent = safeValue.toLocaleString();
    };
    applyStat('statPoints', stats.points);
    applyStat('statLobbiesCreated', stats.lobbiesCreated);
    applyStat('statSavedPresets', gameState.savedTitles.length);
    applyStat('statIncompleteGames', stats.incompleteGames);

    applyStat('modeSingleCount', stats.gameModesCompleted.singleDevice || 0);
    applyStat('modeRandomCount', stats.gameModesCompleted.random || 0);
    applyStat('modePresetCount', stats.gameModesCompleted.preset || 0);
    applyStat('modeLobbyCount', stats.gameModesCompleted.lobby || 0);
    applyStat('modePartyCount', stats.gameModesCompleted.party || 0);

    const suggestionStatus = document.getElementById('suggestionStatus');
    if (suggestionStatus) suggestionStatus.textContent = '';
    const suggestionInput = document.getElementById('suggestionInput');
    if (suggestionInput) suggestionInput.value = '';

    const friendStatus = document.getElementById('friendStatus');
    if (friendStatus) friendStatus.textContent = '';

    renderFriendsList();

    showScreen('profileScreen');
}

function renderFriendsList() {
    const list = document.getElementById('friendsList');
    if (!list) return;

    list.innerHTML = '';

    if (!gameState.friends || gameState.friends.length === 0) {
        list.innerHTML = '<p class="profile-note">You have not added any friends yet.</p>';
        return;
    }

    gameState.friends.forEach(friend => {
        const item = document.createElement('div');
        item.className = 'friend-item';

        const info = document.createElement('div');
        info.className = 'friend-info';

        const nameEl = document.createElement('span');
        nameEl.className = 'friend-name';
        nameEl.textContent = getDisplayTag(friend.username, friend.tag);
        info.appendChild(nameEl);

        const metaEl = document.createElement('span');
        metaEl.className = 'friend-meta';
        const sinceText = formatDateDisplay(friend.since);
        const gamesTogether = friend.gamesPlayedTogether || 0;
        metaEl.textContent = `${gamesTogether} game${gamesTogether === 1 ? '' : 's'} together${sinceText ? ` - friends since ${sinceText}` : ''}`;
        info.appendChild(metaEl);

        const actions = document.createElement('button');
        actions.className = 'btn-secondary btn-small';
        actions.textContent = 'Remove';
        actions.onclick = () => removeFriend(friend.tag);

        item.appendChild(info);
        item.appendChild(actions);
        list.appendChild(item);
    });
}

async function addFriendByTag() {
    if (gameState.userType !== 'registered') {
        showModal('Registered Only', 'Create a registered account to add friends.');
        return;
    }

    const input = document.getElementById('friendTagInput');
    const status = document.getElementById('friendStatus');
    if (!input) return;

    const rawValue = (input.value || '').trim();
    if (!rawValue) {
        if (status) status.textContent = 'Enter a friend tag to add someone.';
        return;
    }

    const sanitized = rawValue.replace(/\s+/g, '');
    const tagPart = sanitized.includes('#') ? sanitized.split('#').pop() : sanitized;

    if (!/^\d{4,5}$/.test(tagPart)) {
        if (status) status.textContent = 'Friend tags are 4-5 digit numbers (e.g., #1443).';
        return;
    }

    if (gameState.userTag && tagPart === gameState.userTag) {
        if (status) status.textContent = 'You cannot add yourself.';
        return;
    }

    if (Array.isArray(gameState.friends) && gameState.friends.some(friend => friend.tag === tagPart)) {
        if (status) status.textContent = 'You are already friends.';
        return;
    }

    if (status) status.textContent = 'Adding friend...';

    try {
        const response = await fetch('/api/friends/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requester: gameState.currentUser,
                friendTag: tagPart
            })
        });

        const result = await response.json();
        if (!response.ok) {
            if (status) status.textContent = result && result.error ? result.error : 'Unable to add friend right now.';
            return;
        }

        await loadUserData();
        renderFriendsList();
        if (status) status.textContent = 'Friend added successfully!';
        if (input) input.value = '';
        setTimeout(() => {
            if (status && status.textContent === 'Friend added successfully!') {
                status.textContent = '';
            }
        }, 2500);
    } catch (err) {
        console.error('Failed to add friend:', err);
        if (status) status.textContent = 'Something went wrong. Please try again.';
    }
}

async function removeFriend(friendTag) {
    if (gameState.userType !== 'registered') return;

    const status = document.getElementById('friendStatus');
    if (status) status.textContent = 'Removing friend...';

    try {
        const response = await fetch('/api/friends/remove', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requester: gameState.currentUser,
                friendTag
            })
        });

        const result = await response.json();
        if (!response.ok) {
            if (status) status.textContent = result && result.error ? result.error : 'Unable to remove friend.';
            return;
        }

        await loadUserData();
        renderFriendsList();
        if (status) status.textContent = 'Friend removed.';
        setTimeout(() => {
            if (status && status.textContent === 'Friend removed.') {
                status.textContent = '';
            }
        }, 2000);
    } catch (err) {
        console.error('Failed to remove friend:', err);
        if (status) status.textContent = 'Something went wrong. Please try again.';
    }
}

async function submitSuggestion() {
    if (gameState.userType !== 'registered') {
        showModal('Registered Only', 'Sign in with a registered account to send suggestions.');
        return;
    }

    const input = document.getElementById('suggestionInput');
    const status = document.getElementById('suggestionStatus');
    if (!input) return;

    const message = (input.value || '').trim();
    if (message.length === 0) {
        if (status) status.textContent = 'Please write a suggestion before sending.';
        return;
    }

    if (status) status.textContent = 'Sending...';

    try {
        const response = await fetch('/api/suggestions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: gameState.currentUser,
                tag: gameState.userTag,
                message
            })
        });

        const result = await response.json();
        if (!response.ok) {
            if (status) status.textContent = result && result.error ? result.error : 'Unable to send suggestion.';
            return;
        }

        if (status) status.textContent = 'Thank you! Your suggestion has been sent.';
        input.value = '';
        setTimeout(() => {
            if (status && status.textContent.startsWith('Thank you')) {
                status.textContent = '';
            }
        }, 3000);
    } catch (err) {
        console.error('Failed to submit suggestion:', err);
        if (status) status.textContent = 'Something went wrong. Please try again.';
    }
}

async function loadSuggestionsForAdmin() {
    const response = await fetch('/api/suggestions', {
        headers: {
            'X-Username': gameState.currentUser
        }
    });

    let data = [];
    try {
        data = await response.json();
    } catch (_) {
        data = [];
    }

    if (!response.ok) {
        const message = data && data.error ? data.error : 'Failed to load suggestions.';
        throw new Error(message);
    }

    gameState.suggestions = Array.isArray(data) ? data : [];
}

async function showMessages() {
    if (!gameState.isAdmin) {
        showModal('Admin Only', 'Only administrators can view incoming suggestions.');
        return;
    }

    const list = document.getElementById('messagesList');
    const emptyState = document.getElementById('messagesEmptyState');
    if (list) list.innerHTML = '';
    if (emptyState) {
        emptyState.style.display = 'block';
        emptyState.textContent = 'Loading suggestions...';
    }

    showScreen('messagesScreen');

    try {
        await loadSuggestionsForAdmin();
        renderMessagesList();
    } catch (err) {
        console.error(err);
        if (emptyState) {
            emptyState.style.display = 'block';
            emptyState.textContent = err.message || 'Failed to load suggestions.';
        }
    }
}

function renderMessagesList() {
    const list = document.getElementById('messagesList');
    const emptyState = document.getElementById('messagesEmptyState');
    if (!list) return;

    list.innerHTML = '';

    // Determine current tab (default to 'active')
    const currentTab = gameState.suggestionsTab || 'active';

    // Filter suggestions based on tab
    let filteredSuggestions = [];
    if (currentTab === 'active') {
        filteredSuggestions = (gameState.suggestions || []).filter(s =>
            !s.status || s.status === 'pending' || s.status === 'in_progress'
        );
    } else {
        filteredSuggestions = (gameState.suggestions || []).filter(s =>
            s.status === 'completed'
        );
    }

    if (filteredSuggestions.length === 0) {
        if (emptyState) {
            emptyState.style.display = 'block';
            emptyState.textContent = currentTab === 'active'
                ? 'No active suggestions.'
                : 'No archived suggestions.';
        }
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    filteredSuggestions.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'message-card';
        if (entry.status) {
            card.classList.add(`status-${entry.status}`);
        }

        const meta = document.createElement('div');
        meta.className = 'message-meta';
        const author = document.createElement('span');
        author.textContent = entry.displayTag || getDisplayTag(entry.username, entry.tag);
        const timestamp = document.createElement('span');
        timestamp.textContent = formatDateDisplay(entry.createdAt, true) || '';
        meta.appendChild(author);
        meta.appendChild(timestamp);

        const body = document.createElement('div');
        body.className = 'message-body';
        body.textContent = entry.message || '';

        // Status controls (only for active tab)
        if (currentTab === 'active') {
            const controls = document.createElement('div');
            controls.className = 'message-controls';

            const statusSelect = document.createElement('select');
            statusSelect.className = 'status-selector';
            statusSelect.value = entry.status || 'pending';

            const statuses = [
                { value: 'pending', label: '⏳ Pending' },
                { value: 'in_progress', label: '🔄 In Progress' },
                { value: 'completed', label: '✅ Completed' }
            ];

            statuses.forEach(status => {
                const option = document.createElement('option');
                option.value = status.value;
                option.textContent = status.label;
                if (status.value === (entry.status || 'pending')) {
                    option.selected = true;
                }
                statusSelect.appendChild(option);
            });

            statusSelect.onchange = () => updateSuggestionStatus(entry.id, statusSelect.value);

            controls.appendChild(statusSelect);
            card.appendChild(meta);
            card.appendChild(body);
            card.appendChild(controls);
        } else {
            card.appendChild(meta);
            card.appendChild(body);
        }

        list.appendChild(card);
    });
}

function switchSuggestionsTab(tab) {
    gameState.suggestionsTab = tab;

    // Update active tab button
    const buttons = document.querySelectorAll('.suggestions-nav-btn');
    buttons.forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Re-render the list
    renderMessagesList();
}

async function updateSuggestionStatus(suggestionId, newStatus) {
    try {
        const response = await fetch(`/api/suggestions/${suggestionId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-Username': gameState.currentUser
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            throw new Error('Failed to update suggestion status');
        }

        // Reload suggestions and re-render
        await loadSuggestionsForAdmin();
        renderMessagesList();

    } catch (error) {
        console.error('Error updating suggestion status:', error);
        showModal('Error', 'Failed to update suggestion status. Please try again.');
    }
}

function renderActiveLobbies() {
    const container = document.getElementById('activeLobbiesList');
    if (!container) return;

    container.innerHTML = '';

    // Filter to only show public lobbies that are not completed
    const publicLobbies = activeLobbies.filter(l => {
        // Exclude private lobbies
        if (l.isPrivate) return false;

        // Exclude completed games
        if (l.gameState && l.gameState.phase === 'completed') return false;

        return true;
    });

    if (publicLobbies.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No public lobbies available. Create one to get started!</p>';
        return;
    }

    publicLobbies.forEach(lobby => {
        const card = document.createElement('div');
        card.className = 'lobby-card';

        const isPartyLobby = lobby.type === 'party';
        const readyCount = isPartyLobby ? 0 : lobby.players.filter(p => p.ready).length;
        const totalCount = lobby.players.length;

        // Determine status based on game state phase
        let statusBadge = '<span class="lobby-card-badge waiting">Waiting for Players</span>';
        if (lobby.gameState) {
            if (lobby.gameState.phase === 'completed') {
                statusBadge = '<span class="lobby-card-badge completed">Complete</span>';
            } else if (lobby.gameState.phase === 'playing' || lobby.gameState.phase === 'setup') {
                statusBadge = '<span class="lobby-card-badge in-progress">In Progress</span>';
            }
        } else if (isPartyLobby && lobby.items && lobby.items.length > 0) {
            statusBadge = '<span class="lobby-card-badge in-progress">Adding Items</span>';
        }

        // Calculate remaining time (only if not completed)
        let timeDisplay = '';
        if (!lobby.gameState || lobby.gameState.phase !== 'completed') {
            const timeRemaining = getRemainingTime(lobby);
            timeDisplay = formatTime(timeRemaining);
        }

        const lobbyTypeIcon = isPartyLobby ? '🎉' : '👥';
        const additionalInfo = isPartyLobby
            ? `<span class="lobby-ready-count">${lobby.items ? lobby.items.length : 0} / ${lobby.rowAmount} items</span>`
            : `<span class="lobby-ready-count">${readyCount} ready</span>`;

        card.innerHTML = `
            <div class="lobby-card-header">
                <div class="lobby-card-title-row">
                    <h3 class="lobby-card-title">${lobby.gameTitle || 'Untitled Game'}</h3>
                    <span class="lobby-type-icon">${lobbyTypeIcon}</span>
                </div>
                ${statusBadge}
            </div>
            <div class="lobby-card-info">
                <div class="lobby-card-detail">
                    <strong>Host:</strong> ${lobby.host}
                </div>
                <div class="lobby-card-detail">
                    <strong>Join Code:</strong> <span class="lobby-join-code">${lobby.joinCode}</span>
                </div>
                <div class="lobby-card-detail">
                    <strong>Rows:</strong> ${lobby.rowAmount}
                </div>
                ${timeDisplay ? `<div class="lobby-card-detail"><strong>Time left:</strong> ${timeDisplay}</div>` : ''}
            </div>
            <div class="lobby-card-footer">
                <span class="lobby-player-count">${totalCount} player${totalCount !== 1 ? 's' : ''}</span>
                ${additionalInfo}
            </div>
        `;

        // Use appropriate join function based on lobby type
        card.onclick = () => {
            if (isPartyLobby) {
                joinPartyLobby(lobby.id);
            } else {
                joinLobby(lobby.id);
            }
        };

        container.appendChild(card);
    });
}

// Lobby Timer Management
let lobbyTimerIntervals = {};

function startLobbyTimer(lobby) {
    if (!lobby || !lobby.id) return;

    // Clear existing timer if any
    if (lobbyTimerIntervals[lobby.id]) {
        clearInterval(lobbyTimerIntervals[lobby.id]);
        delete lobbyTimerIntervals[lobby.id];
    }

    // Helper to sync with latest lobby data and update display
    const updateAndGetLatestLobby = () => {
        const latestLobby = activeLobbies.find(l => l.id === lobby.id);
        if (!latestLobby) {
            return null;
        }
        updateLobbyTimerDisplay(latestLobby);
        return latestLobby;
    };

    const initialLobby = updateAndGetLatestLobby();
    if (!initialLobby) {
        return;
    }

    // Update every second
    lobbyTimerIntervals[lobby.id] = setInterval(() => {
        const latestLobby = updateAndGetLatestLobby();
        if (!latestLobby) {
            clearInterval(lobbyTimerIntervals[lobby.id]);
            delete lobbyTimerIntervals[lobby.id];
            return;
        }

        // Check if time expired
        const timeRemaining = getRemainingTime(latestLobby);
        if (timeRemaining <= 0) {
            clearInterval(lobbyTimerIntervals[lobby.id]);
            delete lobbyTimerIntervals[lobby.id];

            const hostUsername = latestLobby.host || (latestLobby.players.find(p => p.isHost)?.username);
            if (hostUsername && gameState.currentUser === hostUsername) {
                autoStartLobbyOnTimer(latestLobby.id).catch(err => {
                    console.error('Failed to auto-start lobby on timer expiration:', err);
                });
            }
        }
    }, 1000);
}

function updateLobbyTimerDisplay(lobby) {
    const display = document.getElementById('lobbyTimerDisplay');
    if (!display) return;

    const timeRemaining = getRemainingTime(lobby);
    const timeDisplay = formatTime(timeRemaining);

    // Update display classes based on time
    display.className = 'lobby-timer-display';
    if (timeRemaining <= 60) {
        display.className += ' danger';
    } else if (timeRemaining <= 180) {
        display.className += ' warning';
    }

    display.innerHTML = `
        <span class="timer-label">â±ï¸ Time Remaining:</span>
        <span class="timer-value">${timeDisplay}</span>
    `;
}

function getRemainingTime(lobby) {
    if (!lobby.timerStarted || !lobby.timerMinutes) return 0;

    const elapsed = Date.now() - lobby.timerStarted;
    const totalTime = lobby.timerMinutes * 60 * 1000;
    const remaining = totalTime - elapsed;

    return Math.max(0, Math.floor(remaining / 1000)); // Return seconds
}

async function autoStartLobbyOnTimer(lobbyId) {
    const lobbyIndex = activeLobbies.findIndex(l => l.id === lobbyId);
    if (lobbyIndex === -1) {
        return;
    }

    const lobby = activeLobbies[lobbyIndex];

    // If game already transitioned, nothing to do
    if (lobby.gameState && (lobby.gameState.phase === 'setup' || lobby.gameState.phase === 'playing')) {
        return;
    }

    // Party mode manages flow differently; skip auto-start behavior here
    if (lobby.type === 'party') {
        return;
    }

    const hostPlayer = lobby.players.find(p => p.isHost) || null;
    const hostUsername = hostPlayer ? hostPlayer.username : lobby.host;

    // Only the host should orchestrate the auto-start to avoid race conditions
    if (!hostUsername || gameState.currentUser !== hostUsername) {
        return;
    }

    const readyPlayers = lobby.players.filter(p => p.ready || p.isHost);

    // Ensure host is always kept even if they forgot to ready up
    if (hostPlayer && !readyPlayers.some(p => p.username === hostPlayer.username)) {
        readyPlayers.push(hostPlayer);
    }

    if (readyPlayers.length === 0) {
        // No players to start with, close the lobby
        await closeLobby(lobbyId);
        return;
    }

    // Normalize players: mark as ready and deduplicate by username
    const normalizedPlayers = Array.from(new Map(readyPlayers.map(player => {
        const normalized = {
            ...player,
            ready: true
        };
        if (player.isHost) {
            normalized.isHost = true;
        }
        return [normalized.username, normalized];
    })).values());

    const updatedLobby = {
        ...lobby,
        players: normalizedPlayers
    };

    activeLobbies[lobbyIndex] = updatedLobby;
    await saveLobbies();

    if (gameState.lobby && gameState.lobby.id === lobbyId) {
        gameState.lobby = updatedLobby;
        renderLobbyPlayers();
        updateReadyCount();
    }

    await proceedToGame();
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function closeLobby(lobbyId) {
    const index = activeLobbies.findIndex(l => l.id === lobbyId);
    if (index !== -1) {
        activeLobbies.splice(index, 1);
        await saveLobbies();

        // Clear timer
        if (lobbyTimerIntervals[lobbyId]) {
            clearInterval(lobbyTimerIntervals[lobbyId]);
            delete lobbyTimerIntervals[lobbyId];
        }

        // If current user was in this lobby, return to homepage
        if (gameState.lobby && gameState.lobby.id === lobbyId) {
            showModal('Lobby Closed', 'The lobby has been closed due to inactivity.');
            returnToHomepage();
        }

        // Refresh lobby list
        await refreshLobbies();
    }
}

function startNewGame() {
    shuffleColors();
    gameState.players = [];
    gameState.lobby = null; // Clear any previous lobby data
    const playerList = document.getElementById('playerList');
    if (playerList) {
        playerList.innerHTML = '';
    }
    addPlayer();
    showScreen('mainMenu');
}

// Random item pools for each category
const randomItemPools = {
    'Top Movies': ['The Shawshank Redemption', 'The Godfather', 'The Dark Knight', 'Pulp Fiction', 'Forrest Gump', 'Inception', 'The Matrix', 'Goodfellas', 'The Silence of the Lambs', 'Interstellar', 'Parasite', 'The Green Mile', 'Saving Private Ryan', 'The Prestige', 'Gladiator', 'Schindler\'s List', 'Fight Club', 'The Lord of the Rings: The Return of the King', 'Star Wars: Episode V', 'The Usual Suspects', 'Se7en', 'City of God', 'Life is Beautiful', 'Spirited Away', 'The Departed', 'Whiplash', 'The Pianist', 'Memento', 'The Lion King', 'Back to the Future', 'Apocalypse Now', 'Gladiator', 'Django Unchained', 'WALL-E', 'The Lives of Others', 'Sunset Boulevard', 'Paths of Glory', 'The Great Dictator', 'Witness for the Prosecution', 'Alien', 'Spider-Man: Into the Spider-Verse', 'Avengers: Endgame', 'Coco', 'Toy Story', 'Amadeus', 'Braveheart', 'Joker', '12 Angry Men', 'Casablanca', 'Good Will Hunting', 'Raiders of the Lost Ark', 'Eternal Sunshine of the Spotless Mind', 'The Truman Show', 'Toy Story 3', 'Reservoir Dogs', 'Oldboy', 'Inglourious Basterds', 'The Shining', '2001: A Space Odyssey', 'Blade Runner', 'The Sixth Sense', 'No Country for Old Men', 'There Will Be Blood', 'Pan\'s Labyrinth', 'The Grand Budapest Hotel', 'Jaws', 'Jurassic Park', 'The Terminator', 'Die Hard', 'Mad Max: Fury Road', 'Dune', 'Everything Everywhere All at Once', 'Top Gun: Maverick', 'Oppenheimer', 'The Breakfast Club', 'Ferris Bueller\'s Day Off', 'Dead Poets Society', 'Stand by Me', 'E.T. the Extra-Terrestrial', 'Groundhog Day', 'A Beautiful Mind', 'The Social Network', 'Catch Me If You Can', 'The Wolf of Wall Street', 'Her', 'Arrival', 'Sicario', 'La La Land', 'Moonlight', 'Get Out', 'Knives Out', 'Once Upon a Time in Hollywood', 'A Quiet Place', 'Hereditary', 'Midsommar', 'The Lighthouse', 'Uncut Gems', 'The Batman', 'Killers of the Flower Moon', 'Past Lives'],
    'Best Songs': ['Bohemian Rhapsody', 'Stairway to Heaven', 'Hotel California', 'Imagine', 'Smells Like Teen Spirit', 'Hey Jude', 'Purple Rain', 'Billie Jean', 'Like a Rolling Stone', 'Sweet Child O\' Mine', 'November Rain', 'Don\'t Stop Believin\'', 'Africa', 'Mr. Brightside', 'Wonderwall', 'Yesterday', 'Let It Be', 'Come Together', 'A Day in the Life', 'What\'s Going On', 'Respect', 'Superstition', 'What\'d I Say', 'Georgia on My Mind', 'I Got You (I Feel Good)', 'Good Vibrations', 'God Only Knows', 'Wouldn\'t It Be Nice', 'Bridge Over Troubled Water', 'The Sound of Silence', 'Hallelujah', 'Take On Me', 'Sweet Caroline', 'Piano Man', 'Tiny Dancer', 'Rocket Man', 'Your Song', 'Born to Run', 'Thunder Road', 'Dancing in the Dark', 'Born in the U.S.A.', 'Under Pressure', 'We Will Rock You', 'We Are the Champions', 'Somebody to Love', 'Killer Queen', 'Dreams', 'Go Your Own Way', 'The Chain', 'Landslide', 'Free Bird', 'Simple Man', 'Sweet Home Alabama', 'Comfortably Numb', 'Wish You Were Here', 'Another Brick in the Wall', 'Money', 'Time', 'Thriller', 'Beat It', 'Man in the Mirror', 'Smooth Criminal', 'Every Breath You Take', 'Message in a Bottle', 'Roxanne', 'With or Without You', 'One', 'Beautiful Day', 'Where the Streets Have No Name', 'California Dreamin\'', 'California Love', 'Changes', 'Juicy', 'Lose Yourself', 'Stan', 'Rap God', 'God\'s Plan', 'Hotline Bling', 'One Dance', 'Crazy in Love', 'Single Ladies', 'Halo', 'Formation', 'Rolling in the Deep', 'Someone Like You', 'Hello', 'Shake It Off', 'Blank Space', 'Anti-Hero', 'Uptown Funk', 'Happy', 'Get Lucky', 'Blinding Lights', 'Save Your Tears', 'As It Was', 'Flowers', 'Kill Bill', 'Vampire'],
    'Favorite Foods': ['Pizza', 'Sushi', 'Tacos', 'Burgers', 'Pasta', 'Ramen', 'Steak', 'Fried Chicken', 'Pad Thai', 'BBQ Ribs', 'Lasagna', 'Pho', 'Burritos', 'Chicken Wings', 'Ice Cream', 'Chocolate Cake', 'Cheesecake', 'Donuts', 'Cookies', 'Brownies', 'French Fries', 'Onion Rings', 'Mozzarella Sticks', 'Nachos', 'Quesadillas', 'Enchiladas', 'Fajitas', 'Chimichanga', 'Pulled Pork', 'Brisket', 'Mac and Cheese', 'Grilled Cheese', 'BLT Sandwich', 'Club Sandwich', 'Philly Cheesesteak', 'Hot Dog', 'Corn Dog', 'Chicken Tenders', 'Fish and Chips', 'Lobster Roll', 'Crab Cakes', 'Shrimp Scampi', 'Clam Chowder', 'Chicken Noodle Soup', 'Tomato Soup', 'French Onion Soup', 'Miso Soup', 'Wonton Soup', 'Dumplings', 'Spring Rolls', 'Egg Rolls', 'Fried Rice', 'Lo Mein', 'General Tso\'s Chicken', 'Orange Chicken', 'Kung Pao Chicken', 'Sweet and Sour Pork', 'Peking Duck', 'Dim Sum', 'Tempura', 'Teriyaki Chicken', 'Yakitori', 'Tonkatsu', 'Sashimi', 'Udon', 'Soba', 'Curry', 'Tikka Masala', 'Butter Chicken', 'Biryani', 'Samosas', 'Naan Bread', 'Falafel', 'Shawarma', 'Gyro', 'Kebab', 'Hummus', 'Tzatziki', 'Baklava', 'Tiramisu', 'Panna Cotta', 'Gelato', 'Churros', 'Tres Leches Cake', 'Flan', 'Empanadas', 'Arepas', 'Ceviche', 'Paella', 'Risotto', 'Carbonara', 'Alfredo', 'Bolognese', 'Pesto Pasta', 'Ravioli', 'Gnocchi', 'Bruschetta', 'Caprese Salad', 'Caesar Salad', 'Greek Salad'],
    'Dream Destinations': ['Tokyo', 'Paris', 'New York City', 'Bali', 'Rome', 'London', 'Maldives', 'Dubai', 'Barcelona', 'Iceland', 'Santorini', 'Sydney', 'Hawaii', 'Amsterdam', 'Swiss Alps', 'Venice', 'Florence', 'Prague', 'Vienna', 'Budapest', 'Krakow', 'Dubrovnik', 'Athens', 'Istanbul', 'Jerusalem', 'Cairo', 'Marrakech', 'Cape Town', 'Safari in Kenya', 'Serengeti', 'Victoria Falls', 'Madagascar', 'Seychelles', 'Mauritius', 'Zanzibar', 'Dubai', 'Abu Dhabi', 'Petra', 'Wadi Rum', 'Dead Sea', 'Tel Aviv', 'Beirut', 'Bangkok', 'Phuket', 'Chiang Mai', 'Singapore', 'Kuala Lumpur', 'Angkor Wat', 'Hanoi', 'Ho Chi Minh City', 'Halong Bay', 'Seoul', 'Busan', 'Kyoto', 'Osaka', 'Mount Fuji', 'Shanghai', 'Beijing', 'Great Wall of China', 'Hong Kong', 'Macau', 'Taipei', 'Manila', 'Bohol', 'Palawan', 'Jakarta', 'Komodo Island', 'Gili Islands', 'Nepal', 'Bhutan', 'Tibet', 'India', 'Taj Mahal', 'Jaipur', 'Goa', 'Kerala', 'Sri Lanka', 'Mumbai', 'New Zealand', 'Queenstown', 'Milford Sound', 'Great Barrier Reef', 'Uluru', 'Melbourne', 'Perth', 'Tasmania', 'Fiji', 'Tahiti', 'Cook Islands', 'Samoa', 'Tonga', 'Easter Island', 'Galapagos Islands', 'Machu Picchu', 'Patagonia', 'Rio de Janeiro', 'Buenos Aires', 'Cartagena', 'Cusco', 'Amazon Rainforest', 'Iguazu Falls'],
    'Coolest Cars': ['Ferrari F40', 'Lamborghini Aventador', 'Porsche 911', 'McLaren P1', 'Ford Mustang', 'Chevrolet Corvette', 'Bugatti Chiron', 'Tesla Model S', 'Aston Martin DB5', 'Nissan GT-R', 'BMW M3', 'Dodge Challenger', 'Mercedes AMG GT', 'Audi R8', 'Toyota Supra', 'Ferrari 488', 'Ferrari LaFerrari', 'Ferrari Enzo', 'Lamborghini HuracÃ¡n', 'Lamborghini Countach', 'Lamborghini Miura', 'Porsche 918 Spyder', 'Porsche Carrera GT', 'Porsche Taycan', 'McLaren 720S', 'McLaren F1', 'McLaren Senna', 'Bugatti Veyron', 'Bugatti Divo', 'Pagani Huayra', 'Pagani Zonda', 'Koenigsegg Jesko', 'Koenigsegg Agera RS', 'Hennessey Venom F5', 'SSC Tuatara', 'Aston Martin Vantage', 'Aston Martin DBS', 'Aston Martin Valkyrie', 'Bentley Continental GT', 'Rolls-Royce Phantom', 'Rolls-Royce Wraith', 'Maserati GranTurismo', 'Alfa Romeo Giulia Quadrifoglio', 'Jaguar F-Type', 'Jaguar E-Type', 'Land Rover Defender', 'Range Rover Sport', 'Mercedes-Benz S-Class', 'Mercedes-Benz G-Wagon', 'BMW M5', 'BMW i8', 'BMW M2', 'Audi RS6', 'Audi RS7', 'Audi TT', 'Lexus LFA', 'Lexus LC 500', 'Acura NSX', 'Honda Civic Type R', 'Mazda MX-5 Miata', 'Mazda RX-7', 'Subaru WRX STI', 'Nissan 370Z', 'Nissan Skyline', 'Toyota GR86', 'Toyota Land Cruiser', 'Ford GT', 'Ford Bronco', 'Ford Raptor', 'Chevrolet Camaro', 'Chevrolet Silverado', 'Dodge Charger', 'Dodge Viper', 'Jeep Wrangler', 'Tesla Model 3', 'Tesla Model X', 'Tesla Roadster', 'Rivian R1T', 'Lucid Air', 'Lotus Evora', 'Lotus Elise', 'Mini Cooper', 'Volkswagen Golf GTI', 'Volkswagen Beetle', 'Fiat 500', 'Volvo XC90', 'Polestar 2', 'Genesis G70', 'Hyundai Veloster N', 'Kia Stinger', 'Cadillac Escalade', 'Lincoln Navigator', 'GMC Hummer EV'],
    'Best Video Games': ['The Legend of Zelda: Ocarina of Time', 'Red Dead Redemption 2', 'The Last of Us', 'God of War', 'Minecraft', 'Grand Theft Auto V', 'The Witcher 3', 'Elden Ring', 'Super Mario Bros.', 'Halo', 'Call of Duty', 'Fortnite', 'Among Us', 'Overwatch', 'Portal 2', 'The Last of Us Part II', 'Breath of the Wild', 'Tears of the Kingdom', 'Super Mario 64', 'Super Mario Odyssey', 'Super Mario Galaxy', 'Mario Kart 8', 'Super Smash Bros. Ultimate', 'PokÃ©mon Red/Blue', 'PokÃ©mon Gold/Silver', 'PokÃ©mon Scarlet/Violet', 'Final Fantasy VII', 'Final Fantasy XIV', 'Final Fantasy X', 'Chrono Trigger', 'Dark Souls', 'Dark Souls III', 'Bloodborne', 'Sekiro', 'Hollow Knight', 'Celeste', 'Hades', 'Undertale', 'Deltarune', 'Stardew Valley', 'Terraria', 'Valheim', 'Skyrim', 'Fallout 3', 'Fallout: New Vegas', 'Fallout 4', 'Bioshock', 'Bioshock Infinite', 'Half-Life 2', 'Portal', 'Team Fortress 2', 'Counter-Strike', 'Valorant', 'Apex Legends', 'PUBG', 'Warzone', 'Destiny 2', 'Halo 3', 'Halo Infinite', 'Gears of War', 'Uncharted 4', 'Uncharted 2', 'Horizon Zero Dawn', 'Horizon Forbidden West', 'Ghost of Tsushima', 'Spider-Man (PS4)', 'Spider-Man: Miles Morales', 'Ratchet & Clank', 'Crash Bandicoot', 'Spyro the Dragon', 'Metal Gear Solid', 'Metal Gear Solid V', 'Death Stranding', 'Resident Evil 4', 'Resident Evil 2 Remake', 'Resident Evil Village', 'Silent Hill 2', 'Dead Space', 'Doom Eternal', 'Doom (2016)', 'Wolfenstein', 'Dishonored', 'Prey', 'Control', 'Max Payne', 'Alan Wake', 'Quantum Break', 'Mass Effect 2', 'Mass Effect 3', 'Dragon Age: Origins', 'Dragon Age: Inquisition', 'Baldur\'s Gate 3', 'Divinity: Original Sin 2', 'Disco Elysium', 'Pillars of Eternity', 'StarCraft', 'StarCraft II'],
    'Favorite TV Shows': ['Breaking Bad', 'Game of Thrones', 'The Office', 'Friends', 'Stranger Things', 'The Sopranos', 'The Wire', 'The Crown', 'Succession', 'Better Call Saul', 'Parks and Recreation', 'The Mandalorian', 'Seinfeld', 'Avatar: The Last Airbender', 'Sherlock', 'House of the Dragon', 'The Boys', 'The Witcher', 'Peaky Blinders', 'Ozark', 'Narcos', 'Mindhunter', 'Dark', '1899', 'Black Mirror', 'Westworld', 'True Detective', 'Fargo', 'The Handmaid\'s Tale', 'The Last of Us (TV)', 'Chernobyl', 'Band of Brothers', 'The Pacific', 'Twin Peaks', 'The X-Files', 'Lost', 'Mad Men', 'Deadwood', 'Rome', 'Vikings', 'The Last Kingdom', 'Homeland', '24', 'Prison Break', 'Dexter', 'Six Feet Under', 'Boardwalk Empire', 'Community', 'Arrested Development', 'Brooklyn Nine-Nine', 'The Good Place', 'Scrubs', 'How I Met Your Mother', 'New Girl', 'Modern Family', 'Curb Your Enthusiasm', 'It\'s Always Sunny in Philadelphia', 'Rick and Morty', 'BoJack Horseman', 'Archer', 'South Park', 'The Simpsons', 'Futurama', 'Family Guy', 'Bob\'s Burgers', 'Adventure Time', 'Gravity Falls', 'Steven Universe', 'The Legend of Korra', 'Arcane', 'Invincible', 'Young Justice', 'Justice League Unlimited', 'Batman: The Animated Series', 'Cowboy Bebop', 'Attack on Titan', 'Death Note', 'Fullmetal Alchemist: Brotherhood', 'One Piece', 'Naruto', 'Dragon Ball Z', 'My Hero Academia', 'Demon Slayer', 'Jujutsu Kaisen', 'Spy x Family', 'Chainsaw Man', 'Hunter x Hunter', 'One Punch Man', 'Mob Psycho 100', 'Steins;Gate', 'Code Geass', 'Neon Genesis Evangelion', 'The Bear', 'Severance', 'Yellowstone', 'Ted Lasso'],
    'Greatest Athletes': ['Michael Jordan', 'Tom Brady', 'Lionel Messi', 'Cristiano Ronaldo', 'LeBron James', 'Serena Williams', 'Muhammad Ali', 'Usain Bolt', 'Tiger Woods', 'Wayne Gretzky', 'Kobe Bryant', 'Roger Federer', 'Simone Biles', 'Michael Phelps', 'PelÃ©', 'Diego Maradona', 'Zinedine Zidane', 'Ronaldo NazÃ¡rio', 'Johan Cruyff', 'Franz Beckenbauer', 'Alfredo Di StÃ©fano', 'Ronaldinho', 'Thierry Henry', 'Neymar', 'Kylian MbappÃ©', 'Erling Haaland', 'Kevin Durant', 'Stephen Curry', 'Giannis Antetokounmpo', 'Magic Johnson', 'Larry Bird', 'Kareem Abdul-Jabbar', 'Wilt Chamberlain', 'Bill Russell', 'Shaquille O\'Neal', 'Tim Duncan', 'Hakeem Olajuwon', 'Jerry Rice', 'Jim Brown', 'Walter Payton', 'Peyton Manning', 'Joe Montana', 'Lawrence Taylor', 'Barry Sanders', 'Aaron Rodgers', 'Patrick Mahomes', 'Babe Ruth', 'Willie Mays', 'Hank Aaron', 'Ted Williams', 'Jackie Robinson', 'Derek Jeter', 'Mike Trout', 'Shohei Ohtani', 'Sandy Koufax', 'Clayton Kershaw', 'Rafael Nadal', 'Novak Djokovic', 'Bjorn Borg', 'Rod Laver', 'Pete Sampras', 'Steffi Graf', 'Martina Navratilova', 'Billie Jean King', 'Venus Williams', 'Maria Sharapova', 'Naomi Osaka', 'Jack Nicklaus', 'Arnold Palmer', 'Gary Player', 'Rory McIlroy', 'Phil Mickelson', 'Floyd Mayweather', 'Manny Pacquiao', 'Mike Tyson', 'Sugar Ray Leonard', 'Rocky Marciano', 'Joe Louis', 'Carl Lewis', 'Jesse Owens', 'Michael Johnson', 'Jackie Joyner-Kersee', 'Nadia ComÄƒneci', 'Larisa Latynina', 'Katie Ledecky', 'Caeleb Dressel', 'Mark Spitz', 'Ian Thorpe', 'Shaun White', 'Tony Hawk', 'Kelly Slater', 'Valentino Rossi', 'Lewis Hamilton', 'Ayrton Senna', 'Michael Schumacher', 'Sebastian Vettel', 'Max Verstappen'],
    'Best Restaurants': ['Nobu', 'The French Laundry', 'El Bulli', 'Noma', 'Per Se', 'Eleven Madison Park', 'Alinea', 'Osteria Francescana', 'Sukiyabashi Jiro', 'Le Bernardin', 'Gaggan', 'ArpÃ¨ge', 'Mirazur', 'Central', 'Mugaritz', 'Blue Hill at Stone Barns', 'Momofuku Ko', 'Daniel', 'Jean-Georges', 'Le Cirque', 'Masa', 'Sushi Nakazawa', 'Carbone', 'The Spotted Pig', 'Roberta\'s', 'Peter Luger', 'Katz\'s Delicatessen', 'Shake Shack', 'Joe\'s Pizza', 'Rao\'s', 'Balthazar', 'Gramercy Tavern', 'Union Square Cafe', 'ABC Kitchen', 'The River CafÃ©', 'Chez Panisse', 'Zuni CafÃ©', 'State Bird Provisions', 'Gary Danko', 'Benu', 'Saison', 'Atelier Crenn', 'SingleThread', 'The Restaurant at Meadowood', 'Providence', 'n/naka', 'Bestia', 'Republique', 'Guelaguetza', 'Sqirl', 'Jon & Vinny\'s', 'Animal', 'Pizzeria Mozza', 'Spago', 'Manresa', 'Bacchanalia', 'Staplehouse', 'Miller Union', 'The Optimist', 'Gunshow', 'Alinea', 'Girl & the Goat', 'Au Cheval', 'Smyth', 'Oriole', 'Next', 'Avec', 'The Purple Pig', 'RPM Italian', 'Gibsons Bar & Steakhouse', 'Commander\'s Palace', 'Brennan\'s', 'Galatoire\'s', 'Cochon', 'August', 'Herbsaint', 'CompÃ¨re Lapin', 'Franklin Barbecue', 'Uchi', 'Odd Duck', 'Barley Swine', 'Olamaie', 'Justine\'s', 'Ramen Tatsu-Ya', 'Canlis', 'The Walrus and the Carpenter', 'Altura', 'Le Pigeon', 'Pok Pok', 'Beast', 'Screen Door', 'Parachute', 'Cisero\'s', 'Frontera Grill', 'Blackbird', 'The Publican', 'Bavette\'s', 'Fat Rice', 'Monteverde', 'Roister'],
    'Top Vacation Spots': ['Bora Bora', 'Maui', 'Turks and Caicos', 'Amalfi Coast', 'Bali', 'Seychelles', 'Fiji', 'Maldives', 'Santorini', 'Tahiti', 'Costa Rica', 'Barbados', 'Capri', 'Mykonos', 'Phuket', 'Kauai', 'Aruba', 'St. Lucia', 'Jamaica', 'Bahamas', 'Cayman Islands', 'British Virgin Islands', 'Anguilla', 'St. Barts', 'Grenada', 'Antigua', 'Dominica', 'Martinique', 'Guadeloupe', 'CuraÃ§ao', 'Bonaire', 'Cabo San Lucas', 'CancÃºn', 'Playa del Carmen', 'Tulum', 'Puerto Vallarta', 'Riviera Maya', 'Cozumel', 'Isla Mujeres', 'Cinque Terre', 'Positano', 'Ravello', 'Sorrento', 'Lake Como', 'Portofino', 'French Riviera', 'Monaco', 'Cannes', 'Nice', 'Saint-Tropez', 'Corsica', 'Sardinia', 'Sicily', 'Malta', 'Ibiza', 'Mallorca', 'Menorca', 'Formentera', 'Madeira', 'Azores', 'Algarve', 'Lisbon Coast', 'Crete', 'Rhodes', 'Corfu', 'Zakynthos', 'Naxos', 'Paros', 'Milos', 'Ios', 'Croatian Islands', 'Hvar', 'KorÄula', 'Vis', 'BraÄ', 'Montenegro Coast', 'Lake Bled', 'Plitvice Lakes', 'Boracay', 'Palawan', 'Siargao', 'Cebu', 'Lombok', 'Komodo', 'Raja Ampat', 'Bali', 'Gili Islands', 'Phi Phi Islands', 'Krabi', 'Koh Samui', 'Koh Tao', 'Koh Phangan', 'Railay Beach', 'Similan Islands', 'Langkawi', 'Perhentian Islands', 'Tioman Island'],
    'Favorite Cartoons': ['SpongeBob SquarePants', 'Avatar: The Last Airbender', 'Rick and Morty', 'Adventure Time', 'Gravity Falls', 'Steven Universe', 'Regular Show', 'The Simpsons', 'Futurama', 'South Park', 'Family Guy', 'Bob\'s Burgers', 'King of the Hill', 'The Fairly OddParents', 'Danny Phantom', 'Kim Possible', 'Teen Titans', 'Young Justice', 'Justice League Unlimited', 'Batman: The Animated Series', 'X-Men: The Animated Series', 'Spider-Man: The Animated Series', 'Scooby-Doo', 'Looney Tunes', 'Tom and Jerry', 'Dexter\'s Laboratory', 'The Powerpuff Girls', 'Courage the Cowardly Dog', 'Ed, Edd n Eddy', 'Johnny Bravo', 'Samurai Jack', 'Dragon Ball Z', 'PokÃ©mon', 'Digimon', 'Yu-Gi-Oh!', 'Naruto', 'One Piece', 'Attack on Titan', 'Death Note', 'Fullmetal Alchemist', 'My Hero Academia', 'Demon Slayer', 'Cowboy Bebop', 'Neon Genesis Evangelion', 'Code Geass', 'Steins;Gate', 'Hunter x Hunter', 'One Punch Man', 'Mob Psycho 100', 'Jujutsu Kaisen', 'Chainsaw Man', 'Spy x Family', 'Arcane', 'Invincible', 'The Legend of Korra', 'Clone Wars', 'The Bad Batch', 'Voltron', 'He-Man', 'ThunderCats', 'Transformers', 'TMNT', 'DuckTales', 'Darkwing Duck', 'TaleSpin', 'Chip n\' Dale: Rescue Rangers', 'Animaniacs', 'Pinky and the Brain', 'Tiny Toon Adventures', 'Rugrats', 'Hey Arnold!', 'CatDog', 'Ren & Stimpy', 'Rocko\'s Modern Life', 'The Angry Beavers', 'As Told by Ginger', 'The Wild Thornberrys', 'Jimmy Neutron', 'The Adventures of Billy and Mandy', 'Foster\'s Home for Imaginary Friends', 'Camp Lazlo', 'Chowder', 'Flapjack', 'Ben 10', 'Generator Rex', 'Total Drama Island', 'Johnny Test', 'The Amazing World of Gumball', 'Clarence', 'We Bare Bears', 'OK K.O.! Let\'s Be Heroes', 'Craig of the Creek', 'Hilda', 'Amphibia', 'The Owl House', 'Big City Greens', 'Bluey'],
    'Classic Novels Everyone Should Read': ['Pride and Prejudice', 'To Kill a Mockingbird', '1984', 'The Great Gatsby', 'Jane Eyre', 'Wuthering Heights', 'Moby-Dick', 'The Catcher in the Rye', 'Lord of the Flies', 'Animal Farm', 'Brave New World', 'Fahrenheit 451', 'The Hobbit', 'The Lord of the Rings', 'Harry Potter series', 'The Chronicles of Narnia', 'Little Women', 'The Odyssey', 'The Iliad', 'Hamlet', 'Romeo and Juliet', 'Macbeth', 'Crime and Punishment', 'War and Peace', 'Anna Karenina', 'The Brothers Karamazov', 'Les MisÃ©rables', 'The Count of Monte Cristo', 'Don Quixote', 'One Hundred Years of Solitude', 'The Picture of Dorian Gray', 'Dracula', 'Frankenstein', 'The Adventures of Huckleberry Finn', 'The Adventures of Tom Sawyer', 'Great Expectations', 'A Tale of Two Cities', 'Oliver Twist', 'David Copperfield', 'The Scarlet Letter', 'The Grapes of Wrath', 'Of Mice and Men', 'East of Eden', 'The Sound and the Fury', 'As I Lay Dying', 'Beloved', 'Invisible Man', 'The Color Purple', 'Their Eyes Were Watching God', 'The Handmaid\'s Tale', 'Slaughterhouse-Five', 'Catch-22', 'On the Road', 'The Bell Jar', 'The Stranger', 'The Metamorphosis', 'The Trial', 'Siddhartha', 'Steppenwolf', 'The Alchemist', 'Life of Pi', 'The Kite Runner', 'A Thousand Splendid Suns', 'The Book Thief', 'All Quiet on the Western Front', 'The Old Man and the Sea', 'For Whom the Bell Tolls', 'A Farewell to Arms', 'The Sun Also Rises', 'Lolita', 'Heart of Darkness', 'Lord Jim', 'The Secret Garden', 'Anne of Green Gables', 'A Christmas Carol', 'The Wind in the Willows', 'Alice\'s Adventures in Wonderland', 'Through the Looking-Glass', 'Peter Pan', 'Treasure Island', 'Robinson Crusoe', 'Gulliver\'s Travels', 'The Time Machine', 'The Invisible Man', 'The War of the Worlds', 'Journey to the Center of the Earth', 'Twenty Thousand Leagues Under the Sea', 'Around the World in Eighty Days', 'The Three Musketeers', 'The Man in the Iron Mask', 'The Hunchback of Notre-Dame', 'The Phantom of the Opera', 'The Little Prince', 'Charlotte\'s Web', 'Where the Wild Things Are', 'The Giving Tree', 'Oh, the Places You\'ll Go!'],
    'Best Superheroes': ['Spider-Man', 'Batman', 'Superman', 'Iron Man', 'Captain America', 'Wonder Woman', 'Thor', 'Hulk', 'Black Widow', 'Wolverine', 'Deadpool', 'Black Panther', 'Doctor Strange', 'Scarlet Witch', 'Captain Marvel', 'The Flash', 'Green Lantern', 'Aquaman', 'Shazam', 'Cyborg', 'Ant-Man', 'Wasp', 'Hawkeye', 'Daredevil', 'Luke Cage', 'Jessica Jones', 'Iron Fist', 'Punisher', 'Ghost Rider', 'Moon Knight', 'She-Hulk', 'Ms. Marvel', 'Star-Lord', 'Gamora', 'Drax', 'Rocket Raccoon', 'Groot', 'Vision', 'Falcon', 'Winter Soldier', 'War Machine', 'Black Cat', 'Silver Surfer', 'Nova', 'Spawn', 'Hellboy', 'The Tick', 'Invincible', 'Omni-Man', 'Nightwing', 'Robin', 'Batgirl', 'Red Hood', 'Green Arrow', 'Black Canary', 'Supergirl', 'Power Girl', 'Martian Manhunter', 'Blue Beetle', 'Booster Gold', 'Static Shock', 'Storm', 'Cyclops', 'Jean Grey', 'Professor X', 'Magneto', 'Rogue', 'Gambit', 'Beast', 'Nightcrawler', 'Colossus', 'Kitty Pryde', 'Iceman', 'Angel', 'Psylocke', 'Cable', 'Bishop', 'Jubilee', 'Mr. Fantastic', 'Invisible Woman', 'Human Torch', 'The Thing', 'Silver Surfer', 'Namor', 'Doctor Doom', 'Thanos', 'Loki', 'Venom', 'Carnage', 'Electro', 'Sandman', 'Mysterio', 'Green Goblin', 'Doctor Octopus', 'The Joker', 'Harley Quinn', 'Poison Ivy', 'Catwoman', 'Bane'],
    'Favorite Villains': ['The Joker', 'Darth Vader', 'Thanos', 'Loki', 'Magneto', 'Lex Luthor', 'The Penguin', 'Two-Face', 'Bane', 'Scarecrow', 'Ra\'s al Ghul', 'Poison Ivy', 'Mr. Freeze', 'Riddler', 'Harley Quinn', 'Catwoman', 'Green Goblin', 'Doctor Octopus', 'Venom', 'Carnage', 'Sandman', 'Electro', 'Mysterio', 'Vulture', 'Kingpin', 'Ultron', 'Red Skull', 'Winter Soldier', 'Killmonger', 'Hela', 'Ronan', 'Ego', 'Doctor Doom', 'Galactus', 'Apocalypse', 'Juggernaut', 'Mystique', 'Sabretooth', 'Reverse-Flash', 'Zoom', 'Brainiac', 'Doomsday', 'Darkseid', 'Deathstroke', 'Sinestro', 'Black Manta', 'Ocean Master', 'Cheetah', 'Ares', 'General Zod', 'Voldemort', 'Bellatrix Lestrange', 'Dolores Umbridge', 'Draco Malfoy', 'Sauron', 'Saruman', 'Gollum', 'Orcs', 'Emperor Palpatine', 'Kylo Ren', 'Count Dooku', 'General Grievous', 'Jabba the Hutt', 'Boba Fett', 'Jango Fett', 'Grand Moff Tarkin', 'Hannibal Lecter', 'Norman Bates', 'Michael Myers', 'Jason Voorhees', 'Freddy Krueger', 'Pennywise', 'Chucky', 'Jigsaw', 'Ghostface', 'Leatherface', 'Pinhead', 'Dracula', 'Frankenstein\'s Monster', 'The Mummy', 'The Wolf Man', 'The Creature from the Black Lagoon', 'Godzilla', 'King Kong', 'Predator', 'Xenomorph', 'Terminator', 'Agent Smith', 'The Wicked Witch of the West', 'Ursula', 'Maleficent', 'Cruella de Vil', 'Gaston', 'Scar', 'Jafar', 'Hades', 'Captain Hook', 'Queen of Hearts', 'Mother Gothel', 'Hans'],
    'Most Addictive Apps': ['TikTok', 'Instagram', 'Facebook', 'Twitter/X', 'Snapchat', 'YouTube', 'Netflix', 'Spotify', 'Discord', 'Reddit', 'WhatsApp', 'Telegram', 'Signal', 'Messenger', 'Pinterest', 'LinkedIn', 'Threads', 'BeReal', 'Twitch', 'Kick', 'Candy Crush', 'Wordle', 'Duolingo', 'Clash of Clans', 'Clash Royale', 'PokÃ©mon GO', 'Among Us', 'Roblox', 'Minecraft', 'Fortnite', 'PUBG Mobile', 'Call of Duty Mobile', 'Genshin Impact', 'League of Legends: Wild Rift', 'Mobile Legends', 'Free Fire', 'Subway Surfers', 'Temple Run', 'Angry Birds', 'Fruit Ninja', 'Cut the Rope', '2048', 'Threes', 'Monument Valley', 'Alto\'s Adventure', 'Crossy Road', 'Flappy Bird', 'Heads Up!', 'QuizUp', 'Trivia Crack', 'Words with Friends', 'Scrabble GO', 'Chess.com', 'Lichess', 'Peak', 'Lumosity', 'Elevate', 'Calm', 'Headspace', 'MyFitnessPal', 'Strava', 'Nike Run Club', 'Peloton', 'Fitbit', 'Apple Health', 'Google Fit', 'Sleep Cycle', 'Forest', 'Notion', 'Evernote', 'OneNote', 'Google Keep', 'Todoist', 'Trello', 'Asana', 'Slack', 'Zoom', 'Google Meet', 'Microsoft Teams', 'Uber', 'Lyft', 'DoorDash', 'Uber Eats', 'Grubhub', 'Postmates', 'Instacart', 'Amazon', 'eBay', 'Etsy', 'Shein', 'Temu', 'Wish', 'AliExpress', 'Tinder', 'Bumble', 'Hinge', 'Match', 'OkCupid', 'Grindr'],
    'Best Musicians of the 2000s': ['BeyoncÃ©', 'Eminem', 'Kanye West', 'Taylor Swift', 'Rihanna', 'Jay-Z', 'Usher', 'Justin Timberlake', 'Alicia Keys', 'OutKast', 'Coldplay', 'Green Day', 'Linkin Park', 'Amy Winehouse', 'John Mayer', 'The Black Keys', 'Arctic Monkeys', 'Kings of Leon', 'The Killers', 'The White Stripes', 'Franz Ferdinand', 'Arcade Fire', 'LCD Soundsystem', 'Yeah Yeah Yeahs', 'The Strokes', 'Gorillaz', 'Daft Punk', 'Justice', 'MGMT', 'Vampire Weekend', 'Tame Impala', 'Phoenix', 'M83', 'Passion Pit', 'Foster the People', 'Two Door Cinema Club', 'Alt-J', 'Bon Iver', 'Fleet Foxes', 'The National', 'Radiohead', 'Muse', 'Red Hot Chili Peppers', 'Foo Fighters', 'Queens of the Stone Age', 'System of a Down', 'Incubus', 'Blink-182', '50 Cent', 'Lil Wayne', 'T.I.', 'Ludacris', 'Nelly', 'Missy Elliott', 'Pharrell Williams', 'Timbaland', 'Kid Cudi', 'Drake', 'Nicki Minaj', 'Lil Jon', 'Pitbull', 'Flo Rida', 'T-Pain', 'Akon', 'Ne-Yo', 'Chris Brown', 'The Weeknd', 'Frank Ocean', 'Lana Del Rey', 'Florence + The Machine', 'Adele', 'Lady Gaga', 'Katy Perry', 'Kesha', 'Pink', 'Kelly Clarkson', 'Carrie Underwood', 'Shakira', 'Christina Aguilera', 'Britney Spears', 'Avril Lavigne', 'Paramore', 'Fall Out Boy', 'Panic! at the Disco', 'My Chemical Romance', 'Taking Back Sunday', 'Dashboard Confessional', 'Yellowcard', 'Sum 41', 'Simple Plan', 'Good Charlotte', 'Incubus', '3 Doors Down', 'Nickelback', 'Creed', 'Staind', 'Breaking Benjamin', 'Evanescence', 'Disturbed'],
    'Most Iconic Bands': ['The Beatles', 'The Rolling Stones', 'Led Zeppelin', 'Pink Floyd', 'Queen', 'The Who', 'AC/DC', 'Metallica', 'Nirvana', 'Guns N\' Roses', 'U2', 'R.E.M.', 'Radiohead', 'Oasis', 'Blur', 'The Smiths', 'Joy Division', 'New Order', 'The Cure', 'Depeche Mode', 'The Clash', 'Sex Pistols', 'Ramones', 'The Velvet Underground', 'The Doors', 'The Beach Boys', 'Fleetwood Mac', 'Eagles', 'Lynyrd Skynyrd', 'Creedence Clearwater Revival', 'The Jimi Hendrix Experience', 'Cream', 'Deep Purple', 'Black Sabbath', 'Iron Maiden', 'Judas Priest', 'MotÃ¶rhead', 'Slayer', 'Megadeth', 'Anthrax', 'Pantera', 'Van Halen', 'Aerosmith', 'Kiss', 'Def Leppard', 'Bon Jovi', 'Journey', 'Boston', 'Foreigner', 'Toto', 'Chicago', 'Earth, Wind & Fire', 'The Jackson 5', 'The Supremes', 'The Temptations', 'Marvin Gaye & Tammi Terrell', 'Simon & Garfunkel', 'The Mamas & the Papas', 'The Byrds', 'Crosby, Stills, Nash & Young', 'The Grateful Dead', 'Jefferson Airplane', 'Santana', 'Pearl Jam', 'Soundgarden', 'Alice in Chains', 'Stone Temple Pilots', 'Red Hot Chili Peppers', 'Foo Fighters', 'Green Day', 'Blink-182', 'The Offspring', 'Rage Against the Machine', 'System of a Down', 'Linkin Park', 'Evanescence', 'Paramore', 'Fall Out Boy', 'Panic! at the Disco', 'My Chemical Romance', 'Coldplay', 'Muse', 'Arctic Monkeys', 'The Killers', 'The Strokes', 'The White Stripes', 'Kings of Leon', 'Franz Ferdinand', 'Arcade Fire', 'Tame Impala', 'MGMT', 'Vampire Weekend', 'The Black Keys', 'Twenty One Pilots', 'Imagine Dragons', 'One Direction', 'BTS', 'BLACKPINK'],
    'Top Disney Movies': ['The Lion King', 'Beauty and the Beast', 'Aladdin', 'The Little Mermaid', 'Frozen', 'Frozen II', 'Moana', 'Tangled', 'Encanto', 'Coco', 'Toy Story', 'Toy Story 2', 'Toy Story 3', 'Toy Story 4', 'Finding Nemo', 'Finding Dory', 'The Incredibles', 'Incredibles 2', 'Up', 'Inside Out', 'Soul', 'Turning Red', 'Luca', 'Ratatouille', 'WALL-E', 'Monsters, Inc.', 'Monsters University', 'Cars', 'Cars 2', 'Cars 3', 'Brave', 'Onward', 'The Good Dinosaur', 'A Bug\'s Life', 'Cinderella', 'Snow White and the Seven Dwarfs', 'Sleeping Beauty', 'Pocahontas', 'Mulan', 'Hercules', 'Tarzan', 'The Hunchback of Notre Dame', 'The Emperor\'s New Groove', 'Atlantis: The Lost Empire', 'Treasure Planet', 'Brother Bear', 'Lilo & Stitch', 'The Princess and the Frog', 'Wreck-It Ralph', 'Ralph Breaks the Internet', 'Big Hero 6', 'Zootopia', 'Strange World', 'Wish', 'Raya and the Last Dragon', 'Fantasia', 'Fantasia 2000', 'Dumbo', 'Bambi', 'Pinocchio', 'Peter Pan', 'Alice in Wonderland', 'Lady and the Tramp', 'The Aristocats', 'Robin Hood', 'The Jungle Book', 'The Sword in the Stone', 'The Many Adventures of Winnie the Pooh', 'The Rescuers', 'The Rescuers Down Under', 'The Fox and the Hound', 'Oliver & Company', 'The Black Cauldron', 'The Great Mouse Detective', 'A Goofy Movie', 'An Extremely Goofy Movie', 'DuckTales the Movie', 'The Tigger Movie', 'Piglet\'s Big Movie', 'Pooh\'s Heffalump Movie', 'Bolt', 'Meet the Robinsons', 'Chicken Little', 'Dinosaur', 'The Wild', 'Home on the Range', 'Winnie the Pooh', 'Mary Poppins', 'Mary Poppins Returns', 'The Nightmare Before Christmas', 'James and the Giant Peach', 'A Christmas Carol', 'Frankenweenie', 'Pirates of the Caribbean: The Curse of the Black Pearl', 'Pirates of the Caribbean: Dead Man\'s Chest'],
    'Best Comedians': ['Dave Chappelle', 'Chris Rock', 'Kevin Hart', 'Jerry Seinfeld', 'Louis C.K.', 'Bill Burr', 'Ricky Gervais', 'Jim Gaffigan', 'John Mulaney', 'Trevor Noah', 'Hasan Minhaj', 'Ali Wong', 'Amy Schumer', 'Hannah Gadsby', 'Bo Burnham', 'Aziz Ansari', 'Donald Glover', 'Eddie Murphy', 'Richard Pryor', 'George Carlin', 'Robin Williams', 'Joan Rivers', 'Mitch Hedberg', 'Rodney Dangerfield', 'Don Rickles', 'Bob Newhart', 'Steve Martin', 'Martin Short', 'Billy Crystal', 'Whoopi Goldberg', 'Ellen DeGeneres', 'Wanda Sykes', 'Tiffany Haddish', 'Chelsea Handler', 'Sarah Silverman', 'Tig Notaro', 'Maria Bamford', 'Iliza Shlesinger', 'Whitney Cummings', 'Nikki Glaser', 'Fortune Feimster', 'Michelle Wolf', 'Jen Kirkman', 'Kathleen Madigan', 'Anjelah Johnson', 'Margaret Cho', 'Lisa Lampanelli', 'Natasha Leggero', 'Moshe Kasher', 'Patton Oswalt', 'Brian Regan', 'Demetri Martin', 'Dane Cook', 'Gabriel Iglesias', 'Jeff Dunham', 'Daniel Tosh', 'Anthony Jeselnik', 'Hannibal Buress', 'Pete Davidson', 'Colin Jost', 'Michael Che', 'Ronny Chieng', 'Jimmy O. Yang', 'Ken Jeong', 'Jo Koy', 'Russell Peters', 'Sebastian Maniscalco', 'Bert Kreischer', 'Tom Segura', 'Christina P', 'Andrew Santino', 'Mark Normand', 'Joe Rogan', 'Joey Diaz', 'Theo Von', 'Andrew Schulz', 'Nate Bargatze', 'Fortune Feimster', 'Sam Morril', 'Taylor Tomlinson', 'Gary Gulman', 'Mike Birbiglia', 'Jim Norton', 'Norm Macdonald', 'Conan O\'Brien', 'David Letterman', 'Jay Leno', 'Jimmy Fallon', 'Jimmy Kimmel', 'Stephen Colbert', 'Jon Stewart', 'Craig Ferguson', 'James Corden', 'Seth Meyers', 'John Oliver', 'Samantha Bee', 'Larry David', 'Mel Brooks'],
    'Favorite Desserts': ['Chocolate Cake', 'Cheesecake', 'Ice Cream', 'Brownies', 'Cookies', 'Donuts', 'Cupcakes', 'Apple Pie', 'Pumpkin Pie', 'Pecan Pie', 'Key Lime Pie', 'Lemon Meringue Pie', 'Cherry Pie', 'Blueberry Pie', 'Banana Cream Pie', 'Coconut Cream Pie', 'Chocolate Chip Cookies', 'Oatmeal Raisin Cookies', 'Sugar Cookies', 'Snickerdoodles', 'Macarons', 'Ã‰clairs', 'Profiteroles', 'CrÃ¨me BrÃ»lÃ©e', 'Panna Cotta', 'Tiramisu', 'Cannoli', 'Gelato', 'Sorbet', 'Frozen Yogurt', 'Milkshakes', 'Sundaes', 'Banana Split', 'Churros', 'Beignets', 'Funnel Cake', 'Cotton Candy', 'Caramel Apples', 'Candy Apples', 'Rice Krispie Treats', 'S\'mores', 'Fudge', 'Truffles', 'Chocolate-Covered Strawberries', 'Fruit Tart', 'Lemon Bars', 'Peach Cobbler', 'Berry Crisp', 'Bread Pudding', 'Rice Pudding', 'Tapioca Pudding', 'Chocolate Mousse', 'Strawberry Shortcake', 'Trifle', 'Pavlova', 'Meringue', 'SoufflÃ©', 'Flan', 'Tres Leches Cake', 'Carrot Cake', 'Red Velvet Cake', 'German Chocolate Cake', 'Black Forest Cake', 'Pound Cake', 'Angel Food Cake', 'Bundt Cake', 'Coffee Cake', 'Muffins', 'Scones', 'Croissants', 'Danish Pastries', 'Strudel', 'Baklava', 'Loukoumades', 'Gulab Jamun', 'Rasgulla', 'Kulfi', 'Mochi', 'Mochi Ice Cream', 'Dorayaki', 'Taiyaki', 'Boba Tea', 'Shaved Ice', 'Halo-Halo', 'Affogato', 'Popsicles', 'Fudgesicles', 'Creamsicles', 'Klondike Bars', 'Ice Cream Sandwiches', 'Dippin\' Dots', 'Cookie Dough', 'Cake Pops', 'Cronuts', 'Biscotti', 'Ladyfingers', 'Madeleines', 'Financiers', 'Opera Cake'],
    'Most Popular Pizza Toppings': ['Pepperoni', 'Mushrooms', 'Sausage', 'Bacon', 'Onions', 'Black Olives', 'Green Peppers', 'Pineapple', 'Spinach', 'Tomatoes', 'Ham', 'Chicken', 'JalapeÃ±os', 'Banana Peppers', 'Beef', 'Anchovies', 'Garlic', 'Basil', 'Ricotta Cheese', 'Feta Cheese', 'Cheddar Cheese', 'Parmesan Cheese', 'Goat Cheese', 'Blue Cheese', 'Mozzarella', 'Provolone', 'Extra Cheese', 'Red Onions', 'White Onions', 'Caramelized Onions', 'Bell Peppers', 'Roasted Red Peppers', 'Cherry Tomatoes', 'Sun-Dried Tomatoes', 'Artichoke Hearts', 'Kalamata Olives', 'Green Olives', 'Arugula', 'Kale', 'Broccoli', 'Zucchini', 'Eggplant', 'Corn', 'Peas', 'Potatoes', 'BBQ Chicken', 'Buffalo Chicken', 'Grilled Chicken', 'Pulled Pork', 'Meatballs', 'Italian Sausage', 'Chorizo', 'Salami', 'Prosciutto', 'Pancetta', 'Canadian Bacon', 'Ground Beef', 'Steak', 'Shrimp', 'Clams', 'Crab', 'Tuna', 'Smoked Salmon', 'Pesto', 'Alfredo Sauce', 'BBQ Sauce', 'Buffalo Sauce', 'Ranch Dressing', 'Truffle Oil', 'Hot Honey', 'Balsamic Glaze', 'Olive Oil', 'Oregano', 'Red Pepper Flakes', 'Crushed Red Pepper', 'Fresh Mozzarella', 'Burrata', 'Gorgonzola', 'Fontina', 'Asiago', 'Romano', 'Monterey Jack', 'Pepper Jack', 'Ghost Pepper', 'Habanero', 'Serrano Peppers', 'Poblano Peppers', 'Roasted Garlic', 'Pine Nuts', 'Walnuts', 'Capers', 'Fried Egg', 'Avocado', 'Cilantro', 'Rosemary', 'Thyme'],
    'Best Ice Cream Flavors': ['Vanilla', 'Chocolate', 'Strawberry', 'Mint Chocolate Chip', 'Cookie Dough', 'Cookies and Cream', 'Rocky Road', 'Butter Pecan', 'Pistachio', 'Neapolitan', 'Chocolate Chip', 'Coffee', 'Salted Caramel', 'Caramel', 'Dulce de Leche', 'Rum Raisin', 'Cherry Garcia', 'Phish Food', 'Half Baked', 'Chunky Monkey', 'Americone Dream', 'Tonight Dough', 'Cherry Vanilla', 'Black Cherry', 'Birthday Cake', 'Cake Batter', 'Cotton Candy', 'Bubblegum', 'Superman', 'Blue Moon', 'Tiger Tail', 'Moose Tracks', 'Bear Claw', 'Peanut Butter Cup', 'Reese\'s', 'Snickers', 'M&M', 'Twix', 'Kit Kat', 'Oreo', 'Brownie', 'Fudge Brownie', 'Triple Chocolate', 'Dark Chocolate', 'White Chocolate', 'Chocolate Peanut Butter', 'Nutella', 'S\'mores', 'Campfire S\'mores', 'Toasted Marshmallow', 'Maple Walnut', 'Pralines and Cream', 'Butter Brickle', 'English Toffee', 'Almond', 'Hazelnut', 'Macadamia Nut', 'Coconut', 'Pina Colada', 'Mango', 'Strawberry Cheesecake', 'New York Cheesecake', 'Lemon', 'Lemon Sorbet', 'Raspberry', 'Blackberry', 'Blueberry', 'Peach', 'Banana', 'Banana Split', 'Green Tea', 'Matcha', 'Red Bean', 'Black Sesame', 'Taro', 'Ube', 'Thai Tea', 'Chai', 'Lavender', 'Rose', 'Honey', 'Honey Lavender', 'Sea Salt Caramel', 'Salted Pretzel', 'Peanut Butter', 'Peanut Butter & Jelly', 'Cinnamon', 'Churro', 'Tres Leches', 'Flan', 'Tiramisu', 'Cannoli', 'Rum', 'Bourbon', 'Whiskey', 'Amaretto', 'Irish Cream', 'Eggnog', 'Pumpkin', 'Pumpkin Spice'],
    'Favorite Candy': ['Reese\'s Peanut Butter Cups', 'M&Ms', 'Snickers', 'Kit Kat', 'Twix', 'Milky Way', '3 Musketeers', 'Butterfinger', 'Baby Ruth', 'Almond Joy', 'Mounds', 'York Peppermint Patties', 'Junior Mints', 'Rolo', 'Tootsie Rolls', 'Tootsie Pops', 'Dum Dums', 'Blow Pops', 'Ring Pop', 'Push Pop', 'Warheads', 'Sour Patch Kids', 'Swedish Fish', 'Gummy Bears', 'Gummy Worms', 'Haribo Gold Bears', 'Starburst', 'Skittles', 'Life Savers', 'Jolly Ranchers', 'Nerds', 'Gobstoppers', 'SweeTarts', 'Smarties', 'Pixie Stix', 'Fun Dip', 'Laffy Taffy', 'Air Heads', 'Now and Later', 'Hi-Chew', 'Mamba', 'Mentos', 'Tic Tac', 'Altoids', 'Hershey\'s Chocolate Bar', 'Hershey\'s Kisses', 'Dove Chocolate', 'Lindt', 'Ghirardelli', 'Godiva', 'Ferrero Rocher', 'Toblerone', 'Cadbury', 'Kinder', 'Milka', 'Ritter Sport', 'Terry\'s Chocolate Orange', 'After Eight', 'Andes Mints', 'Twizzlers', 'Red Vines', 'Licorice', 'Good & Plenty', 'Mike and Ike', 'Hot Tamales', 'Atomic Fireball', 'Lemonheads', 'Jaw Breakers', 'Bubble Tape', 'Bubble Yum', 'Dubble Bubble', 'Bazooka', 'Big League Chew', 'Caramel', 'Werther\'s Original', 'Kraft Caramels', 'Sugar Babies', 'Sugar Daddy', 'Charleston Chew', 'Zero Bar', 'PayDay', 'Take 5', 'Whatchamacallit', 'Crunch', 'Krackel', '100 Grand', 'Heath Bar', 'Skor', 'Mr. Goodbar', 'Zagnut', 'Bit-O-Honey', 'Circus Peanuts', 'Candy Corn', 'Peeps', 'Dots', 'Jujubes', 'Jujyfruits'],
    'Best Fast Food Chains': ['McDonald\'s', 'Burger King', 'Wendy\'s', 'Taco Bell', 'KFC', 'Subway', 'Chick-fil-A', 'Popeyes', 'Arby\'s', 'Five Guys', 'In-N-Out Burger', 'Shake Shack', 'Whataburger', 'Sonic Drive-In', 'Jack in the Box', 'Carl\'s Jr.', 'Hardee\'s', 'White Castle', 'Krystal', 'Culver\'s', 'Raising Cane\'s', 'Zaxby\'s', 'Bojangles', 'Church\'s Chicken', 'El Pollo Loco', 'Del Taco', 'Chipotle', 'Qdoba', 'Moe\'s Southwest Grill', 'Panera Bread', 'Jimmy John\'s', 'Jersey Mike\'s', 'Firehouse Subs', 'Which Wich', 'Potbelly', 'Penn Station', 'Blimpie', 'Quiznos', 'Panda Express', 'P.F. Chang\'s', 'Pei Wei', 'Benihana Express', 'Pizza Hut', 'Domino\'s', 'Papa John\'s', 'Little Caesars', 'Papa Murphy\'s', 'Marco\'s Pizza', 'Round Table Pizza', 'California Pizza Kitchen', 'Sbarro', 'Long John Silver\'s', 'Captain D\'s', 'Red Lobster', 'Olive Garden', 'Applebee\'s', 'Chili\'s', 'TGI Friday\'s', 'Red Robin', 'Buffalo Wild Wings', 'Wingstop', 'Wing Stop', 'Hooters', 'Twin Peaks', 'Texas Roadhouse', 'LongHorn Steakhouse', 'Outback Steakhouse', 'The Cheesecake Factory', 'Denny\'s', 'IHOP', 'Waffle House', 'Cracker Barrel', 'Bob Evans', 'Perkins', 'Village Inn', 'Steak \'n Shake', 'Checkers', 'Rally\'s', 'A&W', 'Dairy Queen', 'Baskin-Robbins', 'Dunkin\'', 'Krispy Kreme', 'Tim Hortons', 'Cinnabon', 'Auntie Anne\'s', 'Jamba Juice', 'Smoothie King', 'Tropical Smoothie Cafe', 'Orange Julius', 'Wetzel\'s Pretzels', 'Hot Dog on a Stick', 'Nathan\'s Famous', 'Portillo\'s', 'Freddy\'s', 'Smashburger', 'Habit Burger'],
    'Favorite Beverages': ['Water', 'Coffee', 'Tea', 'Green Tea', 'Black Tea', 'Iced Tea', 'Sweet Tea', 'Chai', 'Matcha', 'Espresso', 'Cappuccino', 'Latte', 'Macchiato', 'Mocha', 'Americano', 'Cold Brew', 'Frappuccino', 'Hot Chocolate', 'Chocolate Milk', 'Milk', 'Almond Milk', 'Oat Milk', 'Soy Milk', 'Coconut Milk', 'Orange Juice', 'Apple Juice', 'Grape Juice', 'Cranberry Juice', 'Pineapple Juice', 'Grapefruit Juice', 'Tomato Juice', 'Lemonade', 'Pink Lemonade', 'Arnold Palmer', 'Coca-Cola', 'Pepsi', 'Dr Pepper', 'Sprite', '7UP', 'Mountain Dew', 'Root Beer', 'Ginger Ale', 'Cream Soda', 'Orange Soda', 'Grape Soda', 'Cherry Coke', 'Vanilla Coke', 'Diet Coke', 'Coke Zero', 'Pepsi Max', 'Energy Drinks', 'Red Bull', 'Monster', 'Rockstar', 'Bang Energy', 'Celsius', 'Gatorade', 'Powerade', 'Vitamin Water', 'Coconut Water', 'Sparkling Water', 'La Croix', 'Perrier', 'San Pellegrino', 'Topo Chico', 'Kombucha', 'Kefir', 'Smoothies', 'Protein Shakes', 'Milkshakes', 'Boba Tea', 'Thai Iced Tea', 'Vietnamese Coffee', 'Turkish Coffee', 'Irish Coffee', 'Wine', 'Red Wine', 'White Wine', 'RosÃ©', 'Champagne', 'Prosecco', 'Beer', 'IPA', 'Lager', 'Pilsner', 'Stout', 'Porter', 'Ale', 'Wheat Beer', 'Sour Beer', 'Cider', 'Hard Seltzer', 'Sake', 'Soju', 'Whiskey', 'Bourbon', 'Scotch', 'Vodka', 'Gin', 'Rum', 'Tequila', 'Mezcal'],
    'Best 90s Sitcoms': ['Friends', 'Seinfeld', 'The Fresh Prince of Bel-Air', 'Frasier', 'ER', 'The X-Files', 'Buffy the Vampire Slayer', 'Will & Grace', 'Home Improvement', 'Boy Meets World', 'Full House', 'Family Matters', 'Saved by the Bell', 'Step by Step', 'Sister, Sister', 'The Nanny', 'Blossom', 'Living Single', 'Martin', 'The Wayans Bros.', 'Moesha', 'Sabrina the Teenage Witch', 'Dawson\'s Creek', 'Felicity', 'Charmed', 'Ally McBeal', 'Everybody Loves Raymond', 'That \'70s Show', 'The King of Queens', '3rd Rock from the Sun', 'NewsRadio', 'Spin City', 'Just Shoot Me!', 'Caroline in the City', 'Mad About You', 'Wings', 'Cheers', 'Golden Girls', 'Murphy Brown', 'Designing Women', 'Northern Exposure', 'Twin Peaks', 'Star Trek: The Next Generation', 'Star Trek: Deep Space Nine', 'Star Trek: Voyager', 'Babylon 5'],
    'Favorite Anime Series': ['Attack on Titan', 'Death Note', 'Fullmetal Alchemist: Brotherhood', 'One Piece', 'Naruto', 'Dragon Ball Z', 'My Hero Academia', 'Demon Slayer', 'Jujutsu Kaisen', 'Spy x Family', 'Chainsaw Man', 'Hunter x Hunter', 'One Punch Man', 'Mob Psycho 100', 'Steins;Gate', 'Code Geass', 'Neon Genesis Evangelion', 'Cowboy Bebop', 'Samurai Champloo', 'Bleach', 'Fairy Tail', 'Tokyo Ghoul', 'Parasyte', 'Sword Art Online', 'Re:Zero', 'The Rising of the Shield Hero', 'That Time I Got Reincarnated as a Slime', 'Overlord', 'Konosuba', 'No Game No Life', 'The Promised Neverland', 'Vinland Saga', 'Made in Abyss', 'Dr. Stone', 'Fire Force', 'Black Clover', 'Boruto', 'Fruits Basket', 'Ouran High School Host Club', 'Your Lie in April', 'Anohana', 'Clannad', 'A Silent Voice', 'Your Name', 'Weathering with You', 'Violet Evergarden', 'K-On!', 'Love Live!', 'The Melancholy of Haruhi Suzumiya', 'Toradora!'],
    'Best Horror Movies': ['The Shining', 'The Exorcist', 'Halloween', 'A Nightmare on Elm Street', 'Friday the 13th', 'Scream', 'The Texas Chain Saw Massacre', 'Psycho', 'The Silence of the Lambs', 'Get Out', 'Hereditary', 'The Conjuring', 'Insidious', 'Sinister', 'It', 'The Ring', 'The Grudge', 'Paranormal Activity', 'The Blair Witch Project', 'Saw', 'Hostel', 'The Descent', '28 Days Later', 'Train to Busan', 'A Quiet Place', 'Bird Box', 'Us', 'Midsommar', 'The Lighthouse', 'The Witch', 'It Follows', 'Candyman', 'The Babadook', 'Don\'t Breathe', 'Lights Out', 'Annabelle', 'The Nun', 'Ouija', 'Carrie', 'Misery', 'Pet Sematary', 'Children of the Corn', 'The Mist', 'Poltergeist', 'Amityville Horror', 'The Omen', 'Rosemary\'s Baby', 'Hellraiser', 'Child\'s Play'],
    'Top Action Movies': ['Die Hard', 'Mad Max: Fury Road', 'The Matrix', 'Terminator 2', 'John Wick', 'The Dark Knight', 'Inception', 'Raiders of the Lost Ark', 'Aliens', 'The Bourne Identity', 'Mission: Impossible', 'Speed', 'True Lies', 'The Rock', 'Lethal Weapon', 'Rambo', 'Rocky', 'Gladiator', 'Braveheart', '300', 'Kill Bill', 'Taken', 'The Raid', 'Dredd', 'Edge of Tomorrow', 'Baby Driver', 'Kingsman', 'Atomic Blonde', 'Red Notice', 'The Gray Man', 'Extraction', 'The Equalizer', 'Nobody', 'Old Guard', 'Fast & Furious', 'Point Break', 'Con Air', 'Face/Off', 'The Fugitive', 'Heat', 'Collateral', 'Miami Vice', 'Bad Boys', 'Rush Hour', 'Beverly Hills Cop', '48 Hrs.', 'Total Recall', 'Predator', 'Commando']

,
    'Most Iconic Movie Soundtracks': ['The Lion King', 'Titanic', 'Star Wars', 'The Lord of the Rings', 'Harry Potter', 'Pirates of the Caribbean', 'Gladiator', 'Interstellar', 'Inception', 'Frozen', 'Moana'],
    'Best Romantic Comedies': ['When Harry Met Sally', 'The Notebook', 'Crazy, Stupid, Love', '10 Things I Hate About You', 'Pretty Woman', 'You\'ve Got Mail', 'Sleepless in Seattle', 'Love Actually', 'Notting Hill', 'The Proposal'],
    'Top Sci-Fi Movies': ['Star Wars', 'The Matrix', 'Blade Runner', 'Inception', 'Interstellar', 'The Terminator', 'Alien', 'E.T.', 'Back to the Future', 'Arrival'],
    'Favorite Fantasy Books': ['Harry Potter', 'The Lord of the Rings', 'A Song of Ice and Fire', 'The Chronicles of Narnia', 'The Hobbit', 'Percy Jackson', 'The Hunger Games', 'Twilight', 'Divergent', 'The Maze Runner'],
    'Best Documentaries': ['Planet Earth', 'Blue Planet', 'Free Solo', 'Won\'t You Be My Neighbor', 'Jiro Dreams of Sushi', 'The Social Dilemma', 'Making a Murderer', 'Tiger King', 'The Last Dance', 'Our Planet'],
    'Most Iconic Music Videos': ['Thriller', 'Bad', 'Vogue', 'Single Ladies', 'November Rain', 'Smells Like Teen Spirit', 'Take On Me', 'Bohemian Rhapsody', 'Sledgehammer', 'Virtual Insanity'],
    'Best Music Festivals': ['Coachella', 'Glastonbury', 'Tomorrowland', 'Lollapalooza', 'Bonnaroo', 'Electric Daisy Carnival', 'Ultra Music Festival', 'Burning Man', 'SXSW', 'Woodstock'],
    'Top Broadway Musicals': ['Hamilton', 'The Lion King', 'Wicked', 'The Phantom of the Opera', 'Les Misérables', 'Chicago', 'Rent', 'Dear Evan Hansen', 'Book of Mormon', 'West Side Story'],
    'Famous Painters': ['Leonardo da Vinci', 'Vincent van Gogh', 'Pablo Picasso', 'Claude Monet', 'Rembrandt', 'Michelangelo', 'Salvador Dalí', 'Andy Warhol', 'Frida Kahlo', 'Georgia O\'Keeffe']
,
    'Best Workout Routines': ['Cardio', 'Weight Training', 'HIIT', 'Yoga', 'Pilates', 'CrossFit', 'Running', 'Cycling'],
    'Favorite Sports Teams': ['Lakers', 'Yankees', 'Patriots', 'Cowboys', 'Real Madrid', 'Barcelona', 'Manchester United'],
    'Top Gym Exercises': ['Squats', 'Deadlifts', 'Bench Press', 'Pull-ups', 'Push-ups', 'Lunges', 'Planks'],
    'Best Yoga Poses': ['Downward Dog', 'Warrior', 'Tree Pose', 'Child Pose', 'Cobra', 'Pigeon', 'Savasana'],
    'Most Popular Diets': ['Keto', 'Paleo', 'Vegan', 'Mediterranean', 'Intermittent Fasting', 'Whole30'],
    'Favorite Clothing Brands': ['Nike', 'Adidas', 'Zara', 'H&M', 'Gucci', 'Louis Vuitton', 'Supreme'],
    'Best Shoe Brands': ['Nike', 'Adidas', 'Converse', 'Vans', 'New Balance', 'Jordan', 'Puma'],
    'Favorite Hairstyles': ['Ponytail', 'Bun', 'Braids', 'Pixie Cut', 'Bob', 'Layers', 'Undercut'],
    'Most Useful Apps': ['Gmail', 'Google Maps', 'Uber', 'Amazon', 'WhatsApp', 'Instagram', 'YouTube'],
    'Top Social Media Platforms': ['Instagram', 'TikTok', 'Facebook', 'Twitter', 'Snapchat', 'LinkedIn', 'Reddit'],
    'Best Streaming Services': ['Netflix', 'Disney Plus', 'Hulu', 'HBO Max', 'Amazon Prime', 'Apple TV Plus'],
    'Favorite Podcasts': ['The Joe Rogan Experience', 'Serial', 'This American Life', 'Hardcore History', 'Crime Junkie'],
    'Top Fitness Influencers': ['Joe Wicks', 'Kayla Itsines', 'Jeff Nippard', 'Greg Doucette', 'Athlean-X'],
    'Best Outdoor Games': ['Frisbee', 'Cornhole', 'Volleyball', 'Badminton', 'Capture the Flag', 'Kickball'],
    'Favorite Indoor Games': ['Board Games', 'Card Games', 'Video Games', 'Pool', 'Table Tennis', 'Chess'],
    'Top Travel Apps': ['Google Maps', 'Airbnb', 'Booking.com', 'Uber', 'TripAdvisor', 'Hopper'],
    'Best Productivity Tools': ['Notion', 'Trello', 'Asana', 'Slack', 'Evernote', 'Todoist'],
    'Favorite Car Brands': ['Toyota', 'Honda', 'BMW', 'Mercedes', 'Tesla', 'Ford', 'Chevrolet'],
    'Top Luxury Brands': ['Gucci', 'Louis Vuitton', 'Chanel', 'Prada', 'Rolex', 'Hermès'],
    'Most Popular Hobbies': ['Reading', 'Gaming', 'Photography', 'Cooking', 'Hiking', 'Painting', 'Gardening']
};

// Random Game Mode Functions
function startRandomGame() {
    // Initialize random game mode
    shuffleColors();
    gameState.players = [];
    gameState.lobby = null;
    gameState.isRandomGame = true;
    gameState.currentGameMode = 'random';

    const playerList = document.getElementById('randomGamePlayerList');
    if (playerList) {
        playerList.innerHTML = '';
    }

    // Generate random game title
    generateRandomGameTitle();

    // Add first player with current user's name
    addRandomGamePlayer();

    showScreen('randomGameScreen');
}

// Track recently used categories for better variety
let recentRandomCategories = [];
const MAX_RECENT_CATEGORIES = 10; // Avoid last 10 categories

function generateRandomGameTitle() {
    const allTitles = Object.keys(randomItemPools);

    // Filter out recently used categories for better variety
    let availableTitles = allTitles.filter(title => !recentRandomCategories.includes(title));

    // If all categories were recently used, reset the list
    if (availableTitles.length === 0) {
        recentRandomCategories = [];
        availableTitles = allTitles;
    }

    // Shuffle and pick a random title from available ones
    const shuffled = shuffleArray(availableTitles);
    const randomTitle = shuffled[0];

    // Track this category as recently used
    recentRandomCategories.push(randomTitle);
    if (recentRandomCategories.length > MAX_RECENT_CATEGORIES) {
        recentRandomCategories.shift(); // Remove oldest
    }

    document.getElementById('randomGameTitle').value = randomTitle;
    gameState.randomGameTitle = randomTitle;

    // Generate 5 random suggestions
    generateTitleSuggestions();
}

async function generateTitleSuggestions() {
    const allTitles = Object.keys(randomItemPools);
    const suggestionsContainer = document.getElementById('randomTitleSuggestions');
    const presetSuggestionsContainer = document.getElementById('randomPresetSuggestions');
    const presetRow = document.getElementById('presetSuggestionsRow');

    if (!suggestionsContainer) return;

    // Fetch user-created presets
    let presets = [];
    try {
        const response = await fetch('/api/presets');
        if (response.ok) {
            presets = await response.json();
        }
    } catch (error) {
        console.error('Failed to fetch presets:', error);
    }

    // Filter out the current title and recently used ones for better variety
    const currentTitle = gameState.randomGameTitle;
    let availableTitles = allTitles.filter(title =>
        title !== currentTitle && !recentRandomCategories.includes(title)
    );

    // If not enough available titles, include some recent ones
    if (availableTitles.length < 5) {
        availableTitles = allTitles.filter(title => title !== currentTitle);
    }

    // Shuffle all available titles and pick 5 (or 3 on mobile)
    const isMobile = window.innerWidth <= 768;
    const suggestionCount = isMobile ? 3 : 5;
    const shuffledTitles = shuffleArray(availableTitles);
    const suggestions = shuffledTitles.slice(0, suggestionCount);

    // Clear existing suggestions
    suggestionsContainer.innerHTML = '';

    // Create suggestion chips for quick picks
    suggestions.forEach(title => {
        const chip = document.createElement('button');
        chip.className = 'suggestion-chip';
        chip.textContent = title;
        chip.onclick = () => selectTitleSuggestion(title, false);
        suggestionsContainer.appendChild(chip);
    });

    // Add preset suggestions on separate line
    if (presets.length > 0 && presetSuggestionsContainer) {
        presetSuggestionsContainer.innerHTML = '';
        presetRow.style.display = 'flex';

        const shuffledPresets = shuffleArray(presets);
        const presetSuggestions = shuffledPresets.slice(0, Math.min(suggestionCount, presets.length));

        presetSuggestions.forEach(preset => {
            const chip = document.createElement('button');
            chip.className = 'suggestion-chip preset-chip';
            chip.textContent = preset.title;
            chip.onclick = () => selectPresetSuggestion(preset);
            presetSuggestionsContainer.appendChild(chip);
        });
    } else if (presetRow) {
        presetRow.style.display = 'none';
    }
}

function selectTitleSuggestion(title, isPreset = false) {
    document.getElementById('randomGameTitle').value = title;
    gameState.randomGameTitle = title;
    gameState.selectedPreset = isPreset ? null : null; // Clear any preset selection for quick picks

    // Optionally regenerate suggestions to give new options (no await needed, runs in background)
    generateTitleSuggestions().catch(err => console.error('Error regenerating suggestions:', err));
}

function selectPresetSuggestion(preset) {
    document.getElementById('randomGameTitle').value = preset.title;
    gameState.randomGameTitle = preset.title;
    gameState.selectedPreset = preset; // Store the selected preset

    // Optionally regenerate suggestions to give new options (no await needed, runs in background)
    generateTitleSuggestions().catch(err => console.error('Error regenerating suggestions:', err));
}

function rerollRandomGame() {
    // Re-generate random title and suggestions
    generateRandomGameTitle();
}

function addRandomGamePlayer() {
    const playerList = document.getElementById('randomGamePlayerList');
    const playerIndex = gameState.players.length;
    const color = shuffledColors[playerIndex % shuffledColors.length];

    // For first player, use the logged-in user's name
    let defaultValue = '';
    let placeholderText = 'Player name';

    if (playerIndex === 0 && gameState.currentUser) {
        // Auto-fill with logged-in user's name (remove " (Guest)" or "(Guest-####)" suffix if present)
        defaultValue = gameState.currentUser.replace(/\s*\(Guest(-\d+)?\)\s*$/i, '').trim();
        placeholderText = 'Your name';
    }

    const playerEntry = document.createElement('div');
    playerEntry.className = 'player-entry';
    playerEntry.innerHTML = `
        <input type="text" placeholder="${placeholderText}" maxlength="20" data-player-index="${playerIndex}" value="${defaultValue}">
        <div class="player-color" style="background-color: ${color}"></div>
        ${playerIndex > 0 ? '<button class="btn-remove" onclick="removeRandomGamePlayer(' + playerIndex + ')">Ã—</button>' : ''}
    `;
    playerList.appendChild(playerEntry);

    gameState.players.push({ name: defaultValue, color: color });
}

function removeRandomGamePlayer(index) {
    gameState.players.splice(index, 1);
    renderRandomGamePlayerList();
}

function renderRandomGamePlayerList() {
    const playerList = document.getElementById('randomGamePlayerList');
    playerList.innerHTML = '';

    gameState.players.forEach((player, index) => {
        const placeholderText = index === 0 ? 'Your name' : 'Player name';
        const playerEntry = document.createElement('div');
        playerEntry.className = 'player-entry';
        playerEntry.innerHTML = `
            <input type="text" placeholder="${placeholderText}" maxlength="20" data-player-index="${index}" value="${player.name || ''}">
            <div class="player-color" style="background-color: ${player.color}"></div>
            ${index > 0 ? '<button class="btn-remove" onclick="removeRandomGamePlayer(' + index + ')">Ã—</button>' : ''}
        `;
        playerList.appendChild(playerEntry);
    });
}

function adjustRandomGameRows(delta) {
    const input = document.getElementById('randomGameRowAmount');
    let value = parseInt(input.value) || 10;
    value = Math.max(1, Math.min(100, value + delta));
    input.value = value;
}

function setupRandomGameMode() {
    const title = document.getElementById('randomGameTitle').value.trim();
    const rowAmount = parseInt(document.getElementById('randomGameRowAmount').value);

    if (!title) {
        showModal('Error', 'No random title generated!');
        return;
    }

    // Get player names from inputs
    const playerInputs = document.querySelectorAll('#randomGamePlayerList input[data-player-index]');
    gameState.players = [];
    const currentUserName = gameState.currentUser ? gameState.currentUser.replace(/\s*\(Guest(-\d+)?\)\s*$/i, '').trim() : 'Player 1';

    playerInputs.forEach((input, index) => {
        const name = input.value.trim();
        const color = shuffledColors[index % shuffledColors.length];

        // If no name provided, use default based on index
        const finalName = name || (index === 0 ? currentUserName : `Player ${index + 1}`);

        gameState.players.push({ name: finalName, color: color });
    });

    if (gameState.players.length < 1) {
        showModal('Error', 'Please add at least one player!');
        return;
    }

    gameState.gameTitle = title;
    gameState.currentPlayerIndex = 0;
    gameState.rankingItems = [];
    gameState.removalHistory = [];
    gameState.isSingleDeviceMode = false;
    gameState.isRandomGame = true;

    let selectedItems = [];

    // Check if a preset was selected
    if (gameState.selectedPreset && gameState.selectedPreset.items) {
        // Use preset items
        const presetItems = gameState.selectedPreset.items.map(item => item.value || item);
        const shuffledItems = shuffleArray([...presetItems]);
        selectedItems = shuffledItems.slice(0, Math.min(rowAmount, shuffledItems.length));
    } else {
        // Get items from random pool
        const itemPool = randomItemPools[title];
        if (!itemPool || itemPool.length === 0) {
            showModal('Error', 'No items available for this category!');
            return;
        }

        // Shuffle and select items based on row amount
        const shuffledItems = shuffleArray([...itemPool]);
        selectedItems = shuffledItems.slice(0, Math.min(rowAmount, shuffledItems.length));
    }

    // If we need more items than available, fill remaining with generic names
    for (let i = 1; i <= rowAmount; i++) {
        const itemValue = selectedItems[i - 1] || `Item ${i}`;
        gameState.rankingItems.push({
            number: i,
            value: itemValue,
            removed: false
        });
    }

    // Go directly to game screen with pre-filled items
    renderGameScreen();
    showScreen('gameScreen');
}

// Preset Game Mode Functions
let allPresets = [];
let filteredPresets = [];

function openPresetGameMenu() {
    // Check if user is registered
    if (gameState.userType === 'guest') {
        showModal('Registered Only', 'This feature is only available for registered users.\n\nRegister an account to access presets!');
        return;
    }

    showScreen('presetGameScreen');
}

function showPresetGame() {
    showScreen('presetGameScreen');
}

function showMakePreset() {
    // Clear form
    document.getElementById('presetTitle').value = '';
    document.getElementById('presetDescription').value = '';
    const itemsList = document.getElementById('presetItemsList');
    itemsList.innerHTML = '';

    // Add 5 initial item fields
    for (let i = 0; i < 5; i++) {
        addPresetItem();
    }

    showScreen('makePresetScreen');

    // Auto-focus on preset title input
    setTimeout(() => {
        document.getElementById('presetTitle').focus();
    }, 100);
}

function addPresetItem() {
    const itemsList = document.getElementById('presetItemsList');
    const itemIndex = itemsList.children.length;

    const itemEntry = document.createElement('div');
    itemEntry.className = 'preset-item-entry';
    itemEntry.innerHTML = `
        <input type="text" placeholder="Item ${itemIndex + 1}" maxlength="50" data-item-index="${itemIndex}">
        ${itemIndex >= 5 ? '<button class="btn-remove" onclick="removePresetItem(this)">Ã—</button>' : ''}
    `;
    itemsList.appendChild(itemEntry);

    // Add Enter key navigation
    const input = itemEntry.querySelector('input');
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const allEntries = Array.from(itemsList.children);
            const currentIndex = allEntries.indexOf(itemEntry);

            // If this is the last item, add a new one and focus it
            if (currentIndex === allEntries.length - 1) {
                addPresetItem();
                setTimeout(() => {
                    const newInput = itemsList.lastElementChild.querySelector('input');
                    newInput.focus();
                }, 10);
            } else {
                // Focus the next item
                const nextInput = allEntries[currentIndex + 1].querySelector('input');
                nextInput.focus();
            }
        }
    });
}

function removePresetItem(button) {
    const itemEntry = button.parentElement;
    itemEntry.remove();

    // Re-index remaining items
    const itemsList = document.getElementById('presetItemsList');
    Array.from(itemsList.children).forEach((entry, index) => {
        const input = entry.querySelector('input');
        input.placeholder = `Item ${index + 1}`;
        input.setAttribute('data-item-index', index);
    });
}

async function savePreset() {
    const title = document.getElementById('presetTitle').value.trim();
    const description = document.getElementById('presetDescription').value.trim();

    if (!title) {
        showModal('Error', 'Please enter a preset title!');
        return;
    }

    // Get all items
    const itemInputs = document.querySelectorAll('#presetItemsList input');
    const items = [];

    itemInputs.forEach(input => {
        const value = input.value.trim();
        if (value) {
            items.push(value);
        }
    });

    if (items.length < 5) {
        showModal('Error', 'Please add at least 5 items!');
        return;
    }

    // Check for duplicate items
    const itemsLowerCase = items.map(item => item.toLowerCase());
    const duplicates = itemsLowerCase.filter((item, index) => itemsLowerCase.indexOf(item) !== index);
    if (duplicates.length > 0) {
        showModal('Error', 'Duplicate items found! Each item must be unique.');
        return;
    }

    // Check for duplicate preset title
    try {
        const response = await fetch('/api/presets');
        if (response.ok) {
            const existingPresets = await response.json();
            const titleExists = existingPresets.some(preset =>
                preset.title.toLowerCase() === title.toLowerCase() &&
                preset.creator === gameState.currentUser
            );
            if (titleExists) {
                showModal('Error', 'You already have a preset with this title! Please choose a different title.');
                return;
            }
        }
    } catch (error) {
        console.error('Error checking for duplicate titles:', error);
    }

    // Create preset object
    const preset = {
        id: Date.now(),
        title: title,
        description: description,
        items: items,
        creator: gameState.currentUser,
        createdAt: new Date().toISOString()
    };

    try {
        // Save to server
        const response = await fetch('/api/presets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preset)
        });

        if (response.ok) {
            showModal('Success!', `Preset "${title}" has been saved!\n\nOthers can now play this preset.`, [
                {
                    text: 'Browse Presets',
                    class: 'btn-primary',
                    onclick: () => {
                        closeModal();
                        showBrowsePresets();
                    }
                },
                {
                    text: 'OK',
                    class: 'btn-secondary',
                    onclick: () => {
                        closeModal();
                        showPresetGame();
                    }
                }
            ]);
        } else {
            showModal('Error', 'Failed to save preset. Please try again.');
        }
    } catch (error) {
        console.error('Error saving preset:', error);
        showModal('Connection Error', 'Cannot connect to server. Please make sure the server is running.');
    }
}

async function showBrowsePresets() {
    try {
        // Load presets from server
        const response = await fetch('/api/presets');
        if (response.ok) {
            allPresets = await response.json();
            filteredPresets = [...allPresets];
            applyPresetFilters();
        } else {
            allPresets = [];
            filteredPresets = [];
            renderPresetsList();
        }
    } catch (error) {
        console.error('Error loading presets:', error);
        allPresets = [];
        filteredPresets = [];
        renderPresetsList();
    }

    showScreen('browsePresetsScreen');
}

function applyPresetFilters() {
    const sortFilter = document.getElementById('presetSortFilter').value;
    const searchQuery = document.getElementById('presetSearchInput').value.trim().toLowerCase();

    // Filter by search query (fuzzy search)
    if (searchQuery) {
        filteredPresets = allPresets.filter(preset => {
            const titleMatch = preset.title.toLowerCase().includes(searchQuery);
            const descMatch = preset.description && preset.description.toLowerCase().includes(searchQuery);
            const creatorMatch = preset.creator && preset.creator.toLowerCase().includes(searchQuery);
            return titleMatch || descMatch || creatorMatch;
        });
    } else {
        filteredPresets = [...allPresets];
    }

    // Sort presets
    switch (sortFilter) {
        case 'newest':
            filteredPresets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            filteredPresets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'alpha-asc':
            filteredPresets.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'alpha-desc':
            filteredPresets.sort((a, b) => b.title.localeCompare(a.title));
            break;
    }

    renderPresetsList();
}

function clearPresetSearch() {
    document.getElementById('presetSearchInput').value = '';
    applyPresetFilters();
}

function renderPresetsList() {
    const container = document.getElementById('presetsList');
    container.innerHTML = '';

    if (filteredPresets.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No presets found.</p>';
        return;
    }

    filteredPresets.forEach(preset => {
        const card = document.createElement('div');
        card.className = 'preset-card';

        const date = new Date(preset.createdAt);
        const formattedDate = date.toLocaleDateString();

        card.innerHTML = `
            <div class="preset-card-header">
                <h3 class="preset-card-title">${preset.title}</h3>
                <div class="preset-card-meta">
                    <span>👤 ${preset.creator}</span>
                    <span>📅 ${formattedDate}</span>
                </div>
                ${preset.description ? `<div class="preset-card-description">${preset.description}</div>` : ''}
            </div>
            <div class="preset-card-items">
                <span class="preset-card-items-count">${preset.items.length} items</span>
            </div>
        `;

        card.onclick = () => showPresetDetails(preset);
        container.appendChild(card);
    });
}

function showPresetDetails(preset) {
    const itemsList = preset.items.map((item, index) => `${index + 1}. ${item}`).join('\n');
    const itemsHtml = preset.items.map((item, index) =>
        `<div class="preset-item-line">${index + 1}. ${item}</div>`
    ).join('');

    const modalContent = `
        <div class="preset-details-header">
            <h3>${preset.title}</h3>
            ${preset.description ? `<p class="preset-description">${preset.description}</p>` : ''}
            <div class="preset-meta">
                <span>👤 ${preset.creator}</span>
                <span>📝 ${preset.items.length} items</span>
            </div>
        </div>
        <div class="preset-items-list">
            ${itemsHtml}
        </div>
    `;

    // Build buttons array - include edit/delete if user is creator or admin
    const buttons = [
        {
            text: 'Play',
            class: 'btn-primary',
            onclick: () => {
                closeModal();
                playPreset(preset);
            }
        }
    ];

    // Add edit and delete buttons if user is creator or admin
    if (preset.creator === gameState.currentUser || gameState.isAdmin) {
        buttons.push({
            text: 'Edit',
            class: 'btn-secondary',
            onclick: () => {
                closeModal();
                editPreset(preset);
            }
        });
        buttons.push({
            text: 'Delete',
            class: 'btn-danger',
            onclick: () => {
                closeModal();
                deleteSinglePreset(preset.id);
            }
        });
    }

    buttons.push({
        text: 'Cancel',
        class: 'btn-secondary',
        onclick: () => closeModal()
    });

    showModal('Preset Details', modalContent, buttons);
}

let selectedPreset = null;

function playPreset(preset) {
    // Store the selected preset
    selectedPreset = preset;
    gameState.isSingleDeviceMode = false;
    gameState.isRandomGame = false;
    gameState.currentGameMode = 'preset';

    // Initialize player list
    shuffleColors();
    gameState.players = [];
    const playerList = document.getElementById('playPresetPlayerList');
    if (playerList) {
        playerList.innerHTML = '';
    }

    // Update screen title and description
    document.getElementById('playPresetTitle').textContent = preset.title + ' 📋';
    const descText = preset.description
        ? preset.description + ' • ' + preset.items.length + ' items'
        : preset.items.length + ' items to rank!';
    document.getElementById('playPresetDescription').textContent = descText;

    // Add first player with current user's name
    addPlayPresetPlayer();

    showScreen('playPresetScreen');
}

function addPlayPresetPlayer() {
    const playerList = document.getElementById('playPresetPlayerList');
    const playerIndex = gameState.players.length;
    const color = shuffledColors[playerIndex % shuffledColors.length];

    // For first player, use the logged-in user's name
    let defaultValue = '';
    let placeholderText = 'Player name';

    if (playerIndex === 0 && gameState.currentUser) {
        // Auto-fill with logged-in user's name (remove " (Guest)" or "(Guest-####)" suffix if present)
        defaultValue = gameState.currentUser.replace(/\s*\(Guest(-\d+)?\)\s*$/i, '').trim();
        placeholderText = 'Your name';
    }

    const playerEntry = document.createElement('div');
    playerEntry.className = 'player-entry';
    playerEntry.innerHTML = `
        <input type="text" placeholder="${placeholderText}" maxlength="20" data-player-index="${playerIndex}" value="${defaultValue}">
        <div class="player-color" style="background-color: ${color}"></div>
        ${playerIndex > 0 ? '<button class="btn-remove" onclick="removePlayPresetPlayer(' + playerIndex + ')">Ã—</button>' : ''}
    `;
    playerList.appendChild(playerEntry);

    gameState.players.push({ name: defaultValue, color: color });
}

function removePlayPresetPlayer(index) {
    gameState.players.splice(index, 1);
    renderPlayPresetPlayerList();
}

function renderPlayPresetPlayerList() {
    const playerList = document.getElementById('playPresetPlayerList');
    playerList.innerHTML = '';

    gameState.players.forEach((player, index) => {
        const placeholderText = index === 0 ? 'Your name' : 'Player name';
        const playerEntry = document.createElement('div');
        playerEntry.className = 'player-entry';
        playerEntry.innerHTML = `
            <input type="text" placeholder="${placeholderText}" maxlength="20" data-player-index="${index}" value="${player.name || ''}">
            <div class="player-color" style="background-color: ${player.color}"></div>
            ${index > 0 ? '<button class="btn-remove" onclick="removePlayPresetPlayer(' + index + ')">Ã—</button>' : ''}
        `;
        playerList.appendChild(playerEntry);
    });
}

function startPresetGame() {
    if (!selectedPreset) {
        showModal('Error', 'No preset selected!');
        return;
    }

    // Get player names from inputs
    const playerInputs = document.querySelectorAll('#playPresetPlayerList input[data-player-index]');
    gameState.players = [];
    const currentUserName = gameState.currentUser ? gameState.currentUser.replace(/\s*\(Guest(-\d+)?\)\s*$/i, '').trim() : 'Player 1';

    playerInputs.forEach((input, index) => {
        const name = input.value.trim();
        const color = shuffledColors[index % shuffledColors.length];

        // If no name provided, use default based on index
        const finalName = name || (index === 0 ? currentUserName : `Player ${index + 1}`);

        gameState.players.push({ name: finalName, color: color });
    });

    if (gameState.players.length < 1) {
        showModal('Error', 'Please add at least one player!');
        return;
    }

    // Initialize game with preset
    gameState.lobby = null;
    gameState.isSingleDeviceMode = false;
    gameState.isRandomGame = false;
    gameState.gameTitle = selectedPreset.title;
    gameState.currentPlayerIndex = 0;
    gameState.rankingItems = [];
    gameState.removalHistory = [];

    // Fill items from preset
    selectedPreset.items.forEach((item, index) => {
        gameState.rankingItems.push({
            number: index + 1,
            value: item,
            removed: false
        });
    });

    // Go to game screen
    renderGameScreen();
    showScreen('gameScreen');
}

// Admin Panel Functions
let adminAllPresets = [];
let adminFilteredPresets = [];
let selectedPresetIds = new Set();
let currentEditingPreset = null;
let editPresetReturnScreen = 'adminPanelScreen'; // Track where to return after editing

async function showAdminPanel() {
    // CRITICAL SECURITY: Block guest users from accessing admin panel
    if (gameState.userType !== 'registered' || !gameState.isAdmin) {
        showModal('Access Denied', 'You do not have permission to access the admin panel.');
        return;
    }

    try {
        const response = await fetch('/api/presets');
        if (response.ok) {
            adminAllPresets = await response.json();
            adminFilteredPresets = [...adminAllPresets];
            selectedPresetIds.clear();
            applyAdminPresetFilters();
        } else {
            adminAllPresets = [];
            adminFilteredPresets = [];
            renderAdminPresetsList();
        }
    } catch (error) {
        console.error('Error loading presets:', error);
        adminAllPresets = [];
        adminFilteredPresets = [];
        renderAdminPresetsList();
    }

    // Reset to Manage Presets section
    switchAdminSection('presets');

    showScreen('adminPanelScreen');
}

function applyAdminPresetFilters() {
    const sortFilter = document.getElementById('adminPresetSortFilter').value;
    const searchQuery = document.getElementById('adminPresetSearchInput').value.trim().toLowerCase();

    // Filter by search query
    if (searchQuery) {
        adminFilteredPresets = adminAllPresets.filter(preset => {
            const titleMatch = preset.title.toLowerCase().includes(searchQuery);
            const descMatch = preset.description && preset.description.toLowerCase().includes(searchQuery);
            const creatorMatch = preset.creator && preset.creator.toLowerCase().includes(searchQuery);
            return titleMatch || descMatch || creatorMatch;
        });
    } else {
        adminFilteredPresets = [...adminAllPresets];
    }

    // Sort presets
    switch (sortFilter) {
        case 'newest':
            adminFilteredPresets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            adminFilteredPresets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'alpha-asc':
            adminFilteredPresets.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'alpha-desc':
            adminFilteredPresets.sort((a, b) => b.title.localeCompare(a.title));
            break;
    }

    renderAdminPresetsList();
}

function renderAdminPresetsList() {
    const container = document.getElementById('adminPresetsList');
    container.innerHTML = '';

    if (adminFilteredPresets.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No presets found</p>';
        return;
    }

    adminFilteredPresets.forEach(preset => {
        const card = document.createElement('div');
        card.className = 'preset-card admin-mode';
        if (selectedPresetIds.has(preset.id)) {
            card.classList.add('selected');
        }

        const createdDate = new Date(preset.createdAt).toLocaleDateString();
        const itemCount = preset.items.length;

        card.innerHTML = `
            <input type="checkbox" class="preset-card-checkbox" ${selectedPresetIds.has(preset.id) ? 'checked' : ''}>
            <div class="preset-card-header">
                <h3 class="preset-card-title">${preset.title}</h3>
                <div class="preset-card-meta">
                    <span>👤 ${preset.creator}</span>
                    <span>📅 ${createdDate}</span>
                    <span>📝 ${itemCount} items</span>
                </div>
                ${preset.description ? `<p class="preset-card-description">${preset.description}</p>` : ''}
            </div>
            <div class="preset-card-actions">
                <button class="btn-edit" onclick="editPreset(${preset.id})">Edit</button>
                <button class="btn-delete" onclick="deleteSinglePreset(${preset.id})">Delete</button>
            </div>
        `;

        // Add checkbox event listener
        const checkbox = card.querySelector('.preset-card-checkbox');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            if (checkbox.checked) {
                selectedPresetIds.add(preset.id);
                card.classList.add('selected');
            } else {
                selectedPresetIds.delete(preset.id);
                card.classList.remove('selected');
            }
            updateSelectedCount();
        });

        container.appendChild(card);
    });

    updateSelectedCount();
}

function updateSelectedCount() {
    const count = selectedPresetIds.size;
    document.getElementById('selectedCount').textContent = `${count} selected`;
    document.getElementById('deleteSelectedBtn').disabled = count === 0;
}

async function deleteSinglePreset(presetId) {
    // Try to find preset in different locations depending on context
    let preset = adminAllPresets.find(p => p.id === presetId);
    if (!preset) {
        preset = allPresets.find(p => p.id === presetId);
    }
    if (!preset) {
        preset = filteredPresets.find(p => p.id === presetId);
    }
    if (!preset) {
        showModal('Error', 'Preset not found.');
        return;
    }

    showModal('Confirm Delete', `Are you sure you want to delete "${preset.title}"?`, [
        {
            text: 'Cancel',
            class: 'btn-secondary',
            onclick: () => closeModal()
        },
        {
            text: 'Delete',
            class: 'btn-danger',
            onclick: async () => {
                closeModal();
                try {
                    const response = await fetch(`/api/presets/${presetId}`, {
                        method: 'DELETE',
                        headers: {
                            'X-Username': gameState.currentUser,
                            'X-Is-Admin': gameState.isAdmin ? 'true' : 'false'
                        }
                    });

                    if (response.ok) {
                        showModal('Success', 'Preset deleted successfully!');
                        // Reload the presets list
                        await showBrowsePresets();
                    } else {
                        const error = await response.json();
                        showModal('Error', error.error || 'Failed to delete preset. You may not have permission.');
                    }
                } catch (error) {
                    console.error('Error deleting preset:', error);
                    showModal('Error', 'Failed to delete preset. Please try again.');
                }
            }
        }
    ]);
}

async function deleteSelectedPresets() {
    if (selectedPresetIds.size === 0) return;

    showModal('Confirm Delete', `Are you sure you want to delete ${selectedPresetIds.size} preset(s)?`, [
        {
            text: 'Cancel',
            class: 'btn-secondary',
            onclick: () => closeModal()
        },
        {
            text: 'Delete All',
            class: 'btn-danger',
            onclick: async () => {
                closeModal();
                await deletePresets(Array.from(selectedPresetIds));
            }
        }
    ]);
}

async function deletePresets(presetIds) {
    try {
        const deletePromises = presetIds.map(id =>
            fetch(`/api/presets/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-Username': gameState.currentUser,
                    'X-Is-Admin': gameState.isAdmin ? 'true' : 'false'
                }
            })
        );

        const results = await Promise.all(deletePromises);

        // Check for permission errors
        const failedDeletes = [];
        for (let i = 0; i < results.length; i++) {
            if (!results[i].ok) {
                const error = await results[i].json();
                failedDeletes.push(error.error);
            }
        }

        if (failedDeletes.length > 0) {
            showModal('Error', failedDeletes[0] || 'Failed to delete some presets. You may not have permission.');
            return;
        }

        selectedPresetIds.clear();
        await showAdminPanel();
        showModal('Success', `Successfully deleted ${presetIds.length} preset(s)!`);
    } catch (error) {
        console.error('Error deleting presets:', error);
        showModal('Error', 'Failed to delete presets. Please try again.');
    }
}

function editPreset(preset) {
    // Accept preset object directly (from browse view) or preset ID (from admin panel)
    let presetToEdit = preset;

    // If a number is passed (preset ID from admin panel), find it in adminAllPresets
    if (typeof preset === 'number') {
        presetToEdit = adminAllPresets.find(p => p.id === preset);
        if (!presetToEdit) return;
        editPresetReturnScreen = 'adminPanelScreen'; // Return to admin panel
    } else {
        editPresetReturnScreen = 'browsePresetsScreen'; // Return to browse presets
    }

    currentEditingPreset = presetToEdit;

    document.getElementById('editPresetTitle').value = presetToEdit.title;
    document.getElementById('editPresetDescription').value = presetToEdit.description || '';
    document.getElementById('editPresetCreator').value = presetToEdit.creator;

    // Populate items
    const itemsList = document.getElementById('editPresetItemsList');
    itemsList.innerHTML = '';

    presetToEdit.items.forEach((item, index) => {
        const itemEntry = document.createElement('div');
        itemEntry.className = 'preset-item-entry';
        itemEntry.innerHTML = `
            <input type="text" placeholder="Item ${index + 1}" maxlength="50" value="${item}" data-item-index="${index}">
            ${index >= 3 ? '<button class="btn-remove" onclick="removeEditPresetItem(this)">Ã—</button>' : ''}
        `;
        itemsList.appendChild(itemEntry);
    });

    showScreen('editPresetScreen');
}

function addEditPresetItem() {
    const itemsList = document.getElementById('editPresetItemsList');
    const itemIndex = itemsList.children.length;

    const itemEntry = document.createElement('div');
    itemEntry.className = 'preset-item-entry';
    itemEntry.innerHTML = `
        <input type="text" placeholder="Item ${itemIndex + 1}" maxlength="50" data-item-index="${itemIndex}">
        ${itemIndex >= 3 ? '<button class="btn-remove" onclick="removeEditPresetItem(this)">Ã—</button>' : ''}
    `;
    itemsList.appendChild(itemEntry);
}

function removeEditPresetItem(button) {
    const itemEntry = button.parentElement;
    itemEntry.remove();

    // Re-index remaining items
    const itemsList = document.getElementById('editPresetItemsList');
    Array.from(itemsList.children).forEach((entry, index) => {
        const input = entry.querySelector('input');
        input.placeholder = `Item ${index + 1}`;
        input.setAttribute('data-item-index', index);
    });
}

function cancelEditPreset() {
    if (editPresetReturnScreen === 'adminPanelScreen') {
        showAdminPanel();
    } else {
        showBrowsePresets();
    }
}

async function saveEditedPreset() {
    if (!currentEditingPreset) return;

    const title = document.getElementById('editPresetTitle').value.trim();
    const description = document.getElementById('editPresetDescription').value.trim();

    if (!title) {
        showModal('Error', 'Please enter a preset title!');
        return;
    }

    // Get all items
    const itemInputs = document.querySelectorAll('#editPresetItemsList input');
    const items = [];

    itemInputs.forEach(input => {
        const value = input.value.trim();
        if (value) {
            items.push(value);
        }
    });

    if (items.length < 5) {
        showModal('Error', 'Please add at least 5 items!');
        return;
    }

    // Check for duplicate items
    const itemsLowerCase = items.map(item => item.toLowerCase());
    const duplicates = itemsLowerCase.filter((item, index) => itemsLowerCase.indexOf(item) !== index);
    if (duplicates.length > 0) {
        showModal('Error', 'Duplicate items found! Each item must be unique.');
        return;
    }

    try {
        const response = await fetch(`/api/presets/${currentEditingPreset.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                description: description,
                items: items
            })
        });

        if (response.ok) {
            showModal('Success!', `Preset "${title}" has been updated!`, [
                {
                    text: 'OK',
                    class: 'btn-primary',
                    onclick: async () => {
                        closeModal();
                        if (editPresetReturnScreen === 'adminPanelScreen') {
                            showAdminPanel();
                        } else {
                            await showBrowsePresets();
                        }
                    }
                }
            ]);
        } else {
            showModal('Error', 'Failed to update preset. Please try again.');
        }
    } catch (error) {
        console.error('Error updating preset:', error);
        showModal('Connection Error', 'Cannot connect to server. Please make sure the server is running.');
    }
}

function switchAdminSection(sectionName) {
    // Update navigation buttons
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        if (btn.dataset.section === sectionName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update sections
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });

    if (sectionName === 'presets') {
        document.getElementById('adminPresetsSection').classList.add('active');
    } else if (sectionName === 'users') {
        document.getElementById('adminUsersSection').classList.add('active');
        loadAdminUsers();
    } else if (sectionName === 'password') {
        document.getElementById('adminPasswordSection').classList.add('active');
    }
}

async function loadAdminUsers() {
    try {
        const response = await fetch('/api/users');
        if (response.ok) {
            const users = await response.json();
            renderAdminUsersList(users);
        } else {
            showModal('Error', 'Failed to load users.');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showModal('Connection Error', 'Cannot connect to server.');
    }
}

function renderAdminUsersList(users) {
    const usersList = document.getElementById('adminUsersList');
    usersList.innerHTML = '';

    if (users.length === 0) {
        usersList.innerHTML = '<p class="party-subtitle">No registered users found.</p>';
        return;
    }

    users.forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'admin-user-card';

        const isAdmin = user.isAdmin || false;
        const createdDate = new Date(user.createdAt).toLocaleDateString();

        userCard.innerHTML = `
            <div class="admin-user-info">
                <div class="admin-user-name">${user.username}</div>
                <div class="admin-user-details">
                    <span>📅 Joined: ${createdDate}</span>
                    <span>🎮 Games: ${(user.completedGames || []).length}</span>
                    <span class="admin-user-badge ${isAdmin ? 'admin' : 'user'}">${isAdmin ? 'Admin' : 'User'}</span>
                </div>
            </div>
            <div class="admin-user-actions">
                <button class="btn-toggle-admin" onclick="toggleUserAdmin('${user.username}', ${!isAdmin})">
                    ${isAdmin ? 'Remove Admin' : 'Make Admin'}
                </button>
            </div>
        `;

        usersList.appendChild(userCard);
    });
}

async function toggleUserAdmin(username, makeAdmin) {
    const action = makeAdmin ? 'grant' : 'revoke';
    const confirmMessage = makeAdmin
        ? `Grant admin privileges to ${username}?`
        : `Revoke admin privileges from ${username}?`;

    showModal('Confirm', confirmMessage, [
        {
            text: 'Cancel',
            class: 'btn-secondary',
            onclick: () => closeModal()
        },
        {
            text: 'Confirm',
            class: 'btn-primary',
            onclick: async () => {
                closeModal();
                await performToggleUserAdmin(username, makeAdmin);
            }
        }
    ]);
}

async function performToggleUserAdmin(username, makeAdmin) {
    try {
        const response = await fetch('/api/users');
        const users = await response.json();

        const userIndex = users.findIndex(u => u.username === username);
        if (userIndex === -1) {
            showModal('Error', 'User not found!');
            return;
        }

        users[userIndex].isAdmin = makeAdmin;

        const saveResponse = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(users)
        });

        if (saveResponse.ok) {
            showModal('Success', `${username} is now ${makeAdmin ? 'an admin' : 'a regular user'}!`);
            loadAdminUsers();
        } else {
            showModal('Error', 'Failed to update user privileges.');
        }
    } catch (error) {
        console.error('Error updating user admin status:', error);
        showModal('Connection Error', 'Cannot connect to server.');
    }
}

async function adminChangePassword() {
    const currentPassword = document.getElementById('adminCurrentPassword').value;
    const newPassword = document.getElementById('adminNewPassword').value;
    const confirmPassword = document.getElementById('adminConfirmPassword').value;

    if (!currentPassword) {
        showModal('Error', 'Please enter your current password!');
        return;
    }

    if (!newPassword) {
        showModal('Error', 'Please enter a new password!');
        return;
    }

    if (newPassword.length < 4) {
        showModal('Error', 'New password must be at least 4 characters!');
        return;
    }

    if (newPassword !== confirmPassword) {
        showModal('Error', 'New passwords do not match!');
        return;
    }

    if (currentPassword === newPassword) {
        showModal('Error', 'New password must be different from current password!');
        return;
    }

    try {
        const response = await fetch('/api/users/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: gameState.currentUser,
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showModal('Success!', 'Password changed successfully!', [
                {
                    text: 'OK',
                    class: 'btn-primary',
                    onclick: () => {
                        closeModal();
                        // Clear password inputs
                        document.getElementById('adminCurrentPassword').value = '';
                        document.getElementById('adminNewPassword').value = '';
                        document.getElementById('adminConfirmPassword').value = '';
                    }
                }
            ]);
        } else {
            showModal('Failed', result.error || 'Failed to change password!');
        }
    } catch (error) {
        console.error('Change password error:', error);
        showModal('Connection Error', 'Cannot connect to server. Please make sure the server is running.');
    }
}

// Party Mode Functions
function startPartyMode() {
    // Initialize party mode
    gameState.players = [];
    const partyPlayerList = document.getElementById('partyPlayerList');
    if (partyPlayerList) {
        partyPlayerList.innerHTML = '';
    }
    document.getElementById('partyModeGameTitle').value = '';
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
        ${playerIndex > 0 ? '<button class="btn-remove" onclick="removePartyPlayer(' + playerIndex + ')">Ã—</button>' : ''}
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
            ${index > 0 ? '<button class="btn-remove" onclick="removePartyPlayer(' + index + ')">Ã—</button>' : ''}
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
    const title = document.getElementById('partyModeGameTitle').value.trim();
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

// Single Device Mode Functions
function startSingleDeviceMode() {
    // Initialize single device mode
    shuffleColors();
    gameState.players = [];
    gameState.lobby = null; // Clear any previous lobby data
    gameState.currentGameMode = 'singleDevice';
    const playerList = document.getElementById('singleDevicePlayerList');
    if (playerList) {
        playerList.innerHTML = '';
    }
    document.getElementById('singleDeviceGameTitle').value = '';
    document.getElementById('singleDeviceRowAmount').value = '10';

    // Add first player with current user's initial
    addSingleDevicePlayer();
    showScreen('singleDeviceScreen');
}

function addSingleDevicePlayer() {
    const playerList = document.getElementById('singleDevicePlayerList');
    const playerIndex = gameState.players.length;
    const color = shuffledColors[playerIndex % shuffledColors.length];

    // For first player, use the logged-in user's name
    let defaultValue = '';
    let placeholderText = 'Player name';

    if (playerIndex === 0 && gameState.currentUser) {
        // Auto-fill with logged-in user's name (remove " (Guest)" or "(Guest-####)" suffix if present)
        defaultValue = gameState.currentUser.replace(/\s*\(Guest(-\d+)?\)\s*$/i, '').trim();
        placeholderText = 'Your name';
    }

    const playerEntry = document.createElement('div');
    playerEntry.className = 'player-entry';
    playerEntry.innerHTML = `
        <input type="text" placeholder="${placeholderText}" maxlength="20" data-player-index="${playerIndex}" value="${defaultValue}">
        <div class="player-color" style="background-color: ${color}"></div>
        ${playerIndex > 0 ? '<button class="btn-remove" onclick="removeSingleDevicePlayer(' + playerIndex + ')">Ã—</button>' : ''}
    `;
    playerList.appendChild(playerEntry);

    gameState.players.push({ name: defaultValue, color: color });
}

function removeSingleDevicePlayer(index) {
    gameState.players.splice(index, 1);
    renderSingleDevicePlayerList();
}

function renderSingleDevicePlayerList() {
    const playerList = document.getElementById('singleDevicePlayerList');
    playerList.innerHTML = '';

    gameState.players.forEach((player, index) => {
        const placeholderText = index === 0 ? 'Your name' : 'Player name';
        const playerEntry = document.createElement('div');
        playerEntry.className = 'player-entry';
        playerEntry.innerHTML = `
            <input type="text" placeholder="${placeholderText}" maxlength="20" data-player-index="${index}" value="${player.name || ''}">
            <div class="player-color" style="background-color: ${player.color}"></div>
            ${index > 0 ? '<button class="btn-remove" onclick="removeSingleDevicePlayer(' + index + ')">Ã—</button>' : ''}
        `;
        playerList.appendChild(playerEntry);
    });
}

function adjustSingleDeviceRows(delta) {
    const input = document.getElementById('singleDeviceRowAmount');
    let value = parseInt(input.value) || 10;
    value = Math.max(1, Math.min(100, value + delta));
    input.value = value;
}

function setupSingleDeviceGame() {
    const title = document.getElementById('singleDeviceGameTitle').value.trim();
    const rowAmount = parseInt(document.getElementById('singleDeviceRowAmount').value);

    if (!title) {
        showModal('Error', 'Please enter a game title!');
        return;
    }

    // Get player names from inputs
    const playerInputs = document.querySelectorAll('#singleDevicePlayerList input[data-player-index]');
    gameState.players = [];
    const currentUserName = gameState.currentUser ? gameState.currentUser.replace(/\s*\(Guest(-\d+)?\)\s*$/i, '').trim() : 'Player 1';

    playerInputs.forEach((input, index) => {
        const name = input.value.trim();
        const color = shuffledColors[index % shuffledColors.length];

        // If no name provided, use default based on index
        const finalName = name || (index === 0 ? currentUserName : `Player ${index + 1}`);

        gameState.players.push({ name: finalName, color: color });
    });

    if (gameState.players.length < 1) {
        showModal('Error', 'Please add at least one player!');
        return;
    }

    gameState.gameTitle = title;
    gameState.currentPlayerIndex = 0;
    gameState.rankingItems = [];
    gameState.removalHistory = [];
    gameState.isSingleDeviceMode = true; // Flag to indicate single device mode

    // Initialize ranking items (empty for manual entry)
    for (let i = 1; i <= rowAmount; i++) {
        gameState.rankingItems.push({
            number: i,
            value: '',
            removed: false
        });
    }

    // Go to setup screen where host can fill in all items
    renderSetupScreen();
    showScreen('setupScreen');
}

// Quick Lobby Functions
function createNewLobby() {
    // Check if user is registered
    if (gameState.userType === 'guest') {
        showModal('Registered Only', 'Creating lobbies is only available for registered users.\n\nRegister an account to create lobbies! You can still join existing lobbies.');
        return;
    }

    // Show lobby setup screen first
    document.getElementById('lobbySetupGameTitle').value = '';
    document.getElementById('lobbySetupRowAmount').value = '10';
    document.getElementById('lobbySetupTimer').value = '10';
    document.querySelector('input[name="lobbyPrivacy"][value="public"]').checked = true;

    // Initialize empty items list
    const itemsList = document.getElementById('lobbySetupItemsList');
    itemsList.innerHTML = '';

    // Add 10 initial item fields
    for (let i = 0; i < 10; i++) {
        addLobbySetupItem();
    }

    showScreen('lobbySetupScreen');
}

function adjustLobbySetupRows(delta) {
    const input = document.getElementById('lobbySetupRowAmount');
    let value = parseInt(input.value) || 10;
    const oldValue = value;
    value = Math.max(1, Math.min(100, value + delta));
    input.value = value;

    // Adjust item list
    const itemsList = document.getElementById('lobbySetupItemsList');
    const currentCount = itemsList.children.length;

    if (value > currentCount) {
        // Add more items
        for (let i = currentCount; i < value; i++) {
            addLobbySetupItem();
        }
    } else if (value < currentCount) {
        // Remove items from the end
        for (let i = currentCount; i > value; i--) {
            itemsList.removeChild(itemsList.lastChild);
        }
    }
}

function adjustLobbyTimer(delta) {
    const input = document.getElementById('lobbySetupTimer');
    let value = parseInt(input.value) || 5;
    value = Math.max(1, Math.min(60, value + delta));
    input.value = value;
}

function addLobbySetupItem() {
    const itemsList = document.getElementById('lobbySetupItemsList');
    const itemIndex = itemsList.children.length;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'setup-item';
    itemDiv.innerHTML = `
        <div class="setup-number">#${itemIndex + 1}</div>
        <input type="text"
               class="setup-input"
               placeholder="Item ${itemIndex + 1}"
               data-index="${itemIndex}">
    `;
    itemsList.appendChild(itemDiv);
}

function randomizeLobbySetup() {
    // Get random title using improved variety algorithm
    const allTitles = Object.keys(randomItemPools);

    // Filter out recently used categories for better variety
    let availableTitles = allTitles.filter(title => !recentRandomCategories.includes(title));

    // If all categories were recently used, reset the list
    if (availableTitles.length === 0) {
        recentRandomCategories = [];
        availableTitles = allTitles;
    }

    // Shuffle and pick a random title from available ones
    const shuffled = shuffleArray(availableTitles);
    const randomTitle = shuffled[0];

    // Track this category as recently used
    recentRandomCategories.push(randomTitle);
    if (recentRandomCategories.length > MAX_RECENT_CATEGORIES) {
        recentRandomCategories.shift(); // Remove oldest
    }

    document.getElementById('lobbySetupGameTitle').value = randomTitle;

    // Get items from pool
    const itemPool = randomItemPools[randomTitle];
    const rowAmount = parseInt(document.getElementById('lobbySetupRowAmount').value) || 10;

    // Shuffle and fill items
    const shuffledItems = shuffleArray([...itemPool]);
    const itemInputs = document.querySelectorAll('#lobbySetupItemsList input');

    itemInputs.forEach((input, index) => {
        if (index < shuffledItems.length) {
            input.value = shuffledItems[index];
        } else {
            input.value = `Item ${index + 1}`;
        }
    });
}

async function createLobbyFromSetup() {
    const gameTitle = document.getElementById('lobbySetupGameTitle').value.trim();
    const rowAmount = parseInt(document.getElementById('lobbySetupRowAmount').value);
    const timerMinutes = parseInt(document.getElementById('lobbySetupTimer').value);
    const isPrivate = document.querySelector('input[name="lobbyPrivacy"]:checked').value === 'private';

    if (!gameTitle) {
        showModal('Error', 'Please enter a game title!');
        return;
    }

    // Get items from inputs
    const itemInputs = document.querySelectorAll('#lobbySetupItemsList input');
    const items = [];

    itemInputs.forEach((input, index) => {
        const value = input.value.trim();
        items.push(value);
    });

    // Check if all items are filled
    const emptyItems = items.filter(item => !item || item === '');
    if (emptyItems.length > 0) {
        showModal('Incomplete Items', `Please fill out all ${rowAmount} items before creating the lobby.\n\n${emptyItems.length} item(s) still need to be filled.`);
        return;
    }

    if (items.length < rowAmount) {
        showModal('Error', 'Please fill in all items!');
        return;
    }

    // Create new lobby with setup data
    const newLobby = {
        id: Date.now(),
        joinCode: generateJoinCode(),
        host: gameState.currentUser,
        gameTitle: gameTitle,
        rowAmount: rowAmount,
        items: items.slice(0, rowAmount),
        isPrivate: isPrivate,
        timerMinutes: timerMinutes,
        timerStarted: Date.now(),
        players: [{
            username: gameState.currentUser,
            ready: false,
            isHost: true
        }],
        createdAt: new Date().toISOString()
    };

    // Add to active lobbies
    activeLobbies.push(newLobby);
    await saveLobbies();

    if (gameState.userType === 'registered') {
        if (!gameState.userStats) {
            gameState.userStats = createDefaultUserStats();
        }
        gameState.userStats.lobbiesCreated = (gameState.userStats.lobbiesCreated || 0) + 1;
        try {
            await saveUserData();
        } catch (err) {
            console.error('Failed to update user stats after creating lobby:', err);
        }
    }

    // Set current lobby
    gameState.lobby = newLobby;

    // Display join code and setup
    document.getElementById('lobbyJoinCode').textContent = newLobby.joinCode;
    document.getElementById('lobbyGameTitle').value = newLobby.gameTitle;
    document.getElementById('lobbyRowAmount').value = newLobby.rowAmount;

    // Show dev button for simulating players
    document.getElementById('addPlayerBtn').style.display = 'inline-block';

    renderLobbyPlayers();
    updateReadyCount();
    startLobbyTimer(newLobby);
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

    // Start timer display for this lobby
    startLobbyTimer(lobby);

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

    // Disable lobby controls if game has started
    updateLobbyControlsState();
}

function updateLobbyControlsState() {
    const gameStarted = gameState.lobby && gameState.lobby.gameState && gameState.lobby.gameState.phase === 'playing';

    // Disable/enable title input
    const titleInput = document.getElementById('lobbyGameTitle');
    if (titleInput) {
        titleInput.disabled = gameStarted;
        if (gameStarted) {
            titleInput.style.opacity = '0.6';
            titleInput.style.cursor = 'not-allowed';
        } else {
            titleInput.style.opacity = '1';
            titleInput.style.cursor = 'text';
        }
    }

    // Disable/enable row amount input and buttons
    const rowInput = document.getElementById('lobbyRowAmount');
    if (rowInput) {
        rowInput.disabled = gameStarted;
        if (gameStarted) {
            rowInput.style.opacity = '0.6';
            rowInput.style.cursor = 'not-allowed';
        } else {
            rowInput.style.opacity = '1';
            rowInput.style.cursor = 'text';
        }
    }

    // Disable adjust buttons
    const adjustButtons = document.querySelectorAll('.lobby-controls .btn-adjust');
    adjustButtons.forEach(btn => {
        btn.disabled = gameStarted;
        if (gameStarted) {
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    });
}

async function adjustLobbyRows(delta) {
    // Prevent changes if game has already started
    if (gameState.lobby && gameState.lobby.gameState && gameState.lobby.gameState.phase === 'playing') {
        showModal('Game Started', 'Cannot modify lobby settings while the game is in progress!');
        return;
    }

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
    // Prevent changes if game has already started
    if (gameState.lobby && gameState.lobby.gameState && gameState.lobby.gameState.phase === 'playing') {
        showModal('Game Started', 'Cannot modify lobby settings while the game is in progress!');
        // Revert to original title
        document.getElementById('lobbyGameTitle').value = gameState.lobby.gameTitle;
        return;
    }

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

    // Only show start button to the host
    const startButton = document.getElementById('startLobbyButton');
    const cancelButton = document.getElementById('cancelLobbyButton');
    const currentPlayer = gameState.lobby.players.find(p => p.username === gameState.currentUser);

    if (!currentPlayer || !currentPlayer.isHost) {
        // Hide buttons for non-hosts
        startButton.style.display = 'none';
        if (cancelButton) cancelButton.style.display = 'none';
    } else {
        // Show buttons for host
        startButton.style.display = 'block';
        if (cancelButton) cancelButton.style.display = 'block';

        // Enable start button if all players are ready and at least 1 player
        if (totalPlayers > 0 && readyPlayers === totalPlayers) {
            startButton.disabled = false;
        } else {
            startButton.disabled = true;
        }
    }
}

async function startLobbyGame() {
    // Only host can start the game
    const currentPlayer = gameState.lobby.players.find(p => p.username === gameState.currentUser);
    if (!currentPlayer || !currentPlayer.isHost) {
        showModal('Permission Denied', 'Only the lobby host can start the game!');
        return;
    }

    // Check if all players are ready (host can bypass)
    const allReady = gameState.lobby.players.every(p => p.ready);
    if (!allReady) {
        // Ask host if they want to bypass
        showModal('Not All Ready', 'Not all players are ready. Start anyway?', [
            {
                text: 'Start Game',
                class: 'btn-primary',
                onclick: () => {
                    closeModal();
                    proceedToGame();
                }
            },
            {
                text: 'Cancel',
                class: 'btn-secondary',
                onclick: closeModal
            }
        ]);
        return;
    }

    proceedToGame();
}

async function proceedToGame() {
    const title = gameState.lobby.gameTitle;
    const items = gameState.lobby.items;

    // Validate all items are filled
    const emptyItems = items.filter(item => !item || item.trim() === '');
    if (emptyItems.length > 0) {
        showModal('Incomplete Items', `Please ensure all items are filled before starting the game.\n\n${emptyItems.length} item(s) still need to be filled.`);
        return;
    }

    gameState.isSingleDeviceMode = false;
    gameState.isRandomGame = false;
    gameState.currentGameMode = gameState.lobby && gameState.lobby.type === 'party' ? 'party' : 'lobby';

    shuffleColors();
    const lobbyPlayers = gameState.lobby.players.map((player, index) => ({
        name: player.username,
        color: shuffledColors[index % shuffledColors.length]
    }));

    const rankingItems = items.map((item, index) => ({
        number: index + 1,
        value: item,
        removed: false
    }));

    // Update lobby with game state
    const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
    if (lobbyIndex !== -1) {
        activeLobbies[lobbyIndex].gameState = {
            gameTitle: title,
            players: lobbyPlayers,
            currentPlayerIndex: 0,
            rankingItems: rankingItems,
            removalHistory: [],
            phase: 'playing' // Skip setup, go directly to playing
        };
        await saveLobbies();

        // Stop the lobby timer since game is starting
        if (lobbyTimerIntervals[gameState.lobby.id]) {
            clearInterval(lobbyTimerIntervals[gameState.lobby.id]);
            delete lobbyTimerIntervals[gameState.lobby.id];
        }
    }

    // Set local game state
    gameState.gameTitle = title;
    gameState.players = lobbyPlayers;
    gameState.currentPlayerIndex = 0;
    gameState.rankingItems = rankingItems;
    gameState.removalHistory = [];

    // Show countdown before starting game
    showGameStartCountdown(() => {
        renderGameScreen();
        showScreen('gameScreen');
    });
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

async function cancelLobby() {
    // Only host can cancel the game
    const currentPlayer = gameState.lobby.players.find(p => p.username === gameState.currentUser);
    if (!currentPlayer || !currentPlayer.isHost) {
        showModal('Permission Denied', 'Only the lobby host can cancel the game!');
        return;
    }

    // Confirm cancellation
    showModal('Cancel Game?', 'Are you sure you want to cancel this game? All players will be kicked from the lobby.', [
        {
            text: 'Yes, Cancel',
            class: 'btn-danger',
            onclick: async () => {
                closeModal();

                // Stop the lobby timer
                if (lobbyTimerIntervals[gameState.lobby.id]) {
                    clearInterval(lobbyTimerIntervals[gameState.lobby.id]);
                    delete lobbyTimerIntervals[gameState.lobby.id];
                }

                // Remove the lobby from active lobbies
                const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
                if (lobbyIndex !== -1) {
                    activeLobbies.splice(lobbyIndex, 1);
                    await saveLobbies();
                }

                // Return to homepage
                showHomepage();
            }
        },
        {
            text: 'No, Keep Playing',
            class: 'btn-secondary',
            onclick: () => {
                closeModal();
            }
        }
    ]);
}

// ============================================
// Party Mode Functions
// ============================================

function startPartyMode() {
    // Check if user is registered
    if (gameState.userType === 'guest') {
        showModal('Registered Only', 'Party Mode is only available for registered users.\n\nRegister an account to use Party Mode!');
        return;
    }

    // Reset privacy setting to public (default)
    const publicRadio = document.querySelector('input[name="partyPrivacy"][value="public"]');
    if (publicRadio) {
        publicRadio.checked = true;
    }

    showScreen('partySetupScreen');
}

function adjustPartyRows(delta) {
    const input = document.getElementById('partyRowAmount');
    let value = parseInt(input.value) || 10;
    value = Math.max(3, Math.min(100, value + delta));
    input.value = value;
}

function adjustPartyTimer(delta) {
    const input = document.getElementById('partyTimer');
    let value = parseInt(input.value) || 5;
    value = Math.max(1, Math.min(60, value + delta));
    input.value = value;
}

async function createPartyLobby() {
    const title = document.getElementById('partyGameTitle').value.trim();
    const rowAmount = parseInt(document.getElementById('partyRowAmount').value) || 10;
    const timerMinutes = parseInt(document.getElementById('partyTimer').value) || 5;
    const isPrivate = document.querySelector('input[name="partyPrivacy"]:checked').value === 'private';

    if (!title) {
        showModal('Missing Information', 'Please enter a game title!');
        return;
    }

    const newLobby = {
        id: Date.now(),
        type: 'party',
        joinCode: generateJoinCode(),
        host: gameState.currentUser,
        gameTitle: title,
        rowAmount: rowAmount,
        timerMinutes: timerMinutes,
        timerStarted: Date.now(),
        isPrivate: isPrivate,
        players: [{
            username: gameState.currentUser,
            isHost: true,
            itemsAdded: 0
        }],
        items: [],
        currentTurnIndex: 0,
        setupPhase: 'waiting', // Start in waiting phase
        createdAt: new Date().toISOString()
    };

    activeLobbies.push(newLobby);
    await saveLobbies();

    if (gameState.userType === 'registered') {
        if (!gameState.userStats) {
            gameState.userStats = createDefaultUserStats();
        }
        gameState.userStats.lobbiesCreated = (gameState.userStats.lobbiesCreated || 0) + 1;
        try {
            await saveUserData();
        } catch (err) {
            console.error('Failed to update user stats after creating party lobby:', err);
        }
    }

    gameState.lobby = newLobby;
    renderPartyWaiting();
    startLobbyTimer(newLobby);
    showScreen('partyWaitingScreen');
}

async function joinPartyLobby(lobbyId) {
    const lobby = activeLobbies.find(l => l.id === lobbyId);

    if (!lobby || lobby.type !== 'party') {
        showModal('Error', 'Party lobby not found!');
        return;
    }

    // Check if already in lobby
    if (lobby.players.find(p => p.username === gameState.currentUser)) {
        gameState.lobby = lobby;
        startLobbyTimer(lobby);

        // Go to appropriate screen based on setup phase
        if (lobby.setupPhase === 'waiting') {
            showScreen('partyWaitingScreen');
            renderPartyWaiting();
        } else if (lobby.setupPhase === 'adding_items') {
            showScreen('partyLobbyScreen');
            renderPartyLobby();
        }
        return;
    }

    // Add player to lobby
    lobby.players.push({
        username: gameState.currentUser,
        isHost: false,
        itemsAdded: 0
    });

    // Update the lobby in activeLobbies array
    const lobbyIndex = activeLobbies.findIndex(l => l.id === lobbyId);
    if (lobbyIndex !== -1) {
        activeLobbies[lobbyIndex] = lobby;
        await saveLobbies();
    }
    gameState.lobby = lobby;
    startLobbyTimer(lobby);

    // Go to appropriate screen based on setup phase
    if (lobby.setupPhase === 'waiting') {
        showScreen('partyWaitingScreen');
        renderPartyWaiting();
    } else if (lobby.setupPhase === 'adding_items') {
        showScreen('partyLobbyScreen');
        renderPartyLobby();
    }
}

function renderPartyWaiting() {
    if (!gameState.lobby) return;

    const lobby = gameState.lobby;

    // Update header info
    document.getElementById('partyWaitingJoinCode').textContent = lobby.joinCode;
    document.getElementById('partyWaitingTitleDisplay').textContent = lobby.gameTitle;
    document.getElementById('partyWaitingRowAmount').textContent = lobby.rowAmount;
    document.getElementById('partyWaitingTimeLimit').textContent = lobby.timerMinutes;

    // Render players
    const container = document.getElementById('partyWaitingPlayersList');
    container.innerHTML = '';

    if (!lobby.players || lobby.players.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No players yet</p>';
        return;
    }

    lobby.players.forEach((player) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'lobby-player';

        const playerName = document.createElement('span');
        playerName.className = 'player-name';
        playerName.textContent = player.username;
        if (player.isHost) {
            playerName.textContent += ' 👑';
        }

        playerDiv.appendChild(playerName);
        container.appendChild(playerDiv);
    });

    // Show start button and cancel button only for host
    const startButton = document.getElementById('startItemCreationButton');
    const cancelButton = document.getElementById('cancelPartyWaitingButton');
    const currentUserIsHost = lobby.players.find(p => p.username === gameState.currentUser && p.isHost);
    if (currentUserIsHost && lobby.players.length >= 1) {
        startButton.style.display = 'block';
        if (cancelButton) cancelButton.style.display = 'block';
    } else {
        startButton.style.display = 'none';
        if (cancelButton) cancelButton.style.display = 'none';
    }
}

async function startItemCreation() {
    if (!gameState.lobby) return;

    const lobby = gameState.lobby;

    // Verify host
    const currentPlayer = lobby.players.find(p => p.username === gameState.currentUser);
    if (!currentPlayer || !currentPlayer.isHost) {
        showModal('Permission Denied', 'Only the host can start item creation!');
        return;
    }

    // Update lobby phase
    lobby.setupPhase = 'adding_items';

    // Update lobby in activeLobbies
    const lobbyIndex = activeLobbies.findIndex(l => l.id === lobby.id);
    if (lobbyIndex !== -1) {
        activeLobbies[lobbyIndex] = lobby;
        await saveLobbies();
    }

    // Update local state
    gameState.lobby = lobby;

    // Transition to item creation screen
    showScreen('partyLobbyScreen');
    renderPartyLobby();
}

function leavePartyWaiting() {
    if (!gameState.lobby) {
        showHomepage();
        return;
    }

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

    gameState.lobby = null;
    showHomepage();
}

function renderPartyLobby() {
    if (!gameState.lobby) return;

    const lobby = gameState.lobby;

    // Update header info
    document.getElementById('partyJoinCode').textContent = lobby.joinCode;
    document.getElementById('partyGameTitleDisplay').textContent = lobby.gameTitle;
    document.getElementById('partyItemTotal').textContent = lobby.rowAmount;
    document.getElementById('partyItemCount').textContent = lobby.items.length;

    // Render players
    renderPartyPlayers();

    // Render items
    renderPartyItems();

    // Update turn indicator and input section
    updatePartyTurnDisplay();
}

function renderPartyPlayers() {
    const container = document.getElementById('partyPlayersList');
    container.innerHTML = '';

    if (!gameState.lobby || !gameState.lobby.players) return;

    gameState.lobby.players.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'lobby-player';

        const playerName = document.createElement('span');
        playerName.className = 'player-name';
        playerName.textContent = player.username;
        if (player.isHost) {
            playerName.textContent += ' 👑';
        }

        const itemCount = document.createElement('span');
        itemCount.className = 'player-status';
        itemCount.textContent = `${player.itemsAdded} items added`;

        playerDiv.appendChild(playerName);
        playerDiv.appendChild(itemCount);
        container.appendChild(playerDiv);
    });
}

function renderPartyItems() {
    const container = document.getElementById('partyItemsList');
    container.innerHTML = '';

    if (!gameState.lobby) return;

    const totalItems = gameState.lobby.rowAmount;
    const items = gameState.lobby.items || [];

    for (let i = 0; i < totalItems; i++) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'party-item';

        if (i < items.length) {
            const item = items[i];
            itemDiv.innerHTML = `
                <span class="party-item-number">#${i + 1}</span>
                <span class="party-item-value">${item.value}</span>
                <span class="party-item-author">by ${item.author}</span>
            `;
        } else {
            itemDiv.classList.add('empty');
            itemDiv.innerHTML = `
                <span class="party-item-number">#${i + 1}</span>
                <span class="party-item-value" style="color: var(--text-secondary);">Waiting...</span>
            `;
        }

        container.appendChild(itemDiv);
    }
}

function updatePartyTurnDisplay() {
    if (!gameState.lobby) return;

    const lobby = gameState.lobby;
    const currentPlayer = lobby.players[lobby.currentTurnIndex];
    const isMyTurn = currentPlayer && currentPlayer.username === gameState.currentUser;
    const allItemsAdded = lobby.items.length >= lobby.rowAmount;

    // Update turn indicator text
    const turnText = document.getElementById('partyCurrentTurnText');
    if (allItemsAdded) {
        turnText.textContent = 'âœ… All items added! Ready to start!';
    } else if (isMyTurn) {
        turnText.textContent = "🎯 It's YOUR turn! Add an item below:";
    } else {
        turnText.textContent = `â³ Waiting for ${currentPlayer.username}'s turn...`;
    }

    // Show/hide input section based on turn
    const inputSection = document.getElementById('partyInputSection');
    const inputField = document.getElementById('partyItemInput');

    if (isMyTurn && !allItemsAdded) {
        // Only show and focus if not already visible
        if (inputSection.style.display !== 'block') {
            inputSection.style.display = 'block';
            inputField.value = '';
            inputField.focus();
        }
        // Don't clear or refocus if already typing (preserve user input during refresh)
    } else {
        inputSection.style.display = 'none';
    }

    // Show/hide start game button and cancel button (only for host)
    const startButton = document.getElementById('startPartyGameButton');
    const cancelButton = document.getElementById('cancelPartyLobbyButton');
    const currentUserIsHost = lobby.players.find(p => p.username === gameState.currentUser && p.isHost);
    if (allItemsAdded && currentUserIsHost) {
        startButton.style.display = 'block';
    } else {
        startButton.style.display = 'none';
    }
    // Show cancel button for host regardless of items
    if (currentUserIsHost) {
        if (cancelButton) cancelButton.style.display = 'block';
    } else {
        if (cancelButton) cancelButton.style.display = 'none';
    }
}

async function submitPartyItem() {
    if (!gameState.lobby) return;

    const input = document.getElementById('partyItemInput');
    const value = input.value.trim();

    if (!value) {
        showModal('Error', 'Please enter an item name!');
        return;
    }

    const lobby = gameState.lobby;
    const currentPlayer = lobby.players[lobby.currentTurnIndex];

    // Verify it's actually this player's turn
    if (!currentPlayer || currentPlayer.username !== gameState.currentUser) {
        showModal('Error', "It's not your turn!");
        return;
    }

    // Add item
    if (!lobby.items) {
        lobby.items = [];
    }
    lobby.items.push({
        number: lobby.items.length + 1,
        value: value,
        author: gameState.currentUser
    });

    // Update player's item count
    currentPlayer.itemsAdded++;

    // Move to next player's turn
    lobby.currentTurnIndex = (lobby.currentTurnIndex + 1) % lobby.players.length;

    // Update lobby in activeLobbies
    const lobbyIndex = activeLobbies.findIndex(l => l.id === lobby.id);
    if (lobbyIndex !== -1) {
        activeLobbies[lobbyIndex] = lobby;
        await saveLobbies();
    }

    // Update gameState.lobby reference
    gameState.lobby = lobby;

    // Update UI
    renderPartyLobby();
}

async function startPartyGame() {
    if (!gameState.lobby) return;

    const lobby = gameState.lobby;

    gameState.isSingleDeviceMode = false;
    gameState.isRandomGame = false;
    gameState.currentGameMode = 'party';

    // Verify host
    const currentPlayer = lobby.players.find(p => p.username === gameState.currentUser);
    if (!currentPlayer || !currentPlayer.isHost) {
        showModal('Permission Denied', 'Only the host can start the game!');
        return;
    }

    // Verify all items added
    if (lobby.items.length < lobby.rowAmount) {
        showModal('Error', 'Not all items have been added yet!');
        return;
    }

    // Verify all items are filled (not empty)
    const emptyItems = lobby.items.filter(item => !item.value || item.value.trim() === '');
    if (emptyItems.length > 0) {
        showModal('Incomplete Items', `Please ensure all ${lobby.rowAmount} items are filled before starting the game.\n\n${emptyItems.length} item(s) still need to be filled.`);
        return;
    }

    // Prepare game state
    shuffleColors();
    const players = lobby.players.map((player, index) => ({
        name: player.username,
        color: shuffledColors[index % shuffledColors.length]
    }));

    const rankingItems = lobby.items.map(item => ({
        number: item.number,
        value: item.value,
        removed: false
    }));

    // Update lobby with game state
    const lobbyIndex = activeLobbies.findIndex(l => l.id === lobby.id);
    if (lobbyIndex !== -1) {
        activeLobbies[lobbyIndex].gameState = {
            gameTitle: lobby.gameTitle,
            players: players,
            currentPlayerIndex: 0,
            rankingItems: rankingItems,
            removalHistory: [],
            phase: 'playing'
        };
        await saveLobbies();

        // Stop the lobby timer
        if (lobbyTimerIntervals[lobby.id]) {
            clearInterval(lobbyTimerIntervals[lobby.id]);
            delete lobbyTimerIntervals[lobby.id];
        }
    }

    // Set local game state
    gameState.gameTitle = lobby.gameTitle;
    gameState.players = players;
    gameState.currentPlayerIndex = 0;
    gameState.rankingItems = rankingItems;
    gameState.removalHistory = [];

    // Show countdown before starting game
    showGameStartCountdown(() => {
        renderGameScreen();
        showScreen('gameScreen');
    });
}

function leavePartyLobby() {
    if (!gameState.lobby) {
        showHomepage();
        return;
    }

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

    gameState.lobby = null;
    showHomepage();
}

async function cancelPartyGame() {
    if (!gameState.lobby) {
        showHomepage();
        return;
    }

    // Only host can cancel the game
    const currentPlayer = gameState.lobby.players.find(p => p.username === gameState.currentUser);
    if (!currentPlayer || !currentPlayer.isHost) {
        showModal('Permission Denied', 'Only the party host can cancel the game!');
        return;
    }

    // Confirm cancellation
    showModal('Cancel Party Game?', 'Are you sure you want to cancel this party game? All players will be kicked from the lobby.', [
        {
            text: 'Yes, Cancel',
            class: 'btn-danger',
            onclick: async () => {
                closeModal();

                // Stop the lobby timer
                if (lobbyTimerIntervals[gameState.lobby.id]) {
                    clearInterval(lobbyTimerIntervals[gameState.lobby.id]);
                    delete lobbyTimerIntervals[gameState.lobby.id];
                }

                // Remove the lobby from active lobbies
                const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
                if (lobbyIndex !== -1) {
                    activeLobbies.splice(lobbyIndex, 1);
                    await saveLobbies();
                }

                // Clear local game state
                gameState.lobby = null;

                // Return to homepage
                showHomepage();
            }
        },
        {
            text: 'No, Keep Playing',
            class: 'btn-secondary',
            onclick: () => {
                closeModal();
            }
        }
    ]);
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

    // Show/hide home button based on screen
    const homeButton = document.getElementById('homeButton');
    if (homeButton) {
        if (screenName === 'loginScreen' || screenName === 'homepage') {
            homeButton.style.display = 'none';
        } else {
            homeButton.style.display = 'flex';
        }
    }
}

function returnToMenu() {
    // Return to homepage
    showHomepage();
}

function returnToHome() {
    // If user is logged in, go to homepage, otherwise go to login
    if (gameState.currentUser) {
        showHomepage();
    } else {
        showScreen('loginScreen');
    }
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
        ${playerNumber > 1 ? '<button class="player-remove" onclick="removePlayer(this)">Ã—</button>' : ''}
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

    console.log('setupGame called:', {
        isRandomGame: gameState.isRandomGame,
        randomGameTitle: gameState.randomGameTitle,
        gameTitleInput,
        rowAmount
    });

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
    gameState.removalHistory = [];

    // Create ranking items
    if (gameState.isRandomGame && randomItemPools[gameState.randomGameTitle]) {
        console.log('Auto-filling random items for:', gameState.randomGameTitle);
        // Auto-fill with random items from the pool
        const itemPool = randomItemPools[gameState.randomGameTitle];
        const shuffledItems = shuffleArray(itemPool);

        for (let i = 1; i <= rowAmount; i++) {
            gameState.rankingItems.push({
                number: i,
                value: shuffledItems[i - 1] || `Item ${i}`, // Fallback if pool runs out
                removed: false
            });
        }

        // Clear the random game flag
        gameState.isRandomGame = false;
        gameState.randomGameTitle = null;

        // Skip setup screen and go directly to game
        saveGameTitle(gameTitleInput);
        renderGameScreen();
        showScreen('gameScreen');
    } else {
        // Normal mode - create empty items for manual entry
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
}

// Render Setup Screen
function renderSetupScreen() {
    document.getElementById('setupTitle').textContent = gameState.gameTitle;
    const container = document.getElementById('setupList');

    // Preserve focus/caret on mobile to keep keyboard open
    let prevFocusedIndex = -1;
    let prevCaretStart = null;
    let prevCaretEnd = null;
    if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('setup-input')) {
        const idxAttr = document.activeElement.getAttribute('data-index');
        if (idxAttr !== null) {
            prevFocusedIndex = parseInt(idxAttr, 10);
        }
        try {
            prevCaretStart = document.activeElement.selectionStart;
            prevCaretEnd = document.activeElement.selectionEnd;
        } catch (_) {}
    }

    container.innerHTML = '';

    // Determine next field to fill; keep pending index during live typing
    let computedNext = gameState.rankingItems.findIndex(i => !i.value || i.value.trim() === '');
    if (computedNext === -1) computedNext = gameState.rankingItems.length; // all filled
    // Initialize or maintain pending index while the same player is active
    if (gameState.pendingSetupIndex == null || gameState.pendingSetupPlayerIndex == null || gameState.pendingSetupPlayerIndex !== gameState.currentPlayerIndex) {
        gameState.pendingSetupIndex = computedNext === -1 ? null : computedNext;
        gameState.pendingSetupPlayerIndex = gameState.currentPlayerIndex;
    }
    const nextIndex = gameState.pendingSetupIndex == null ? computedNext : gameState.pendingSetupIndex;
    const allFilled = nextIndex === -1;

    // Update description with turn info
    const desc = document.querySelector('#setupScreen .setup-description');
    if (desc) {
        if (gameState.isSingleDeviceMode) {
            // In single device mode, no turn indicator needed
            if (!allFilled) {
                desc.textContent = 'Fill in all the ranking items below, then start the game!';
            } else {
                desc.textContent = 'All fields are filled. You can start the game!';
            }
        } else {
            // In multiplayer mode, show whose turn it is
            if (!allFilled) {
                const currentPlayer = gameState.players[gameState.currentPlayerIndex];
                if (currentPlayer && gameState.rankingItems[nextIndex]) {
                    const nextNumber = gameState.rankingItems[nextIndex].number;
                    desc.textContent = `${currentPlayer.name}'s turn â€” add an item for #${nextNumber}`;
                } else {
                    desc.textContent = 'Waiting for game state...';
                }
            } else {
                desc.textContent = 'All fields are filled. You can start the game!';
            }
        }
    }

    gameState.rankingItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'setup-item';
        const isEditable = (() => {
            // In single device mode, all fields are editable
            if (gameState.isSingleDeviceMode) {
                return true;
            }
            // In multiplayer mode, only current player's turn field is editable
            if (allFilled) return false;
            if (index !== nextIndex) return false;
            const currentPlayer = gameState.players[gameState.currentPlayerIndex];
            return currentPlayer && namesEqual(currentPlayer.name, gameState.currentUser);
        })();

        // In single device mode, show placeholder text and value separately
        const placeholderText = gameState.isSingleDeviceMode ? `Item ${item.number}` : `Enter item ${item.number}...`;
        const itemValue = item.value || '';

        // In single device mode, only highlight empty fields
        const shouldHighlight = gameState.isSingleDeviceMode ? (isEditable && !itemValue) : isEditable;

        itemDiv.innerHTML = `
            <div class="setup-number">#${item.number}</div>
            <input type="text"
                   class="setup-input"
                   placeholder="${placeholderText}"
                   value="${itemValue}"
                   data-index="${index}"
                   ${isEditable ? '' : 'disabled'}
                   onkeydown="setupInputKey(event, ${index})"
                   onchange="updateSetupItem(${index}, this.value)"
                   oninput="updateSetupItemLive(${index}, this.value)">
        `;
        if (shouldHighlight) {
            itemDiv.classList.add('your-turn');
        }
        container.appendChild(itemDiv);
    });

    // Focus the editable input if available; restore caret if we had focus
    setTimeout(() => {
        const editable = container.querySelector('input.setup-input:not([disabled])');
        if (editable) {
            // Prefer restoring previous focus when still on same index
            const nextIndexNow = gameState.rankingItems.findIndex(i => !i.value || i.value.trim() === '');
            if (prevFocusedIndex === nextIndexNow) {
                editable.focus({ preventScroll: true });
                try {
                    if (prevCaretStart != null && prevCaretEnd != null) {
                        editable.setSelectionRange(prevCaretStart, prevCaretEnd);
                    }
                } catch (_) {}
            } else {
                editable.focus({ preventScroll: true });
            }
        }
    }, 0);

    // Update visible turn indicator on setup screen
    updateSetupTurnIndicator();

    // Enable/disable Start button based on completeness
    const startBtn = document.querySelector('#setupScreen .btn-primary');
    if (startBtn) {
        // In single device mode, always enable the button (items can be left as placeholders)
        startBtn.disabled = gameState.isSingleDeviceMode ? false : !allFilled;
    }
}

function updateSetupTurnIndicator() {
    try {
        const el = document.getElementById('setupCurrentPlayerTurn');
        if (!el) {
            console.log('Turn indicator element not found');
            return;
        }

        // Hide turn indicator in single device mode
        if (gameState.isSingleDeviceMode) {
            el.style.display = 'none';
            return;
        }

        const currentPlayer = gameState.players && gameState.players[gameState.currentPlayerIndex];
        console.log('Updating turn indicator:', {
            currentPlayerIndex: gameState.currentPlayerIndex,
            totalPlayers: gameState.players?.length,
            currentPlayer: currentPlayer,
            currentUser: gameState.currentUser
        });
        if (!currentPlayer) {
            el.textContent = '';
            el.removeAttribute('style');
            return;
        }
        const initials = getPlayerInitials(currentPlayer.name);
        el.innerHTML = `<span class="turn-initials">${initials}</span> ${currentPlayer.name}'s Turn`;
        el.style.backgroundColor = currentPlayer.color || '#3b82f6';
        el.style.color = '#fff';
        el.style.display = 'inline-block';
        el.style.padding = '0.5rem 1rem';
        el.style.borderRadius = '8px';
        el.style.fontWeight = '600';
    } catch (e) {
        console.error('Error updating turn indicator:', e);
    }
}

async function updateSetupItem(index, value) {
    const trimmed = (value || '').trim();

    // In single device mode, allow editing any field (including saving empty values)
    if (gameState.isSingleDeviceMode) {
        gameState.rankingItems[index].value = trimmed;
        // Don't re-render to avoid losing focus
        return;
    }

    // Multiplayer mode: enforce turn-based input
    // Only allow editing the next empty field
    const nextIndex = gameState.rankingItems.findIndex(i => !i.value || i.value.trim() === '');
    if (nextIndex !== index) {
        renderSetupScreen();
        return;
    }

    // Enforce turn: only current player can submit
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!namesEqual(gameState.currentUser, currentPlayer.name)) {
        // Re-render to reset input if someone else typed
        renderSetupScreen();
        return;
    }

    if (!trimmed) {
        return; // do not advance on empty
    }

    gameState.rankingItems[index].value = trimmed;

    // Advance turn
    const oldPlayerIndex = gameState.currentPlayerIndex;
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    console.log('Turn advanced:', {
        from: oldPlayerIndex,
        to: gameState.currentPlayerIndex,
        fromPlayer: gameState.players[oldPlayerIndex]?.name,
        toPlayer: gameState.players[gameState.currentPlayerIndex]?.name
    });

    // Reset pending index for new player
    const newNext = gameState.rankingItems.findIndex(i => !i.value || i.value.trim() === '');
    gameState.pendingSetupIndex = newNext === -1 ? null : newNext;
    gameState.pendingSetupPlayerIndex = gameState.currentPlayerIndex;

    // Sync to lobby game state if in a lobby
    if (gameState.lobby && gameState.lobby.gameState) {
        const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
        if (lobbyIndex !== -1) {
            activeLobbies[lobbyIndex].gameState.rankingItems = gameState.rankingItems;
            activeLobbies[lobbyIndex].gameState.currentPlayerIndex = gameState.currentPlayerIndex;
            console.log('Saving lobby state with currentPlayerIndex:', gameState.currentPlayerIndex);
            await saveLobbies();
        }
    }

    renderSetupScreen();
}

function setupInputKey(event, index) {
    if (event && (event.key === 'Enter' || event.keyCode === 13)) {
        event.preventDefault(); // Prevent form submission

        if (gameState.isSingleDeviceMode) {
            // In single device mode, save current value and move to next field
            const value = event.target && event.target.value ? event.target.value : '';
            gameState.rankingItems[index].value = value.trim();

            // Find next field and focus it
            const nextIndex = index + 1;
            if (nextIndex < gameState.rankingItems.length) {
                // Re-render to update green highlights
                renderSetupScreen();
                // Focus next field
                setTimeout(() => {
                    const nextInput = document.querySelector(`input.setup-input[data-index="${nextIndex}"]`);
                    if (nextInput) {
                        nextInput.focus();
                    }
                }, 50);
            } else {
                // Last field - just re-render to remove green highlight
                renderSetupScreen();
            }
        } else {
            // Multiplayer mode: commit the value and advance turn
            updateSetupItem(index, event.target && event.target.value ? event.target.value : '');
        }
    }
}

// Debounce helper for live sync
let _liveSyncTimer = null;
function debounceLiveSync(fn, delay = 600) {
    return (...args) => {
        if (_liveSyncTimer) clearTimeout(_liveSyncTimer);
        _liveSyncTimer = setTimeout(() => fn(...args), delay);
    };
}

// Live sync during setup without advancing the turn
const updateSetupItemLive = debounceLiveSync(async function(index, value) {
    try {
        // Only for the currently editable field and current player
        const nextIndex = gameState.rankingItems.findIndex(i => !i.value || i.value.trim() === '');
        const effectiveIndex = gameState.pendingSetupIndex == null ? nextIndex : gameState.pendingSetupIndex;
        if (index !== effectiveIndex) return;
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        if (!currentPlayer || !namesEqual(gameState.currentUser, currentPlayer.name)) return;

        gameState.rankingItems[index].value = value;

        if (gameState.lobby && gameState.lobby.gameState) {
            const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
            if (lobbyIndex !== -1) {
                activeLobbies[lobbyIndex].gameState.rankingItems = gameState.rankingItems;
                await saveLobbies();
            }
        }
    } catch (_) { /* ignore live sync errors */ }
}, 700);

// Start Game from Setup Screen
async function startGameFromSetup() {
    // Validate that all items are filled out
    const emptyItems = gameState.rankingItems.filter(item => !item.value || item.value.trim() === '');
    if (emptyItems.length > 0) {
        showModal('Incomplete Setup', `Please fill out all ${gameState.rankingItems.length} ranking items before starting the game.\n\n${emptyItems.length} item(s) still need to be filled.`);
        return;
    }

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
    updateGameInteractivity();
    updateGameActions();
}

function updateGameActions() {
    const gameActions = document.getElementById('gameActions');
    if (!gameActions) return;

    // Clear and rebuild buttons
    gameActions.innerHTML = '';

    // Always show Return to Menu
    const menuButton = document.createElement('button');
    menuButton.className = 'btn-secondary';
    menuButton.textContent = 'Return to Menu';
    menuButton.onclick = returnToMenu;
    gameActions.appendChild(menuButton);

    // Show New Random Game if this is a random game
    if (gameState.isRandomGame) {
        const randomButton = document.createElement('button');
        randomButton.className = 'btn-secondary';
        randomButton.textContent = 'New Random Game';
        randomButton.onclick = returnToRandomGame;
        gameActions.appendChild(randomButton);
    }
}

function returnToRandomGame() {
    showScreen('randomGameScreen');
}

function renderRankingList() {
    const container = document.getElementById('rankingList');
    container.innerHTML = '';

    const isYourTurn = (() => {
        // In lobby games, only the current player gets to remove
        if (gameState.lobby && gameState.lobby.gameState) {
            const current = gameState.players[gameState.currentPlayerIndex];
            return current && current.name === gameState.currentUser;
        }
        // In local/party games, allow interaction freely
        return true;
    })();

    // Toggle overall interactivity classes for styling
    container.classList.toggle('your-turn', isYourTurn);
    container.classList.toggle('not-your-turn', !isYourTurn);

    // Sort items: non-removed first, then removed items at bottom
    // Keep track of original indices for proper updates
    const itemsWithIndex = gameState.rankingItems.map((item, index) => ({ item, index }));
    const sortedItems = [...itemsWithIndex].sort((a, b) => {
        // If one is removed and the other isn't, removed goes to bottom
        if (a.item.removed && !b.item.removed) return 1;
        if (!a.item.removed && b.item.removed) return -1;
        // Otherwise maintain original order
        return a.index - b.index;
    });

    sortedItems.forEach(({ item, index }) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `ranking-item ${item.removed ? 'removed' : ''}`;

        // Lock text fields for ALL game modes - items should only be removable, not editable
        const itemsArePreFilled = true;

        itemDiv.innerHTML = `
            <div class="ranking-number">#${item.number}</div>
            <textarea class="ranking-input ${itemsArePreFilled ? 'locked' : ''}"
                   placeholder="Enter item ${item.number}..."
                   ${item.removed || !isYourTurn || itemsArePreFilled ? 'disabled readonly' : ''}
                   ${itemsArePreFilled ? 'tabindex="-1"' : ''}
                   onchange="${itemsArePreFilled ? '' : `updateRankingItem(${index}, this.value)`}"
                   oninput="${itemsArePreFilled ? '' : `updateRankingItemLive(${index}, this.value)`}"
                   onfocus="${itemsArePreFilled ? 'this.blur()' : ''}"
                   onkeydown="${itemsArePreFilled ? 'return false' : ''}"
                   onpaste="${itemsArePreFilled ? 'return false' : ''}"
                   oncut="${itemsArePreFilled ? 'return false' : ''}"
                   rows="1">${item.value}</textarea>
            <button class="btn-remove"
                    onclick="removeRankingItem(${index})"
                    ${item.removed || !isYourTurn ? 'disabled' : ''}>
                Remove
            </button>
        `;
        container.appendChild(itemDiv);
    });

    // Auto-resize all textareas to fit content
    container.querySelectorAll('textarea.ranking-input').forEach(textarea => {
        autoResizeTextarea(textarea);
    });
}

// Helper function to auto-resize textarea based on content
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(40, textarea.scrollHeight) + 'px';
}

// Ensure buttons/inputs reflect whose turn it is without requiring a full re-render
function updateGameInteractivity() {
    if (gameState.currentScreen !== 'gameScreen') return;
    const isYourTurn = (() => {
        if (gameState.lobby && gameState.lobby.gameState) {
            const current = gameState.players[gameState.currentPlayerIndex];
            return current && current.name === gameState.currentUser;
        }
        return true;
    })();
    const list = document.getElementById('rankingList');
    if (!list) return;
    list.classList.toggle('your-turn', isYourTurn);
    list.classList.toggle('not-your-turn', !isYourTurn);
    list.querySelectorAll('button.btn-remove').forEach(btn => {
        const parent = btn.closest('.ranking-item');
        const parentRemoved = parent ? parent.classList.contains('removed') : false;
        btn.disabled = parentRemoved || !isYourTurn;
    });
    list.querySelectorAll('input.ranking-input').forEach(inp => {
        // Lock text fields for ALL game modes - items should only be removable, not editable
        const itemsArePreFilled = true;

        // Disable editing when not your turn OR when items are pre-filled
        if (!isYourTurn || itemsArePreFilled) {
            inp.setAttribute('disabled', 'disabled');
            if (itemsArePreFilled) {
                inp.setAttribute('readonly', 'readonly');
                inp.setAttribute('tabindex', '-1');
                inp.classList.add('locked');
                // Block all interaction events
                inp.onfocus = function() { this.blur(); };
                inp.onkeydown = function() { return false; };
                inp.onpaste = function() { return false; };
                inp.oncut = function() { return false; };
            }
        } else if (!inp.closest('.ranking-item')?.classList.contains('removed')) {
            inp.removeAttribute('disabled');
            inp.removeAttribute('readonly');
            inp.removeAttribute('tabindex');
            inp.classList.remove('locked');
            inp.onfocus = null;
            inp.onkeydown = null;
            inp.onpaste = null;
            inp.oncut = null;
        }
    });
}

function updateRankingItem(index, value) {
    // Block editing in ALL game modes - items should only be removable, not editable
    return;
}

async function updateRankingItemLive(index, value) {
    // Block editing in ALL game modes - items should only be removable, not editable
    return;
}

async function persistRankingItems() {
    try {
        if (!gameState.lobby || !gameState.lobby.gameState) return;
        const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
        if (lobbyIndex === -1) return;
        activeLobbies[lobbyIndex].gameState.rankingItems = gameState.rankingItems;
        // Do not mutate turn here; only text updates
        await saveLobbies();
    } catch (e) {
        console.error('Failed to persist ranking items:', e);
    }
}

async function removeRankingItem(index) {
    if (gameState.rankingItems[index].removed) return;

    // Enforce turn ownership for lobby games
    if (gameState.lobby && gameState.lobby.gameState) {
        const current = gameState.players[gameState.currentPlayerIndex];
        if (!current || current.name !== gameState.currentUser) {
            return; // Not your turn; ignore
        }
    }

    gameState.rankingItems[index].removed = true;

    // Track removal order for Top 3 in completion modal
    const removedItem = gameState.rankingItems[index];
    gameState.removalHistory.push({
        number: removedItem.number,
        value: removedItem.value
    });

    const remainingCount = gameState.rankingItems.filter(item => !item.removed).length;

    // Sync to lobby if in lobby game
    if (gameState.lobby && gameState.lobby.gameState) {
        const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
        if (lobbyIndex !== -1) {
            activeLobbies[lobbyIndex].gameState.rankingItems = gameState.rankingItems;
            activeLobbies[lobbyIndex].gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
            activeLobbies[lobbyIndex].gameState.removalHistory = gameState.removalHistory;
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
    if (!currentPlayer || !turnIndicator) return;
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
async function completeGame() {
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
    updateStatsAfterGame(completedGame);
    if (gameState.userStats) {
        gameState.userStats.lobbiesSaved = gameState.savedTitles.length;
    }
    saveToLocalStorage();

    // Store the completed game data for replay
    gameState.lastCompletedGame = completedGame;

    // Update lobby game state to "completed" so other players see it
    if (gameState.lobby && gameState.lobby.id) {
        const lobbyIndex = activeLobbies.findIndex(l => l.id === gameState.lobby.id);
        if (lobbyIndex !== -1) {
            activeLobbies[lobbyIndex].gameState = {
                ...activeLobbies[lobbyIndex].gameState,
                phase: 'completed',
                winner: completedGame.winner,
                completedGame: completedGame
            };
            await saveLobbies();
        }

        // Give other players a moment to see the completion before closing lobby
        setTimeout(async () => {
            await closeLobby(gameState.lobby.id);
            gameState.lobby = null;
        }, 5000);
    }

    setTimeout(() => {
        showModal(
            '🎉 Game Complete!',
            `Winner: ${completedGame.winner}`,
            [
                {
                    text: 'New Game',
                    class: 'btn-primary',
                    onclick: () => {
                        closeModal();
                        if (gameState.isRandomGame) {
                            returnToRandomGame();
                        } else {
                            returnToMenu();
                        }
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
                },
                {
                    text: 'Home',
                    class: 'btn-secondary',
                    onclick: () => {
                        closeModal();
                        showHomepage();
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
            ${gameState.userType === 'registered' || gameState.isAdmin ? `<div class="completed-card-actions"><button class="btn-delete btn-small" onclick="event.stopPropagation(); deleteCompletedGame(${game.id})">Delete</button></div>` : ''}
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

async function deleteCompletedGame(gameId) {
    const game = gameState.completedGames.find(g => g.id === gameId);
    if (!game) return;

    showModal('Confirm Delete', `Are you sure you want to delete "${game.title}"?`, [
        {
            text: 'Cancel',
            class: 'btn-secondary',
            onclick: () => closeModal()
        },
        {
            text: 'Delete',
            class: 'btn-danger',
            onclick: async () => {
                closeModal();
                try {
                    const response = await fetch(`/api/users/${encodeURIComponent(gameState.currentUser)}/games/${gameId}`, {
                        method: 'DELETE',
                        headers: {
                            'X-Username': gameState.currentUser,
                            'X-Is-Admin': gameState.isAdmin ? 'true' : 'false'
                        }
                    });

                    if (response.ok) {
                        // Remove from local state
                        gameState.completedGames = gameState.completedGames.filter(g => g.id !== gameId);
                        // Re-render the list
                        renderCompletedRankings();
                        showModal('Success', 'Game deleted successfully!');
                    } else {
                        const error = await response.json();
                        showModal('Error', error.error || 'Failed to delete game. You may not have permission.');
                    }
                } catch (error) {
                    console.error('Error deleting game:', error);
                    showModal('Connection Error', 'Cannot connect to server. Please make sure the server is running.');
                }
            }
        }
    ]);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
