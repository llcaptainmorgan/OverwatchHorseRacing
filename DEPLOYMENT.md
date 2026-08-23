# Deployment Guide

This guide walks you through deploying OHR to production so it's "always available" as a GitHub project.

## Architecture Overview

- **Backend**: Cloudflare Workers + Durable Objects (serverless, WebSocket support)
- **Frontend**: Static files (can be hosted on Cloudflare Pages, GitHub Pages, or any static host)

## Step 1: Deploy Backend to Cloudflare Workers

### Prerequisites
1. Cloudflare account (free tier works)
2. Wrangler CLI installed: `npm install -g wrangler`

### Deployment Steps

1. **Login to Cloudflare**
   ```bash
   wrangler login
   ```
   This opens a browser to authenticate with Cloudflare.

2. **Configure Production Settings** (if needed)
   
   Edit `backend/wrangler.toml`:
   ```toml
   [vars]
   ALLOWED_ORIGIN = "https://your-frontend-domain.com"  # Replace with your frontend URL
   ```

3. **Set Production Secrets** (Discord OAuth, etc.)
   ```bash
   cd backend
   wrangler secret put DISCORD_CLIENT_ID
   wrangler secret put DISCORD_CLIENT_SECRET
   wrangler secret put DISCORD_REDIRECT_URI
   wrangler secret put SESSION_JWT_SECRET
   ```
   Enter values when prompted.

4. **Deploy**
   ```bash
   npm run deploy:backend
   # OR
   cd backend
   wrangler deploy
   ```

5. **Copy Your Workers URL**
   After deployment, you'll see output like:
   ```
   ✨  Deployed! Your Worker is live at:
   https://ohr-backend.yourname.workers.dev
   ```
   **Save this URL** - you'll need it for the frontend.

## Step 2: Update Frontend Configuration

1. **Edit `main/backend_config.js`**
   
   Find this line:
   ```javascript
   return 'https://REPLACE_WITH_YOUR_WORKERS_URL.workers.dev';
   ```
   
   Replace with your actual Workers URL:
   ```javascript
   return 'https://ohr-backend.yourname.workers.dev';
   ```

2. **Build CSS**
   ```bash
   npm run build:css
   ```

## Step 3: Deploy Frontend

### Option A: Cloudflare Pages (Recommended - Free & Fast)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

2. **Connect to Cloudflare Pages**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
   - Click "Create a project" → "Connect to Git"
   - Select your GitHub repo

3. **Configure Build Settings**
   - **Framework preset**: None
   - **Build command**: `npm install && npm run build:css`
   - **Build output directory**: `main`
   - **Root directory**: `/` (leave empty or set to `/`)

4. **Deploy**
   - Click "Save and Deploy"
   - Cloudflare will build and deploy your frontend
   - Your site will be live at: `https://your-project.pages.dev`

5. **Update Backend CORS** (if needed)
   If you get CORS errors, update `backend/wrangler.toml`:
   ```toml
   [vars]
   ALLOWED_ORIGIN = "https://your-project.pages.dev"
   ```
   Then redeploy backend: `npm run deploy:backend`

### Option B: GitHub Pages

1. **Install gh-pages** (optional, makes it easier)
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Add deploy script to `package.json`**
   ```json
   "scripts": {
     "deploy:frontend": "npm run build:css && gh-pages -d main"
   }
   ```

3. **Deploy**
   ```bash
   npm run deploy:frontend
   ```

4. **Enable GitHub Pages**
   - Go to your repo → Settings → Pages
   - Source: `gh-pages` branch
   - Your site will be at: `https://yourusername.github.io/repo-name/main/index.html`

5. **Update Frontend Path**
   If using GitHub Pages, you may need to update paths in `index.html` to be relative or use a base tag.

### Option C: Any Static Hosting (Netlify, Vercel, etc.)

1. **Build CSS**
   ```bash
   npm run build:css
   ```

2. **Upload `main/` directory** to your hosting service

3. **Configure redirects** (if needed) to handle client-side routing

## Step 4: Test Production Deployment

1. **Visit your frontend URL**
   - Should load the game interface

2. **Open browser console**
   - Should see: `[OHR] Running in PRODUCTION mode`
   - Should see: `[OHR] Backend URL: https://your-backend.workers.dev`

3. **Create a session**
   - Click "CREATE NEW SESSION"
   - Should receive a 4-letter code

4. **Test WebSocket connection**
   - Check console for WebSocket connection logs
   - Should connect successfully

## Step 5: Set Up Custom Domain (Optional)

### Backend (Cloudflare Workers)

1. Go to Workers dashboard → Your worker → Settings → Triggers
2. Add Custom Domain
3. Follow Cloudflare's DNS setup instructions

### Frontend (Cloudflare Pages)

1. Go to Pages dashboard → Your project → Custom domains
2. Add your domain
3. Update DNS records as instructed

## Troubleshooting

### CORS Errors
- Ensure `ALLOWED_ORIGIN` in `wrangler.toml` matches your frontend URL exactly
- Include protocol (`https://`) and no trailing slash

### WebSocket Connection Fails
- Verify backend is deployed and accessible
- Check browser console for specific error messages
- Ensure WebSocket URL converts correctly (`https://` → `wss://`)

### Images Not Loading
- Verify image paths are relative (starting with `../images/`)
- Check that images directory is included in deployment

### Environment Detection Issues
- If frontend thinks it's in development when it should be production:
  - Check hostname in browser
  - Verify `backend_config.js` fallback URL is set correctly

## Continuous Deployment

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g wrangler
      - run: wrangler deploy
        working-directory: ./backend
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Summary Checklist

- [ ] Backend deployed to Cloudflare Workers
- [ ] Workers URL saved
- [ ] Frontend `backend_config.js` updated with Workers URL
- [ ] CSS built (`npm run build:css`)
- [ ] Frontend deployed (Pages/GitHub Pages/etc.)
- [ ] CORS configured in `wrangler.toml`
- [ ] Tested production deployment
- [ ] Custom domain configured (optional)

Your game should now be "always available" at your deployed URL! 🎉

