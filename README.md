# Overwatch Horse Racing (OHR)

A real-time multiplayer horse racing game featuring Overwatch heroes, built with Cloudflare Workers + Durable Objects and vanilla JavaScript.

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18 or higher)
- **Python 3** (for local frontend server) OR **npx** (comes with Node.js)
- **Wrangler CLI** for Cloudflare Workers: `npm install -g wrangler`

### Local Development

#### Option 1: Manual Setup (Recommended for First Time)

1. **Start the Backend (Cloudflare Workers)**
   ```bash
   cd backend
   wrangler dev
   # Backend will run at http://127.0.0.1:8787
   ```

2. **Start the Frontend (in a new terminal)**
   ```bash
   # From project root (IMPORTANT: must be project root, not main/ directory):
   npm run dev:frontend
   # OR manually:
   python -m http.server 8081
   # Frontend will be at http://127.0.0.1:8081/main/index.html
   ```
   
   **Important**: The server must run from the project root directory, not from `main/`. This ensures image paths (`../images/`) resolve correctly.

3. **Watch SCSS Files (optional, in another terminal)**
   ```bash
   npm run watch:css
   # OR double-click: tools/watch_scss.bat
   ```

4. **Open in Browser**
   - Navigate to: `http://127.0.0.1:8081/main/index.html`
   - The frontend will automatically connect to the local backend

#### Option 2: Use Backend Override (For Testing Different Backends)

You can override the backend URL via URL parameter:
```
http://127.0.0.1:8081/main/index.html?backend=https://your-backend.workers.dev
```

## 📁 Project Structure

```
.
├── backend/           # Cloudflare Workers backend
│   ├── src/          # Backend source code
│   └── wrangler.toml # Workers configuration
├── main/              # Frontend application
│   ├── index.html    # Main entry point
│   ├── *.js          # Frontend modules
│   └── styles.css    # Compiled CSS (auto-generated)
├── styles/           # SCSS source files
├── images/           # Game assets
├── sounds/           # Audio files
└── shared/           # Shared configuration

```

## 🔧 Configuration

### Backend Configuration

The frontend automatically detects the environment:
- **Development**: Uses `http://127.0.0.1:8787` when running on localhost
- **Production**: Uses your deployed Cloudflare Workers URL

To set a production backend URL, update `main/backend_config.js`:
```javascript
// Replace the fallback URL with your actual Workers domain
return 'https://your-backend.workers.dev';
```

### Discord OAuth (Optional)

For Discord authentication, create `backend/.dev.vars`:
```env
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://127.0.0.1:8787/auth/discord/callback
SESSION_JWT_SECRET=your_random_secret_key
ALLOWED_ORIGIN=http://127.0.0.1:8081
```

## 🌐 Deployment

### Deploy Backend to Cloudflare Workers

1. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

2. **Deploy**
   ```bash
   npm run deploy:backend
   # OR
   cd backend
   wrangler deploy
   ```

3. **Update Frontend Config**
   - Copy your Workers URL (e.g., `https://ohr-backend.yourname.workers.dev`)
   - Update `main/backend_config.js` with your production URL

### Deploy Frontend

#### Option 1: Cloudflare Pages (Recommended)

1. Connect your GitHub repo to Cloudflare Pages
2. Set build command: `npm run build`
3. Set output directory: `main`
4. Set root directory: `/`
5. Deploy!

#### Option 2: GitHub Pages

1. Build CSS: `npm run build:css`
2. Push `main/` directory to `gh-pages` branch
3. Enable GitHub Pages in repo settings

#### Option 3: Any Static Hosting

1. Build CSS: `npm run build:css`
2. Upload the `main/` directory to your hosting service
3. Ensure `backend_config.js` points to your deployed Workers URL

## 🎮 How It Works

- **Backend**: Cloudflare Workers + Durable Objects handle game state, race logic, and WebSocket connections
- **Frontend**: Vanilla JavaScript renders the UI and connects to backend via WebSocket
- **Game Flow**: 
  1. Create or join a session (4-letter code)
  2. Select characters (Overwatch heroes)
  3. Race begins automatically
  4. Real-time position updates via WebSocket

## 🛠️ Development Scripts

```bash
npm run build:css      # Compile SCSS once
npm run watch:css      # Watch SCSS files for changes
npm run dev:frontend   # Start frontend server
npm run dev:backend    # Start backend server
npm run deploy:backend # Deploy backend to Cloudflare
```

## 📝 Notes

- **SCSS**: Edit files in `styles/`, they compile to `main/styles.css`
- **Backend Config**: Auto-detects dev vs production based on hostname
- **Ports**: Backend uses 8787, Frontend uses 8081 (configurable)
- **CORS**: Backend allows all origins in development, restrict in production

## 🐛 Troubleshooting

**Frontend can't connect to backend:**
- Check backend is running: `http://127.0.0.1:8787`
- Check browser console for connection errors
- Verify `backend_config.js` has correct URL

**Images not loading (404 errors):**
- **Most common issue**: Server is running from wrong directory
  - ✅ **Correct**: Run `python -m http.server 8081` from project root
  - ❌ **Wrong**: Running from `main/` directory
  - Solution: `cd` to project root, then run the server
- Verify image files exist in `images/current_roster/` directory
- Check browser DevTools Network tab to see what paths are being requested
- All image paths use `../images/` which assumes server root is project root

**SCSS not compiling:**
- Run `npm install` to install dependencies
- Use `npm run watch:css` for auto-compilation

## 📄 License

[Your License Here]

## 🤝 Contributing

[Your Contributing Guidelines Here]

