const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const data = JSON.parse(fs.readFileSync("data/matches.json", "utf8"));
const pageHtml = fs.readFileSync("index.html", "utf8");
const styleCss = fs.readFileSync("styles.css", "utf8");

function createElement() {
  return {
    innerHTML: "",
    textContent: "",
    dataset: { filter: "all" },
    classList: { toggle() {}, add() {} },
    addEventListener() {},
  };
}

const elements = {};
const tabs = [
  { dataset: { filter: "all" }, classList: { toggle() {} }, addEventListener() {} },
  { dataset: { filter: "today" }, classList: { toggle() {} }, addEventListener() {} },
  { dataset: { filter: "tomorrow" }, classList: { toggle() {} }, addEventListener() {} },
];
const saleTabs = [
  { dataset: { saleFilter: "all" }, classList: { toggle() {} }, addEventListener() {} },
  { dataset: { saleFilter: "available" }, classList: { toggle() {} }, addEventListener() {} },
];
const viewButtons = [
  { dataset: { viewButton: "overview" }, classList: { toggle() {} }, addEventListener() {} },
  { dataset: { viewButton: "analysis" }, classList: { toggle() {} }, addEventListener() {} },
  { dataset: { viewButton: "plans" }, classList: { toggle() {} }, addEventListener() {} },
  { dataset: { viewButton: "history" }, classList: { toggle() {} }, addEventListener() {} },
  { dataset: { viewButton: "review" }, classList: { toggle() {} }, addEventListener() {} },
];
const views = [
  { dataset: { view: "overview" }, classList: { toggle() {} } },
  { dataset: { view: "analysis" }, classList: { toggle() {} } },
  { dataset: { view: "plans" }, classList: { toggle() {} } },
  { dataset: { view: "history" }, classList: { toggle() {} } },
  { dataset: { view: "review" }, classList: { toggle() {} } },
];

const document = {
  querySelector(selector) {
    elements[selector] ||= createElement();
    return elements[selector];
  },
  querySelectorAll(selector) {
    if (selector === "[data-filter]") return tabs;
    if (selector === "[data-sale-filter]") return saleTabs;
    if (selector === "[data-view-button]") return viewButtons;
    if (selector === "[data-view]") return views;
    return [];
  },
};

const context = {
  document,
  window: {
    location: { hash: "#plans" },
    history: { pushState() {} },
    addEventListener() {},
  },
  fetch: async () => ({ ok: true, json: async () => data }),
  setInterval() {},
  Intl,
  Date,
  Math,
  Number,
  Boolean,
  String,
  Error,
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("script.js", "utf8"), context);

setTimeout(() => {
  const html = [
    elements["#focusStrip"].innerHTML,
    elements["#matchAnalysis"].innerHTML,
    elements["#parlayList"].innerHTML,
    elements["#hitTracker"].innerHTML,
    elements["#planHistory"].innerHTML,
    elements["#dailySummary"].innerHTML,
    elements["#tomorrowPool"].innerHTML,
  ].join("");

  assert(html.includes("总进球数"), "renders concrete total goals market");
  assert(html.includes("让球胜平负"), "renders handicap win/draw/loss market");
  assert(html.includes("比分"), "renders score market");
  assert(html.includes("赛前预测"), "renders predicted market row");
  assert(html.includes("完赛真实") || html.includes("等待完赛"), "renders actual market row");
  assert(/[0-4]\+?球/.test(html), "renders an exact goals pick");
  assert(!html.includes("3球及以上") && !html.includes("0-2球"), "does not render old goal ranges");
  assert(data.planArchive.every((plan) => plan.picks.every((pick) => pick.marketKey !== "ou" || pick.exactGoals)), "archives exact goal picks");
  assert(
    data.matches.every((match) => {
      const [home, away] = match.markets.score.pick.split("-").map(Number);
      const goals = match.markets.ou.exactGoals;
      return goals === "4+" || String(home + away) === String(goals);
    }),
    "keeps predicted scoreline consistent with exact goals market",
  );
  const argentinaMatch = data.matches.find((match) => match.homeTeam.includes("阿根廷") && match.awayTeam.includes("冰岛"));
  if (argentinaMatch) {
    if (argentinaMatch.markets.wdl) assert(argentinaMatch.markets.wdl.pick === "主胜", "uses team-strength model for clear favorite win/draw/loss");
    assert(!["2-0", "0-2", "1-0", "0-1"].includes(argentinaMatch.markets.score.pick), "does not collapse clear favorite scoreline to a mechanical template");
  }
  const englandMatch = data.matches.find((match) => match.homeTeam.includes("英格兰") && match.awayTeam.includes("哥斯达"));
  if (englandMatch) {
    assert(!englandMatch.markets.wdl, "does not create win/draw/loss market when Sporttery does not offer it");
    assert(englandMatch.markets.hdc, "keeps handicap market when standard win/draw/loss is unavailable");
  }
  assert(
    data.matches.every((match) => !match.availablePools?.includes("HAD") || match.markets.wdl),
    "creates win/draw/loss market when Sporttery offers HAD",
  );
  assert(
    data.matches.every((match) => match.availablePools?.includes("HAD") || !match.markets.wdl),
    "does not create win/draw/loss market when Sporttery does not offer HAD",
  );
  assert(
    data.matches.some((match) => Math.abs(Number(match.markets.hdc?.handicap || 0)) === 2),
    "supports official or estimated two-goal handicap lines",
  );
  data.planArchive.forEach((plan) => {
    plan.picks.forEach((pick) => {
      if (pick.status !== "finished" || pick.marketKey !== "hdc") return;
      const match = data.matches.find((item) => item.sourceEventId === pick.sourceEventId);
      if (!match?.actualMarkets?.hdc) return;
      assert(Number(pick.handicap) === Number(match.actualMarkets.hdc.handicap), "uses official handicap line when reviewing archived handicap picks");
    });
  });
  assert(
    data.planArchive.every((plan) => plan.picks.every((pick) => pick.status !== "finished" || typeof pick.hit === "boolean")),
    "marks finished archived picks as correct or wrong",
  );
  assert(!html.includes("大小球"), "does not render old over-under label");
  assert(!html.includes("赔率"), "does not render odds wording");
  assert(!html.includes("预计回报"), "does not render return estimate");
  assert(data.modelProfile?.marketWeights?.hdc, "builds market calibration weights from reviewed plans");
  assert(
    data.matches.every((match) => match.modelProfile && typeof match.modelProfile.strengthEdge === "number"),
    "adds team-strength model profile to each match",
  );
  assert(
    data.matches.every((match) =>
      Object.values(match.markets).every((market) => typeof market.baseProbability === "number" && typeof market.probability === "number"),
    ),
    "keeps base and calibrated probabilities on each market",
  );
  assert(new Set(data.matches.map((match) => match.markets.htft?.pick).filter(Boolean)).size > 1, "does not collapse every half/full-time pick to draw/draw");
  assert(html.includes("购买方案"), "renders purchase plan section");
  assert(data.parlaySeeds.every((plan) => plan.targetDate), "generates target-date parlay plans");
  assert(data.parlaySeeds.length > 0, "generates purchasable parlay plans");
  assert(data.parlaySeeds.length <= 25, "caps grouped parlay plans");
  assert(Object.values(data.parlaySeeds.reduce((groups, plan) => ((groups[plan.planGroup] = (groups[plan.planGroup] || 0) + 1), groups), {})).every((count) => count <= 5), "caps each parlay group at five plans");
  assert(data.parlaySeeds.every((plan) => plan.matchIds.every((id) => data.matches.find((match) => match.id === id)?.date === plan.targetDate)), "uses tomorrow-tab matches for every parlay");
  assert(data.parlaySeeds.some((plan) => plan.planSize === 2), "includes two-leg parlays when enough matches exist");
  assert(data.parlaySeeds.some((plan) => plan.markets.includes("hdc")), "includes handicap parlays");
  assert(data.parlaySeeds.some((plan) => plan.markets.includes("score")), "includes at least one score parlay");
  assert(data.parlaySeeds.every((plan, index, plans) => index === 0 || plan.planGroup !== plans[index - 1].planGroup || plans[index - 1].planProbability >= plan.planProbability), "sorts each parlay group by probability");
  assert(
    data.planArchive.every(
      (plan) => plan.schemaVersion === "tomorrow-tab-plans-v1" || plan.result === "hit" || plan.result === "miss",
    ),
    "drops unresolved legacy plan snapshots from the archive",
  );
  assert(html.includes("核心胆"), "renders parlay banker pick");
  assert(html.includes("风险点"), "renders parlay weak link");
  assert(html.includes("玩法表现"), "renders market performance history");
  assert(html.includes("自动复盘"), "renders automatic hit summary");
  assert(html.includes("每日方案汇总"), "renders daily plan summary");
  assert(html.includes("今日方案"), "renders today's plan summary");
  assert(
    data.dailyPlanSummaries.every((item) => {
      if (!item.reviewedPlans || item.reviewedPlans === item.totalPlans) return true;
      return !elements["#dailySummary"].innerHTML.includes(`${item.totalPlans} 个购买方案`);
    }),
    "does not present archived total as reviewed daily hit count",
  );
  assert(!elements["#dailySummary"].innerHTML.includes("summary-details"), "keeps overview daily summary compact");
  assert(elements["#hitTracker"].innerHTML.includes("review-date-group"), "groups hit review rows by date");
  assert(elements["#hitTracker"].innerHTML.includes("每日命中率"), "shows daily hit rate in review groups");
  assert(html.includes("历史购买方案") || html.includes("待复盘"), "renders historical purchase plans");
  assert(html.includes("已完赛方案") && html.includes("未完赛方案"), "groups historical plans by settlement status");
  assert(html.includes("history-split"), "renders finished and unfinished history columns");
  assert(html.includes("查看具体方案"), "renders expandable daily review plan details");
  assert(html.includes("review-plan-details"), "renders expandable hit review plan rows");
  assert(html.includes("正确") || html.includes("错误") || html.includes("待赛果") || html.includes("进行中") || html.includes("未开赛"), "renders per-pick archive result labels");
  assert(html.includes("已完赛"), "renders settled pick count in archive summary");
  assert(!html.includes("已完赛正确"), "does not imply unsettled picks are already correct");
  if (data.planArchive.some((plan) => plan.picks.some((pick) => pick.status === "live"))) {
    assert(html.includes("进行中") && html.includes("当前比分"), "renders live archived picks as in progress");
  }
  assert(!html.includes("2026-05-28"), "does not render old template history");
  assert(html.includes("总进球数命中"), "renders goal market hit tracking");
  if (data.matches.some((match) => match.status === "finished")) assert(html.includes("完场"), "renders finished match status");
  if (data.matches.some((match) => match.status === "live")) assert(html.includes("进行中"), "renders live match status");
  assert(fs.readFileSync("script.js", "utf8").includes("matches.json?ts="), "fetches match data without browser cache");
  assert(pageHtml.includes('data-sale-filter="available"') && pageHtml.includes("可购买"), "renders purchasable match filter");
  assert(saleTabs.length === 2, "wires purchasable and all-match filters");
  assert(viewButtons.length === 5 && views.length === 5, "renders page navigation views");
  assert(styleCss.includes(".analysis-layout") && styleCss.includes("calc(100vh") && styleCss.includes("overflow-y: auto"), "keeps analysis columns fixed with internal scrolling");
  assert(styleCss.includes("repeat(auto-fit, minmax(220px, 1fr))"), "uses wider responsive market cards");
  assert(styleCss.includes("repeat(auto-fit, minmax(300px, 1fr))"), "uses wider responsive parlay cards");
  const today = data.generatedAt.slice(0, 10);
  assert(
    html.includes(data.matches.some((match) => match.date === today) ? "今日重点" : "今日暂无真实赛事"),
    "renders focus match strip or empty focus state",
  );
  assert(html.includes("临场信号"), "renders live tactical signals");
  assert(html.includes("赛程环境"), "renders schedule context analysis");
  assert(html.includes("模型修正"), "renders model calibration context");
  assert(html.includes("任务与轮换"), "renders motivation and rotation analysis");
  assert(html.includes("外部环境"), "renders external context analysis");
  assert(html.includes("复盘权重"), "renders review weighting analysis");
  assert(!html.includes("假赛"), "does not render unverified match-fixing wording");
  assert(html.includes("趋势变化"), "renders probability trend signal");
  assert(html.includes("准备指数"), "renders tomorrow preparation score");
  assert(html.includes("建议动作"), "renders tomorrow action advice");
  assert(elements["#refreshTime"].textContent.includes("Sporttery"), "renders official Sporttery provider");
  assert(html.includes("竞彩编号"), "renders sporttery match number");
  assert(/周[一二三四五六日]\d{3}/.test(html), "renders a sporttery counter number");

  console.log("dashboard smoke ok");
}, 0);
