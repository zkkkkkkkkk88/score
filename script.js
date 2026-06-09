const state = {
  matches: [],
  selectedId: null,
  filter: "all",
  saleFilter: "all",
  activeView: "overview",
  data: null,
  tick: 0,
};

const els = {
  matchCount: document.querySelector("#matchCount"),
  refreshTime: document.querySelector("#refreshTime"),
  focusStrip: document.querySelector("#focusStrip"),
  matchList: document.querySelector("#matchList"),
  matchAnalysis: document.querySelector("#matchAnalysis"),
  parlayList: document.querySelector("#parlayList"),
  hitTracker: document.querySelector("#hitTracker"),
  planHistory: document.querySelector("#planHistory"),
  tomorrowPool: document.querySelector("#tomorrowPool"),
  dailySummary: document.querySelector("#dailySummary"),
  tabs: [...document.querySelectorAll("[data-filter]")],
  saleTabs: [...document.querySelectorAll("[data-sale-filter]")],
  viewButtons: [...document.querySelectorAll("[data-view-button]")],
  views: [...document.querySelectorAll("[data-view]")],
};

const viewNames = ["overview", "analysis", "plans", "history", "review"];
const DATA_REFRESH_INTERVAL_MS = 60 * 1000;

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
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
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

function combinations(items, size) {
  const result = [];

  function walk(start, group) {
    if (group.length === size) {
      result.push(group);
      return;
    }

    for (let index = start; index < items.length; index += 1) {
      walk(index + 1, [...group, items[index]]);
    }
  }

  walk(0, []);
  return result;
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

function riskPenalty(risk) {
  if (risk === "低" || risk === "Low") return 0;
  if (risk === "中" || risk === "Medium") return 6;
  if (risk === "高" || risk === "High") return 14;
  return 6;
}

function statusClass(status) {
  return `status-${status}`;
}

function isPurchasable(match) {
  const blockedTags = ["暂停", "取消", "推迟", "完场", "待定"];
  const tags = [match.statusText, ...(match.tags ?? [])].filter(Boolean).join(" ");
  return !["finished", "cancelled", "postponed"].includes(match.status) && !blockedTags.some((tag) => tags.includes(tag));
}

function getFilteredMatches() {
  let matches = state.matches;
  if (state.filter === "today") matches = matches.filter((match) => match.date === getToday());
  if (state.filter === "tomorrow") matches = matches.filter((match) => match.date === getTomorrow());
  if (state.saleFilter === "available") matches = matches.filter(isPurchasable);
  return matches;
}

function getSelectedMatch() {
  return state.matches.find((match) => match.id === state.selectedId) ?? getFilteredMatches()[0] ?? state.matches[0];
}

function syncSelectedMatchWithFilter() {
  const matches = getFilteredMatches();
  if (matches.length && !matches.some((match) => match.id === state.selectedId)) {
    state.selectedId = matches[0].id;
  }
}

function getHashView() {
  const hash = window.location?.hash?.replace("#", "");
  return viewNames.includes(hash) ? hash : "overview";
}

function setActiveView(viewName, updateHash = true) {
  const nextView = viewNames.includes(viewName) ? viewName : "overview";
  state.activeView = nextView;
  els.viewButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.viewButton === nextView));
  els.views.forEach((view) => view.classList.toggle("is-active", view.dataset.view === nextView));

  if (!updateHash || !window.location) return;

  const nextHash = `#${nextView}`;
  if (window.location.hash === nextHash) return;
  if (window.history?.pushState) {
    window.history.pushState(null, "", nextHash);
  } else {
    window.location.hash = nextHash;
  }
}

function getMatchPriority(match) {
  const liveBonus = match.status === "live" ? 16 : 0;
  const finishedPenalty = match.status === "finished" ? 18 : 0;
  return match.importance + match.dataQuality * 0.35 + match.markets.wdl.probability * 24 + liveBonus - riskPenalty(match.risk) - finishedPenalty;
}

function getMarket(match, key) {
  return match.markets[key];
}

function formatMarketPick(key, market) {
  if (key !== "ou") return market.pick;
  return market.exactGoals ? `${market.exactGoals}球` : market.pick;
}

function getPickLabel(pick) {
  return `${pick.match.sportteryNo ?? pick.match.id} ${pick.match.homeTeam} 对 ${pick.match.awayTeam} · ${marketNames[pick.marketKey]} ${formatMarketPick(
    pick.marketKey,
    pick.market,
  )}`;
}

function getTrendText(base, live) {
  const delta = live - base;
  return `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%`;
}

function getParlayInsight(picks) {
  return picks.reduce(
    (insight, pick) => ({
      banker: pick.probability > insight.banker.probability ? pick : insight.banker,
      weak: pick.probability < insight.weak.probability ? pick : insight.weak,
    }),
    { banker: picks[0], weak: picks[0] },
  );
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

function renderFocusStrip() {
  const matches = state.matches
    .filter((match) => match.date === getToday())
    .sort((a, b) => getMatchPriority(b) - getMatchPriority(a))
    .slice(0, 4);

  if (!matches.length) {
    els.focusStrip.innerHTML = `<div class="empty-state">今日暂无真实赛事</div>`;
    return;
  }

  els.focusStrip.innerHTML = matches
    .map((match) => {
      const wdl = match.markets.wdl;
      const goals = match.markets.ou;
      const live = liveProbability(wdl.probability, match);

      return `
        <button class="focus-card" type="button" data-match-id="${match.id}">
          <span>${escapeHtml(match.sportteryNo ?? match.id)} · 今日重点 · ${statusLabels[match.status]}</span>
          <strong>${escapeHtml(match.homeTeam)} 对 ${escapeHtml(match.awayTeam)}</strong>
          <div>
            <em>${marketNames.wdl} ${escapeHtml(wdl.pick)} · ${pct(live)}</em>
            <em>${marketNames.ou} ${escapeHtml(formatMarketPick("ou", goals))}</em>
          </div>
          <small>趋势变化 ${getTrendText(wdl.probability, live)}</small>
        </button>
      `;
    })
    .join("");
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
            <span>${escapeHtml(match.sportteryNo ?? match.id)}</span>
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

function getLiveSignals(match) {
  const wdl = match.markets.wdl;
  const goals = match.markets.ou;
  const primary = liveProbability(wdl.probability, match);
  const goalProbability = liveProbability(goals.probability, match);
  const action =
    primary >= 0.68
      ? "可进入主推"
      : primary >= 0.58
        ? "等待临场确认"
        : "只做观察";

  return [
    {
      title: "趋势变化",
      value: getTrendText(wdl.probability, primary),
      detail: `${wdl.pick} 实时概率 ${pct(primary)}`,
    },
    {
      title: "总进球数",
      value: formatMarketPick("ou", goals),
      detail: `当前路径概率 ${pct(goalProbability)}`,
    },
    {
      title: "风险温度",
      value: riskLabels[match.risk] ?? match.risk,
      detail: `数据质量 ${match.dataQuality} / 节奏 ${match.stats.tempo}`,
    },
    {
      title: "建议动作",
      value: action,
      detail: match.status === "finished" ? "完场复盘" : "结合首发、赛程和临场事件再确认",
    },
  ];
}

function renderLiveSignals(match) {
  return `
    <div class="signal-panel">
      <div class="section-heading">
        <p>临场信号</p>
        <h3>实时决策提示</h3>
      </div>
      <div class="signal-grid">
        ${getLiveSignals(match)
          .map(
            (signal) => `
              <div class="signal-card">
                <span>${escapeHtml(signal.title)}</span>
                <strong>${escapeHtml(signal.value)}</strong>
                <em>${escapeHtml(signal.detail)}</em>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderSocialFactors(match) {
  const factors = match.socialFactors ?? {
    clubMotivation: "球队动机数据待接入，当前按中性处理。",
    politicalFactor: "未接入地区舆情数据，暂按常规比赛处理。",
    integrityRisk: "未发现可核验异常信息，避免作未经证实的假赛判断。",
    consequence: "若赛果偏离模型，需要在完场后进入复盘。",
    recommendation: "谨慎观察，不做激进方案。",
  };

  return `
    <div class="social-panel">
      <div class="section-heading">
        <p>社会因素</p>
        <h3>非技术面研判</h3>
      </div>
      <div class="social-grid">
        <div>
          <span>俱乐部动机</span>
          <strong>${escapeHtml(factors.clubMotivation)}</strong>
        </div>
        <div>
          <span>政治及地区因素</span>
          <strong>${escapeHtml(factors.politicalFactor)}</strong>
        </div>
        <div>
          <span>异常风险</span>
          <strong>${escapeHtml(factors.integrityRisk)}</strong>
        </div>
        <div>
          <span>潜在后果</span>
          <strong>${escapeHtml(factors.consequence)}</strong>
        </div>
      </div>
      <p>${escapeHtml(factors.recommendation)}</p>
    </div>
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
          <span>竞彩编号</span>
          <strong>${escapeHtml(match.sportteryNo ?? match.id)}</strong>
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
          </ul>
        </div>
      </div>

      ${renderLiveSignals(match)}
      ${renderSocialFactors(match)}

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
    els.parlayList.innerHTML = `<div class="empty-state">当前没有可执行购买方案</div>`;
    return;
  }

  els.parlayList.innerHTML = state.data.parlaySeeds
    .map((seed) => {
      const picks = getParlayPicks(seed);
      const live = getParlayProbability(seed, true);
      const prematch = getParlayProbability(seed, false);
      const delta = live - prematch;
      const required = seed.mode === "all" ? "全中" : `${seed.requiredHits}/${picks.length} 命中`;
      const insight = getParlayInsight(picks);
      const socialNote = seed.socialNote ?? "社会因素未见可核验异常，按常规谨慎方案处理。";

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
          <div class="parlay-insights">
            <div>
              <span>核心胆</span>
              <strong>${escapeHtml(getPickLabel(insight.banker))}</strong>
            </div>
            <div>
              <span>风险点</span>
              <strong>${escapeHtml(getPickLabel(insight.weak))}</strong>
            </div>
            <div>
              <span>社会因素</span>
              <strong>${escapeHtml(socialNote)}</strong>
            </div>
          </div>
          <div class="pick-list">
            ${picks
              .map(
                (pick) => `
                  <div class="pick-row">
                    <span>${escapeHtml(pick.match.sportteryNo ?? pick.match.id)} ${escapeHtml(pick.match.homeTeam)} 对 ${escapeHtml(pick.match.awayTeam)}</span>
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
            <span>方案变化 ${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHitTracker() {
  const history = state.data.history;
  const marketHistory = state.data.marketHistory ?? [];
  const autoReview = state.data.autoReview;
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
    <div class="market-ledger">
      <div class="section-heading">
        <p>自动复盘</p>
        <h3>近 30 日玩法表现</h3>
      </div>
      <div class="auto-review">
        <strong>${escapeHtml(autoReview?.summary ?? "等待比分完场后自动复盘购买方案命中率。")}</strong>
      </div>
      <div class="ledger-grid">
        ${marketHistory
          .map((item) => {
            const rate = item.total ? item.hits / item.total : 0;

            return `
              <div class="ledger-card">
                <span>${escapeHtml(item.name)}命中</span>
                <strong>${pct(rate)}</strong>
                ${renderProbabilityBar(rate, item.name)}
                <em>${item.hits}/${item.total} · ${escapeHtml(item.streak)}</em>
              </div>
            `;
          })
          .join("")}
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
        .join("") || `<div class="empty-state">等待比分完场后自动复盘购买方案命中率</div>`}
    </div>
  `;
}

function renderPlanHistory() {
  const archive = state.data.planArchive ?? [];

  if (!archive.length) {
    els.planHistory.innerHTML = `<div class="empty-state">从今天开始保存真实生成的购买方案，等比赛完场后自动判断是否命中</div>`;
    return;
  }

  els.planHistory.innerHTML = archive
    .map((plan) => {
      const statusText = plan.result === "hit" ? "命中" : plan.result === "miss" ? "未中" : "待复盘";
      const required = plan.mode === "all" ? "全中" : `至少 ${plan.requiredHits}/${plan.totalPicks || plan.picks.length}`;
      const totalPicks = plan.totalPicks || plan.picks.length;
      const settledText = `已完赛 ${plan.settledPicks || 0}/${totalPicks} · 正确 ${plan.hitPicks || 0}`;

      return `
        <article class="archive-card ${plan.result}">
          <div class="archive-head">
            <div>
              <span>${escapeHtml(plan.date)} · ${required}</span>
              <strong>${escapeHtml(plan.type)}</strong>
            </div>
            <em>${statusText} · ${settledText}</em>
          </div>
          <div class="archive-picks">
            ${plan.picks
              .map((pick) => {
                const pickStatus =
                  pick.hit === true
                    ? "正确"
                    : pick.hit === false
                      ? "错误"
                      : pick.status === "live"
                        ? "进行中"
                        : pick.status === "pre"
                          ? "未开赛"
                          : "待赛果";
                const pickClass = pick.hit === true ? "pick-hit" : pick.hit === false ? "pick-miss" : "pick-pending";
                const score = pick.score ? `${pick.status === "live" ? "当前比分" : "比分"} ${escapeHtml(pick.score)}` : "等待完场";

                return `
                  <div class="archive-pick ${pickClass}">
                    <span>${escapeHtml(pick.sportteryNo)} ${escapeHtml(pick.homeTeam)} 对 ${escapeHtml(pick.awayTeam)}</span>
                    <strong>${escapeHtml(pick.marketName)} · ${escapeHtml(pick.pick)}</strong>
                    <em><b>${pickStatus}</b> · ${score}</em>
                  </div>
                `;
              })
              .join("")}
          </div>
          <p>${escapeHtml(plan.note || "")}</p>
        </article>
      `;
    })
    .join("");
}

function renderDailySummary() {
  const summaries = state.data.dailyPlanSummaries ?? [];

  if (!summaries.length) {
    els.dailySummary.innerHTML = `<div class="empty-state">今日方案生成后开始累计每日命中率</div>`;
    return;
  }

  els.dailySummary.innerHTML = summaries
    .map((item, index) => {
      const rate = item.reviewedPlans ? item.hitPlans / item.reviewedPlans : 0;
      const label = index === 0 ? "今日方案" : "历史方案";

      return `
        <article class="summary-card">
          <div>
            <span>每日方案汇总 · ${label} · ${escapeHtml(item.date)}</span>
            <strong>${item.totalPlans} 个购买方案</strong>
          </div>
          <div class="summary-metrics">
            <span>已复盘 ${item.reviewedPlans}</span>
            <span>命中 ${item.hitPlans}</span>
            <span>命中率 ${pct(rate)}</span>
          </div>
          ${renderProbabilityBar(rate, `${item.date} 命中率`)}
          <p>${escapeHtml(item.summary)}</p>
        </article>
      `;
    })
    .join("");
}

function renderTomorrowPool() {
  els.tomorrowPool.innerHTML = state.data.tomorrowPool
    .map((item) => {
      const match = state.matches.find((candidate) => candidate.id === item.matchId);
      if (!match) return "";
      const market = match.markets[item.market];
      const readiness = clamp(
        Math.round(match.dataQuality * 0.45 + market.confidence * 0.4 + market.probability * 100 * 0.15 - riskPenalty(market.risk)),
        38,
        95,
      );
      const action = readiness >= 78 ? "建议动作：进入主推池" : readiness >= 66 ? "建议动作：等待首发确认" : "建议动作：只做观察";

      return `
        <article class="watch-card ${riskClass(market.risk)}">
          <div>
            <span>${escapeHtml(item.category)}</span>
            <strong>${escapeHtml(match.sportteryNo ?? match.id)} ${escapeHtml(match.homeTeam)} 对 ${escapeHtml(match.awayTeam)}</strong>
          </div>
          <div class="prep-score">
            <span>准备指数</span>
            <strong>${readiness}</strong>
            ${renderProbabilityBar(readiness / 100, "准备指数")}
            <em>${action}</em>
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
  const provider = state.data.source?.provider ? ` · ${state.data.source.provider}` : "";
  els.matchCount.textContent = `${state.matches.length} 场赛事`;
  els.refreshTime.textContent = `刷新 ${formatDateTime(state.data.generatedAt)}${provider}`;
}

function render() {
  renderMeta();
  renderFocusStrip();
  renderMatchList();
  renderAnalysis();
  renderParlays();
  renderHitTracker();
  renderPlanHistory();
  renderDailySummary();
  renderTomorrowPool();
}

async function loadData(options = {}) {
  const previousSelectedId = state.selectedId;
  const response = await fetch(`./data/matches.json?ts=${Date.now()}`);
  if (!response.ok) throw new Error("无法载入赛事数据");

  state.data = await response.json();
  state.matches = state.data.matches;
  const canKeepSelection = options.preserveSelection && state.matches.some((match) => match.id === previousSelectedId);
  state.selectedId = canKeepSelection ? previousSelectedId : (getFilteredMatches()[0]?.id ?? state.matches[0]?.id ?? null);
  setActiveView(getHashView(), false);
  render();
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.filter = tab.dataset.filter;
    els.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    syncSelectedMatchWithFilter();
    renderMatchList();
    renderAnalysis();
  });
});

els.saleTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.saleFilter = tab.dataset.saleFilter;
    els.saleTabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    syncSelectedMatchWithFilter();
    renderMatchList();
    renderAnalysis();
  });
});

els.viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveView(button.dataset.viewButton);
  });
});

window.addEventListener("hashchange", () => {
  setActiveView(getHashView(), false);
});

window.addEventListener("click", (event) => {
  const row = event.target.closest("[data-match-id]");
  if (!row) return;
  state.selectedId = row.dataset.matchId;
  setActiveView("analysis");
  render();
});

setInterval(() => {
  if (!state.data) return;
  state.tick += 1;
  renderAnalysis();
  renderParlays();
}, 3000);

setInterval(() => {
  loadData({ preserveSelection: true }).catch((error) => {
    els.refreshTime.textContent = `刷新失败：${error.message}`;
  });
}, DATA_REFRESH_INTERVAL_MS);

loadData().catch((error) => {
  els.matchAnalysis.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
