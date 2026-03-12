export default {
  async fetch(request, env) {
    const kvNamespace = "bookmarks";
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Helpers ────────────────────────────────────────────────────────────
    async function hashPassword(password) {
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest("SHA-256", enc.encode(password));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // ── Load settings ──────────────────────────────────────────────────────
    let settings = await env[kvNamespace].get("settings", { type: "json" }) || {};
    const userName = settings.userName || "";
    const weatherLat = settings.weatherLat || "";
    const weatherLon = settings.weatherLon || "";
    const weatherApiKey = settings.weatherApiKey || "";
    const passwordHash = settings.passwordHash || "";

    const needsSetup = !userName || !weatherApiKey || !weatherLat || !weatherLon || !passwordHash;

    let bookmarks = await env[kvNamespace].get("data", { type: "json" }) || [];
    let categories = await env[kvNamespace].get("categories", { type: "json" }) || [
      "3D Printing", "Applications", "Downloads", "Gaming", "Misc", "News", "Shopping"
    ];

    const defaultTheme = {
      bg: "#111111", text: "#ffffff", cardBg: "#222222",
      cardHover: "#2a2a2a", accent: "#4ea3ff", accentHover: "#6bb5ff"
    };
    let theme = await env[kvNamespace].get("theme", { type: "json" }) || defaultTheme;

    // ── Settings API ───────────────────────────────────────────────────────
    if (path === "/api/settings" && request.method === "POST") {
      const body = await request.json();
      if (body.password) {
        body.passwordHash = await hashPassword(body.password);
        delete body.password;
      }
      if (body.confirmPassword) delete body.confirmPassword;
      settings = { ...settings, ...body };
      await env[kvNamespace].put("settings", JSON.stringify(settings));
      return new Response("OK");
    }

    // ── Verify password API (used by padlock) ──────────────────────────────
    if (path === "/api/verify-password" && request.method === "POST") {
      const { password } = await request.json();
      const hash = await hashPassword(password);
      if (hash === passwordHash) return new Response("OK");
      return new Response("Unauthorized", { status: 401 });
    }

    // ── Main page ──────────────────────────────────────────────────────────
    if (path === "/" && request.method === "GET") {
      const osloTime = new Date().toLocaleString("en-GB", { timeZone: "Europe/Oslo" });
      const hour = new Date(osloTime).getHours();
      let greeting = !userName ? "Welcome to BookmarkBam!" :
        hour < 12 ? "Good morning " + userName + "!" :
        hour < 18 ? "Good afternoon " + userName + "!" :
        "Good evening " + userName + "!";

      let weather = null;
      if (weatherApiKey && weatherLat && weatherLon) {
        try {
          const weatherRes = await fetch("https://api.weatherapi.com/v1/current.json?key=" + weatherApiKey + "&q=" + weatherLat + "," + weatherLon + "&aqi=no");
          if (weatherRes.ok) {
            const w = await weatherRes.json();
            weather = { temp: w.current.temp_c, icon: "https:" + w.current.condition.icon };
          }
        } catch (err) {}
      }

      const weatherHTML = weather
        ? `<div class="weather-container"><img class="weather-icon" src="${weather.icon}"><div class="weather-temp">${weather.temp}&deg;C</div></div>`
        : "";

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>BookmarkBam</title>
  <style>
    :root {
      --bg: ${theme.bg}; --text: ${theme.text}; --card-bg: ${theme.cardBg};
      --card-hover: ${theme.cardHover}; --accent: ${theme.accent}; --accent-hover: ${theme.accentHover || theme.accent};
    }
    * { box-sizing: border-box; }
    body { font-family: sans-serif; padding: 20px; background: var(--bg); color: var(--text); margin: 0; }
    .header-container { display: flex; align-items: center; gap: 20px; margin-bottom: 2px; }
    .header-container h1 { margin: 0; }
    .weather-container { display: flex; align-items: center; gap: 8px; }
    .weather-icon { width: 48px; height: 48px; }
    .weather-temp { font-size: 28px; font-weight: bold; }
    .search-container { position: relative; width: 100%; margin: 10px 0 20px 0; }
    #searchBox { width: 100%; padding: 10px 120px 10px 14px; border-radius: 8px; border: none; background: var(--card-bg); color: var(--text); font-size: 16px; box-sizing: border-box; }
    #searchBox:focus { background: var(--card-hover); outline: none; }
    #engineSelect { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: var(--card-hover); color: var(--text); border: none; border-radius: 6px; padding: 4px 8px; font-size: 14px; cursor: pointer; z-index: 2; }
    #engineSelect:focus { outline: 2px solid var(--accent); }
    .category-row { display: grid; grid-template-columns: 135px 1fr; gap: 20px; margin-bottom: -2px; align-items: start; border: 2px solid var(--accent); border-radius: 12px; padding: 15px; }
    .category-row:not(:last-child) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
    .category-row:not(:first-child) { border-top-left-radius: 0; border-top-right-radius: 0; }
    .category-left { font-size: 13px; font-weight: bold; color: var(--text); display: flex; align-items: center; min-height: 31px; transition: color 0.2s; }
    .category-left:hover { color: var(--accent); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .item { background: var(--card-bg); padding: 7px; border-radius: 10px; display: flex; flex-direction: column; gap: 3px; cursor: pointer; min-height: 29px; justify-content: center; touch-action: manipulation; transition: background 0.2s, transform 0.1s; }
    .item:hover, .item:active { background: var(--card-hover); transform: scale(1.02); }
    .item-top { display: flex; align-items: center; gap: 8px; }
    .favicon { width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0; }
    .item-title { font-size: 13px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.2; }
    a, .item-title { color: var(--accent); text-decoration: none; transition: color 0.2s; }
    .item:hover a, .item:hover .item-title { color: var(--accent-hover); }
    .internal-link { font-size: 10px; opacity: 0.7; margin-left: 28px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .delete-btn { margin-left: auto; background: #ff4e4e; border: none; color: white; padding: 3px 7px; border-radius: 6px; cursor: pointer; display: none; font-size: 13px; }
    .edit-mode .delete-btn { display: inline-block; }
    #editToggle { position: fixed; bottom: 20px; right: 20px; background: transparent; padding: 8px; border-radius: 50%; cursor: pointer; font-size: 20px; user-select: none; opacity: 0.25; color: var(--text); transition: opacity 0.2s, transform 0.2s; }
    #editToggle:hover { opacity: 0.5; transform: scale(1.1); }
    #addSection { display: none; }
    .edit-mode #addSection { display: block; }
    form input, form select { padding: 8px; border-radius: 6px; border: none; flex: 1; min-width: 150px; background: var(--card-hover); color: var(--text); }
    form button { padding: 8px 16px; border: none; background: var(--accent); color: white; border-radius: 6px; cursor: pointer; }
    form button:hover { background: var(--accent-hover); }
    #addForm { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    #status { margin-top: 10px; color: var(--accent); }
    #themePanel, #settingsPanel { margin-top: 20px; padding: 16px; background: var(--card-bg); border-radius: 10px; }
    #themePanel h3, #settingsPanel h3 { margin-top: 0; }
    .color-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .color-row label { min-width: 90px; font-size: 13px; }
    .color-row input[type=color] { width: 40px; height: 28px; border: none; border-radius: 4px; cursor: pointer; padding: 2px; }
    .preset-btn { margin-right: 8px; padding: 7px 14px; border: none; border-radius: 6px; background: var(--accent); color: white; cursor: pointer; font-size: 13px; }
    .preset-btn:hover { background: var(--accent-hover); }
    .settings-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .settings-row label { font-size: 12px; opacity: 0.7; }
    .settings-row input { padding: 8px; border-radius: 6px; border: none; background: var(--card-hover); color: var(--text); font-size: 14px; width: 100%; }
    .settings-hint { font-size: 11px; opacity: 0.5; margin-top: 2px; }
    #settingsFeedback { font-size: 12px; min-height: 16px; margin-top: 8px; color: #2ecc71; }
    #settingsFeedback.err { color: #ff4e4e; }
    .section-divider { border: none; border-top: 1px solid var(--card-hover); margin: 18px 0; }

    /* Password prompt modal */
    #pwModal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; }
    #pwModal.hidden { display: none; }
    .pw-box { background: var(--card-bg); border: 2px solid var(--accent); border-radius: 14px; padding: 28px; max-width: 340px; width: 100%; }
    .pw-box h3 { margin: 0 0 6px 0; color: var(--accent); }
    .pw-box p { font-size: 13px; opacity: 0.6; margin: 0 0 18px 0; }
    #pwInput { width: 100%; padding: 10px 12px; border-radius: 8px; border: none; background: var(--card-hover); color: var(--text); font-size: 15px; margin-bottom: 12px; }
    #pwInput:focus { outline: 2px solid var(--accent); }
    #pwSubmit { width: 100%; padding: 10px; background: var(--accent); color: white; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
    #pwSubmit:hover { background: var(--accent-hover); }
    #pwError { color: #ff4e4e; font-size: 12px; margin-top: 8px; min-height: 16px; }

    /* Setup overlay */
    #setupOverlay { position: fixed; inset: 0; background: var(--bg); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; overflow-y: auto; }
    #setupOverlay.hidden { display: none; }
    .setup-box { background: var(--card-bg); border: 2px solid var(--accent); border-radius: 16px; padding: 32px; max-width: 480px; width: 100%; }
    .setup-box h2 { margin-top: 0; color: var(--accent); }
    .setup-box p { font-size: 14px; opacity: 0.75; margin-bottom: 24px; }
    .setup-box .settings-row input { background: var(--bg); }
    #setupSaveBtn { width: 100%; padding: 12px; background: var(--accent); color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; margin-top: 8px; }
    #setupSaveBtn:hover { background: var(--accent-hover); }
    #setupError { color: #ff4e4e; font-size: 13px; margin-top: 8px; min-height: 16px; }

    #categoryManager { margin: 20px 0 0 0; padding: 16px; background: var(--card-bg); border: 1px solid var(--accent); border-radius: 10px; }
    #categoryManager h3 { margin: 0 0 12px 0; font-size: 14px; opacity: 0.85; }
    .cat-tag-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; min-height: 26px; }
    .cat-tag { display: inline-flex; align-items: center; gap: 6px; background: var(--card-hover); border: 1px solid transparent; padding: 4px 8px 4px 12px; border-radius: 20px; font-size: 12px; transition: border-color 0.15s; }
    .cat-tag:hover { border-color: var(--accent); }
    .cat-tag-del { width: 17px; height: 17px; border-radius: 50%; border: none; background: #ff4e4e; color: white; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; }
    .cat-tag-del:hover { background: #c0392b; }
    .cat-divider { border: none; border-top: 1px solid var(--card-hover); margin: 12px 0; }
    .cat-action-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
    .cat-action-row input, .cat-action-row select { padding: 6px 10px; border: none; border-radius: 6px; background: var(--card-hover); color: var(--text); font-size: 13px; flex: 1; min-width: 120px; max-width: 200px; }
    .cat-action-btn { padding: 6px 14px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; color: white; white-space: nowrap; }
    .cat-action-btn:hover { opacity: 0.85; }
    .cat-action-btn.add { background: var(--accent); }
    .cat-action-btn.rename { background: #f39c12; }
    #catFeedback { font-size: 12px; min-height: 16px; margin-top: 4px; }
    #catFeedback.ok { color: #2ecc71; }
    #catFeedback.err { color: #ff4e4e; }
  </style>
</head>
<body>

<!-- PASSWORD MODAL -->
<div id="pwModal" class="hidden">
  <div class="pw-box">
    <h3>🔒 Enter Password</h3>
    <p>Enter your password to access the edit menu</p>
    <input type="password" id="pwInput" placeholder="Password" autofocus>
    <button id="pwSubmit">Unlock →</button>
    <div id="pwError"></div>
  </div>
</div>

<!-- SETUP OVERLAY -->
<div id="setupOverlay" class="${needsSetup ? '' : 'hidden'}">
  <div class="setup-box">
    <h2>👋 Welcome to BookmarkBam</h2>
    <p>Fill in your details to get started. You can update these anytime from the padlock menu.</p>
    <div class="settings-row">
      <label>Your Name</label>
      <input id="setup-name" placeholder="e.g. Alex" value="${userName}">
    </div>
    <div class="settings-row">
      <label>Latitude</label>
      <input id="setup-lat" placeholder="e.g. 59.479668" value="${weatherLat}">
      <div class="settings-hint">Used for weather. Find yours at latlong.net</div>
    </div>
    <div class="settings-row">
      <label>Longitude</label>
      <input id="setup-lon" placeholder="e.g. 10.320253" value="${weatherLon}">
    </div>
    <div class="settings-row">
      <label>WeatherAPI Key</label>
      <input id="setup-apikey" placeholder="Free key from weatherapi.com" value="${weatherApiKey}">
      <div class="settings-hint">Sign up free at weatherapi.com — no credit card needed</div>
    </div>
    <hr class="section-divider">
    <div class="settings-row">
      <label>Password</label>
      <input type="password" id="setup-pw" placeholder="Choose a password for the edit menu">
      <div class="settings-hint">Used to unlock the padlock / edit menu</div>
    </div>
    <div class="settings-row">
      <label>Confirm Password</label>
      <input type="password" id="setup-pw2" placeholder="Repeat your password">
    </div>
    <button id="setupSaveBtn">Save &amp; Get Started →</button>
    <div id="setupError"></div>
  </div>
</div>

<div class="header-container"><h1>${greeting}</h1>${weatherHTML}</div>
<div class="search-container">
  <input id="searchBox" type="text" placeholder="Search bookmarks or web&hellip;">
  <select id="engineSelect">
    <option value="duckduckgo" selected>DuckDuckGo</option>
    <option value="google">Google</option>
    <option value="google-images">Google Images</option>
    <option value="bing">Bing</option>
    <option value="yahoo">Yahoo</option>
    <option value="startpage">Startpage</option>
    <option value="ecosia">Ecosia</option>
    <option value="claude">Claude AI</option>
  </select>
</div>
<div id="bookmarks"></div>
<div id="addSection">
  <h2>Edit / Add Bookmark</h2>
  <form id="addForm">
    <input type="text" id="title" placeholder="Title" required>
    <input type="url" id="url" placeholder="https://example.com" required>
    <input type="url" id="internal" placeholder="Internal address (optional)">
    <input type="text" id="internalText" placeholder="Internal link text (optional)">
    <input type="url" id="customFavicon" placeholder="Custom favicon URL (optional)">
    <select id="category"><option value="">No category</option></select>
    <button id="addButton" type="submit">Add</button>
  </form>
  <p id="status"></p>
  <hr>

  <!-- SETTINGS PANEL -->
  <div id="settingsPanel">
    <h3>⚙️ Settings</h3>
    <div class="settings-row">
      <label>Your Name</label>
      <input id="settings-name" placeholder="e.g. Alex" value="${userName}">
    </div>
    <div class="settings-row">
      <label>Latitude</label>
      <input id="settings-lat" placeholder="e.g. 59.479668" value="${weatherLat}">
    </div>
    <div class="settings-row">
      <label>Longitude</label>
      <input id="settings-lon" placeholder="e.g. 10.320253" value="${weatherLon}">
    </div>
    <div class="settings-row">
      <label>WeatherAPI Key</label>
      <input id="settings-apikey" placeholder="Free key from weatherapi.com" value="${weatherApiKey}">
      <div class="settings-hint">Get a free key at <a href="https://www.weatherapi.com" target="_blank" style="color:var(--accent)">weatherapi.com</a></div>
    </div>
    <button class="preset-btn" id="saveSettingsBtn">Save Settings</button>
    <hr class="section-divider">
    <h3>🔑 Change Password</h3>
    <div class="settings-row">
      <label>New Password</label>
      <input type="password" id="settings-pw" placeholder="New password">
    </div>
    <div class="settings-row">
      <label>Confirm New Password</label>
      <input type="password" id="settings-pw2" placeholder="Repeat new password">
    </div>
    <button class="preset-btn" id="savePasswordBtn">Change Password</button>
    <div id="settingsFeedback"></div>
  </div>

  <hr>
  <div id="categoryManager">
    <h3>&#9881; Manage Categories</h3>
    <div class="cat-tag-list" id="catTagList"></div>
    <hr class="cat-divider">
    <div class="cat-action-row">
      <input id="newCatInput" placeholder="New category name..." maxlength="40">
      <button class="cat-action-btn add" id="addCatBtn">+ Add</button>
    </div>
    <hr class="cat-divider">
    <div class="cat-action-row">
      <select id="renameFromSel"></select>
      <span style="opacity:.4;font-size:12px;flex-shrink:0;">&#8594;</span>
      <input id="renameToCatInput" placeholder="New name..." maxlength="40">
      <button class="cat-action-btn rename" id="renameCatBtn">Rename</button>
    </div>
    <p id="catFeedback"></p>
  </div>
</div>

<div id="editToggle">&#128274;</div>

<div id="themePanel" style="display:none;">
  <h3>Theme Settings</h3>
  <select id="themeSelect">
    <option value="custom">Custom</option><option value="dark-default">Dark Default</option>
    <option value="light">Light</option><option value="deep-blue">Deep Blue</option>
    <option value="forest">Forest Green</option><option value="purple-night">Purple Night</option>
    <option value="solarized-dark">Solarized Dark</option><option value="midnight-blue">Midnight Blue</option>
  </select>
  <div class="color-row"><label>Background</label><input type="color" id="bg-color" value="${theme.bg}"></div>
  <div class="color-row"><label>Text</label><input type="color" id="text-color" value="${theme.text}"></div>
  <div class="color-row"><label>Card/Box</label><input type="color" id="card-bg" value="${theme.cardBg}"></div>
  <div class="color-row"><label>Hover</label><input type="color" id="card-hover" value="${theme.cardHover}"></div>
  <div class="color-row"><label>Accent</label><input type="color" id="accent" value="${theme.accent}"></div>
  <button class="preset-btn" id="saveThemeBtn">Save Theme</button>
  <button class="preset-btn" id="resetThemeBtn">Reset to Default</button>
</div>

<script>
var themes = {
  "dark-default":   {bg:"#111111",text:"#ffffff",cardBg:"#222222",cardHover:"#2a2a2a",accent:"#4ea3ff",accentHover:"#6bb5ff"},
  "light":          {bg:"#f5f5f5",text:"#111111",cardBg:"#ffffff",cardHover:"#e8e8e8",accent:"#0066cc",accentHover:"#3399ff"},
  "deep-blue":      {bg:"#0d1b2a",text:"#e0f0ff",cardBg:"#1b263b",cardHover:"#415a77",accent:"#778da9",accentHover:"#9ab8d9"},
  "forest":         {bg:"#1a2f1a",text:"#e8f5e8",cardBg:"#2e4a2e",cardHover:"#3f6b3f",accent:"#8fbc8f",accentHover:"#a8d5a8"},
  "purple-night":   {bg:"#1a0d2e",text:"#f0e6ff",cardBg:"#2e1a4a",cardHover:"#4a2e6b",accent:"#b19cd9",accentHover:"#d0b8f0"},
  "solarized-dark": {bg:"#002b36",text:"#839496",cardBg:"#073642",cardHover:"#586e75",accent:"#268bd2",accentHover:"#4aa0e0"},
  "midnight-blue":  {bg:"#242B33",text:"#EFFBFF",cardBg:"#242B33",cardHover:"#1D2229",accent:"#67C6CC",accentHover:"#8AD8DD"}
};
var defaultTheme = {bg:"#111111",text:"#ffffff",cardBg:"#222222",cardHover:"#2a2a2a",accent:"#4ea3ff",accentHover:"#6bb5ff"};
var searchEngines = {
  duckduckgo:"https://duckduckgo.com/?q=",google:"https://www.google.com/search?q=",
  "google-images":"https://www.google.com/search?tbm=isch&q=",bing:"https://www.bing.com/search?q=",
  yahoo:"https://search.yahoo.com/search?p=",startpage:"https://www.startpage.com/do/dsearch?query=",
  ecosia:"https://www.ecosia.org/search?q=",claude:"https://claude.ai/new?q="
};
var editMode = false, updateId = null;
window.currentBookmarks = []; window.currentCategories = [];

// ── Setup overlay ──────────────────────────────────────────────────────────
document.getElementById("setupSaveBtn").addEventListener("click", async function() {
  var name   = document.getElementById("setup-name").value.trim();
  var lat    = document.getElementById("setup-lat").value.trim();
  var lon    = document.getElementById("setup-lon").value.trim();
  var apikey = document.getElementById("setup-apikey").value.trim();
  var pw     = document.getElementById("setup-pw").value;
  var pw2    = document.getElementById("setup-pw2").value;
  var err    = document.getElementById("setupError");
  if (!name)           { err.textContent = "Please enter your name."; return; }
  if (!lat || !lon)    { err.textContent = "Please enter your latitude and longitude."; return; }
  if (!apikey)         { err.textContent = "Please enter your WeatherAPI key."; return; }
  if (!pw)             { err.textContent = "Please choose a password."; return; }
  if (pw.length < 6)   { err.textContent = "Password must be at least 6 characters."; return; }
  if (pw !== pw2)      { err.textContent = "Passwords do not match."; return; }
  err.textContent = "";
  await fetch("/api/settings", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({userName:name, weatherLat:lat, weatherLon:lon, weatherApiKey:apikey, password:pw})
  });
  document.getElementById("setupOverlay").classList.add("hidden");
  location.reload();
});

// ── Password modal ─────────────────────────────────────────────────────────
function showPwModal() {
  document.getElementById("pwInput").value = "";
  document.getElementById("pwError").textContent = "";
  document.getElementById("pwModal").classList.remove("hidden");
  setTimeout(function(){ document.getElementById("pwInput").focus(); }, 50);
}
function hidePwModal() {
  document.getElementById("pwModal").classList.add("hidden");
}

async function submitPassword() {
  var pw = document.getElementById("pwInput").value;
  if (!pw) { document.getElementById("pwError").textContent = "Please enter your password."; return; }
  var res = await fetch("/api/verify-password", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({password: pw})
  });
  if (res.ok) {
    hidePwModal();
    enterEditMode();
  } else {
    document.getElementById("pwError").textContent = "Incorrect password.";
    document.getElementById("pwInput").value = "";
    document.getElementById("pwInput").focus();
  }
}

document.getElementById("pwSubmit").addEventListener("click", submitPassword);
document.getElementById("pwInput").addEventListener("keydown", function(e){ if(e.key==="Enter") submitPassword(); });
document.getElementById("pwModal").addEventListener("click", function(e){ if(e.target===this) hidePwModal(); });

// ── Edit mode ──────────────────────────────────────────────────────────────
function enterEditMode() {
  editMode = true;
  document.body.classList.add("edit-mode");
  document.getElementById("editToggle").textContent = "\uD83D\uDD13";
  document.getElementById("themePanel").style.display = "block";
  loadCategories();
}

function exitEditMode() {
  editMode = false;
  document.body.classList.remove("edit-mode");
  document.getElementById("editToggle").textContent = "\uD83D\uDD12";
  document.getElementById("themePanel").style.display = "none";
  updateId = null;
  document.getElementById("addButton").textContent = "Add";
  document.getElementById("addForm").reset();
}

document.getElementById("editToggle").addEventListener("click", function() {
  if (editMode) {
    exitEditMode();
  } else {
    showPwModal();
  }
});

// ── Settings panel ─────────────────────────────────────────────────────────
document.getElementById("saveSettingsBtn").addEventListener("click", async function() {
  var name   = document.getElementById("settings-name").value.trim();
  var lat    = document.getElementById("settings-lat").value.trim();
  var lon    = document.getElementById("settings-lon").value.trim();
  var apikey = document.getElementById("settings-apikey").value.trim();
  await fetch("/api/settings", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({userName:name, weatherLat:lat, weatherLon:lon, weatherApiKey:apikey})
  });
  settingsFeedback("Settings saved! Reloading...", false);
  setTimeout(function(){ location.reload(); }, 1000);
});

document.getElementById("savePasswordBtn").addEventListener("click", async function() {
  var pw  = document.getElementById("settings-pw").value;
  var pw2 = document.getElementById("settings-pw2").value;
  if (!pw)           { settingsFeedback("Enter a new password.", true); return; }
  if (pw.length < 6) { settingsFeedback("Password must be at least 6 characters.", true); return; }
  if (pw !== pw2)    { settingsFeedback("Passwords do not match.", true); return; }
  await fetch("/api/settings", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({password: pw})
  });
  document.getElementById("settings-pw").value = "";
  document.getElementById("settings-pw2").value = "";
  settingsFeedback("Password changed!", false);
});

function settingsFeedback(msg, isErr) {
  var fb = document.getElementById("settingsFeedback");
  fb.textContent = msg; fb.className = isErr ? "err" : "";
  setTimeout(function(){ fb.textContent = ""; fb.className = ""; }, 3000);
}

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme(t){var r=document.documentElement;r.style.setProperty("--bg",t.bg);r.style.setProperty("--text",t.text);r.style.setProperty("--card-bg",t.cardBg);r.style.setProperty("--card-hover",t.cardHover);r.style.setProperty("--accent",t.accent);r.style.setProperty("--accent-hover",t.accentHover||t.accent);}
async function loadTheme(){var res=await fetch("/api/theme");if(res.ok){var s=await res.json();applyTheme(s);document.getElementById("bg-color").value=s.bg;document.getElementById("text-color").value=s.text;document.getElementById("card-bg").value=s.cardBg;document.getElementById("card-hover").value=s.cardHover;document.getElementById("accent").value=s.accent;}}
async function saveTheme(){var t={bg:document.getElementById("bg-color").value,text:document.getElementById("text-color").value,cardBg:document.getElementById("card-bg").value,cardHover:document.getElementById("card-hover").value,accent:document.getElementById("accent").value,accentHover:document.getElementById("accent").value};await fetch("/api/theme",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});applyTheme(t);}
function applyPreset(){var s=document.getElementById("themeSelect").value;if(s==="custom")return;var p=themes[s];if(p){document.getElementById("bg-color").value=p.bg;document.getElementById("text-color").value=p.text;document.getElementById("card-bg").value=p.cardBg;document.getElementById("card-hover").value=p.cardHover;document.getElementById("accent").value=p.accent;saveTheme();}}
loadTheme();
document.getElementById("themeSelect").addEventListener("change",applyPreset);
document.getElementById("saveThemeBtn").addEventListener("click",saveTheme);
document.getElementById("resetThemeBtn").addEventListener("click",async function(){await fetch("/api/theme",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(defaultTheme)});location.reload();});

// ── Categories ─────────────────────────────────────────────────────────────
async function loadCategories(){try{var res=await fetch("/api/categories");window.currentCategories=await res.json();window.currentCategories.sort(function(a,b){return a.localeCompare(b);});rebuildCategoryUI();}catch(err){console.error(err);}}
function rebuildCategoryUI(){var sel=document.getElementById("category");var prev=sel.value;sel.innerHTML='<option value="">No category</option>';window.currentCategories.forEach(function(c){var o=document.createElement("option");o.value=o.textContent=c;sel.appendChild(o);});if(prev)sel.value=prev;var rfSel=document.getElementById("renameFromSel");var rfPrev=rfSel.value;rfSel.innerHTML="";window.currentCategories.forEach(function(c){var o=document.createElement("option");o.value=o.textContent=c;rfSel.appendChild(o);});if(rfPrev)rfSel.value=rfPrev;var tl=document.getElementById("catTagList");tl.innerHTML="";if(!window.currentCategories.length){tl.innerHTML='<span style="opacity:.45;font-size:12px;">No categories yet.</span>';return;}window.currentCategories.forEach(function(c){var t=document.createElement("div");t.className="cat-tag";t.innerHTML='<span>'+escHtml(c)+'</span><button class="cat-tag-del" data-cat="'+escHtml(c)+'" title="Delete">\u00d7</button>';tl.appendChild(t);});}
document.getElementById("catTagList").addEventListener("click",async function(e){if(!e.target.classList.contains("cat-tag-del"))return;var cat=e.target.dataset.cat;if(!confirm('Delete category "'+cat+'"?'))return;var r=await fetch("/api/categories/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:cat})});if(r.ok){catMsg('"'+cat+'" deleted.',"ok");await loadCategories();await load();}else catMsg("Error.","err");});
document.getElementById("addCatBtn").addEventListener("click",async function(){var name=document.getElementById("newCatInput").value.trim();if(!name)return catMsg("Enter a name.","err");if(window.currentCategories.map(function(c){return c.toLowerCase();}).includes(name.toLowerCase()))return catMsg('"'+name+'" exists.',"err");var r=await fetch("/api/categories/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name})});if(r.ok){document.getElementById("newCatInput").value="";catMsg('"'+name+'" added!',"ok");await loadCategories();}else catMsg("Error.","err");});
document.getElementById("renameCatBtn").addEventListener("click",async function(){var from=document.getElementById("renameFromSel").value;var to=document.getElementById("renameToCatInput").value.trim();if(!from)return catMsg("Select a category.","err");if(!to)return catMsg("Enter a new name.","err");if(from===to)return catMsg("Same name.","err");if(window.currentCategories.map(function(c){return c.toLowerCase();}).includes(to.toLowerCase()))return catMsg('"'+to+'" exists.',"err");var r=await fetch("/api/categories/rename",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({from:from,to:to})});if(r.ok){document.getElementById("renameToCatInput").value="";catMsg('Renamed.',"ok");await loadCategories();await load();}else catMsg("Error.","err");});
var catMsgTimer;
function catMsg(msg,type){var el=document.getElementById("catFeedback");el.textContent=msg;el.className=type;clearTimeout(catMsgTimer);catMsgTimer=setTimeout(function(){el.textContent="";el.className="";},3500);}
function escHtml(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

// ── Bookmarks ──────────────────────────────────────────────────────────────
function renderBookmarks(data){renderBookmarksInContainer(data,document.getElementById("bookmarks"));}
function renderBookmarksInContainer(data,container){container.innerHTML="";var groups={};data.forEach(function(b){var cat=b.category||"Uncategorised";if(!groups[cat])groups[cat]=[];groups[cat].push(b);});Object.keys(groups).sort().forEach(function(category){var row=document.createElement("div");row.className="category-row";var left=document.createElement("div");left.className="category-left";left.textContent=category;var right=document.createElement("div");right.className="category-right";var grid=document.createElement("div");grid.className="grid";groups[category].sort(function(a,b){return a.title.localeCompare(b.title);}).forEach(function(b){var div=document.createElement("div");div.className="item";div.dataset.url=b.url;div.dataset.id=b.id;var favicon=b.customFavicon||("https://www.google.com/s2/favicons?domain="+new URL(b.url).hostname+"&sz=64");var ih="";if(b.internal){ih='<a class="internal-link" href="'+b.internal+'" target="_blank">'+(b.internalText||b.internal)+"</a>";}div.innerHTML='<div class="item-top" data-id="'+b.id+'"><img src="'+favicon+'" class="favicon"><span class="item-title">'+b.title+'</span><button class="delete-btn" data-id="'+b.id+'">\u2716</button></div>'+ih;grid.appendChild(div);});right.appendChild(grid);row.appendChild(left);row.appendChild(right);container.appendChild(row);});}

async function load(){var res=await fetch("/api/bookmarks");window.currentBookmarks=await res.json();renderBookmarks(window.currentBookmarks);}
load();
document.getElementById("searchBox").value="";
document.getElementById("searchBox").focus();

// ── Keyboard navigation ────────────────────────────────────────────────────
var selectedBookmarkIndex=-1;
function getVisibleBookmarks(){return Array.from(document.querySelectorAll(".item")).filter(function(i){return i.offsetParent!==null;});}
function highlightBookmark(index){var bms=getVisibleBookmarks();bms.forEach(function(b){b.style.outline="";});if(index>=0&&index<bms.length){bms[index].style.outline="3px solid var(--accent)";bms[index].scrollIntoView({behavior:"smooth",block:"nearest"});selectedBookmarkIndex=index;}}
document.addEventListener("keydown",function(e){if(document.activeElement.id==="searchBox"&&selectedBookmarkIndex===-1)return;var bms=getVisibleBookmarks();if(!bms.length)return;var cols=Math.floor(((document.querySelector(".grid")||{}).offsetWidth||800)/170);switch(e.key){case"ArrowDown":e.preventDefault();highlightBookmark(selectedBookmarkIndex<0?0:Math.min(selectedBookmarkIndex+cols,bms.length-1));break;case"ArrowUp":e.preventDefault();highlightBookmark(selectedBookmarkIndex<0?bms.length-1:Math.max(selectedBookmarkIndex-cols,0));break;case"ArrowRight":e.preventDefault();highlightBookmark(selectedBookmarkIndex<0?0:Math.min(selectedBookmarkIndex+1,bms.length-1));break;case"ArrowLeft":e.preventDefault();highlightBookmark(selectedBookmarkIndex<0?bms.length-1:Math.max(selectedBookmarkIndex-1,0));break;case"Enter":e.preventDefault();if(selectedBookmarkIndex>=0){var u=bms[selectedBookmarkIndex].dataset.url;if(u)window.open(u,"_blank");}break;case"Escape":highlightBookmark(-1);selectedBookmarkIndex=-1;document.getElementById("searchBox").blur();break;}});

document.getElementById("searchBox").addEventListener("input",function(){var q=this.value.toLowerCase().trim();renderBookmarks(window.currentBookmarks.filter(function(b){return b.title.toLowerCase().includes(q)||b.url.toLowerCase().includes(q)||(b.internal&&b.internal.toLowerCase().includes(q))||(b.internalText&&b.internalText.toLowerCase().includes(q));}));selectedBookmarkIndex=-1;getVisibleBookmarks().forEach(function(b){b.style.outline="";});});
document.getElementById("searchBox").addEventListener("keydown",function(e){if(e.key!=="Enter")return;e.preventDefault();var q=this.value.trim();if(!q)return;var engine=document.getElementById("engineSelect").value;var baseUrl=searchEngines[engine]||searchEngines.duckduckgo;var filtered=window.currentBookmarks.filter(function(b){return b.title.toLowerCase().includes(q.toLowerCase())||b.url.toLowerCase().includes(q.toLowerCase())||(b.internal&&b.internal.toLowerCase().includes(q.toLowerCase()))||(b.internalText&&b.internalText.toLowerCase().includes(q.toLowerCase()));});if(filtered.length===1)window.open(filtered[0].url,"_blank");else window.location.href=baseUrl+encodeURIComponent(q);});

document.getElementById("addForm").addEventListener("submit",async function(e){e.preventDefault();var payload={title:document.getElementById("title").value,url:document.getElementById("url").value,internal:document.getElementById("internal").value,internalText:document.getElementById("internalText").value,customFavicon:document.getElementById("customFavicon").value,category:document.getElementById("category").value};if(updateId){payload.id=updateId;await fetch("/api/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});updateId=null;document.getElementById("addButton").textContent="Add";}else{await fetch("/api/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}document.getElementById("addForm").reset();document.getElementById("status").textContent="Saved!";setTimeout(function(){document.getElementById("status").textContent="";},2000);await load();});
document.addEventListener("click",async function(e){if(e.target.classList.contains("delete-btn")){e.stopPropagation();if(confirm("Delete this bookmark?")){await fetch("/api/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:e.target.dataset.id})});await load();}return;}});
document.addEventListener("click",function(e){if(e.target.classList.contains("delete-btn")||e.target.classList.contains("internal-link")||e.target.closest(".internal-link"))return;var item=e.target.closest(".item");if(!item)return;if(editMode){var b=window.currentBookmarks.find(function(x){return x.id===item.dataset.id;});if(!b)return;document.getElementById("title").value=b.title;document.getElementById("url").value=b.url;document.getElementById("internal").value=b.internal||"";document.getElementById("internalText").value=b.internalText||"";document.getElementById("customFavicon").value=b.customFavicon||"";document.getElementById("category").value=b.category||"";updateId=item.dataset.id;document.getElementById("addButton").textContent="Update";}else{window.open(item.dataset.url,"_blank");}});
<\/script>
</body>
</html>`;

      return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    if (path === "/api/bookmarks" && request.method === "GET") return new Response(JSON.stringify(bookmarks), { headers: { "Content-Type": "application/json" } });
    if (path === "/api/add" && request.method === "POST") { const body = await request.json(); if (!body.title || !body.url) return new Response("Invalid", { status: 400 }); const id = Date.now().toString(36) + Math.random().toString(36).slice(2); bookmarks.push({ id, ...body }); await env[kvNamespace].put("data", JSON.stringify(bookmarks)); return new Response("OK"); }
    if (path === "/api/update" && request.method === "POST") { const body = await request.json(); if (!body.id) return new Response("Invalid", { status: 400 }); bookmarks = bookmarks.map(b => b.id === body.id ? { ...b, ...body } : b); await env[kvNamespace].put("data", JSON.stringify(bookmarks)); return new Response("OK"); }
    if (path === "/api/delete" && request.method === "POST") { const { id } = await request.json(); bookmarks = bookmarks.filter(b => b.id !== id); await env[kvNamespace].put("data", JSON.stringify(bookmarks)); return new Response("OK"); }
    if (path === "/api/categories" && request.method === "GET") return new Response(JSON.stringify(categories), { headers: { "Content-Type": "application/json" } });
    if (path === "/api/categories/add" && request.method === "POST") { const { name } = await request.json(); if (!name?.trim()) return new Response("Invalid", { status: 400 }); const trimmed = name.trim(); if (categories.map(c => c.toLowerCase()).includes(trimmed.toLowerCase())) return new Response("Exists", { status: 409 }); categories.push(trimmed); await env[kvNamespace].put("categories", JSON.stringify(categories)); return new Response("OK"); }
    if (path === "/api/categories/rename" && request.method === "POST") { const { from, to } = await request.json(); if (!from || !to || from === to) return new Response("Invalid", { status: 400 }); if (!categories.includes(from)) return new Response("Not found", { status: 404 }); if (categories.map(c => c.toLowerCase()).includes(to.toLowerCase())) return new Response("Conflict", { status: 409 }); categories = categories.map(c => c === from ? to : c); bookmarks = bookmarks.map(b => ({ ...b, category: b.category === from ? to : b.category })); await env[kvNamespace].put("categories", JSON.stringify(categories)); await env[kvNamespace].put("data", JSON.stringify(bookmarks)); return new Response("OK"); }
    if (path === "/api/categories/delete" && request.method === "POST") { const { name } = await request.json(); if (!name || !categories.includes(name)) return new Response("Not found", { status: 404 }); categories = categories.filter(c => c !== name); bookmarks = bookmarks.map(b => ({ ...b, category: b.category === name ? "" : b.category })); await env[kvNamespace].put("categories", JSON.stringify(categories)); await env[kvNamespace].put("data", JSON.stringify(bookmarks)); return new Response("OK"); }
    if (path === "/api/theme" && request.method === "GET") return new Response(JSON.stringify(theme), { headers: { "Content-Type": "application/json" } });
    if (path === "/api/theme" && request.method === "POST") { const t = await request.json(); await env[kvNamespace].put("theme", JSON.stringify(t)); return new Response("OK"); }
    return new Response("Not found", { status: 404 });
  }
};
