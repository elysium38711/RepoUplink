# Quick Start Guide

## Get Started in 3 Steps:

### Step 1: Get Your GitHub Token
1. Go to: https://github.com/settings/tokens/new
2. Name it: "RepoUplink"
3. Check the box for: `repo` (Full control of private repositories)
4. Click "Generate token" at the bottom
5. **Copy the token** (starts with `ghp_`)

### Step 2: Install & Run
**On Windows:**
```bash
start.bat
```

**On Mac/Linux:**
```bash
chmod +x start.sh
./start.sh
```

Or manually:
```bash
pip install -r requirements.txt
python app.py
```

### Step 3: Use the App
1. Open browser to: http://127.0.0.1:5000
2. Paste your GitHub token
3. Click "Connect"
4. Select a repository from the list
5. Enter your folder path (e.g., `C:\MyProject`)
6. Type a commit message
7. Click "Push to GitHub"

**Done!** Your files are now on GitHub.

## Example Folder Paths

**Windows:**
- `C:\Users\YourName\Documents\MyProject`
- `D:\Code\WebApp`

**Mac/Linux:**
- `/Users/yourname/projects/myapp`
- `/home/username/code/website`

## Tips

- Check "Save token" to avoid entering it every time
- Use the search box to quickly find your repo
- The app remembers your last folder path
- Works with both new and existing repositories

## Need Help?

See the full [README.md](README.md) for detailed instructions and troubleshooting.
