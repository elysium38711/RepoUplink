# GitHub RepoUplink

A simple web-based GUI application for uploading local folders to GitHub repositories. Makes pushing to GitHub as easy as a few clicks!

## Features

- Clean, modern web interface
- GitHub authentication using Personal Access Tokens
- Search and select from your repositories
- Simple folder selection
- Custom commit messages
- Auto-saves your preferences (token and last folder path)
- Support for both new and existing git repositories
- Works with public and private repositories

## Prerequisites

- Python 3.7 or higher
- Git installed on your system
- A GitHub account
- A GitHub Personal Access Token

## Installation

1. Clone or download this repository

2. Install the required dependencies:
```bash
pip install -r requirements.txt
```

## Setup

### Create a GitHub Personal Access Token

1. Go to [GitHub Settings > Tokens](https://github.com/settings/tokens/new)
2. Click "Generate new token (classic)"
3. Give it a name (e.g., "RepoUplink")
4. Select the `repo` scope (full control of private repositories)
5. Click "Generate token"
6. Copy the token (it looks like `ghp_xxxxxxxxxxxx`)

**Important:** Save this token somewhere safe! GitHub will only show it once.

## Usage

### 1. Start the Application

Run the Flask application:
```bash
python app.py
```

The application will start on `http://127.0.0.1:5000`

### 2. Open in Browser

Open your web browser and navigate to:
```
http://127.0.0.1:5000
```

### 3. Connect to GitHub

1. Paste your Personal Access Token in the input field
2. Check "Save token" if you want it saved for next time
3. Click "Connect"

### 4. Select a Repository

1. Use the search box to find your repository
2. Click on the repository you want to upload to

### 5. Push Your Files

1. Enter the full path to the folder you want to upload
   - Windows example: `C:\Users\YourName\Projects\MyProject`
   - Linux/Mac example: `/home/username/projects/myproject`
2. Enter a commit message describing your changes
3. Click "Push to GitHub"

## How It Works

The application will:
1. Check if your folder is already a git repository
   - If yes: It will add, commit, and push your changes
   - If no: It will initialize git, add all files, commit, and push
2. Automatically configure the remote repository URL
3. Push to the main (or master) branch

## Features in Detail

### Auto-Save Settings
- Your GitHub token is saved locally (if you check the box)
- Last used folder path is remembered
- Settings are stored in `settings.json` in the application directory

### Repository Search
- Type to filter repositories by name or description
- Works with both public and private repos
- Shows repository status (public/private)

### Smart Git Handling
- Automatically detects existing git repositories
- Initializes new repositories if needed
- Handles both main and master branches
- Adds all files automatically

## Security Notes

- Your Personal Access Token is stored locally in `settings.json`
- Never share your `settings.json` file or commit it to version control
- The token is added to `.gitignore` by default
- Use tokens with minimal required permissions
- You can revoke tokens anytime from GitHub settings

## Troubleshooting

### "Authentication failed"
- Check that your token is valid
- Make sure the token has `repo` scope permissions
- Try generating a new token

### "Invalid folder path"
- Use the full absolute path to your folder
- Make sure the folder exists
- On Windows, use backslashes or forward slashes

### "Failed to push"
- Check that you have write access to the repository
- Make sure the repository exists on GitHub
- Verify your internet connection

### "No changes to commit"
- This means all files are already up to date
- Make some changes to your files before pushing

## File Structure

```
RepoUplink/
├── app.py              # Main Flask application
├── requirements.txt    # Python dependencies
├── settings.json       # Saved user settings (auto-generated)
├── .gitignore         # Git ignore file
├── templates/
│   └── index.html     # Web interface
└── static/
    ├── style.css      # Styling
    └── script.js      # Frontend logic
```

## Technologies Used

- **Flask**: Web framework
- **PyGithub**: GitHub API integration
- **GitPython**: Git operations
- **HTML/CSS/JavaScript**: Frontend interface

## License

Free to use and modify as needed.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review the GitHub token permissions
3. Ensure all dependencies are installed correctly

## Future Enhancements

Potential features to add:
- Branch selection
- Pull before push option
- File/folder exclusion patterns
- Multiple repository uploads
- Upload history
- Desktop application version (Electron)

---

**Happy Uploading!**

