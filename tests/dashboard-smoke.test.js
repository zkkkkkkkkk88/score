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
    elements["#matchAnalysis"].innerHTML,
    elements["#parlayList"].innerHTML,
    elements["#hitTracker"].innerHTML,
    elements["#tomorrowPool"].innerHTML,
  ].join("");

  assert(html.includes("总进球数"), "renders concrete total goals market");
  assert(html.includes("3球及以上"), "renders high goal range");
  assert(html.includes("0-2球"), "renders low goal range");
  assert(!html.includes("大小球"), "does not render old over-under label");
  assert(html.includes("预计回报"), "renders parlay return estimate");
  assert(html.includes("核心胆"), "renders parlay banker pick");
  assert(html.includes("风险点"), "renders parlay weak link");
  assert(html.includes("玩法表现"), "renders market performance history");
  assert(html.includes("总进球数命中"), "renders goal market hit tracking");

  console.log("dashboard smoke ok");
}, 0);
