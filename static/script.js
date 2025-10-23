let selectedRepo = null;
let allRepos = [];

// Load saved settings on page load
window.addEventListener('DOMContentLoaded', () => {
    loadSettings();
});

async function loadSettings() {
    try {
        const response = await fetch('/api/load-settings');
        const data = await response.json();

        if (data.settings) {
            if (data.settings.last_folder) {
                document.getElementById('folder-path').value = data.settings.last_folder;
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function connectGitHub() {
    const token = document.getElementById('github-token').value.trim();
    const saveToken = document.getElementById('save-token').checked;
    const statusDiv = document.getElementById('auth-status');

    if (!token) {
        showStatus(statusDiv, 'Please enter your GitHub token', 'error');
        return;
    }

    showStatus(statusDiv, 'Connecting to GitHub...', 'info');

    try {
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus(statusDiv, data.message, 'success');

            // Save settings if requested
            if (saveToken) {
                await saveUserSettings(token);
            }

            // Show repository section
            document.getElementById('repo-section').style.display = 'block';
            loadRepositories();
        } else {
            showStatus(statusDiv, data.error || 'Authentication failed', 'error');
        }
    } catch (error) {
        showStatus(statusDiv, 'Connection error: ' + error.message, 'error');
    }
}

async function loadRepositories() {
    const repoList = document.getElementById('repo-list');
    repoList.innerHTML = '<p class="loading">Loading repositories...</p>';

    try {
        const response = await fetch('/api/repos');
        const data = await response.json();

        if (response.ok) {
            allRepos = data.repos;
            displayRepositories(allRepos);
        } else {
            repoList.innerHTML = `<p class="error">${data.error || 'Failed to load repositories'}</p>`;
        }
    } catch (error) {
        repoList.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

function displayRepositories(repos) {
    const repoList = document.getElementById('repo-list');

    if (repos.length === 0) {
        repoList.innerHTML = '<p class="loading">No repositories found</p>';
        return;
    }

    repoList.innerHTML = '';
    repos.forEach(repo => {
        const repoItem = document.createElement('div');
        repoItem.className = 'repo-item';
        repoItem.onclick = () => selectRepository(repo);

        const badge = repo.private ?
            '<span class="repo-badge badge-private">Private</span>' :
            '<span class="repo-badge badge-public">Public</span>';

        repoItem.innerHTML = `
            <div class="repo-name">${repo.name}${badge}</div>
            <div class="repo-description">${repo.description || 'No description'}</div>
        `;

        repoList.appendChild(repoItem);
    });
}

function searchRepos() {
    const searchTerm = document.getElementById('repo-search').value.toLowerCase();
    const filteredRepos = allRepos.filter(repo =>
        repo.name.toLowerCase().includes(searchTerm) ||
        (repo.description && repo.description.toLowerCase().includes(searchTerm))
    );
    displayRepositories(filteredRepos);
}

function selectRepository(repo) {
    selectedRepo = repo;

    // Update UI
    const repoItems = document.querySelectorAll('.repo-item');
    repoItems.forEach(item => item.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

    // Show selected repo info
    const selectedInfo = document.getElementById('selected-repo');
    selectedInfo.className = 'selected-info show';
    selectedInfo.innerHTML = `
        <strong>Selected Repository:</strong> ${repo.name}<br>
        <small>${repo.url}</small>
    `;

    // Show push section
    document.getElementById('push-section').style.display = 'block';
}

async function pushToGitHub() {
    if (!selectedRepo) {
        alert('Please select a repository first');
        return;
    }

    const folderPath = document.getElementById('folder-path').value.trim();
    const commitMessage = document.getElementById('commit-message').value.trim();
    const statusDiv = document.getElementById('push-status');

    if (!folderPath) {
        showStatus(statusDiv, 'Please enter a folder path', 'error');
        return;
    }

    if (!commitMessage) {
        showStatus(statusDiv, 'Please enter a commit message', 'error');
        return;
    }

    showStatus(statusDiv, 'Pushing to GitHub...', 'info');

    try {
        const response = await fetch('/api/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                folder_path: folderPath,
                repo_name: selectedRepo.name,
                commit_message: commitMessage
            })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus(statusDiv, data.message, 'success');

            // Save last used folder
            await saveUserSettings(null, folderPath);
        } else {
            showStatus(statusDiv, data.error || 'Push failed', 'error');
        }
    } catch (error) {
        showStatus(statusDiv, 'Error: ' + error.message, 'error');
    }
}

async function saveUserSettings(token = null, folder = null) {
    const currentToken = token || document.getElementById('github-token').value;
    const currentFolder = folder || document.getElementById('folder-path').value;

    try {
        await fetch('/api/save-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: currentToken,
                last_folder: currentFolder,
                last_repo: selectedRepo ? selectedRepo.name : ''
            })
        });
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.style.display = 'block';
}
