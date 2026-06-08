# World Cup Match Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean static World Cup styled football match radar dashboard with single-match predictions, daily parlay plans, live probability simulation, hit tracking, and tomorrow preparation.

**Architecture:** The first version is a dependency-free static web app. `index.html` defines the dashboard shell, `styles.css` owns the World Cup broadcast visual system, `script.js` owns state/rendering/probability helpers, and `data/matches.json` provides deterministic mock match data.

**Tech Stack:** HTML, CSS, vanilla JavaScript, local JSON data, Git, PowerShell, optional static server for verification.

---

## File Structure

- Keep: `docs/superpowers/specs/2026-06-08-world-cup-match-radar-design.md`
- Keep: `docs/superpowers/plans/2026-06-08-world-cup-match-radar.md`
- Replace: `index.html`
- Replace: `styles.css`
- Replace: `script.js`
- Create: `data/matches.json`
- Create: `README.md`
- Remove from workspace: `.chrome-cdp/`, `.chrome-preview/`, `preview.png`, `preview-desktop.png`, `preview-less-ai.png`, `preview-mobile.png`

The old demo is not tracked by Git. Remove it before building the new dashboard so the first implementation commit contains only the intended project files.

---

### Task 1: Clean Old Demo And Add Project Metadata

**Files:**
- Delete: `.chrome-cdp/`
- Delete: `.chrome-preview/`
- Delete: `preview.png`
- Delete: `preview-desktop.png`
- Delete: `preview-less-ai.png`
- Delete: `preview-mobile.png`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `script.js`
- Create: `README.md`

- [ ] **Step 1: Remove untracked preview assets and old browser folders**

Run:

```powershell
Remove-Item -Recurse -Force .chrome-cdp, .chrome-preview
Remove-Item -Force preview.png, preview-desktop.png, preview-less-ai.png, preview-mobile.png
```

Expected: files are removed. If a path is already missing, skip it and continue.

- [ ] **Step 2: Create README**

Write this content to `README.md`:

```markdown
# World Cup Match Radar

A static World Cup styled football match radar for match analysis, daily prediction cards, parlay plans, live probability simulation, and tomorrow preparation.

The first version uses mock data only. Predictions are model-style estimates for product design and workflow testing, not betting guarantees.

## Modules

- Near-two-day match board
- Single-match win/draw/loss, over/under, and half/full-time analysis
- Daily parlay strategy center
- Today hit tracker
- Tomorrow preparation pool

## Run

Open `index.html` in a browser, or serve the folder with any static file server.
```

- [ ] **Step 3: Commit cleanup metadata when implementation files exist**

Do not commit immediately in this task because `index.html`, `styles.css`, `script.js`, and `data/matches.json` are replaced in later tasks.

---

### Task 2: Add Mock Match Data

**Files:**
- Create: `data/matches.json`

- [ ] **Step 1: Create the data directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path data
```

Expected: `data/` exists.

- [ ] **Step 2: Add deterministic mock data**

Create `data/matches.json` with matches, parlays, hit history, and tomorrow watchlist. Use stable probabilities so the UI can verify calculations.

Required top-level keys:

```json
{
  "generatedAt": "2026-06-08T12:00:00+08:00",
  "matches": [],
  "parlaySeeds": [],
  "history": [],
  "tomorrowPool": []
}
```

Each match object must include:

```json
{
  "id": "001",
  "date": "2026-06-08",
  "kickoff": "20:00",
  "competition": "World Cup Group Stage",
  "homeTeam": "France",
  "awayTeam": "Denmark",
  "status": "pre",
  "score": { "home": null, "away": null },
  "minute": null,
  "tags": ["focus", "goal-trend"],
  "dataQuality": 91,
  "importance": 87,
  "risk": "Medium",
  "odds": { "home": 1.86, "draw": 3.35, "away": 4.20, "over25": 1.92, "under25": 1.78 },
  "stats": { "form": "W W D W L", "attack": 84, "defense": 78, "tempo": 72, "homeAway": "Home edge +8" },
  "markets": {
    "wdl": { "pick": "Home Win", "probability": 0.62, "confidence": 78, "risk": "Medium", "reason": "France carry the stronger attack profile and better late-game pressure." },
    "ou": { "line": 2.5, "pick": "Over", "probability": 0.59, "confidence": 73, "risk": "Medium", "reason": "Both sides trend above league average in shot creation." },
    "htft": { "pick": "Draw/Home", "probability": 0.36, "confidence": 62, "risk": "High", "reason": "Denmark often hold compact early before pressure rises after halftime." }
  }
}
```

Add at least 8 matches across today and tomorrow, including at least 1 live match and 1 finished match.

- [ ] **Step 3: Verify JSON parses**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('data/matches.json','utf8')); console.log('matches json ok')"
```

Expected:

```text
matches json ok
```

---

### Task 3: Replace HTML Shell

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace `index.html` with the dashboard shell**

Use a semantic app structure:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>World Cup Match Radar</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="app-shell">
      <header class="top-nav" aria-label="Dashboard navigation">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true"></span>
          <div>
            <p>World Cup Desk</p>
            <h1>世界杯赛事雷达</h1>
          </div>
        </div>
        <div class="nav-stats">
          <span id="matchCount">0 场赛事</span>
          <span id="refreshTime">等待数据</span>
          <span class="live-pill">LIVE</span>
        </div>
      </header>

      <section class="dashboard-grid" aria-label="Match radar dashboard">
        <aside class="match-rail" aria-label="Near two day matches">
          <div class="section-heading">
            <p>Fixture Board</p>
            <h2>近两日赛程</h2>
          </div>
          <div class="filter-tabs" role="tablist" aria-label="Date filter">
            <button class="tab is-active" type="button" data-filter="all">全部</button>
            <button class="tab" type="button" data-filter="today">今日</button>
            <button class="tab" type="button" data-filter="tomorrow">明日</button>
          </div>
          <div id="matchList" class="match-list" aria-live="polite"></div>
        </aside>

        <section class="analysis-panel" aria-label="Selected match analysis">
          <div id="matchAnalysis"></div>
        </section>

        <aside class="parlay-panel" aria-label="Daily parlay strategy center">
          <div class="section-heading">
            <p>Strategy Center</p>
            <h2>每日串单</h2>
          </div>
          <div id="parlayList" class="parlay-list"></div>
        </aside>
      </section>

      <section class="lower-grid" aria-label="Tracking and tomorrow preparation">
        <article class="review-panel">
          <div class="section-heading">
            <p>Result Tracker</p>
            <h2>今日命中追踪</h2>
          </div>
          <div id="hitTracker" class="hit-tracker"></div>
        </article>

        <article class="tomorrow-panel">
          <div class="section-heading">
            <p>Next Day Prep</p>
            <h2>明日预选池</h2>
          </div>
          <div id="tomorrowPool" class="tomorrow-pool"></div>
        </article>
      </section>
    </main>
    <script src="./script.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify the page shell has all target IDs**

Run:

```powershell
rg -n "matchList|matchAnalysis|parlayList|hitTracker|tomorrowPool" index.html
```

Expected: all five IDs are found.

---

### Task 4: Implement Probability Engine And Rendering

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Add application state and data loading**

Implement:

```javascript
const state = {
  matches: [],
  selectedId: null,
  filter: "all",
  data: null,
  tick: 0,
};

const els = {
  matchCount: document.querySelector("#matchCount"),
  refreshTime: document.querySelector("#refreshTime"),
  matchList: document.querySelector("#matchList"),
  matchAnalysis: document.querySelector("#matchAnalysis"),
  parlayList: document.querySelector("#parlayList"),
  hitTracker: document.querySelector("#hitTracker"),
  tomorrowPool: document.querySelector("#tomorrowPool"),
  tabs: [...document.querySelectorAll("[data-filter]")],
};

async function loadData() {
  const response = await fetch("./data/matches.json");
  if (!response.ok) throw new Error("Unable to load match data");
  state.data = await response.json();
  state.matches = state.data.matches;
  state.selectedId = state.matches[0]?.id ?? null;
  render();
}
```

- [ ] **Step 2: Add probability helpers**

Implement:

```javascript
function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function liveProbability(base, match) {
  const statusBoost = match.status === "live" ? Math.sin(state.tick / 2 + Number(match.id)) * 0.035 : 0;
  const finishedBoost = match.status === "finished" ? 0 : statusBoost;
  return clamp(base + finishedBoost, 0.08, 0.92);
}

function allHitProbability(picks) {
  return picks.reduce((product, pick) => product * pick.probability, 1);
}

function atLeastProbability(probabilities, requiredHits) {
  let total = 0;
  const combinations = 1 << probabilities.length;
  for (let mask = 0; mask < combinations; mask += 1) {
    let hits = 0;
    let probability = 1;
    probabilities.forEach((p, index) => {
      const hit = Boolean(mask & (1 << index));
      hits += hit ? 1 : 0;
      probability *= hit ? p : 1 - p;
    });
    if (hits >= requiredHits) total += probability;
  }
  return total;
}
```

- [ ] **Step 3: Add render functions**

Implement render functions for:

- `renderMatchList()`
- `renderAnalysis()`
- `renderParlays()`
- `renderHitTracker()`
- `renderTomorrowPool()`
- `render()`

Each render function must read from `state.data` and replace inner HTML of the relevant container.

- [ ] **Step 4: Add interactions and timer**

Implement:

```javascript
els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.filter = tab.dataset.filter;
    els.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    renderMatchList();
  });
});

window.addEventListener("click", (event) => {
  const row = event.target.closest("[data-match-id]");
  if (!row) return;
  state.selectedId = row.dataset.matchId;
  render();
});

setInterval(() => {
  state.tick += 1;
  renderAnalysis();
  renderParlays();
}, 3000);

loadData().catch((error) => {
  els.matchAnalysis.innerHTML = `<div class="empty-state">${error.message}</div>`;
});
```

- [ ] **Step 5: Verify helper functions in Node**

Run:

```powershell
node -e "const probs=[0.62,0.58,0.54];let total=0;for(let m=0;m<(1<<probs.length);m++){let h=0,p=1;probs.forEach((x,i)=>{const hit=Boolean(m&(1<<i));h+=hit?1:0;p*=hit?x:1-x});if(h>=2)total+=p} console.log(total.toFixed(3))"
```

Expected:

```text
0.619
```

---

### Task 5: Add World Cup Broadcast Styling

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Replace CSS with the visual system**

Define:

```css
:root {
  color-scheme: dark;
  --pitch: #061c14;
  --pitch-2: #0c3325;
  --ink: #f7fff6;
  --muted: #a9c3b7;
  --line: rgba(255, 255, 255, 0.14);
  --gold: #d8b45d;
  --gold-2: #f4d27a;
  --home: #e4444e;
  --away: #3f8cff;
  --green: #40d47e;
  --panel: rgba(9, 28, 22, 0.9);
  --panel-2: rgba(14, 43, 34, 0.84);
}
```

Required layout classes:

- `.app-shell`
- `.top-nav`
- `.dashboard-grid`
- `.match-rail`
- `.analysis-panel`
- `.parlay-panel`
- `.lower-grid`
- `.review-panel`
- `.tomorrow-panel`

Required component classes:

- `.match-card`
- `.score-chip`
- `.status-pill`
- `.market-grid`
- `.probability-bar`
- `.parlay-card`
- `.risk-low`
- `.risk-medium`
- `.risk-high`
- `.watch-card`

- [ ] **Step 2: Add responsive behavior**

Add media queries:

```css
@media (max-width: 1180px) {
  .dashboard-grid,
  .lower-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .top-nav,
  .nav-stats,
  .match-card,
  .analysis-header {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Verify required classes exist**

Run:

```powershell
rg -n "app-shell|dashboard-grid|match-card|parlay-card|probability-bar|watch-card" styles.css
```

Expected: all required class names are found.

---

### Task 6: Browser Verification

**Files:**
- No source changes unless verification reveals a bug.

- [ ] **Step 1: Start a static server**

Run:

```powershell
python -m http.server 4173
```

Expected: server starts at `http://localhost:4173`.

- [ ] **Step 2: Open in browser**

Use the Browser plugin to open:

```text
http://localhost:4173
```

Expected:

- Dashboard loads.
- No garbled Chinese.
- Match list is visible.
- Center analysis has selected match data.
- Parlay cards show probabilities.
- Tomorrow pool appears.

- [ ] **Step 3: Click a match**

Click a different match in the left rail.

Expected:

- Selected row changes state.
- Center panel updates teams, markets, confidence, and risk.

- [ ] **Step 4: Check mobile viewport**

Use a narrow viewport around 390px width.

Expected:

- No incoherent text overlap.
- Cards stack vertically.
- Buttons and tags remain readable.

---

### Task 7: Commit And Push Implementation

**Files:**
- Stage: `README.md`
- Stage: `index.html`
- Stage: `styles.css`
- Stage: `script.js`
- Stage: `data/matches.json`
- Stage: `docs/superpowers/plans/2026-06-08-world-cup-match-radar.md`

- [ ] **Step 1: Verify working tree**

Run:

```powershell
git status -sb
```

Expected: only intended implementation files are modified or untracked.

- [ ] **Step 2: Stage intended files**

Run:

```powershell
git add README.md index.html styles.css script.js data/matches.json docs/superpowers/plans/2026-06-08-world-cup-match-radar.md
```

- [ ] **Step 3: Commit**

Run:

```powershell
git commit -m "Build World Cup match radar dashboard"
```

- [ ] **Step 4: Push**

Run:

```powershell
git push
```

Expected: commit appears on `origin/main`.

---

## Self-Review

Spec coverage:

- World Cup visual direction: covered by Task 5.
- Static dashboard first screen: covered by Tasks 3, 4, and 5.
- Near-two-day matches: covered by Task 2 and Task 4.
- Single-match predictions: covered by Task 2 and Task 4.
- Daily parlay cards: covered by Task 2 and Task 4.
- Probability and hit tracking: covered by Task 4.
- Tomorrow preparation pool: covered by Task 2 and Task 4.
- Error handling for data load failure: covered by Task 4.
- Browser verification: covered by Task 6.
- Commit and push: covered by Task 7.

Red-flag scan:

- The plan intentionally avoids empty markers and vague implementation steps.

Type consistency:

- Data keys are stable across tasks: `matches`, `parlaySeeds`, `history`, `tomorrowPool`, `markets`, `wdl`, `ou`, `htft`.
- DOM IDs are stable across tasks: `matchCount`, `refreshTime`, `matchList`, `matchAnalysis`, `parlayList`, `hitTracker`, `tomorrowPool`.
