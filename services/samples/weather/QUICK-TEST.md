# Quick Test - Verify Dev Setup Works

This guide helps you verify the dev workflow is working correctly.

## Step 1: Build the Components

```bash
cd services/samples/weather
pnpm run dev:wc
```

You should see output like:

```
vite v5.x.x building for production...
✓ 324 modules transformed.
dev-dist/favorite-cities.js  XXX kB │ gzip: XX kB
dev-dist/city-selector.js    XXX kB │ gzip: XX kB
...
built in Xms.

watching for file changes...
```

Leave this running. It's now watching for changes.

## Step 2: Serve the Components

In a **new terminal**:

```bash
cd services/samples/weather
pnpm run serve:wc
```

You should see:

```
   ┌───────────────────────────────────────┐
   │                                       │
   │   Serving!                            │
   │                                       │
   │   - Local:    http://localhost:5173   │
   │   - Network:  http://192.168.x.x:5173 │
   │                                       │
   │   Copied local address to clipboard!  │
   │                                       │
   └───────────────────────────────────────┘
```

## Step 3: Verify Components Are Accessible

Open your browser and visit:

**http://localhost:5173/favorite-cities.js**

You should see **JavaScript code** that starts something like:

```javascript
var _export_sfc = (sfc, props) => {
  const target = sfc.__vccOpts || sfc;
  for (const [key, val] of props) {
    target[key] = val;
  }
  return target;
};
import { SvelteElement as S, append_hydration as v, attribute as E, ...
```

**If you see HTML instead of JavaScript, something is wrong!**

Try the other components too:

- http://localhost:5173/city-selector.js
- http://localhost:5173/weather-alerts.js

All should return JavaScript code.

## Step 4: Test Hot Reloading

Keep terminals 1 and 2 running.

Edit a component:

```bash
# In your editor, open:
services/samples/weather/src/webcomponent/lib/widgets/favorite-cities.svelte

# Change line 185 (the h3 title) to:
<h3 class="text-base font-semibold m-0">My AWESOME Favorite Cities</h3>

# Save the file
```

Watch terminal 1. You should see:

```
vite v5.x.x building for production...
✓ 234 modules transformed.
dev-dist/favorite-cities.js  XXX kB │ gzip: XX kB
built in 1.2s
```

Now visit: http://localhost:5173/favorite-cities.js

Search for "AWESOME" in the page (Cmd+F / Ctrl+F). You should find it in the JavaScript!

## Step 5: Test in Pika Chat

Now let's test in the actual app.

### 5a. Set Environment Variable

Create or edit `apps/pika-chat/.env.local`:

```bash
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js'
```

### 5b. Start Pika Chat

In a **new terminal** (3rd terminal):

```bash
cd apps/pika-chat
pnpm run dev
```

Wait for it to start, then open: http://localhost:3000

### 5c. Verify Component Loads

1. Log into pika-chat
2. Go to a chat that has the weather widgets
3. Look at the spotlight widgets at the top
4. You should see "My AWESOME Favorite Cities" if you made that change!

### 5d. Test Live Updates

1. Edit `favorite-cities.svelte` again - change "AWESOME" to "SUPER COOL"
2. Save the file
3. Watch terminal 1 rebuild (takes ~2 seconds)
4. Refresh your browser at localhost:3000
5. You should now see "My SUPER COOL Favorite Cities"

## Troubleshooting

### "Cannot GET /favorite-cities.js" (404 error)

The serve command didn't start properly or isn't serving the right directory.

Fix:

```bash
# Kill the serve process (Ctrl+C)
# Verify files exist:
ls dev-dist/

# You should see favorite-cities.js, city-selector.js, etc.
# If not, the build didn't work. Check terminal 1 for errors.

# Restart serve:
pnpm run serve:wc
```

### Seeing HTML instead of JavaScript

Vite's dev server is running instead of the build server.

Fix:

```bash
# Make sure you're NOT running: pnpm run dev
# You should be running: pnpm run dev:wc (build watch)
# And: pnpm run serve:wc (static server)
```

### Changes not appearing

1. Check terminal 1 - did it rebuild?
2. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
3. Check browser DevTools → Network tab - is it loading from `localhost:5173`?
4. Check `.env.local` has the correct URL

### CORS errors in browser console

The serve command needs --cors flag:

```bash
# Should be:
npx serve dev-dist -p 5173 --cors

# Check package.json has:
"serve:wc": "npx serve dev-dist -p 5173 --cors"
```

## Success!

If you can:

1. ✅ See JavaScript at http://localhost:5173/favorite-cities.js
2. ✅ Edit a `.svelte` file and see rebuild in terminal 1
3. ✅ Refresh browser and see changes in pika-chat

Then your dev workflow is working perfectly! 🎉

Now go build amazing web components with instant(ish) feedback!
