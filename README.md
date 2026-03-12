# BookmarkBam 🔖

A fast, personal bookmark manager that runs entirely on **Cloudflare Workers** — no server, no database, no subscription. Your bookmarks live in Cloudflare's global KV store, accessible from anywhere.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/danieljcroberts/BookmarkBam)

---

## Features

- 📁 **Category organisation** — group bookmarks your way, rename or delete categories anytime
- 🔍 **Instant search** — filter bookmarks or launch a web search from the same box
- 🌤️ **Live weather** — shows current conditions for your location
- 🎨 **Theming** — choose from built-in themes or customise every colour
- 🔗 **Dual links** — store both an external and internal URL per bookmark (great for self-hosted services)
- ⌨️ **Keyboard navigation** — arrow keys, Enter to open, Escape to clear
- 📱 **Mobile friendly** — works on any screen size

---

## Deploy

### Option 1 — One Click (No coding required)

1. Click the **Deploy** button above
2. Connect your GitHub account and Cloudflare account when prompted
3. Follow the setup wizard — it will fork the repo and deploy the worker automatically

> **One manual step required after deployment:**
> Go to **Cloudflare Dashboard → Workers & Pages → KV**, create a namespace called `bookmarks`, copy the ID, and paste it into `wrangler.toml` under `id = "..."`. Then redeploy.

---

### Option 2 — Wrangler CLI

```bash
# 1. Install Wrangler
npm install -g wrangler

# 2. Log in to Cloudflare
wrangler login

# 3. Create the KV namespace
wrangler kv namespace create dan_bookmarks
# → Copy the ID from the output

# 4. Paste the ID into wrangler.toml
#    Find: id = "REPLACE_WITH_YOUR_KV_ID"
#    Replace with your actual ID

# 5. Deploy
wrangler deploy
```

---

## Configuration

Open `bookmarkbamdesktop.js` and edit these lines at the top of the file:

```js
const userName = "Dan";              // Your name — used in the greeting
const weatherLat = 59.479668;        // Your latitude
const weatherLon = 10.32025375;      // Your longitude
const weatherApiKey = "YOUR_KEY";    // Free key from weatherapi.com
```

To get a free weather API key, sign up at [weatherapi.com](https://www.weatherapi.com) — no credit card required.

---

## Project Structure

```
BookmarkBam/
├── bookmarkbamdesktop.js   # The entire worker — all logic and UI in one file
├── wrangler.toml           # Cloudflare Workers config
├── package.json            # Node dependencies (just Wrangler)
└── README.md
```

---

## How It Works

BookmarkBam is a single Cloudflare Worker that:
- Serves a full HTML page with embedded CSS and JavaScript
- Stores all bookmark, category, and theme data in **Cloudflare KV**
- Fetches live weather from WeatherAPI on each page load
- Requires no backend framework, no build step, and no database

---

## License

MIT — do whatever you like with it.
