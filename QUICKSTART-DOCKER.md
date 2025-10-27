# Quick Start with Docker Compose

Get RepoUplink running on your local machine in just a few steps!

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed
- A GitHub account
- A [GitHub Personal Access Token](https://github.com/settings/tokens/new) with `repo` scope

## Step 1: Start the Application

Open a terminal in the RepoUplink directory and run:

```bash
docker compose up -d
```

Or if you have the older docker-compose version:

```bash
docker-compose up -d
```

This will:
- Build the Docker image (first time only)
- Start the container in the background
- Make the web interface available at http://localhost:5000

## Step 2: Access the Web Interface

Open your web browser and go to:

```
http://localhost:5000
```

You should see the RepoUplink interface!

## Step 3: Configure Project Folders (Optional but Recommended)

To upload folders from your computer, you need to mount them as volumes:

### Option A: Using docker-compose.override.yml (Recommended)

1. Copy the example override file:
   ```bash
   cp docker-compose.override.yml.example docker-compose.override.yml
   ```

2. Edit `docker-compose.override.yml` and uncomment the volumes section for your OS

3. Restart the container:
   ```bash
   docker compose up -d
   ```

### Option B: Edit docker-compose.yml Directly

1. Open `docker-compose.yml`
2. Find the `volumes:` section
3. Uncomment and customize the project folder mount for your OS
4. Restart: `docker compose up -d`

### Example Volume Mounts

**Windows:**
```yaml
volumes:
  - C:/Users/YourName/Projects:/projects
```

**Linux:**
```yaml
volumes:
  - /home/username/projects:/projects
```

**macOS:**
```yaml
volumes:
  - /Users/username/Projects:/projects
```

Then in the web interface, use the container path (e.g., `/projects/MyApp`) instead of your local path.

## Usage

1. **Connect to GitHub**: Enter your Personal Access Token
2. **Select Repository**: Choose from your GitHub repos
3. **Push Files**: Enter the container path to your project folder (e.g., `/projects/MyApp`)
4. **Add Commit Message**: Describe your changes
5. **Push to GitHub**: Click the button and you're done!

## Useful Commands

### View Logs
```bash
docker compose logs -f
```

### Stop the Application
```bash
docker compose down
```

### Restart the Application
```bash
docker compose restart
```

### Rebuild After Code Changes
```bash
docker compose up -d --build
```

### Check Status
```bash
docker compose ps
```

## Troubleshooting

### Port 5000 Already in Use?

Change the port in `docker-compose.yml`:
```yaml
ports:
  - "8080:5000"  # Now access at http://localhost:8080
```

### Can't Access Local Folders?

Make sure you've:
1. Mounted your project folders as volumes (see Step 3)
2. Restarted the container after changing volumes
3. Used the container path in the web interface (e.g., `/projects/MyApp`)

### Settings Not Persisting?

The `./data` directory stores your settings. Make sure it exists and has proper permissions:
```bash
ls -la ./data
```

## Next Steps

- Read [DOCKER.md](DOCKER.md) for advanced configuration
- Check [README.md](README.md) for detailed usage instructions
- See [QUICKSTART.md](QUICKSTART.md) for non-Docker setup

---

**That's it! You're ready to upload to GitHub with ease!**
