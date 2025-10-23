# Docker Setup for RepoUplink

Run RepoUplink in a Docker container for easy deployment and isolation.

## Prerequisites

- Docker Desktop installed ([Download here](https://www.docker.com/products/docker-desktop))
- Docker Compose (included with Docker Desktop)

## Quick Start

### 1. Build and Run with Docker Compose

```bash
docker-compose up -d
```

This will:
- Build the Docker image
- Start the container in the background
- Expose the app on port 5000

### 2. Access the Application

Open your browser to: **http://localhost:5000**

### 3. Stop the Application

```bash
docker-compose down
```

## Configuration

### Mount Your Project Folders

To upload folders from your computer, you need to mount them as volumes.

Edit `docker-compose.yml` and uncomment/modify the volumes section:

**Windows:**
```yaml
volumes:
  - ./data:/app/data
  - C:/Users/YourName/Projects:/projects
```

**Mac/Linux:**
```yaml
volumes:
  - ./data:/app/data
  - /home/username/projects:/projects
```

Then in the app, use the **container path**:
- Instead of: `C:\Users\YourName\Projects\MyApp`
- Use: `/projects/MyApp`

### Environment Variables

You can customize the app using environment variables in `docker-compose.yml`:

```yaml
environment:
  - FLASK_ENV=production
  - FLASK_HOST=0.0.0.0
  - FLASK_PORT=5000
  - SETTINGS_FILE=/app/data/settings.json
  - SECRET_KEY=your-secret-key-here
```

## Data Persistence

### Settings Storage

Settings (including your GitHub token) are stored in the `./data` directory on your host machine:
- **Location:** `./data/settings.json`
- **Persists:** Between container restarts

To clear saved settings:
```bash
rm ./data/settings.json
```

## Docker Commands Cheat Sheet

### Start the app (foreground with logs)
```bash
docker-compose up
```

### Start the app (background)
```bash
docker-compose up -d
```

### Stop the app
```bash
docker-compose down
```

### View logs
```bash
docker-compose logs -f
```

### Rebuild the image (after code changes)
```bash
docker-compose up -d --build
```

### Check running containers
```bash
docker ps
```

### Access container shell
```bash
docker exec -it repouplink /bin/bash
```

## Manual Docker Commands (without docker-compose)

### Build the image
```bash
docker build -t repouplink .
```

### Run the container
```bash
docker run -d \
  --name repouplink \
  -p 5000:5000 \
  -v $(pwd)/data:/app/data \
  repouplink
```

### Stop and remove container
```bash
docker stop repouplink
docker rm repouplink
```

## Folder Upload Examples with Docker

### Example 1: Upload mounted project folder

**In docker-compose.yml:**
```yaml
volumes:
  - C:/Projects:/projects
```

**In RepoUplink web interface:**
- Folder Path: `/projects/MyWebsite`
- This uploads `C:\Projects\MyWebsite` to GitHub

### Example 2: Multiple project folders

**In docker-compose.yml:**
```yaml
volumes:
  - C:/Work:/work
  - C:/Personal:/personal
  - D:/Repos:/repos
```

**In RepoUplink web interface:**
- `/work/ProjectA` → uploads `C:\Work\ProjectA`
- `/personal/MyApp` → uploads `C:\Personal\MyApp`
- `/repos/Website` → uploads `D:\Repos\Website`

## Port Conflicts

If port 5000 is already in use, change it in `docker-compose.yml`:

```yaml
ports:
  - "8080:5000"  # Access on localhost:8080
```

Then access the app at: **http://localhost:8080**

## Security in Docker

### Best Practices:

1. **Use environment variables for secrets:**
```yaml
environment:
  - SECRET_KEY=${SECRET_KEY}
```

Then create a `.env` file:
```
SECRET_KEY=your-random-secret-key-here
```

2. **Don't commit data directory:**
```bash
echo "data/" >> .gitignore
```

3. **Use Docker secrets for production** (Docker Swarm):
```yaml
secrets:
  github_token:
    external: true
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs

# Check if port is in use
# Windows
netstat -ano | findstr :5000

# Linux/Mac
lsof -i :5000
```

### Can't access folders
- Make sure volumes are mounted correctly in docker-compose.yml
- Use absolute paths on host machine
- Use container paths in the web interface

### Settings not persisting
- Check that `./data` directory exists
- Verify volume mount in docker-compose.yml
- Check permissions on the data directory

### Git operations failing
- Ensure git is installed in container (already included in Dockerfile)
- Check that folders are properly mounted
- Verify GitHub token is valid

## Production Deployment

### Using Docker Compose in Production:

1. **Set production environment:**
```yaml
environment:
  - FLASK_ENV=production
  - SECRET_KEY=${SECRET_KEY}
```

2. **Use restart policy:**
```yaml
restart: unless-stopped
```

3. **Add resource limits:**
```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
```

4. **Use reverse proxy (nginx):**
```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - repouplink
```

## Advanced: Multi-stage Build

For smaller image size, use multi-stage build:

```dockerfile
# Builder stage
FROM python:3.11-slim as builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.11-slim
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
CMD ["python", "app.py"]
```

---

**For basic usage, just run `docker-compose up -d` and you're ready to go!**
