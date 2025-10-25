# Reverse Ranking Game

## Docker / unRAID Deployment

This project now supports containerized deployment with Docker and unRAID. Data and logs locations are configurable via environment variables, and volumes can be mapped to persist state.

### Environment variables

- `PORT` (default `3000`): HTTP port the server listens on.
- `HOST` (default `0.0.0.0`): Bind address inside the container.
- `DATA_DIR` (default `/data` in Docker, repo dir otherwise): Directory where `lobbies.json` and `users.json` are stored.
- `LOG_DIR` (default empty): If set, logs are also written to `<LOG_DIR>/server.log` in addition to stdout.

### Files persisted in `DATA_DIR`

- `lobbies.json`
- `users.json`

If these files do not exist, the server creates them (or seeds from any copies included with the image).

### Quick start (Docker)

1. Build image: `docker compose build`
2. Start: `docker compose up -d`
3. Open: `http://localhost:3000`

By default, host directories `./data` and `./logs` are mapped to `/data` and `/logs` in the container.

### Configure custom locations

- Edit `docker-compose.yml` and change:
  - `environment: DATA_DIR` and `LOG_DIR` values (container paths)
  - `volumes:` host paths before the colon to your preferred locations

Example:

```
services:
  reverse-rank:
    environment:
      - DATA_DIR=/data
      - LOG_DIR=/logs
    volumes:
      - D:/games/reverse-rank/data:/data
      - D:/games/reverse-rank/logs:/logs
```

### unRAID template tips

- Add two Path mappings in the template:
  - Container Path: `/data` -> Host Path: your storage location
  - Container Path: `/logs` -> Host Path: your logs location
- Set Environment variables in the template:
  - `DATA_DIR=/data`
  - `LOG_DIR=/logs`
  - `PORT=3000` (change host port in the port mapping as desired)

The container writes state to `DATA_DIR` and logs to `LOG_DIR/server.log` if set. stdout/stderr still go to the Docker logs.

### Notes

- The server binds to `0.0.0.0` by default so it is reachable from your LAN when the port is published.
- If `lobbies.json` or `users.json` are missing, the server serves empty arrays and will create the files on first write.

A modern, responsive web-based multiplayer ranking game where players take turns eliminating options until only one remains.

## Features

- **Multiplayer Support**: Add multiple players with unique names and randomly assigned colors
- **Customizable Rankings**: Create rankings with 1-100 rows
- **Quick Pick Titles**: Save and reuse game titles for easy setup
- **Turn-Based Gameplay**: Players take turns eliminating one option at a time
- **Top 5 Display**: See the remaining top items as you narrow down choices
- **Game History**: All completed games are saved with full details
- **Fully Responsive**: Works perfectly on mobile, tablet, and desktop devices
- **Local & Network Play**: Host locally or share with others on your network

## How to Run

### Prerequisites
- Node.js installed on your machine

### Starting the Server

1. Open a terminal in the game directory
2. Run the server:
   ```bash
   node server.js
   ```
   Or use npm:
   ```bash
   npm start
   ```

3. The server will display URLs where you can access the game:
   - **Local**: `http://localhost:3000`
   - **Network**: `http://[your-ip]:3000` (for other devices)

### Accessing from Other Devices

To allow friends to join on the same network:
1. Start the server
2. Find your local IP address in the terminal output
3. Share the Network URL (e.g., `http://192.168.1.100:3000`) with others
4. They can access it from their phones, tablets, or computers

## How to Play

1. **Setup Game**:
   - Enter a game title (e.g., "Best Movies of 2024")
   - Choose number of ranking rows (1-100)
   - Add players with their names
   - Click "Continue to Setup"

2. **Fill in All Rows**:
   - Enter items in each row (#1, #2, #3, etc.)
   - Fill in all the options you want to rank
   - Click "Start Game" when ready

3. **Take Turns**:
   - Each player takes turns clicking "Remove" on one item
   - The current player is highlighted in the sidebar
   - Turns automatically rotate between players

4. **Watch Top 5**:
   - As items are eliminated, the Top 5 remaining items are displayed
   - Continue until only 1 item remains

5. **Winner**:
   - The last remaining item is the winner!
   - Game is automatically saved to "Completed Rankings"

## Game Rules

- Each player removes exactly 1 row per turn
- Turns rotate through all players
- Game continues until only 1 option remains
- The final remaining option is declared the winner

## Technical Details

- **Frontend**: Pure HTML, CSS, JavaScript (no frameworks)
- **Backend**: Node.js HTTP server
- **Storage**: Browser localStorage for game persistence
- **Port**: 3000 (configurable in server.js)

## Customization

### Change Server Port
Edit `server.js` and modify the `PORT` constant:
```javascript
const PORT = 3000; // Change to your desired port
```

### Add More Player Colors
Edit `app.js` and add colors to the `playerColors` array:
```javascript
const playerColors = [
    '#ef4444', '#f59e0b', // Add more hex colors here
];
```

### Adjust Maximum Rows
Edit `index.html` and modify the max attribute:
```html
<input type="number" id="rowAmount" value="10" min="1" max="100">
```

## Browser Support

Works on all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (iOS Safari, Chrome Mobile)

## Troubleshooting

**Port already in use**:
- Change the PORT in server.js to a different number (e.g., 3001)

**Can't connect from other devices**:
- Make sure all devices are on the same Wi-Fi network
- Check if your firewall is blocking the port
- Try using the server's IP address instead of localhost

**Game data not saving**:
- Ensure browser localStorage is enabled
- Check browser console for errors

## License

MIT License - Free to use and modify
