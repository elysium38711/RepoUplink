from flask import Flask, render_template, request, jsonify, session
from github import Github, GithubException
import git
import os
import json
from pathlib import Path
import shutil

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this'  # Change this in production
SETTINGS_FILE = 'settings.json'

def load_settings():
    """Load saved settings from file"""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_settings(settings):
    """Save settings to file"""
    with open(SETTINGS_FILE, 'w') as f:
        json.dump(settings, f, indent=2)

@app.route('/')
def index():
    """Main page"""
    settings = load_settings()
    return render_template('index.html', saved_token=settings.get('token', ''))

@app.route('/api/connect', methods=['POST'])
def connect_github():
    """Connect to GitHub using Personal Access Token"""
    try:
        data = request.json
        token = data.get('token', '').strip()

        if not token:
            return jsonify({'error': 'Token is required'}), 400

        # Try to authenticate
        g = Github(token)
        user = g.get_user()
        username = user.login

        # Store in session
        session['github_token'] = token
        session['github_username'] = username

        return jsonify({
            'success': True,
            'username': username,
            'message': f'Connected as {username}'
        })

    except GithubException as e:
        return jsonify({'error': f'GitHub authentication failed: {str(e)}'}), 401
    except Exception as e:
        return jsonify({'error': f'Error: {str(e)}'}), 500

@app.route('/api/repos', methods=['GET'])
def get_repos():
    """Get list of user repositories"""
    try:
        token = session.get('github_token')
        if not token:
            return jsonify({'error': 'Not authenticated'}), 401

        search = request.args.get('search', '').lower()

        g = Github(token)
        user = g.get_user()

        repos = []
        for repo in user.get_repos():
            if search and search not in repo.name.lower():
                continue

            repos.append({
                'name': repo.name,
                'full_name': repo.full_name,
                'private': repo.private,
                'url': repo.html_url,
                'clone_url': repo.clone_url,
                'description': repo.description or ''
            })

        return jsonify({'repos': repos})

    except GithubException as e:
        return jsonify({'error': f'Failed to fetch repositories: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Error: {str(e)}'}), 500

@app.route('/api/push', methods=['POST'])
def push_to_github():
    """Push selected folder to GitHub repository"""
    try:
        token = session.get('github_token')
        if not token:
            return jsonify({'error': 'Not authenticated'}), 401

        data = request.json
        folder_path = data.get('folder_path', '').strip()
        repo_name = data.get('repo_name', '').strip()
        commit_message = data.get('commit_message', 'Update files').strip()

        if not folder_path or not os.path.exists(folder_path):
            return jsonify({'error': 'Invalid folder path'}), 400

        if not os.path.isdir(folder_path):
            return jsonify({'error': 'Path must be a directory'}), 400

        if not repo_name:
            return jsonify({'error': 'Repository name is required'}), 400

        # Get repository info
        g = Github(token)
        user = g.get_user()
        repo = user.get_repo(repo_name)

        # Check if folder is already a git repository
        git_dir = os.path.join(folder_path, '.git')

        if os.path.exists(git_dir):
            # Existing git repo
            repo_obj = git.Repo(folder_path)
        else:
            # Initialize new git repo
            repo_obj = git.Repo.init(folder_path)

            # Add remote if it doesn't exist
            try:
                origin = repo_obj.remote('origin')
            except:
                clone_url = repo.clone_url.replace('https://', f'https://{token}@')
                origin = repo_obj.create_remote('origin', clone_url)

        # Add all files
        repo_obj.git.add(A=True)

        # Check if there are changes to commit
        if repo_obj.is_dirty() or repo_obj.untracked_files:
            # Commit changes
            repo_obj.index.commit(commit_message)

            # Push to GitHub
            origin = repo_obj.remote('origin')

            # Update remote URL with token
            clone_url = repo.clone_url.replace('https://', f'https://{token}@')
            origin.set_url(clone_url)

            # Push to main or master branch
            try:
                origin.push('main')
                branch = 'main'
            except:
                try:
                    origin.push('master')
                    branch = 'master'
                except Exception as e:
                    # Try to push with force to new repo
                    try:
                        repo_obj.git.push('--set-upstream', 'origin', 'main')
                        branch = 'main'
                    except:
                        raise Exception(f'Failed to push: {str(e)}')

            return jsonify({
                'success': True,
                'message': f'Successfully pushed to {repo_name} ({branch})',
                'commit_message': commit_message
            })
        else:
            return jsonify({
                'success': True,
                'message': 'No changes to commit',
                'commit_message': commit_message
            })

    except GithubException as e:
        return jsonify({'error': f'GitHub error: {str(e)}'}), 500
    except git.GitCommandError as e:
        return jsonify({'error': f'Git error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Error: {str(e)}'}), 500

@app.route('/api/save-settings', methods=['POST'])
def save_user_settings():
    """Save user settings"""
    try:
        data = request.json
        settings = {
            'token': data.get('token', ''),
            'last_repo': data.get('last_repo', ''),
            'last_folder': data.get('last_folder', '')
        }
        save_settings(settings)
        return jsonify({'success': True, 'message': 'Settings saved'})
    except Exception as e:
        return jsonify({'error': f'Error saving settings: {str(e)}'}), 500

@app.route('/api/load-settings', methods=['GET'])
def load_user_settings():
    """Load user settings"""
    try:
        settings = load_settings()
        return jsonify({'settings': settings})
    except Exception as e:
        return jsonify({'error': f'Error loading settings: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
