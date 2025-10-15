# Web Component Development Workflow

This guide explains how to rapidly develop and test web components without redeploying to AWS.

## TL;DR - Quick Commands

```bash
# Terminal 1 - Watch and rebuild on changes
cd services/samples/weather
pnpm run dev:wc

# Terminal 2 - Serve built files
cd services/samples/weather
pnpm run serve:wc

# In apps/pika-chat/.env.local add:
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js'

# Terminal 3 - Run pika-chat
cd apps/pika-chat
pnpm run dev
```

Now edit `.svelte` files, wait 2 seconds for rebuild, refresh browser!

## Quick Start

### 1. Initial Setup (One-time)

Deploy your tag definitions to AWS **once**:

```bash
# From services/samples/weather/
STAGE=test pnpm run cdk:deploy
```

This deploys:

- Tag definitions to DynamoDB
- Web component bundle to S3
- Lambda functions for weather tools

### 2. Start Web Component Dev Server

You need **two terminal windows** for the dev server:

**Terminal 1 - Build with watch mode:**

```bash
# From services/samples/weather/
pnpm run dev:wc
```

This watches your `.svelte` files and rebuilds on changes to `dev-dist/` directory.

**Terminal 2 - Serve the built files:**

```bash
# From services/samples/weather/ (in a new terminal)
pnpm run serve:wc
```

This serves the built files on `localhost:5173`:

- http://localhost:5173/favorite-cities.js
- http://localhost:5173/city-selector.js
- http://localhost:5173/weather-alerts.js
- http://localhost:5173/temperature-trend.js
- http://localhost:5173/weather-comparison.js
- http://localhost:5173/weather-fun-fact.js
- http://localhost:5173/quick-weather-search.js
- http://localhost:5173/full-forecast.js

**Pro tip:** Verify it's working by visiting http://localhost:5173/favorite-cities.js in your browser - you should see JavaScript code, not HTML.

### 3. Configure Pika Chat to Use Local Components

In `apps/pika-chat/.env.local`:

```bash
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js;weather.weather-alerts::http://localhost:5173/weather-alerts.js;weather.temperature-trend::http://localhost:5173/temperature-trend.js;weather.weather-comparison::http://localhost:5173/weather-comparison.js;weather.weather-fun-fact::http://localhost:5173/weather-fun-fact.js;weather.quick-weather-search::http://localhost:5173/quick-weather-search.js;weather.full-forecast::http://localhost:5173/full-forecast.js'
```

Or just the ones you're actively developing:

```bash
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js'
```

### 4. Start Pika Chat

```bash
# From apps/pika-chat/
pnpm run dev
```

Open http://localhost:3000

### 5. Develop with Fast Feedback

Now you can:

1. Edit any `.svelte` file in `src/webcomponent/lib/widgets/`
2. Save the file
3. Watch terminal 1 - Vite rebuilds automatically (takes 1-2 seconds)
4. Refresh pika-chat browser
5. See your changes!

**No CDK deployments. No S3 uploads. Just save, wait 2 seconds, and reload!**

**How fast?** Rebuilds typically take 1-2 seconds. Not as instant as HMR, but WAY faster than CDK deploy (which takes minutes).

## How It Works

### Dev Server Architecture

```
Terminal 1: Watch + Build
┌─────────────────────────────────────────┐
│  Vite Build --watch                     │
│                                         │
│  Watches: src/webcomponent/lib/*.svelte│
│                                         │
│  On change:                             │
│  1. Compiles Svelte → JS               │
│  2. Bundles with Tailwind               │
│  3. Outputs to dev-dist/                │
│     → favorite-cities.js                │
│     → city-selector.js                  │
│     → ... (one per component)           │
│                                         │
│  ⚡ Rebuild time: ~1-2 seconds          │
└─────────────────────────────────────────┘

Terminal 2: Serve Files
┌─────────────────────────────────────────┐
│  Static Server (localhost:5173)         │
│                                         │
│  Serves: dev-dist/ directory            │
│  CORS: Enabled                          │
│                                         │
│  GET /favorite-cities.js → file         │
│  GET /city-selector.js → file           │
│  ... etc                                │
└─────────────────────────────────────────┘
             ↓
    pika-chat fetches these URLs
             ↓
┌─────────────────────────────────────────┐
│  Pika Chat (localhost:3000)             │
│                                         │
│  1. Loads tag definitions from DB      │
│  2. Applies WEB_COMPONENT_URLS override│
│  3. Fetches JS from localhost:5173     │
│  4. Executes & renders web components  │
└─────────────────────────────────────────┘
```

### File Structure

```
services/samples/weather/
├── dev-entry/                    # Dev server entry points
│   ├── favorite-cities.ts        # Imports component + styles
│   ├── city-selector.ts
│   └── ... (one per component)
├── src/webcomponent/
│   ├── app.css                   # Global styles
│   ├── main.ts                   # Production bundle entry
│   └── lib/widgets/
│       ├── favorite-cities.svelte  # Your component code
│       └── ...
├── vite.config.ts                # Production build config
├── vite.config.dev.ts            # Dev server config ← NEW
└── package.json
```

### Production vs Development

**Production Build** (`pnpm run build`):

- Uses `vite.config.ts`
- Bundles all components into single `weather.js.gz`
- Minified and optimized
- Deployed to S3

**Development Server** (`pnpm run dev:wc`):

- Uses `vite.config.dev.ts`
- Serves each component individually
- No minification (easier debugging)
- Hot module reloading
- CORS enabled for cross-origin requests

## Tips & Tricks

### 1. Viewing Network Requests

Open browser DevTools → Network tab to see:

- Components loading from `localhost:5173` (not S3)
- Any 404s or loading errors

### 2. Component Not Loading?

Check:

1. **Dev server running?** Look for `VITE ready in Xms` in terminal
2. **URL in env var correct?** Check `.env.local` syntax
3. **CORS errors?** Vite config has `cors: true`
4. **Component registered?** Check `dev-entry/` has an entry file

### 3. Styles Not Applying?

Each `dev-entry/*.ts` file imports `app.css`. If styles are missing:

1. Check that `app.css` has your Tailwind directives
2. Verify import path in entry file
3. Restart dev server

### 4. Hot Reload Not Working?

Vite watches `.svelte` files automatically. If changes aren't detected:

1. Restart `pnpm run dev:wc`
2. Check file is saved (not just buffer in editor)
3. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)

### 5. Testing Multiple Components

You can test any combination by setting `WEB_COMPONENT_URLS`:

```bash
# Test just one
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js'

# Test a few
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js'

# Test all (long but works!)
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js;...'
```

Components not in the override will load from S3 (your last deployment).

### 6. Deploying Production Changes

When you're ready to deploy:

```bash
# Build production bundle
pnpm run build

# Deploy to AWS
STAGE=test pnpm run cdk:deploy
```

Then **remove** `WEB_COMPONENT_URLS` from `.env.local` to test the S3 version.

## Troubleshooting

### "Port 5173 already in use"

Another Vite server is running. Either:

- Kill the other process: `lsof -ti:5173 | xargs kill -9`
- Or change port in `vite.config.dev.ts`

### "Failed to resolve import"

Path alias issue. Check `vite.config.dev.ts` → `resolve.alias`:

```js
alias: {
    '$icons/': '~icons/',
    $lib: resolve(__dirname, 'src/webcomponent/lib')
}
```

### "Component doesn't appear in pika-chat"

1. Check tag definition exists in DynamoDB
2. Verify `WEB_COMPONENT_URLS` has correct `{scope}.{tag}` key
3. Check browser console for errors
4. Verify component is enabled in spotlight/canvas/dialog

### "Styles from pika-ux not working"

Make sure `pika-ux` is installed and Tailwind is configured. Check:

- `tailwind.config.ts` includes `pika-ux` in content paths
- Component imports from `pika-ux/shadcn/*`

## Advanced: Adding New Components

To add a new component to the dev server:

1. **Create the Svelte component**:

    ```bash
    # In src/webcomponent/lib/widgets/
    touch my-new-widget.svelte
    ```

2. **Add it to main.ts** (for production):

    ```js
    import './lib/widgets/my-new-widget.svelte';
    ```

3. **Create dev entry point**:

    ```bash
    cat > dev-entry/my-new-widget.ts << EOF
    import '../src/webcomponent/app.css';
    import '../src/webcomponent/lib/widgets/my-new-widget.svelte';
    EOF
    ```

4. **Add to vite.config.dev.ts**:

    ```js
    lib: {
        entry: {
            // ... existing entries
            'my-new-widget': resolve(__dirname, 'dev-entry/my-new-widget.ts')
        }
    }
    ```

5. **Deploy tag definition once**:

    ```bash
    # Add tag definition to lib/weather-service-stack.ts
    STAGE=test pnpm run cdk:deploy
    ```

6. **Add to WEB_COMPONENT_URLS**:

    ```bash
    # In apps/pika-chat/.env.local
    WEB_COMPONENT_URLS='...;weather.my-new-widget::http://localhost:5173/my-new-widget.js'
    ```

7. **Develop!**

## Summary

**One-time setup:**

1. Deploy tag definitions to AWS
2. Start dev server: `pnpm run dev:wc`
3. Set `WEB_COMPONENT_URLS` in pika-chat
4. Start pika-chat: `pnpm run dev`

**Daily workflow:**

1. Edit `.svelte` files
2. Save
3. Refresh browser
4. See changes instantly

**When ready to deploy:**

1. `pnpm run build`
2. `STAGE=test pnpm run cdk:deploy`
3. Remove `WEB_COMPONENT_URLS` to test production
