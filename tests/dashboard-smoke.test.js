const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const data = JSON.parse(fs.readFileSync("data/matches.json", "utf8"));

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

const document = {
  querySelector(selector) {
    elements[selector] ||= createElement();
    return elements[selector];
  },
  querySelectorAll(selector) {
    return selector === "[data-filter]" ? tabs : [];
  },
};

const context = {
  document,
  window: { addEventListener() {} },
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
    elements["#tomorrowPool"].innerHTML,
  ].join("");

  assert(html.includes("总进球数"), "renders concrete total goals market");
  assert(html.includes("3球及以上") || html.includes("0-2球"), "renders a concrete goal range");
  assert(!html.includes("大小球"), "does not render old over-under label");
  assert(!html.includes("赔率"), "does not render odds wording");
  assert(!html.includes("预计回报"), "does not render return estimate");
  assert(html.includes("购买方案"), "renders purchase plan section");
  assert(html.includes("核心胆"), "renders parlay banker pick");
  assert(html.includes("风险点"), "renders parlay weak link");
  assert(html.includes("玩法表现"), "renders market performance history");
  assert(html.includes("自动复盘"), "renders automatic hit summary");
  assert(html.includes("总进球数命中"), "renders goal market hit tracking");
  assert(html.includes("今日重点"), "renders focus match strip");
  assert(html.includes("临场信号"), "renders live tactical signals");
  assert(html.includes("社会因素"), "renders social factor analysis");
  assert(html.includes("俱乐部动机"), "renders club motivation analysis");
  assert(html.includes("政治及地区因素"), "renders political and regional analysis");
  assert(html.includes("潜在后果"), "renders consequence analysis");
  assert(html.includes("趋势变化"), "renders probability trend signal");
  assert(html.includes("准备指数"), "renders tomorrow preparation score");
  assert(html.includes("建议动作"), "renders tomorrow action advice");
  assert(elements["#refreshTime"].textContent.includes("TheSportsDB"), "renders real data provider");

  console.log("dashboard smoke ok");
}, 0);
