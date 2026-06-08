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

const marketNames = {
  wdl: "胜平负",
  ou: "总进球数",
  htft: "半全场",
};

const statusLabels = {
  pre: "未开赛",
  live: "进行中",
  halftime: "中场",
  finished: "完场",
};

const riskLabels = {
  Low: "低风险",
  Medium: "中风险",
  High: "高风险",
  低: "低风险",
  中: "中风险",
  高: "高风险",
};

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getToday() {
  return state.data.generatedAt.slice(0, 10);
}

function getTomorrow() {
  return addDays(getToday(), 1);
}

function liveProbability(base, match) {
  const numericId = Number(match.id);
  const liveWave = match.status === "live" ? Math.sin(state.tick / 2 + numericId) * 0.035 : 0;
  const preWave = match.status === "pre" ? Math.sin(state.tick / 4 + numericId) * 0.012 : 0;
  const finishedBoost = match.status === "finished" ? 0 : liveWave + preWave;
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

function scoreText(match) {
  if (match.score.home === null || match.score.away === null) return `${match.kickoff}`;
  return `${match.score.home} - ${match.score.away}`;
}

function riskClass(risk) {
  const key = String(risk);
  if (key === "低" || key === "Low") return "risk-low";
  if (key === "中" || key === "Medium") return "risk-medium";
  if (key === "高" || key === "High") return "risk-high";
  return "risk-medium";
}

function statusClass(status) {
  return `status-${status}`;
}

function getFilteredMatches() {
  if (state.filter === "today") return state.matches.filter((match) => match.date === getToday());
  if (state.filter === "tomorrow") return state.matches.filter((match) => match.date === getTomorrow());
  return state.matches;
}

function getSelectedMatch() {
  return state.matches.find((match) => match.id === state.selectedId) ?? state.matches[0];
}

function getMarket(match, key) {
  return match.markets[key];
}

function formatMarketPick(key, market) {
  if (key !== "ou") return market.pick;
  return market.goalRange ?? market.pick;
}

function getParlayPicks(seed, useLive = true) {
  return seed.matchIds
    .map((matchId, index) => {
      const match = state.matches.find((item) => item.id === matchId);
      const marketKey = seed.markets[index];
      if (!match || !match.markets[marketKey]) return null;
      const market = match.markets[marketKey];
      const probability = useLive ? liveProbability(market.probability, match) : market.probability;

      return {
        match,
        marketKey,
        market,
        probability,
      };
    })
    .filter(Boolean);
}

function getParlayProbability(seed, useLive = true) {
  const picks = getParlayPicks(seed, useLive);
  if (seed.mode === "all") return allHitProbability(picks);
  return atLeastProbability(
    picks.map((pick) => pick.probability),
    seed.requiredHits,
  );
}

function renderProbabilityBar(value, label) {
  return `
    <div class="probability-bar" aria-label="${escapeHtml(label)} ${pct(value)}">
      <span style="width: ${pct(value)}"></span>
    </div>
  `;
}

function renderTags(tags) {
  return tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
}

function renderMatchList() {
  const matches = getFilteredMatches();

  if (!matches.length) {
    els.matchList.innerHTML = `<div class="empty-state">当前筛选暂无赛事</div>`;
    return;
  }

  els.matchList.innerHTML = matches
    .map((match) => {
      const active = match.id === state.selectedId ? "is-selected" : "";

      return `
        <button class="match-card ${active}" type="button" data-match-id="${match.id}">
          <div class="match-meta">
            <span>${match.id}</span>
            <span>${escapeHtml(match.competition)}</span>
          </div>
          <div class="teams">
            <strong>${escapeHtml(match.homeTeam)}</strong>
            <em>对</em>
            <strong>${escapeHtml(match.awayTeam)}</strong>
          </div>
          <div class="match-foot">
            <span class="score-chip">${scoreText(match)}</span>
            <span class="status-pill ${statusClass(match.status)}">${statusLabels[match.status]}</span>
          </div>
          <div class="tags">${renderTags(match.tags)}</div>
        </button>
      `;
    })
    .join("");
}

function renderMarketCard(match, key) {
  const market = getMarket(match, key);
  const probability = liveProbability(market.probability, match);
  const delta = probability - market.probability;
  const deltaText = `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%`;

  return `
    <article class="market-card ${riskClass(market.risk)}">
      <div class="market-title">
        <span>${marketNames[key]}</span>
        <strong>${escapeHtml(formatMarketPick(key, market))}</strong>
      </div>
      <div class="market-score">
        <span>实时概率</span>
        <strong>${pct(probability)}</strong>
      </div>
      ${renderProbabilityBar(probability, marketNames[key])}
      <div class="market-extra">
        <span>信心 ${market.confidence}</span>
        <span>${escapeHtml(riskLabels[market.risk] ?? market.risk)} ${deltaText}</span>
      </div>
      <p>${escapeHtml(market.reason)}</p>
    </article>
  `;
}

function renderAnalysis() {
  const match = getSelectedMatch();
  if (!match) {
    els.matchAnalysis.innerHTML = `<div class="empty-state">暂无赛事数据</div>`;
    return;
  }

  const primary = liveProbability(match.markets.wdl.probability, match);
  const statusText = match.status === "live" ? `${match.minute}' ${statusLabels[match.status]}` : statusLabels[match.status];

  els.matchAnalysis.innerHTML = `
    <article class="analysis-card">
      <div class="analysis-header">
        <div>
          <p class="eyebrow">${escapeHtml(match.competition)} · ${match.date} ${match.kickoff}</p>
          <h2>${escapeHtml(match.homeTeam)} <span>对</span> ${escapeHtml(match.awayTeam)}</h2>
          <div class="analysis-tags">${renderTags(match.tags)}</div>
        </div>
        <div class="score-board">
          <span>${statusText}</span>
          <strong>${scoreText(match)}</strong>
        </div>
      </div>

      <div class="radar-strip">
        <div>
          <span>主方向</span>
          <strong>${escapeHtml(match.markets.wdl.pick)}</strong>
        </div>
        <div>
          <span>模型信心</span>
          <strong>${match.markets.wdl.confidence}</strong>
        </div>
        <div>
          <span>实时概率</span>
          <strong>${pct(primary)}</strong>
        </div>
        <div>
          <span>数据质量</span>
          <strong>${match.dataQuality}</strong>
        </div>
      </div>

      <div class="momentum-card">
        <div class="pitch-lines" aria-hidden="true">
          <i style="height:${match.stats.attack}%"></i>
          <i style="height:${match.stats.defense}%"></i>
          <i style="height:${match.stats.tempo}%"></i>
        </div>
        <div>
          <p class="eyebrow">关键因素</p>
          <ul class="factor-list">
            <li>近况：${escapeHtml(match.stats.form)}</li>
            <li>攻防：进攻 ${match.stats.attack} / 防守 ${match.stats.defense}</li>
            <li>节奏：比赛节奏 ${match.stats.tempo}</li>
            <li>场地：${escapeHtml(match.stats.homeAway)}</li>
            <li>赔率：主 ${match.odds.home} / 平 ${match.odds.draw} / 客 ${match.odds.away}</li>
          </ul>
        </div>
      </div>

      <div class="market-grid">
        ${renderMarketCard(match, "wdl")}
        ${renderMarketCard(match, "ou")}
        ${renderMarketCard(match, "htft")}
      </div>
    </article>
  `;
}

function renderParlays() {
  if (!state.data?.parlaySeeds?.length) {
    els.parlayList.innerHTML = `<div class="empty-state">当前没有安全串单推荐</div>`;
    return;
  }

  els.parlayList.innerHTML = state.data.parlaySeeds
    .map((seed) => {
      const picks = getParlayPicks(seed);
      const live = getParlayProbability(seed, true);
      const prematch = getParlayProbability(seed, false);
      const delta = live - prematch;
      const required = seed.mode === "all" ? "全中" : `${seed.requiredHits}/${picks.length} 命中`;

      return `
        <article class="parlay-card ${riskClass(seed.risk)}">
          <div class="parlay-head">
            <div>
              <span>${required}</span>
              <h3>${escapeHtml(seed.type)}</h3>
            </div>
            <strong>${pct(live)}</strong>
          </div>
          ${renderProbabilityBar(live, seed.type)}
          <div class="pick-list">
            ${picks
              .map(
                (pick) => `
                  <div class="pick-row">
                    <span>${pick.match.id} ${escapeHtml(pick.match.homeTeam)} 对 ${escapeHtml(pick.match.awayTeam)}</span>
                    <strong>${marketNames[pick.marketKey]} · ${escapeHtml(formatMarketPick(pick.marketKey, pick.market))}</strong>
                    <em>${pct(pick.probability)}</em>
                  </div>
                `,
              )
              .join("")}
          </div>
          <p>${escapeHtml(seed.note)}</p>
          <div class="parlay-foot">
            <span>${escapeHtml(riskLabels[seed.risk] ?? seed.risk)}</span>
            <span>实时变化 ${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHitTracker() {
  const history = state.data.history;
  const hits = history.filter((item) => item.result === "hit").length;
  const hitRate = history.length ? hits / history.length : 0;
  const finished = state.matches.filter((match) => match.status === "finished").length;
  const live = state.matches.filter((match) => match.status === "live").length;

  els.hitTracker.innerHTML = `
    <div class="tracker-metrics">
      <div>
        <span>近 7 日命中率</span>
        <strong>${pct(hitRate)}</strong>
      </div>
      <div>
        <span>今日完场</span>
        <strong>${finished}</strong>
      </div>
      <div>
        <span>实时赛事</span>
        <strong>${live}</strong>
      </div>
    </div>
    <div class="history-list">
      ${history
        .map(
          (item) => `
            <div class="history-row">
              <span>${escapeHtml(item.date)}</span>
              <strong>${escapeHtml(item.type)}</strong>
              <em class="${item.result === "hit" ? "hit" : "miss"}">${item.result === "hit" ? "命中" : "未中"} · ${pct(item.probability)}</em>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTomorrowPool() {
  els.tomorrowPool.innerHTML = state.data.tomorrowPool
    .map((item) => {
      const match = state.matches.find((candidate) => candidate.id === item.matchId);
      if (!match) return "";
      const market = match.markets[item.market];

      return `
        <article class="watch-card ${riskClass(market.risk)}">
          <div>
            <span>${escapeHtml(item.category)}</span>
            <strong>${match.id} ${escapeHtml(match.homeTeam)} 对 ${escapeHtml(match.awayTeam)}</strong>
          </div>
          <div class="watch-market">
            <span>${marketNames[item.market]}</span>
            <strong>${escapeHtml(formatMarketPick(item.market, market))} · ${pct(market.probability)}</strong>
          </div>
          <p>${escapeHtml(item.reason)}</p>
        </article>
      `;
    })
    .join("");
}

function renderMeta() {
  els.matchCount.textContent = `${state.matches.length} 场赛事`;
  els.refreshTime.textContent = `刷新 ${formatDateTime(state.data.generatedAt)}`;
}

function render() {
  renderMeta();
  renderMatchList();
  renderAnalysis();
  renderParlays();
  renderHitTracker();
  renderTomorrowPool();
}

async function loadData() {
  const response = await fetch("./data/matches.json");
  if (!response.ok) throw new Error("无法载入赛事数据");

  state.data = await response.json();
  state.matches = state.data.matches;
  state.selectedId = state.matches[0]?.id ?? null;
  render();
}

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
  if (!state.data) return;
  state.tick += 1;
  renderAnalysis();
  renderParlays();
}, 3000);

loadData().catch((error) => {
  els.matchAnalysis.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
