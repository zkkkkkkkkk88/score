const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const data = JSON.parse(fs.readFileSync("data/matches.json", "utf8"));
const pageHtml = fs.readFileSync("index.html", "utf8");

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
  assert(/[0-4]\+?球/.test(html), "renders an exact goals pick");
  assert(!html.includes("3球及以上") && !html.includes("0-2球"), "does not render old goal ranges");
  assert(data.planArchive.every((plan) => plan.picks.every((pick) => pick.marketKey !== "ou" || pick.exactGoals)), "archives exact goal picks");
  assert(
    data.planArchive.every((plan) => plan.picks.every((pick) => pick.status !== "finished" || typeof pick.hit === "boolean")),
    "marks finished archived picks as correct or wrong",
  );
  assert(!html.includes("大小球"), "does not render old over-under label");
  assert(!html.includes("赔率"), "does not render odds wording");
  assert(!html.includes("预计回报"), "does not render return estimate");
  assert(html.includes("购买方案"), "renders purchase plan section");
  assert(data.parlaySeeds.every((plan) => plan.targetDate), "generates target-date parlay plans");
  assert(data.parlaySeeds.some((plan) => plan.markets.includes("hdc")), "includes handicap parlays");
  assert(data.parlaySeeds.some((plan) => plan.markets.includes("score")), "includes score parlays");
  assert(data.parlaySeeds.every((plan, index, plans) => index === 0 || plans[index - 1].planProbability >= plan.planProbability), "sorts parlays by probability");
  assert(html.includes("核心胆"), "renders parlay banker pick");
  assert(html.includes("风险点"), "renders parlay weak link");
  assert(html.includes("玩法表现"), "renders market performance history");
  assert(html.includes("自动复盘"), "renders automatic hit summary");
  assert(html.includes("每日方案汇总"), "renders daily plan summary");
  assert(html.includes("今日方案"), "renders today's plan summary");
  assert(html.includes("历史购买方案") || html.includes("待复盘"), "renders historical purchase plans");
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
  assert(html.includes("今日重点"), "renders focus match strip");
  assert(html.includes("临场信号"), "renders live tactical signals");
  assert(html.includes("社会因素"), "renders social factor analysis");
  assert(html.includes("俱乐部动机"), "renders club motivation analysis");
  assert(html.includes("政治及地区因素"), "renders political and regional analysis");
  assert(html.includes("潜在后果"), "renders consequence analysis");
  assert(html.includes("趋势变化"), "renders probability trend signal");
  assert(html.includes("准备指数"), "renders tomorrow preparation score");
  assert(html.includes("建议动作"), "renders tomorrow action advice");
  assert(elements["#refreshTime"].textContent.includes("Sporttery"), "renders official Sporttery provider");
  assert(html.includes("竞彩编号"), "renders sporttery match number");
  assert(/周[一二三四五六日]\d{3}/.test(html), "renders a sporttery counter number");

  console.log("dashboard smoke ok");
}, 0);
