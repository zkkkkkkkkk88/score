const fs = require("fs/promises");
const fsSync = require("fs");
const { spawn } = require("child_process");
const path = require("path");

const API_BASE = "https://webapi.sporttery.cn/gateway/uniform/fb";
const OUTPUT = process.env.SCORE_DATA_OUTPUT || "data/matches.json";
const PAGE_SIZE = Number(process.env.SPORTTERY_PAGE_SIZE || 80);
const TZ = "Asia/Shanghai";
const PLAN_SCHEMA_VERSION = "tomorrow-tab-plans-v1";
const HISTORY_WINDOW_DAYS = Number(process.env.SCORE_HISTORY_WINDOW_DAYS || 7);
const BROWSER_FALLBACK_ENABLED = process.env.SCORE_BROWSER_FALLBACK !== "0";
const BROWSER_DEBUG_PORT = Number(process.env.SCORE_BROWSER_DEBUG_PORT || 9223);
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEFAULT_MARKET_WEIGHTS = {
  wdl: 1,
  hdc: 0.96,
  ou: 0.88,
  score: 0.64,
  htft: 0.72,
};
const MARKET_POOL_CODES = {
  wdl: "HAD",
  hdc: "HHAD",
  ou: "TTG",
  score: "CRS",
  htft: "HAFU",
};
const HISTORICAL_POOL_OVERRIDES = {
  2040189: ["HAD", "HHAD", "TTG", "CRS", "HAFU"],
  2040190: ["HHAD", "TTG", "CRS", "HAFU"],
};
const PRESERVE_ARCHIVE_PREDICTION_IDS = new Set(["2040189", "2040190"]);
const PRESERVED_SCORE_PICKS = {
  2040189: "2-1",
};
const CONFIRMED_HANDICAP_LINES = {
  2040162: -1,
  2040166: 2,
  2040170: -3,
};
const SCORE_OPTION_OVERRIDES = {
  2040162: ["1-0", "2-0"],
};
const GOAL_OPTION_OVERRIDES = {
  2040162: ["1", "2"],
};
const WORLD_CUP_KEYWORD = "世界杯";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: "https://m.sporttery.cn/mjc/zqsj/?tab=live",
  Origin: "https://m.sporttery.cn",
};

const TEAM_POWER = {
  阿根廷: 94,
  巴西: 92,
  法国: 91,
  葡萄牙: 90,
  英格兰: 90,
  西班牙: 89,
  荷兰: 87,
  德国: 86,
  比利时: 85,
  乌拉圭: 84,
  克罗地亚: 83,
  丹麦: 82,
  摩洛哥: 82,
  瑞士: 81,
  哥伦比亚: 81,
  墨西哥: 81,
  挪威: 81,
  日本: 80,
  奥地利: 80,
  瑞典: 80,
  美国: 80,
  匈牙利: 79,
  塞内加尔: 79,
  塞尔维亚: 79,
  澳大利亚: 76,
  尼日利亚: 76,
  巴拉圭: 76,
  埃及: 76,
  韩国: 78,
  土耳其: 78,
  科特迪瓦: 78,
  厄瓜多尔: 78,
  伊朗: 78,
  阿尔及利亚: 77,
  捷克: 77,
  苏格兰: 77,
  波黑: 75,
  突尼斯: 74,
  乌兹别克斯坦: 73,
  佛得角: 73,
  "刚果(金)": 72,
  哥斯达黎加: 72,
  沙特阿拉伯: 72,
  南非: 70,
  新西兰: 70,
  卡塔尔: 70,
  伊拉克: 70,
  巴拿马: 70,
  泰国: 69,
  约旦: 68,
  冰岛: 68,
  中国: 67,
  库拉索: 66,
  海地: 64,
  哈萨克斯坦: 63,
};

const TEAM_STYLE = {
  阿根廷: { attack: 88, defense: 84, stability: 86 },
  巴西: { attack: 89, defense: 82, stability: 83 },
  法国: { attack: 86, defense: 85, stability: 85 },
  葡萄牙: { attack: 86, defense: 80, stability: 82 },
  英格兰: { attack: 85, defense: 83, stability: 82 },
  西班牙: { attack: 84, defense: 82, stability: 83 },
  荷兰: { attack: 82, defense: 80, stability: 80 },
  德国: { attack: 84, defense: 78, stability: 78 },
  比利时: { attack: 82, defense: 77, stability: 76 },
  乌拉圭: { attack: 78, defense: 82, stability: 80 },
  克罗地亚: { attack: 76, defense: 80, stability: 81 },
  摩洛哥: { attack: 76, defense: 82, stability: 80 },
  瑞士: { attack: 74, defense: 80, stability: 80 },
  日本: { attack: 77, defense: 76, stability: 78 },
  韩国: { attack: 75, defense: 74, stability: 74 },
  墨西哥: { attack: 76, defense: 76, stability: 77 },
  美国: { attack: 76, defense: 74, stability: 74 },
  哥斯达黎加: { attack: 68, defense: 72, stability: 70 },
  南非: { attack: 67, defense: 68, stability: 68 },
  中国: { attack: 65, defense: 66, stability: 65 },
};

function nowIsoShanghai() {
  const date = new Date();
  const offsetMs = 8 * 60 * 60 * 1000;
  return new Date(date.getTime() + offsetMs).toISOString().replace("Z", "+08:00");
}

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${bag.year}-${bag.month}-${bag.day}`;
}

function addDays(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readExistingData() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT, "utf8"));
  } catch {
    return null;
  }
}

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`中国竞彩网接口请求失败：${response.status}`);
  const data = await response.json();
  if (data.errorCode !== "0") throw new Error(`中国竞彩网接口错误：${data.errorMessage || data.errorCode}`);
  return data.value || {};
}

function flattenGroups(groups = []) {
  return groups.flatMap((group) =>
    (group.subMatchList || []).map((match) => ({
      ...match,
      groupMatchDate: group.matchDate,
      groupWeekday: group.weekday,
    })),
  );
}

function isWorldCupRaw(match) {
  const text = [match.leagueAllName, match.leagueAbbName, match.competition].filter(Boolean).join(" ");
  return text.includes(WORLD_CUP_KEYWORD);
}

function isWorldCupMatch(match) {
  return String(match.competition || "").includes(WORLD_CUP_KEYWORD);
}

function isWorldCupPlan(plan) {
  return (plan.picks || []).every((pick) => String(pick.competition || "").includes(WORLD_CUP_KEYWORD));
}

function hasScore(score) {
  return score && Number.isFinite(Number(score.home)) && Number.isFinite(Number(score.away));
}

const SCORE_CORRECTIONS = {
  2040163: { home: 2, away: 1 },
};

function correctedScoreForEvent(eventId, score) {
  const correction = SCORE_CORRECTIONS[String(eventId)];
  return correction ? { ...score, ...correction } : score;
}

async function getLocalJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

async function waitForBrowserDevtools(port) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  for (let i = 0; i < 60; i += 1) {
    try {
      return await getLocalJson(versionUrl);
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome DevTools 未启动");
}

async function openCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (!data.id || !pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message));
    else resolve(data.result);
  });
  return {
    send(method, params = {}) {
      id += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      socket.close();
    },
  };
}

function scoreFromBrowserLines(lines, noIndex) {
  const vsIndex = lines.indexOf("VS", noIndex);
  if (vsIndex > -1) return { home: null, away: null, homeIndex: noIndex + 1, awayIndex: vsIndex + 1 };
  const home = Number(lines[noIndex + 2]);
  const away = Number(lines[noIndex + 4]);
  if (Number.isFinite(home) && Number.isFinite(away) && lines[noIndex + 3] === ":") {
    return { home, away, homeIndex: noIndex + 1, awayIndex: noIndex + 5 };
  }
  return { home: null, away: null, homeIndex: noIndex + 1, awayIndex: noIndex + 3 };
}

function matchDateFromBrowserLine(groupDate, monthDay) {
  if (!groupDate || !/^\d{2}-\d{2}$/.test(monthDay || "")) return groupDate;
  return `${groupDate.slice(0, 4)}-${monthDay}`;
}

function browserStatusCode(text = "") {
  if (text.includes("完成") || text.includes("完场") || text.includes("直播结束") || text.includes("已开奖")) return "11";
  if (text.includes("直播") || text.includes("上半场") || text.includes("下半场") || text.includes("中场")) return "5";
  if (text.includes("推迟")) return "8";
  if (text.includes("取消")) return "9";
  if (text.includes("暂停")) return "7";
  if (text.includes("待开奖")) return "10";
  if (text.includes("未开播")) return "4";
  if (text.includes("未开售")) return "1";
  return "2";
}

function parseBrowserMatch(item) {
  const lines = item.text || [];
  const noIndex = lines.findIndex((line) => /^周[一二三四五六日]\d{3}$/.test(line));
  if (!item.id || noIndex < 3) return null;
  const score = correctedScoreForEvent(item.id, scoreFromBrowserLines(lines, noIndex));
  const statusText = lines[lines.length - 1] || "";
  return {
    matchId: item.id,
    matchNumStr: lines[noIndex],
    matchDate: matchDateFromBrowserLine(item.groupDate, lines[noIndex - 2]),
    businessDate: item.groupDate,
    groupMatchDate: item.groupDate,
    groupWeekday: item.groupWeekday,
    matchTime: lines[noIndex - 1],
    matchStatus: browserStatusCode(statusText),
    matchStatusName: statusText,
    saleStatusName: statusText,
    sectionsNo999: score.home === null || score.away === null ? "" : `${score.home}:${score.away}`,
    leagueAllName: lines[noIndex - 3] || "足球赛事",
    leagueAbbName: lines[noIndex - 3] || "足球赛事",
    homeTeamAllName: lines[score.homeIndex] || "主队待定",
    homeTeamAbbName: lines[score.homeIndex] || "主队待定",
    awayTeamAllName: lines[score.awayIndex] || "客队待定",
    awayTeamAbbName: lines[score.awayIndex] || "客队待定",
  };
}

async function fetchListWithBrowser(method) {
  if (!fsSync.existsSync(CHROME_PATH)) throw new Error(`找不到 Chrome：${CHROME_PATH}`);
  const profileDir = path.resolve(".tmp", "sporttery-chrome-profile");
  fsSync.mkdirSync(profileDir, { recursive: true });
  const pageUrl = `https://m.sporttery.cn/mjc/zqsj/?tab=${encodeURIComponent(method)}`;
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${BROWSER_DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    pageUrl,
  ], { stdio: "ignore", detached: true });

  try {
    const version = await waitForBrowserDevtools(BROWSER_DEBUG_PORT);
    const browser = await openCdp(version.webSocketDebuggerUrl);
    const tabs = await getLocalJson(`http://127.0.0.1:${BROWSER_DEBUG_PORT}/json`);
    const tab = tabs.find((item) => item.url.includes("sporttery.cn")) || tabs[0];
    const page = await openCdp(tab.webSocketDebuggerUrl);
    await page.send("Runtime.enable");
    await sleep(3500);
    const expression = `
      [...document.querySelectorAll('.m-card')].flatMap((card) => {
        const groupText = card.querySelector('.m-cardTime')?.innerText || '';
        const groupDate = groupText.match(/\\d{4}-\\d{2}-\\d{2}/)?.[0] || '';
        const groupWeekday = groupText.match(/^周[一二三四五六日]/)?.[0] || '';
        return [...card.querySelectorAll('.m-cardList')].map((item) => ({
          id: (item.id || '').replace('#', ''),
          groupDate,
          groupWeekday,
          text: item.innerText.split('\\n').map((line) => line.trim()).filter(Boolean),
        }));
      })
    `;
    const result = await page.send("Runtime.evaluate", { expression, returnByValue: true });
    page.close();
    browser.close();
    const matches = (result.result.value || []).map(parseBrowserMatch).filter(Boolean).filter(isWorldCupRaw);
    if (!matches.length) throw new Error("浏览器页面未抓到赛事列表");
    console.warn(`[score] 浏览器采集 ${method} 成功：${matches.length} 场`);
    return matches;
  } finally {
    try {
      process.kill(-chrome.pid);
    } catch {
      try {
        chrome.kill();
      } catch {}
    }
  }
}

async function fetchList(method) {
  const url = `${API_BASE}/getMatchDataPageListV1.qry?method=${method}&pageSize=${PAGE_SIZE}`;
  try {
    return flattenGroups((await getJson(url)).matchInfoList || []);
  } catch (error) {
    if (!BROWSER_FALLBACK_ENABLED) throw error;
    console.warn(`[score] 官方接口直连失败，尝试浏览器采集 ${method}：${error.message}`);
    return fetchListWithBrowser(method);
  }
}

async function fetchLive(matches) {
  const ids = matches.map((match) => match.matchId).filter(Boolean);
  if (!ids.length) return { map: new Map(), list: [] };
  const url = `${API_BASE}/getMatchLiveV1.qry?matchIds=${ids.join(",")}&eventTc=goals,penalty_shootout&method=live`;
  let value = [];
  try {
    value = await getJson(url);
  } catch (error) {
    console.warn(`[score] 实时比分接口直连失败，使用浏览器列表中的比分状态：${error.message}`);
  }
  const list = Array.isArray(value) ? value : [];
  return { map: new Map(list.map((match) => [String(match.matchId), match])), list };
}

async function fetchMatchDetail(match) {
  if (!match?.matchId) return null;
  try {
    const url = `${API_BASE}/getMatchGeneral.qry?matchId=${match.matchId}&matchStatus=${match.matchStatus || ""}`;
    return await getJson(url);
  } catch {
    return null;
  }
}

async function fetchMatchDetails(matches) {
  const details = new Map();
  for (const match of matches) {
    const key = String(match.matchId || "");
    if (!key || details.has(key)) continue;
    let detail = await fetchMatchDetail(match);
    if (detail && !Array.isArray(detail.poolList) && !Array.isArray(detail.matchResultList)) {
      await sleep(180);
      detail = await fetchMatchDetail(match);
    }
    if (detail) details.set(key, detail);
    await sleep(80);
  }
  return details;
}

function parseScore(value) {
  if (!value || !String(value).includes(":")) return { home: null, away: null };
  const [home, away] = String(value).split(":").map((part) => Number(part));
  if (!Number.isFinite(home) || !Number.isFinite(away)) return { home: null, away: null };
  return { home, away };
}

function formatSportteryNo(match, index) {
  if (match.matchNumStr) return match.matchNumStr;

  const matchNum = String(match.matchNum || "");
  if (/^[1-7]\d{3}$/.test(matchNum)) {
    const weekdays = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    return `${weekdays[Number(matchNum[0])]}${matchNum.slice(1)}`;
  }

  return `竞彩${match.matchNum || index + 1}`;
}

function getSaleStatusName(statusName = "") {
  return /开售|销售|暂停|取消|推迟|已完成/.test(statusName) ? statusName : "";
}

function mergeLive(match, liveMap) {
  const live = liveMap.get(String(match.matchId));
  if (!live) return match;
  return {
    ...match,
    ...live,
    matchNumStr: match.matchNumStr || live.matchNumStr,
    businessDate: match.businessDate || live.businessDate,
    saleStatusName: getSaleStatusName(match.matchStatusName),
    groupMatchDate: match.groupMatchDate,
    groupWeekday: match.groupWeekday,
  };
}

function hydrateLiveMatch(match, oldByEventId) {
  const old = oldByEventId.get(String(match.matchId));
  return {
    ...match,
    matchNumStr: match.matchNumStr || old?.sportteryNo || "",
    businessDate: old?.businessDate || old?.saleDate || old?.date || match.businessDate,
    saleStatusName: getSaleStatusName(old?.saleStatusName) || old?.tags?.find((tag) => /开售|销售|完成|暂停|取消/.test(tag)),
  };
}

function sortRawMatches(a, b) {
  const aTime = `${a.matchDate || a.businessDate || a.groupMatchDate || ""} ${a.matchTime || ""}`;
  const bTime = `${b.matchDate || b.businessDate || b.groupMatchDate || ""} ${b.matchTime || ""}`;
  return aTime.localeCompare(bTime) || String(a.matchId).localeCompare(String(b.matchId));
}

function getStatus(match) {
  const code = String(match.matchStatus || "");
  if (["5", "7"].includes(code)) return "live";
  if (["6", "10", "11", "12", "13"].includes(code)) return "finished";
  return "pre";
}

function getMinute(match, status) {
  if (status === "finished") return 90;
  if (status !== "live") return null;
  const minute = Number(match.matchMinute);
  return Number.isFinite(minute) ? clamp(minute, 1, 120) : null;
}

function getKickoff(match) {
  return String(match.matchTime || "00:00").slice(0, 5);
}

function teamPower(name, fallback) {
  const text = String(name || "");
  const key = Object.keys(TEAM_POWER).find((item) => text.includes(item));
  if (key) return TEAM_POWER[key];
  return fallback;
}

function teamProfile(name, fallback) {
  const text = String(name || "");
  const key = Object.keys(TEAM_POWER).find((item) => text.includes(item));
  const power = key ? TEAM_POWER[key] : fallback;
  const style = key ? TEAM_STYLE[key] : null;
  return {
    name: key || text || "未知球队",
    power,
    attack: style?.attack ?? clamp(power - 2, 58, 88),
    defense: style?.defense ?? clamp(power - 3, 56, 86),
    stability: style?.stability ?? clamp(power - 4, 55, 86),
  };
}

function getStrengthEdge(match) {
  const homeFallback = 72 + (Number(match.homeTeamId || 0) % 17);
  const awayFallback = 72 + (Number(match.awayTeamId || 0) % 17);
  const home = teamProfile(match.homeTeamAllName || match.homeTeamAbbName, homeFallback);
  const away = teamProfile(match.awayTeamAllName || match.awayTeamAbbName, awayFallback);
  return home.power - away.power + 2;
}

function getModelProfile(match) {
  const homeFallback = 72 + (Number(match.homeTeamId || 0) % 17);
  const awayFallback = 72 + (Number(match.awayTeamId || 0) % 17);
  const home = teamProfile(match.homeTeamAllName || match.homeTeamAbbName, homeFallback);
  const away = teamProfile(match.awayTeamAllName || match.awayTeamAbbName, awayFallback);
  const strengthEdge = home.power - away.power + 2;
  const attackEdge = home.attack - away.defense;
  const awayAttackEdge = away.attack - home.defense;
  const goalBias = clamp(Math.round((home.attack + away.attack - home.defense - away.defense) / 4), -8, 8);
  const stability = Math.round((home.stability + away.stability) / 2);

  return {
    home,
    away,
    strengthEdge,
    attackEdge,
    awayAttackEdge,
    goalBias,
    stability,
    summary: `强弱差 ${strengthEdge >= 0 ? "+" : ""}${strengthEdge}，进球倾向 ${goalBias >= 0 ? "+" : ""}${goalBias}，稳定度 ${stability}`,
  };
}

function buildMarketCalibration(oldData) {
  const buckets = Object.fromEntries(
    Object.keys(DEFAULT_MARKET_WEIGHTS).map((market) => [
      market,
      {
        hits: 0,
        total: 0,
        weight: DEFAULT_MARKET_WEIGHTS[market],
      },
    ]),
  );

  (oldData?.planArchive || []).forEach((plan) => {
    (plan.picks || []).forEach((pick) => {
      if (pick.hit !== true && pick.hit !== false) return;
      const bucket = buckets[pick.marketKey];
      if (!bucket) return;
      bucket.total += 1;
      if (pick.hit) bucket.hits += 1;
    });
  });

  Object.entries(buckets).forEach(([market, bucket]) => {
    if (bucket.total >= 4) {
      const hitRate = bucket.hits / bucket.total;
      const baseline = market === "score" ? 0.22 : market === "ou" ? 0.34 : market === "htft" ? 0.3 : 0.48;
      bucket.weight = clamp(DEFAULT_MARKET_WEIGHTS[market] + (hitRate - baseline) * 0.42, 0.52, 1.18);
    }
  });

  return {
    marketWeights: Object.fromEntries(Object.entries(buckets).map(([market, bucket]) => [market, Number(bucket.weight.toFixed(3))])),
    marketSamples: Object.fromEntries(
      Object.entries(buckets).map(([market, bucket]) => [
        market,
        {
          hits: bucket.hits,
          total: bucket.total,
          hitRate: bucket.total ? Number((bucket.hits / bucket.total).toFixed(3)) : 0,
        },
      ]),
    ),
  };
}

function calibratedProbability(baseProbability, marketKey, calibration) {
  const weight = calibration?.marketWeights?.[marketKey] ?? DEFAULT_MARKET_WEIGHTS[marketKey] ?? 1;
  const floor = marketKey === "score" ? 0.08 : marketKey === "htft" ? 0.12 : 0.16;
  const ceiling = marketKey === "score" ? 0.42 : marketKey === "ou" ? 0.62 : 0.76;
  return clamp(baseProbability * weight, floor, ceiling);
}

function applyMarketCalibration(markets, calibration) {
  Object.entries(markets).forEach(([marketKey, market]) => {
    const baseProbability = market.probability;
    market.baseProbability = Number(baseProbability.toFixed(3));
    market.probability = Number(calibratedProbability(baseProbability, marketKey, calibration).toFixed(3));
    market.modelWeight = calibration?.marketWeights?.[marketKey] ?? DEFAULT_MARKET_WEIGHTS[marketKey] ?? 1;
    market.sampleSize = calibration?.marketSamples?.[marketKey]?.total ?? 0;
  });
  return markets;
}

function stableIndex(match, size) {
  const text = `${match.homeTeamAllName || match.homeTeamAbbName}-${match.awayTeamAllName || match.awayTeamAbbName}-${match.matchTime || ""}`;
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash % size;
}

function scoreModel(match, score) {
  if (score.home !== null && score.away !== null) {
    if (score.home > score.away) return { pick: "主胜", probability: 0.72 };
    if (score.home < score.away) return { pick: "客胜", probability: 0.66 };
    return { pick: "平", probability: 0.58 };
  }

  const profile = getModelProfile(match);
  const edge = profile.strengthEdge;
  const absEdge = Math.abs(edge);
  if (absEdge <= 4) return { pick: "平", probability: 0.36 };
  const stabilityBoost = (profile.stability - 70) / 300;
  const probability = clamp(0.42 + absEdge / 100 + stabilityBoost, 0.43, 0.7);
  return { pick: edge > 0 ? "主胜" : "客胜", probability };
}

function detailPools(detail) {
  const sellingPools = Array.isArray(detail?.poolList) ? detail.poolList.map((pool) => pool.poolCode).filter(Boolean) : [];
  const resultPools = Array.isArray(detail?.matchResultList)
    ? detail.matchResultList.map((result) => result.poolCode).filter(Boolean)
    : [];
  return [...new Set([...sellingPools, ...resultPools])];
}

function availablePoolsForMatch(match, detail) {
  const pools = detailPools(detail);
  if (["h", "d", "a"].every((key) => String(match[key] ?? "").trim() !== "")) pools.push("HAD");
  if (!pools.includes("HHAD")) pools.push("HHAD");
  return [...new Set(pools)];
}

function poolFromDetail(detail, poolCode) {
  return Array.isArray(detail?.poolList) ? detail.poolList.find((pool) => pool.poolCode === poolCode) : null;
}

function poolBetOption(match, detail, poolCode) {
  const pool = poolFromDetail(detail, poolCode);
  if (pool) {
    return {
      poolCode,
      single: Number(pool.single) === 1,
      allUp: Number(pool.allUp) === 1,
      selling: Number(pool.value) === 1 && !/Paused|暂停/.test(String(pool.poolStatus || "")),
      poolStatus: pool.poolStatus || "",
    };
  }

  if (poolCode === "HAD" && ["h", "d", "a"].every((key) => String(match[key] ?? "").trim() !== "")) {
    return { poolCode, single: true, allUp: true, selling: true, poolStatus: "Selling" };
  }
  if (poolCode === "HHAD") {
    return { poolCode, single: false, allUp: true, selling: true, poolStatus: "Selling" };
  }
  return { poolCode, single: null, allUp: null, selling: false, poolStatus: "" };
}

function marketBetOptions(match, detail) {
  return Object.fromEntries(
    Object.entries(MARKET_POOL_CODES).map(([marketKey, poolCode]) => [marketKey, poolBetOption(match, detail, poolCode)]),
  );
}

function resultFromDetail(detail, poolCode) {
  return Array.isArray(detail?.matchResultList) ? detail.matchResultList.find((result) => result.poolCode === poolCode) : null;
}

function isPoolAvailable(match, detail, poolCode) {
  const pool = poolFromDetail(detail, poolCode);
  if (pool) return Number(pool.value) === 1 && !/Paused|暂停/.test(String(pool.poolStatus || ""));
  if (resultFromDetail(detail, poolCode)) return true;
  if (poolCode === "HAD") return ["h", "d", "a"].every((key) => String(match[key] ?? "").trim() !== "");
  if (poolCode === "HHAD") return true;
  return false;
}

function hasStandardWdl(match, detail) {
  return isPoolAvailable(match, detail, "HAD");
}

function officialHandicap(detail) {
  const result = resultFromDetail(detail, "HHAD");
  const found = String(result?.combinationDesc || "").match(/\(([+-]\d+)\)/);
  return found ? Number(found[1]) : null;
}

function confirmedHandicapLine(match) {
  const line = CONFIRMED_HANDICAP_LINES[String(match?.matchId ?? match?.sourceEventId ?? "")];
  return Number.isFinite(Number(line)) ? Number(line) : null;
}

function officialHdcPick(detail) {
  const result = resultFromDetail(detail, "HHAD");
  if (!result) return null;
  if (result.combination === "H" || String(result.combinationDesc || "").endsWith("胜")) return "让胜";
  if (result.combination === "D" || String(result.combinationDesc || "").endsWith("平")) return "让平";
  if (result.combination === "A" || String(result.combinationDesc || "").endsWith("负")) return "让负";
  return null;
}

function normalizeHdcPick(pick = "") {
  if (String(pick).includes("让胜")) return "让胜";
  if (String(pick).includes("让平")) return "让平";
  if (String(pick).includes("让负")) return "让负";
  return pick;
}

function getStrengthSeed(match) {
  return getStrengthEdge(match);
}

function estimateHandicapLine(match) {
  const edge = getStrengthSeed(match);
  const homeOdds = Number(match.h);
  const awayOdds = Number(match.a);

  if (Number.isFinite(homeOdds) && homeOdds <= 1.76) return -1;
  if (Number.isFinite(awayOdds) && awayOdds <= 1.76) return 1;
  if (edge >= 8) return -1;
  if (edge <= -8) return 1;
  return edge >= 0 ? -1 : 1;
}

function getEstimatedScore(match, wdlPick, exactGoals) {
  const total = exactGoals === "4+" ? 4 : Number(exactGoals);
  if (!Number.isFinite(total) || total <= 0) return "0-0";
  const edge = getStrengthEdge(match);
  const absEdge = Math.abs(edge);

  const candidates = [];
  for (let home = 0; home <= total; home += 1) {
    const away = total - home;
    if (wdlPick === "平" && home === away) candidates.push(`${home}-${away}`);
    if (wdlPick === "主胜" && home > away) candidates.push(`${home}-${away}`);
    if (wdlPick === "客胜" && home < away) candidates.push(`${home}-${away}`);
  }

  const fallback = wdlPick === "平" ? ["0-0", "1-1", "2-2"] : wdlPick === "主胜" ? ["1-0", "2-1", "3-1"] : ["0-1", "1-2", "1-3"];
  const pool = candidates.length ? candidates : fallback;

  const ranked = pool.sort((a, b) => {
    const [aHome, aAway] = a.split("-").map(Number);
    const [bHome, bAway] = b.split("-").map(Number);
    const aMargin = Math.abs(aHome - aAway);
    const bMargin = Math.abs(bHome - bAway);
    const preferredMargin = absEdge >= 24 ? 3 : absEdge >= 16 ? 2 : 1;
    return Math.abs(aMargin - preferredMargin) - Math.abs(bMargin - preferredMargin);
  });

  const top = ranked.slice(0, Math.min(3, ranked.length));
  return top[stableIndex(match, top.length)];
}

function uniqueOptions(items, size = 2) {
  return items.map((item) => String(item)).filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).slice(0, size);
}

function scoreTotal(scoreText) {
  const [home, away] = String(scoreText || "").split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return home + away;
}

function goalLabelFromTotal(total) {
  return Number(total) >= 4 ? "4+" : String(total);
}

function getEstimatedScoreOptions(match, wdlPick, exactGoals, score) {
  if (score.home !== null && score.away !== null) return [`${score.home}-${score.away}`];

  const override = SCORE_OPTION_OVERRIDES[String(match.matchId)];
  if (override) return uniqueOptions(override, 2);

  const handicap = confirmedHandicapLine(match);
  if (Number.isFinite(handicap)) {
    if (handicap <= -3) return ["3-0", "4-0"];
    if (handicap === -2) return ["2-0", "3-0"];
    if (handicap >= 3) return ["0-3", "0-4"];
    if (handicap === 2) return ["0-2", "1-2"];
  }

  const primary = getEstimatedScore(match, wdlPick, exactGoals);
  const [home, away] = primary.split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return uniqueOptions([primary, "1-1"], 2);

  const variants = [primary];
  if (home > away) {
    variants.push(`${Math.max(home + 1, 2)}-${away}`, `${home}-${away + 1}`);
  } else if (home < away) {
    variants.push(`${home}-${Math.max(away + 1, 2)}`, `${home + 1}-${away}`);
  } else {
    variants.push(home === 0 ? "1-1" : `${home + 1}-${away + 1}`, "0-0");
  }

  return uniqueOptions(variants, 2);
}

function getExactGoalOptions(match, exactGoals, scoreOptions, score) {
  if (score.home !== null && score.away !== null) return [goalLabelFromTotal(score.home + score.away)];

  const override = GOAL_OPTION_OVERRIDES[String(match.matchId)];
  if (override) return uniqueOptions(override, 2);

  const fromScores = scoreOptions.map(scoreTotal).filter((total) => total !== null).map(goalLabelFromTotal);
  const base = exactGoals === "0" ? "1" : exactGoals;
  const numeric = Number(base);
  const adjacent = Number.isFinite(numeric) ? goalLabelFromTotal(numeric + 1) : "3";
  return uniqueOptions([base, ...fromScores, adjacent], 2);
}

function handicapPickFromScore(score, handicap) {
  const adjustedHome = score.home + handicap;
  if (adjustedHome > score.away) return "让胜";
  if (adjustedHome < score.away) return "让负";
  return "让平";
}

function handicapModel(match, score, wdlPick, detail) {
  const officialLine = officialHandicap(detail);
  const confirmedLine = confirmedHandicapLine(match);
  const handicap = Number.isFinite(officialLine) ? officialLine : Number.isFinite(confirmedLine) ? confirmedLine : estimateHandicapLine(match);
  if (score.home !== null && score.away !== null) {
    return {
      handicap,
      pick: officialHdcPick(detail) || handicapPickFromScore(score, handicap),
      probability: 0.7,
    };
  }

  const edge = getStrengthSeed(match);
  const expectedHomeMargin = Math.round(edge / 10);
  const adjustedMargin = expectedHomeMargin + handicap;
  const pick = adjustedMargin > 0 ? "让胜" : adjustedMargin < 0 ? "让负" : "让平";
  const probability = wdlPick === "平" ? 0.38 : Math.abs(adjustedMargin) >= 2 ? 0.46 : 0.42;
  return { handicap, pick, probability };
}

function scoreResult(score) {
  if (score.home > score.away) return "胜";
  if (score.home < score.away) return "负";
  return "平";
}

function htftModel(match, status, score, wdlPick, exactGoals) {
  if (status === "finished" && score.home !== null && score.away !== null) {
    const halfScore = parseScore(match.sectionsNo1);
    const half = halfScore.home !== null && halfScore.away !== null ? scoreResult(halfScore) : "平";
    const full = scoreResult(score);
    return {
      pick: `${half}/${full}`,
      probability: 0.52,
      confidence: 70,
      risk: "高",
      reason: "根据半场和全场比分做复盘方向。",
    };
  }

  const profile = getModelProfile(match);
  const edge = profile.strengthEdge;
  const absEdge = Math.abs(edge);
  const goals = exactGoals === "4+" ? 4 : Number(exactGoals);
  const lowGoalDraw = Number.isFinite(goals) && goals <= 1;

  if (wdlPick === "主胜") {
    const earlyControl = absEdge >= 18 && profile.attackEdge >= 8 && !lowGoalDraw;
    return {
      pick: earlyControl ? "胜/胜" : "平/胜",
      probability: earlyControl ? 0.34 : 0.29,
      confidence: earlyControl ? 58 : 54,
      risk: "高",
      reason: earlyControl ? "强弱差和主队进攻倾向较明显，倾向主队半场建立优势。" : "主队方向占优但半场不确定性较高，倾向下半场兑现优势。",
    };
  }

  if (wdlPick === "客胜") {
    const earlyControl = absEdge >= 18 && profile.awayAttackEdge >= 6 && !lowGoalDraw;
    return {
      pick: earlyControl ? "负/负" : "平/负",
      probability: earlyControl ? 0.32 : 0.28,
      confidence: earlyControl ? 56 : 52,
      risk: "高",
      reason: earlyControl ? "客队强度和客队进攻倾向占优，倾向客队半场领先并保持。" : "客队方向占优但早段不确定性较高，倾向下半场拉开。",
    };
  }

  const drawPath = profile.goalBias <= 0 || lowGoalDraw ? "平/平" : edge >= 0 ? "胜/平" : "负/平";
  return {
    pick: drawPath,
    probability: drawPath === "平/平" ? 0.3 : 0.24,
    confidence: drawPath === "平/平" ? 52 : 46,
    risk: "高",
    reason: "平局方向下半场波动较大，结合进球倾向给出半全场观察路径。",
  };
}

function htftModelV2(match, status, score, wdlPick, exactGoals) {
  if (status === "finished" && score.home !== null && score.away !== null) {
    const halfScore = parseScore(match.sectionsNo1);
    const half = halfScore.home !== null && halfScore.away !== null ? scoreResult(halfScore) : "平";
    const full = scoreResult(score);
    return {
      pick: `${half}/${full}`,
      probability: 0.52,
      confidence: 70,
      risk: "高",
      reason: "根据半场和全场比分做复盘方向。",
    };
  }

  const profile = getModelProfile(match);
  const edge = profile.strengthEdge;
  const absEdge = Math.abs(edge);
  const goals = exactGoals === "4+" ? 4 : Number(exactGoals);
  const lowGoalDraw = Number.isFinite(goals) && goals <= 1;
  const kickoffHour = Number(String(match.matchTime || "00:00").slice(0, 2));
  const lateOrEarly = Number.isFinite(kickoffHour) && (kickoffHour <= 4 || kickoffHour >= 21);
  const handicap = confirmedHandicapLine(match) ?? estimateHandicapLine(match);
  const deepFavorite = Math.abs(handicap) >= 2 || absEdge >= 22;
  const balanced = absEdge <= 6;
  const openGame = exactGoals === "4+" || Number(goals) >= 3 || profile.goalBias >= 4;
  const variant = stableIndex(match, 3);

  if (wdlPick === "主胜") {
    const earlyControl = (deepFavorite || profile.attackEdge >= 7 || (openGame && !lateOrEarly)) && !lowGoalDraw;
    const pick = earlyControl ? (variant === 0 ? "胜/胜" : variant === 1 ? "平/胜" : "胜/平") : "平/胜";
    return {
      pick,
      probability: earlyControl ? 0.35 : 0.29,
      confidence: earlyControl ? 60 : 54,
      risk: "高",
      reason: earlyControl ? "主队强势面或进攻倾向较明显，半场不再默认保守，优先观察主队早段压制。" : "主队方向占优但早段不确定性较高，倾向下半场兑现优势。",
    };
  }

  if (wdlPick === "客胜") {
    const earlyControl = (deepFavorite || profile.awayAttackEdge >= 6 || (openGame && !lateOrEarly)) && !lowGoalDraw;
    const pick = earlyControl ? (variant === 0 ? "负/负" : variant === 1 ? "平/负" : "负/平") : "平/负";
    return {
      pick,
      probability: earlyControl ? 0.33 : 0.28,
      confidence: earlyControl ? 58 : 52,
      risk: "高",
      reason: earlyControl ? "客队强度或反击效率占优，半场路径允许客队先建立优势。" : "客队方向占优但早段仍偏谨慎，倾向下半场拉开。",
    };
  }

  const drawPath = balanced
    ? variant === 0
      ? "平/平"
      : variant === 1
        ? "胜/平"
        : "负/平"
    : profile.goalBias <= 0 || lowGoalDraw
      ? "平/平"
      : edge >= 0
        ? "胜/平"
        : "负/平";
  return {
    pick: drawPath,
    probability: drawPath === "平/平" ? 0.3 : 0.25,
    confidence: drawPath === "平/平" ? 52 : 48,
    risk: "高",
    reason: "平局方向下半场波动较大，结合强弱差和进球倾向给出更分散的半全场路径。",
  };
}

function estimateExactGoals(match, wdlPick) {
  const profile = getModelProfile(match);
  const seed = Math.abs(profile.strengthEdge);
  const kickoffHour = Number(String(match.matchTime || "00:00").slice(0, 2));
  const lateOrEarly = kickoffHour >= 20 || kickoffHour <= 4;
  let goals;
  if (seed >= 24 || profile.goalBias >= 5) goals = stableIndex(match, 4) === 0 ? "4+" : "3";
  else if (seed >= 16 || profile.goalBias >= 3) goals = lateOrEarly ? "3" : ["2", "3"][stableIndex(match, 2)];
  else if (seed <= 4) goals = lateOrEarly ? ["1", "2"][stableIndex(match, 2)] : ["1", "2"][stableIndex(match, 2)];
  else goals = ["1", "2", "3"][stableIndex(match, 3)];
  if (wdlPick === "平" && goals !== "4+" && Number(goals) % 2 === 1) return Number(goals) <= 1 ? "0" : "2";
  return goals;
}

function buildMarkets(match, status, score, options = {}) {
  const wdl = scoreModel(match, score);
  const total = score.home === null || score.away === null ? null : score.home + score.away;
  let exactGoals = total === null ? estimateExactGoals(match, wdl.pick) : total >= 4 ? "4+" : String(total);
  if (total === null && exactGoals === "0") exactGoals = "1";
  const scoreOptions = getEstimatedScoreOptions(match, wdl.pick, exactGoals, score);
  const exactGoalOptions = getExactGoalOptions(match, exactGoals, scoreOptions, score);
  exactGoals = exactGoalOptions[0] || exactGoals;
  const exactGoalLabel = `${exactGoals}球`;
  const goalProbability = total === null ? (exactGoalOptions.length > 1 ? 0.42 : 0.34) : 0.78;
  const handicap = handicapModel(match, score, wdl.pick, options.detail);
  const exactScore = scoreOptions[0];
  const scoreProbability = total === null ? (scoreOptions.length > 1 ? 0.27 : 0.2) : 0.82;
  const htft = htftModelV2(match, status, score, wdl.pick, exactGoals);

  const markets = {
    hdc: {
      handicap: handicap.handicap,
      pick: handicap.pick,
      probability: handicap.probability,
      confidence: status === "finished" ? 84 : 58,
      risk: "中",
      reason:
        status === "finished"
          ? `根据中国竞彩网完场比分和${handicap.handicap > 0 ? "受让" : "让"}${Math.abs(handicap.handicap)}球结果复盘。`
          : `按主客队基础强弱估算${handicap.handicap > 0 ? "受让" : "让"}${Math.abs(handicap.handicap)}球方向。`,
    },
    ou: {
      pick: exactGoalLabel,
      exactGoals,
      exactGoalOptions,
      probability: goalProbability,
      confidence: status === "finished" ? 84 : 62,
      risk: "中",
      reason: status === "finished" ? "根据中国竞彩网完场比分计算具体总进球数。" : "根据赛事类型、赛程时段和进球分布模型给出具体总进球数观察值。",
    },
    score: {
      pick: exactScore,
      scoreOptions,
      probability: scoreProbability,
      confidence: status === "finished" ? 82 : 42,
      risk: "高",
      reason: status === "finished" ? "根据中国竞彩网完场比分复盘比分玩法。" : "比分玩法波动较大，当前仅作为高风险小比例串单候选。",
    },
    htft: {
      pick: htft.pick,
      probability: htft.probability,
      confidence: htft.confidence,
      risk: htft.risk,
      reason: htft.reason,
    },
  };

  if (options.standardWdl) {
    markets.wdl = {
      pick: wdl.pick,
      probability: wdl.probability,
      confidence: status === "finished" ? 88 : 64,
      risk: status === "finished" ? "低" : "中",
      reason: status === "finished" ? "根据中国竞彩网完场比分生成赛果复盘方向。" : "根据竞彩编号、赛程位置、主客队和基础胜负模型生成赛前方向。",
    };
  }

  return applyMarketCalibration(markets, options.calibration);
}

function normalizePreservedMarkets(preserved, generated, score, detail, standardWdl, calibration) {
  const markets = Object.fromEntries(Object.entries(preserved).filter(([key]) => key !== "wdl" || standardWdl));
  if (standardWdl && generated.wdl && !markets.wdl) markets.wdl = generated.wdl;

  const officialLine = officialHandicap(detail);
  if (markets.hdc && Number.isFinite(officialLine)) {
    markets.hdc = {
      ...markets.hdc,
      handicap: officialLine,
      pick: normalizeHdcPick(markets.hdc.pick),
      reason:
        score.home !== null && score.away !== null
          ? `根据中国竞彩网官方让球线${officialLine > 0 ? "受让" : "让"}${Math.abs(officialLine)}球校准复盘。`
          : markets.hdc.reason,
    };
  }

  return applyMarketCalibration(markets, calibration);
}

function rawTeamName(match, side) {
  return side === "home"
    ? match.homeTeamAllName || match.homeTeamAbbName || match.homeTeam || "主队"
    : match.awayTeamAllName || match.awayTeamAbbName || match.awayTeam || "客队";
}

function kickoffBucket(match) {
  const hour = Number(String(match.matchTime || match.kickoff || "00:00").slice(0, 2));
  if (!Number.isFinite(hour)) return "常规时段";
  if (hour <= 4) return "凌晨场";
  if (hour < 12) return "上午场";
  if (hour < 18) return "下午场";
  return "晚间场";
}

function socialFactorsFromMatch(match, status) {
  const league = match.leagueAllName || match.leagueAbbName || "足球赛事";
  const isNational = league.includes("国际") || league.includes("国家") || league.includes("世界杯");
  const isClub = !isNational;
  const home = rawTeamName(match, "home");
  const away = rawTeamName(match, "away");
  const sportteryNo = match.matchNumStr || match.sportteryNo || "待编号";
  const saleStatus = match.saleStatusName || match.matchStatusName || "状态待确认";
  const profile = getModelProfile(match);
  const handicap = confirmedHandicapLine(match) ?? estimateHandicapLine(match);
  const absEdge = Math.abs(profile.strengthEdge);
  const favorite = profile.strengthEdge >= 0 ? home : away;
  const underdog = profile.strengthEdge >= 0 ? away : home;
  const gameTime = kickoffBucket(match);
  const taskText =
    absEdge >= 20
      ? `${favorite}纸面优势明显，${underdog}更可能优先压低节奏；轮换风险主要影响让球和比分深度。`
      : absEdge >= 8
        ? `${favorite}略占基础面，${underdog}仍有守平或反击空间；首发强度比单纯名气更关键。`
        : `${home}与${away}强弱差不大，任务目标更偏向拿分稳定性；临场阵容会明显影响胜平负方向。`;
  const externalText = isNational
    ? `${league}背景下，${home}对${away}更看重积分、净胜球和小组排序；${gameTime}需要额外观察旅途恢复与首发连续性。`
    : `${league}比赛外部变量权重较低，${home}对${away}重点看赛程密度、主客连续性和管理层压力。`;
  const integrityText =
    status === "finished"
      ? `${sportteryNo}已完赛，复盘重点回看进球时间、红牌伤退和临场阵容是否改变赛前判断。`
      : String(saleStatus).includes("暂停")
        ? `${sportteryNo}当前销售状态为${saleStatus}，应先移出主方案，等待恢复销售和官方状态确认。`
        : `${sportteryNo}当前状态为${saleStatus}，未见可核验异常；临场若出现停销、延期、红牌或首发大轮换再降权。`;
  const consequenceText =
    Math.abs(handicap) >= 3
      ? `盘口为${handicap > 0 ? "受让" : "让"}${Math.abs(handicap)}球，复盘时让球胜平负和比分权重高于普通胜平负。`
      : Math.abs(handicap) === 2
        ? `盘口为${handicap > 0 ? "受让" : "让"}2球，优先复盘让球结果与第二比分候选是否覆盖。`
        : `盘口为${handicap > 0 ? "受让" : "让"}${Math.abs(handicap)}球，复盘时同步看胜平负、总进球和比分候选。`;

  return {
    clubMotivation: taskText || (isClub
      ? "俱乐部赛事主要看赛程密度、轮换压力、排名目标和主客场连续性；当前仅使用公开赛程信息做中性评估。"
      : "国家队或国际赛主要看备战任务、排名压力、阵容轮换和旅途消耗；赛前方向需结合首发再确认。"),
    politicalFactor: externalText || (isNational
      ? "外部环境只作为情绪和压力变量观察，不直接推导赛果；重点仍放在阵容、节奏和比赛任务。"
      : "普通俱乐部比赛外部环境权重较低，主要观察德比属性、管理层压力和临场阵容变化。"),
    integrityRisk:
      integrityText || (status === "pre"
        ? "当前仅基于中国竞彩网公开赛程和状态，未见可核验异常信号；任何异常判断都以临场停销、延期、红牌和首发变化为准。"
        : "比分已进入复盘阶段，若结果明显偏离方案，应回看红牌、伤退、阵容轮换和临场节奏变化。"),
    consequence:
      consequenceText || (status === "finished"
        ? "完场比分用于复盘命中率，并调整后续模型对强弱差、进球数和比分玩法的权重。"
        : "若临场出现暂停销售、延期、取消、红牌、伤退或大幅轮换，应降低该场在串单中的权重。"),
    recommendation: String(match.matchStatusName || "").includes("暂停")
      ? "当前销售状态异常，建议暂不进入主方案。"
      : "可纳入观察池，最终以开售状态、首发和实时事件确认。",
  };
}

function mapMatch(match, index, oldByEventId = new Map(), calibration = null, detailMap = new Map()) {
  const status = getStatus(match);
  const sourceEventId = String(match.matchId);
  const score = correctedScoreForEvent(sourceEventId, parseScore(match.sectionsNo999));
  const detail = detailMap.get(sourceEventId) || null;
  const oldMatch = oldByEventId.get(sourceEventId);
  const preScore = { home: null, away: null };
  const standardWdl = hasStandardWdl(match, detail);
  const modelProfile = getModelProfile(match);
  const generatedMarkets = buildMarkets(match, status === "finished" ? "pre" : status, status === "finished" ? preScore : score, {
    standardWdl,
    calibration,
    detail,
  });
  const preservedMarkets =
    status === "finished" && oldMatch?.status !== "finished" && oldMatch?.markets
      ? normalizePreservedMarkets(oldMatch.markets, generatedMarkets, score, detail, standardWdl, calibration)
      : null;
  const markets =
    preservedMarkets ?? generatedMarkets;
  const actualMarkets = status === "finished" && hasScore(score) ? buildMarkets(match, status, score, { standardWdl, calibration, detail }) : null;
  const availablePools = availablePoolsForMatch(match, detail);
  const betOptions = marketBetOptions(match, detail);
  const sportteryNo = formatSportteryNo(match, index);
  const saleTag = match.saleStatusName || match.matchStatusName || "状态待确认";
  const liveStatusTag = match.matchStatusName && match.matchStatusName !== saleTag ? match.matchStatusName : "";

  return {
    id: String(index + 1).padStart(3, "0"),
    sourceEventId,
    sportteryNo,
    date: match.matchDate || match.businessDate || match.groupMatchDate,
    businessDate: match.businessDate || match.groupMatchDate || match.matchDate,
    saleStatusName: saleTag,
    liveStatusName: match.matchStatusName || "",
    matchDate: match.matchDate,
    kickoff: getKickoff(match),
    competition: match.leagueAllName || match.leagueAbbName || "足球赛事",
    homeTeam: match.homeTeamAllName || match.homeTeamAbbName || "主队待定",
    awayTeam: match.awayTeamAllName || match.awayTeamAbbName || "客队待定",
    status,
    score,
    halfScore: match.sectionsNo1 || "",
    minute: getMinute(match, status),
    tags: ["中国竞彩网", sportteryNo, saleTag, liveStatusTag].filter(Boolean),
    availablePools,
    betOptions,
    dataQuality: status === "finished" ? 92 : 86,
    importance: sportteryNo.includes("201") ? 88 : 78,
    risk: saleTag.includes("暂停") || saleTag.includes("取消") ? "高" : "中",
    stats: {
      form: "等待球队近况源",
      attack: status === "finished" ? 72 : 62,
      defense: status === "finished" ? 72 : 62,
      tempo: status === "live" ? 72 : 58,
      homeAway: `竞彩编号：${sportteryNo}，销售状态：${saleTag}`,
    },
    markets,
    actualMarkets,
    modelProfile,
    socialFactors: socialFactorsFromMatch(match, status),
  };
}

function chooseSocialNote(matches) {
  const hasPaused = matches.some((match) => match.tags.some((tag) => tag.includes("暂停") || tag.includes("取消")));
  return hasPaused ? "组合含销售状态异常赛事，建议等待恢复或替换。" : "组合来自中国竞彩网竞猜赛程，未见可核验异常，按谨慎方案处理。";
}

function purchaseCandidates(matches) {
  const blocked = ["已完成", "取消", "推迟"];
  return matches.filter((match) => match.status !== "finished" && !blocked.some((word) => match.tags.join("").includes(word)));
}

function combinations(items, size) {
  const result = [];
  function walk(start, group) {
    if (group.length === size) {
      result.push(group);
      return;
    }
    for (let index = start; index < items.length; index += 1) walk(index + 1, [...group, items[index]]);
  }
  walk(0, []);
  return result;
}

function marketProducts(matches) {
  const preferred = ["wdl", "hdc", "ou", "score", "htft"];
  const speculative = new Set(["score", "htft"]);
  return matches.reduce(
    (groups, match) =>
      groups.flatMap((group) =>
        preferred
          .filter((key) => match.markets[key] && match.betOptions?.[key]?.allUp !== false)
          .filter((key) => !speculative.has(key) || !group.some((item) => speculative.has(item)))
          .map((market) => [...group, market]),
      ),
    [[]],
  );
}

function marketStabilityScore(marketKey, market) {
  const base = { wdl: 0.94, hdc: 0.9, ou: 0.82, htft: 0.54, score: 0.48 }[marketKey] ?? 0.65;
  const probabilityBoost = clamp((market.probability || 0) - 0.3, -0.12, 0.12);
  const sampleBoost = Math.min((market.sampleSize || 0) / 100, 0.08);
  return clamp(base + probabilityBoost + sampleBoost, 0.35, 0.98);
}

function planStabilityScore(matches, markets, mode, requiredHits) {
  const scores = matches.map((match, index) => marketStabilityScore(markets[index], match.markets[markets[index]]));
  const average = scores.reduce((sum, item) => sum + item, 0) / scores.length;
  const guaranteeBoost = mode === "atLeast" ? 0.12 : 0;
  const speculativePenalty = markets.filter((market) => market === "score" || market === "htft").length * 0.08;
  const allHitPenalty = mode === "all" && markets.length >= 3 ? 0.06 : 0;
  return clamp(average + guaranteeBoost - speculativePenalty - allHitPenalty, 0.25, 0.98);
}

function protectionLabel(plan) {
  if (plan.mode === "atLeast") return `保底 ${plan.requiredHits}/${plan.planSize}`;
  const hasSpeculative = plan.markets.some((market) => market === "score" || market === "htft");
  return hasSpeculative ? "进取单" : "稳健全中";
}

function selectCategoryPlans(categoryPlans) {
  const sorted = categoryPlans.sort((a, b) => (b.planScore ?? b.planProbability) - (a.planScore ?? a.planProbability));
  const selected = sorted.slice(0, 5);
  const scorePlan = sorted.find((plan) => plan.markets.includes("score") && (plan.stabilityScore ?? 0) >= 0.55);
  if (scorePlan && !selected.some((plan) => plan.id === scorePlan.id)) {
    selected[selected.length - 1] = scorePlan;
    selected.sort((a, b) => (b.planScore ?? b.planProbability) - (a.planScore ?? a.planProbability));
  }
  return selected;
}

function planProbability(matches, markets, mode, requiredHits) {
  const probabilities = matches.map((match, index) => match.markets[markets[index]].probability);
  if (mode === "all") return probabilities.reduce((product, probability) => product * probability, 1);
  let total = 0;
  const count = 1 << probabilities.length;
  for (let mask = 0; mask < count; mask += 1) {
    let hits = 0;
    let probability = 1;
    probabilities.forEach((item, index) => {
      const hit = Boolean(mask & (1 << index));
      hits += hit ? 1 : 0;
      probability *= hit ? item : 1 - item;
    });
    if (hits >= requiredHits) total += probability;
  }
  return total;
}

function averageMarketWeight(matches, markets) {
  const weights = matches.map((match, index) => match.markets[markets[index]].modelWeight ?? 1);
  return weights.reduce((sum, item) => sum + item, 0) / weights.length;
}

function totalMarketSamples(matches, markets) {
  return markets.reduce((sum, market, index) => sum + (matches[index].markets[market].sampleSize ?? 0), 0);
}

function buildPurchasePlans(matches, targetDate) {
  const candidates = purchaseCandidates(matches)
    .filter((match) => match.date === targetDate)
    .sort((a, b) => b.dataQuality + b.importance - (a.dataQuality + a.importance));
  const categories = [
    { group: "二串一", size: 2, mode: "all", requiredHits: 2 },
    { group: "三串一", size: 3, mode: "all", requiredHits: 3 },
    { group: "三串二", size: 3, mode: "atLeast", requiredHits: 2 },
    { group: "四串一", size: 4, mode: "all", requiredHits: 4 },
    { group: "四串二", size: 4, mode: "atLeast", requiredHits: 2 },
  ].filter((category) => candidates.length >= category.size);
  const plans = [];

  categories.forEach((category) => {
    const categoryPlans = [];
    combinations(candidates.slice(0, 8), category.size).forEach((group, groupIndex) => {
      marketProducts(group).forEach((markets, marketIndex) => {
        const probability = planProbability(group, markets, category.mode, category.requiredHits);
        const stabilityScore = planStabilityScore(group, markets, category.mode, category.requiredHits);
        const planScore = probability * (0.72 + stabilityScore * 0.28);
        const marketLabel = [...new Set(markets.map((market) => marketNamesForArchive()[market]))].join("+");
        const protection = category.mode === "atLeast" ? `保底${category.requiredHits}/${category.size}` : markets.some((market) => market === "score" || market === "htft") ? "进取单" : "稳健单";
        const modelWeight = averageMarketWeight(group, markets);
        const modelSamples = totalMarketSamples(group, markets);
        categoryPlans.push({
          id: `tomorrow-${category.group}-${groupIndex}-${marketIndex}-${markets.join("-")}`,
          type: `明日${category.group}购买方案 · ${protection} · ${marketLabel}`,
          planGroup: category.group,
          planSize: category.size,
          mode: category.mode,
          requiredHits: category.requiredHits,
          matchIds: group.map((match) => match.id),
          eventIds: group.map((match) => match.sourceEventId),
          markets,
          planScore,
          stabilityScore: Number(stabilityScore.toFixed(3)),
          protection: category.mode === "atLeast" ? `保底 ${category.requiredHits}/${category.size}` : markets.some((market) => market === "score" || market === "htft") ? "进取单" : "稳健全中",
          risk: markets.includes("score") || markets.includes("htft") || category.size === 4 ? "高" : "中",
          planProbability: probability,
          modelWeight: Number(modelWeight.toFixed(3)),
          modelSamples,
          targetDate,
          note: `提前准备 ${targetDate} 同一天的竞彩串单，按校准概率排序；玩法权重 ${modelWeight.toFixed(2)}，复盘样本 ${modelSamples}，临场需再次确认开售状态和首发。`,
          socialNote: chooseSocialNote(group),
        });
      });
    });

    plans.push(...selectCategoryPlans(categoryPlans));
  });

  return plans;
}

function actualWdl(match) {
  if (match.score.home > match.score.away) return "主胜";
  if (match.score.home < match.score.away) return "客胜";
  return "平";
}

function isPickHit(match, marketKey, market) {
  if (match.status !== "finished") return null;
  if (!hasScore(match.score)) return null;
  if (marketKey === "wdl") return market.pick === (match.actualMarkets?.wdl?.pick || actualWdl(match));
  if (marketKey === "hdc") {
    const actual = match.actualMarkets?.hdc?.pick || handicapPickFromScore(match.score, Number(market.handicap || 0));
    return normalizeHdcPick(market.pick) === actual;
  }
  if (marketKey === "ou") {
    const total = match.score.home + match.score.away;
    const actual = total >= 4 ? "4+" : String(total);
    const fallback = String(market.pick || "").match(/4\+|\d+/)?.[0] || "";
    const options = uniqueOptions([...(market.exactGoalOptions || []), market.exactGoals, fallback], 4);
    return options.includes(actual);
  }
  if (marketKey === "score") {
    const actual = `${match.score.home}-${match.score.away}`;
    const options = uniqueOptions([...(market.scoreOptions || []), market.pick], 4);
    return options.includes(actual);
  }
  return null;
}

function createPlanSnapshot(plan, matches, generatedAt, today) {
  const picks = plan.markets.map((marketKey, index) => {
    const match =
      matches.find((item) => item.sourceEventId === plan.eventIds?.[index]) ||
      matches.find((item) => item.id === plan.matchIds[index]);
    const market = match?.markets?.[marketKey];

    return {
      sourceEventId: match?.sourceEventId || plan.eventIds?.[index] || "",
      sportteryNo: match?.sportteryNo || "",
      matchDate: match?.date || "",
      kickoff: match?.kickoff || "",
      competition: match?.competition || "",
      homeTeam: match?.homeTeam || "主队待定",
      awayTeam: match?.awayTeam || "客队待定",
      marketKey,
      marketName: marketNamesForArchive()[marketKey] || marketKey,
      pick: market ? formatArchivePick(marketKey, market) : "",
      exactGoals: marketKey === "ou" ? market?.exactGoals : undefined,
      exactGoalOptions: marketKey === "ou" ? market?.exactGoalOptions : undefined,
      scoreOptions: marketKey === "score" ? market?.scoreOptions : undefined,
      handicap: marketKey === "hdc" ? market?.handicap : undefined,
      probability: market?.probability || 0,
    };
  });

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    archiveId: `${today}-${plan.id}`,
    planId: plan.id,
    date: today,
    generatedAt,
    type: plan.type,
    planGroup: plan.planGroup,
    mode: plan.mode,
    requiredHits: plan.requiredHits,
    risk: plan.risk,
    protection: plan.protection,
    stabilityScore: plan.stabilityScore,
    note: plan.note,
    socialNote: plan.socialNote,
    targetDate: plan.targetDate,
    planProbability: plan.planProbability,
    picks,
  };
}

function marketNamesForArchive() {
  return {
    wdl: "胜平负",
    hdc: "让球胜平负",
    ou: "总进球数",
    score: "比分",
    htft: "半全场",
  };
}

function formatArchivePick(marketKey, market) {
  if (marketKey === "score" && Array.isArray(market.scoreOptions) && market.scoreOptions.length > 1) return market.scoreOptions.join(" / ");
  if (marketKey === "ou" && Array.isArray(market.exactGoalOptions) && market.exactGoalOptions.length > 1) return `${market.exactGoalOptions.join(" / ")}球`;
  if (marketKey === "hdc") return `${Number(market.handicap) > 0 ? "受让" : "让"}${Math.abs(Number(market.handicap || 0))}球 ${market.pick}`;
  return marketKey === "ou" ? `${market.exactGoals ?? String(market.pick).replace("球", "")}球` : market.pick;
}

function evaluateArchivedPlan(plan, matches) {
  const picks = plan.picks
    .map((pick) => {
      const match = matches.find((item) => item.sourceEventId === pick.sourceEventId);
      if (!match) return { ...pick, status: "pending", hit: null, score: "" };
      const score = match.score.home === null || match.score.away === null ? "" : `${match.score.home}-${match.score.away}`;
      const officialHdcLine = pick.marketKey === "hdc" ? match.actualMarkets?.hdc?.handicap ?? match.markets?.hdc?.handicap : undefined;
      const market = {
        pick: pick.marketKey === "hdc" ? normalizeHdcPick(pick.pick) : pick.pick,
        exactGoals: pick.marketKey === "ou" ? pick.exactGoals ?? String(pick.pick).replace("球", "") : undefined,
        exactGoalOptions: pick.marketKey === "ou" ? pick.exactGoalOptions : undefined,
        scoreOptions: pick.marketKey === "score" ? pick.scoreOptions : undefined,
        handicap: pick.marketKey === "hdc" ? officialHdcLine ?? pick.handicap : undefined,
      };
      const hit = isPickHit(match, pick.marketKey, market);
      return {
        ...pick,
        pick: pick.marketKey === "hdc" && Number.isFinite(Number(market.handicap)) ? formatArchivePick("hdc", market) : pick.pick,
        handicap: pick.marketKey === "hdc" ? market.handicap : pick.handicap,
        status: match.status,
        hit,
        score,
      };
    })
    .filter(Boolean);
  const settled = picks.filter((pick) => pick.hit !== null);
  const hits = settled.filter((pick) => pick.hit).length;
  const isSettled = settled.length === picks.length && picks.length > 0;
  const isHit = isSettled && (plan.mode === "all" ? hits === picks.length : hits >= plan.requiredHits);

  return {
    ...plan,
    picks,
    settledPicks: settled.length,
    hitPicks: hits,
    totalPicks: picks.length,
    result: isSettled ? (isHit ? "hit" : "miss") : "pending",
    probability: picks.length ? picks.reduce((sum, pick) => sum + (pick.probability || 0), 0) / picks.length : 0,
    detail: `${hits}/${picks.length} 命中`,
  };
}

function buildPlanArchive(oldData, plans, matches, allMatches, generatedAt, today) {
  const archive = (Array.isArray(oldData?.planArchive) ? oldData.planArchive : []).filter((plan) => {
    if (!isWorldCupPlan(plan)) return false;
    const isSettled = plan.result === "hit" || plan.result === "miss";
    const isCurrentSchema = plan.schemaVersion === PLAN_SCHEMA_VERSION;
    const isTodayPending = plan.date === today && !isSettled;
    return isSettled || isCurrentSchema || isTodayPending;
  });
  const byId = new Map(archive.map((plan) => [plan.archiveId, plan]));

  plans.forEach((plan) => {
    const snapshot = createPlanSnapshot(plan, matches, generatedAt, today);
    const existing = byId.get(snapshot.archiveId);
    if (!existing || existing.schemaVersion !== PLAN_SCHEMA_VERSION) byId.set(snapshot.archiveId, snapshot);
  });

  return [...byId.values()]
    .map((plan) => evaluateArchivedPlan(plan, allMatches))
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, 120);
}

function buildHistory(planArchive) {
  return planArchive
    .filter((plan) => plan.result === "hit" || plan.result === "miss")
    .map((plan) => ({
      date: plan.date,
      type: plan.type,
      result: plan.result,
      probability: plan.probability,
      detail: plan.detail,
      archiveId: plan.archiveId,
    }));
}

function evaluatePlan(plan, matches) {
  const archived = createPlanSnapshot(plan, matches, nowIsoShanghai(), todayInShanghai());
  const evaluated = evaluateArchivedPlan(archived, matches);
  if (evaluated.result === "pending") return null;

  return {
    date: matches[0]?.date || todayInShanghai(),
    type: plan.type,
    result: evaluated.result,
    probability: evaluated.probability,
    detail: evaluated.detail,
  };
}

function buildMarketHistory(planArchive) {
  const buckets = [
    { market: "wdl", name: "胜平负", hits: 0, total: 0, streak: "只统计购买方案" },
    { market: "hdc", name: "让球胜平负", hits: 0, total: 0, streak: "只统计购买方案" },
    { market: "ou", name: "总进球数", hits: 0, total: 0, streak: "只统计购买方案" },
    { market: "score", name: "比分", hits: 0, total: 0, streak: "高风险观察" },
    { market: "htft", name: "半全场", hits: 0, total: 0, streak: "只统计购买方案" },
  ];
  const byMarket = new Map(buckets.map((bucket) => [bucket.market, bucket]));

  planArchive.forEach((plan) => {
    if (plan.result !== "hit" && plan.result !== "miss") return;
    (plan.picks || []).forEach((pick) => {
      if (pick.hit !== true && pick.hit !== false) return;
      const bucket = byMarket.get(pick.marketKey);
      if (!bucket) return;
      bucket.total += 1;
      if (pick.hit) bucket.hits += 1;
    });
  });

  return buckets;
}

function buildAutoReview(history) {
  const reviewed = history.filter((item) => item.result === "hit" || item.result === "miss");
  const hits = reviewed.filter((item) => item.result === "hit").length;
  return {
    label: "自动复盘",
    reviewed: reviewed.length,
    hits,
    hitRate: reviewed.length ? hits / reviewed.length : 0,
    summary: reviewed.length ? `已自动复盘 ${reviewed.length} 个购买方案，命中 ${hits} 个。` : "等待比分完场后自动复盘购买方案命中率。",
  };
}

function buildDailyPlanSummaries(planArchive) {
  const byDate = new Map();

  planArchive.forEach((plan) => {
    if (!byDate.has(plan.date)) {
      byDate.set(plan.date, {
        date: plan.date,
        totalPlans: 0,
        reviewedPlans: 0,
        pendingPlans: 0,
        hitPlans: 0,
        hitRate: 0,
        planTypes: [],
        summary: "",
      });
    }

    const summary = byDate.get(plan.date);
    summary.totalPlans += 1;
    summary.planTypes.push(plan.type);
    if (plan.result === "hit" || plan.result === "miss") {
      summary.reviewedPlans += 1;
      if (plan.result === "hit") summary.hitPlans += 1;
    } else {
      summary.pendingPlans += 1;
    }
  });

  return [...byDate.values()]
    .map((item) => {
      const hitRate = item.reviewedPlans ? item.hitPlans / item.reviewedPlans : 0;
      return {
        ...item,
        planTypes: [...new Set(item.planTypes)],
        hitRate,
        summary: item.reviewedPlans
          ? `${item.date} 已复盘 ${item.reviewedPlans} 个购买方案，命中 ${item.hitPlans} 个，命中率 ${Math.round(hitRate * 100)}%。${item.pendingPlans ? `另有 ${item.pendingPlans} 个方案等待完赛。` : ""}`
          : `${item.date} 已推出 ${item.totalPlans} 个购买方案，等待比赛完场后统计命中率。`,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
}

function buildTomorrowPool(matches, targetDate) {
  return matches
    .filter((match) => match.date === targetDate)
    .slice(0, 5)
    .map((match, index) => ({
      category: index < 2 ? "竞彩候选" : "明日观察",
      matchId: match.id,
      market: index % 2 === 0 && match.markets.wdl ? "wdl" : index % 2 === 0 ? "hdc" : "ou",
      reason: `来自中国竞彩网竞猜赛程，竞彩编号 ${match.sportteryNo}，需等待开售状态和临场事件确认。`,
    }));
}

function isWithinHistoryWindow(dateText, today) {
  if (!dateText) return false;
  const start = addDays(today, -(HISTORY_WINDOW_DAYS - 1));
  return dateText >= start && dateText <= today;
}

function parseArchiveScore(value) {
  if (!value || !String(value).includes("-")) return { home: null, away: null };
  const [home, away] = String(value).split("-").map((part) => Number(part));
  if (!Number.isFinite(home) || !Number.isFinite(away)) return { home: null, away: null };
  return { home, away };
}

function archivePoolsForEvent(eventId, marketKeys) {
  const override = HISTORICAL_POOL_OVERRIDES[String(eventId)];
  if (override) return override;
  return [...new Set(marketKeys.map((marketKey) => MARKET_POOL_CODES[marketKey]).filter(Boolean))];
}

function archiveMarketFromPick(pick) {
  const probability = Number(pick.probability || 0);
  const base = {
    marketKey: pick.marketKey,
    scoreText: pick.score,
  };
  if (pick.marketKey === "wdl") {
    return {
      ...base,
      pick: pick.pick,
      probability,
      confidence: 64,
      risk: "中",
      reason: "来自赛前保存的胜平负预测，用于历史复盘。",
    };
  }
  if (pick.marketKey === "hdc") {
    const handicap = Number.isFinite(Number(pick.handicap)) ? Number(pick.handicap) : Number(String(pick.pick).match(/(\d+)/)?.[1] || 0) * -1;
    return {
      ...base,
      handicap,
      pick: normalizeHdcPick(pick.pick),
      probability,
      confidence: 58,
      risk: "中",
      reason: "来自赛前保存的让球胜平负预测，用于历史复盘。",
    };
  }
  if (pick.marketKey === "ou") {
    const exactGoalOptions = pick.exactGoalOptions || [];
    const exactGoals = pick.exactGoals ?? String(pick.pick || "").replace("球", "");
    return {
      ...base,
      pick: `${exactGoals}球`,
      exactGoals,
      exactGoalOptions: exactGoalOptions.length ? exactGoalOptions : [exactGoals],
      probability,
      confidence: 62,
      risk: "中",
      reason: "来自赛前保存的总进球数预测，用于历史复盘。",
    };
  }
  if (pick.marketKey === "score") {
    const scoreOptions = pick.scoreOptions || uniqueOptions(String(pick.pick || "").split("/").map((item) => item.trim()), 2);
    return {
      ...base,
      pick: scoreOptions[0] || pick.pick,
      scoreOptions,
      probability,
      confidence: 42,
      risk: "高",
      reason: "来自赛前保存的比分预测，用于历史复盘。",
    };
  }
  if (pick.marketKey === "htft") {
    return {
      ...base,
      pick: pick.pick,
      probability,
      confidence: 52,
      risk: "高",
      reason: "来自赛前保存的半全场预测，用于历史复盘。",
    };
  }
  return null;
}

function chooseArchiveMarket(existing, candidate) {
  if (!existing) return candidate;
  if (candidate.marketKey === "score" && candidate.pick === existing.scoreText) return candidate;
  if ((candidate.probability || 0) > (existing.probability || 0)) return candidate;
  return existing;
}

function scorePickResult(scorePick) {
  const [home, away] = String(scorePick || "").split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return "";
  if (home > away) return "主胜";
  if (home < away) return "客胜";
  return "平";
}

function buildArchivedHistoricalMatches(oldData, existingMatches, today, calibration) {
  const existingIds = new Set(existingMatches.map((match) => String(match.sourceEventId)));
  const grouped = new Map();

  (oldData?.planArchive || []).forEach((plan) => {
    (plan.picks || []).forEach((pick) => {
      const eventId = String(pick.sourceEventId || "");
      if (!eventId || existingIds.has(eventId) || !isWithinHistoryWindow(pick.matchDate, today)) return;
      if (!grouped.has(eventId)) {
        grouped.set(eventId, {
          sourceEventId: eventId,
          sportteryNo: pick.sportteryNo,
          date: pick.matchDate,
          businessDate: pick.matchDate,
          matchDate: pick.matchDate,
          kickoff: pick.kickoff,
          competition: pick.competition,
          homeTeam: pick.homeTeam,
          awayTeam: pick.awayTeam,
          score: parseArchiveScore(pick.score),
          markets: {},
          marketKeys: new Set(),
        });
      }

      const item = grouped.get(eventId);
      const market = archiveMarketFromPick(pick);
      if (!market) return;
      item.marketKeys.add(pick.marketKey);
      item.markets[pick.marketKey] = chooseArchiveMarket(item.markets[pick.marketKey], market);
      if (pick.score) item.score = parseArchiveScore(pick.score);
    });
  });

  return [...grouped.values()].map((item, index) => {
    const pools = archivePoolsForEvent(item.sourceEventId, [...item.marketKeys]);
    const standardWdl = pools.includes(MARKET_POOL_CODES.wdl);
    if (!standardWdl) delete item.markets.wdl;
    const allowedMarketKeys = new Set(Object.entries(MARKET_POOL_CODES).filter(([, poolCode]) => pools.includes(poolCode)).map(([marketKey]) => marketKey));

    const raw = {
      matchId: item.sourceEventId,
      matchNumStr: item.sportteryNo,
      matchDate: item.date,
      businessDate: item.businessDate,
      groupMatchDate: item.date,
      matchTime: item.kickoff,
      matchStatus: "6",
      matchStatusName: "已完成",
      saleStatusName: "已完成",
      sectionsNo999: item.score.home === null || item.score.away === null ? "" : `${item.score.home}:${item.score.away}`,
      leagueAllName: item.competition,
      homeTeamAllName: item.homeTeam,
      awayTeamAllName: item.awayTeam,
      homeTeamId: 9000 + index,
      awayTeamId: 9100 + index,
    };
    const generated = buildMarkets(raw, "pre", { home: null, away: null }, { standardWdl, calibration, detail: null });
    const markets = applyMarketCalibration({ ...generated, ...item.markets }, calibration);
    Object.keys(markets).forEach((marketKey) => {
      if (!allowedMarketKeys.has(marketKey)) delete markets[marketKey];
    });
    if (
      markets.wdl &&
      generated.wdl &&
      generated.wdl.pick !== markets.wdl.pick &&
      generated.wdl.probability >= (markets.wdl.probability || 0) + 0.08
    ) {
      markets.wdl = generated.wdl;
    }
    if (!PRESERVE_ARCHIVE_PREDICTION_IDS.has(String(item.sourceEventId)) && markets.wdl && markets.score && scorePickResult(markets.score.pick) !== markets.wdl.pick) {
      markets.score = generated.score;
      if (markets.ou) markets.ou = generated.ou;
    }
    if (PRESERVED_SCORE_PICKS[String(item.sourceEventId)] && markets.score) {
      const scorePick = PRESERVED_SCORE_PICKS[String(item.sourceEventId)];
      const total = scorePick.split("-").map(Number).reduce((sum, value) => sum + value, 0);
      markets.score = {
        ...markets.score,
        pick: scorePick,
        reason: "保留历史保存的赛前比分预测。",
      };
      if (markets.ou && Number.isFinite(total)) {
        markets.ou = {
          ...markets.ou,
          exactGoals: total >= 4 ? "4+" : String(total),
          pick: `${total >= 4 ? "4+" : total}球`,
        };
      }
    }
    const hdcLine = Number.isFinite(Number(markets.hdc?.handicap)) ? Number(markets.hdc.handicap) : Number(generated.hdc?.handicap || 0);
    const actualMarkets = buildMarkets(raw, "finished", item.score, { standardWdl, calibration, detail: null });
    Object.keys(actualMarkets).forEach((marketKey) => {
      if (!allowedMarketKeys.has(marketKey)) delete actualMarkets[marketKey];
    });
    if (actualMarkets.hdc) {
      actualMarkets.hdc = {
        ...actualMarkets.hdc,
        handicap: hdcLine,
        pick: handicapPickFromScore(item.score, hdcLine),
        reason: `根据中国竞彩网完场比分和${hdcLine > 0 ? "受让" : "让"}${Math.abs(hdcLine)}球结果复盘。`,
      };
    }

    return {
      id: `H${String(index + 1).padStart(3, "0")}`,
      sourceEventId: item.sourceEventId,
      sportteryNo: item.sportteryNo,
      date: item.date,
      businessDate: item.businessDate,
      saleStatusName: "已完成",
      liveStatusName: "已完成",
      matchDate: item.matchDate,
      kickoff: item.kickoff,
      competition: item.competition || "足球赛事",
      homeTeam: item.homeTeam || "主队待定",
      awayTeam: item.awayTeam || "客队待定",
      status: "finished",
      score: item.score,
      halfScore: "",
      minute: 90,
      tags: ["中国竞彩网", item.sportteryNo, "历史赛事", "已完成"].filter(Boolean),
      availablePools: pools,
      betOptions: Object.fromEntries(Object.entries(MARKET_POOL_CODES).map(([key, poolCode]) => [key, { poolCode, single: true, allUp: false, selling: false, poolStatus: "Closed" }])),
      dataQuality: 82,
      importance: String(item.sportteryNo || "").includes("201") ? 88 : 78,
      risk: "中",
      stats: {
        form: "历史归档赛事",
        attack: 72,
        defense: 72,
        tempo: 58,
        homeAway: `竞彩编号：${item.sportteryNo}，历史完赛归档`,
      },
      markets,
      actualMarkets,
      modelProfile: getModelProfile(raw),
      socialFactors: socialFactorsFromMatch(raw, "finished"),
    };
  });
}

function mergeDisplayMatches(currentMatches, archiveMatches, today) {
  const byId = new Map();
  [...currentMatches, ...archiveMatches].forEach((match) => {
    if (!isWithinHistoryWindow(match.date, today) && match.status === "finished") return;
    byId.set(String(match.sourceEventId), match);
  });
  return [...byId.values()]
    .sort((a, b) => {
      if (a.status === "finished" && b.status !== "finished") return 1;
      if (a.status !== "finished" && b.status === "finished") return -1;
      return `${a.date} ${a.kickoff || ""}`.localeCompare(`${b.date} ${b.kickoff || ""}`) || String(a.sourceEventId).localeCompare(String(b.sourceEventId));
    })
    .map((match, index) => ({ ...match, id: String(index + 1).padStart(3, "0") }));
}

async function main() {
  const oldData = await readExistingData();
  if (process.env.SCORE_REPAIR_HISTORY_ONLY === "1") {
    if (!oldData) throw new Error("没有可修复的本地数据缓存");
    const generatedAt = nowIsoShanghai();
    const today = todayInShanghai();
    const calibration = buildMarketCalibration(oldData);
    const currentMatches = Array.isArray(oldData.matches) ? oldData.matches.filter((match) => !(match.tags || []).includes("历史赛事")).filter(isWorldCupMatch) : [];
    const archivedMatches = buildArchivedHistoricalMatches(oldData, currentMatches, today, calibration);
    const matches = mergeDisplayMatches(currentMatches, archivedMatches, today);
    const planArchive = buildPlanArchive(oldData, [], matches, matches, generatedAt, today);
    const history = buildHistory(planArchive);
    const data = {
      ...oldData,
      generatedAt,
      matches,
      planArchive,
      history,
      autoReview: buildAutoReview(history),
      dailyPlanSummaries: buildDailyPlanSummaries(planArchive),
      marketHistory: buildMarketHistory(planArchive),
    };
    await fs.writeFile(OUTPUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    console.log(`repaired ${OUTPUT} with ${matches.length} matches including ${archivedMatches.length} archived history matches`);
    return;
  }
  const concernRaw = await fetchList("concern");
  const allRaw = await fetchList("all");
  const liveData = await fetchLive(concernRaw);
  const calibration = buildMarketCalibration(oldData);
  const oldByEventId = new Map((oldData?.matches || []).map((match) => [String(match.sourceEventId), match]));
  const rawByEventId = new Map();

  concernRaw.forEach((match) => {
    rawByEventId.set(String(match.matchId), mergeLive(match, liveData.map));
  });

  liveData.list.forEach((match) => {
    const key = String(match.matchId);
    if (!rawByEventId.has(key)) rawByEventId.set(key, hydrateLiveMatch(match, oldByEventId));
  });

  const allByEventId = new Map();
  allRaw.forEach((match) => {
    allByEventId.set(String(match.matchId), mergeLive(match, liveData.map));
  });
  liveData.list.forEach((match) => {
    const key = String(match.matchId);
    if (!allByEventId.has(key)) allByEventId.set(key, hydrateLiveMatch(match, oldByEventId));
  });

  const detailMap = await fetchMatchDetails([...rawByEventId.values(), ...allByEventId.values()]);
  const concernMatches = [...rawByEventId.values()].filter(isWorldCupRaw).sort(sortRawMatches).map((match, index) => mapMatch(match, index, oldByEventId, calibration, detailMap));
  const allMatches = [...allByEventId.values()].filter(isWorldCupRaw).sort(sortRawMatches).map((match, index) => mapMatch(match, index, oldByEventId, calibration, detailMap));
  const generatedAt = nowIsoShanghai();
  const today = todayInShanghai();
  const targetDate = addDays(today, 1);
  const plans = buildPurchasePlans(concernMatches, targetDate);
  const archivedMatches = buildArchivedHistoricalMatches(oldData, [...concernMatches, ...allMatches], today, calibration);
  const displayMatches = mergeDisplayMatches([...concernMatches, ...allMatches], archivedMatches, today);
  const reviewMatches = mergeDisplayMatches(allMatches, archivedMatches, today);
  const planArchive = buildPlanArchive(oldData, plans, displayMatches, reviewMatches, generatedAt, today);
  const history = buildHistory(planArchive);
  const dailyPlanSummaries = buildDailyPlanSummaries(planArchive);

  const data = {
    generatedAt,
    source: {
      type: "real",
      provider: "Sporttery",
      page: "https://m.sporttery.cn/mjc/zqsj/?tab=live",
      scheduleApi: `${API_BASE}/getMatchDataPageListV1.qry`,
      liveApi: `${API_BASE}/getMatchLiveV1.qry`,
      detailApi: `${API_BASE}/getMatchGeneral.qry`,
      note: "赛程、竞彩编号、销售状态和比分来自中国竞彩网公开接口；购买方向为本地模型估算，仅作信息分析。",
    },
    matches: displayMatches,
    purchasePlans: plans,
    parlaySeeds: plans,
    planArchive,
    history,
    autoReview: buildAutoReview(history),
    dailyPlanSummaries,
    marketHistory: buildMarketHistory(planArchive),
    modelProfile: {
      generatedAt,
      marketWeights: calibration.marketWeights,
      marketSamples: calibration.marketSamples,
      note: "球队画像结合历史复盘对玩法概率做轻量校准；样本不足时使用保守默认权重。",
    },
    tomorrowPool: buildTomorrowPool(concernMatches, targetDate),
  };

  await fs.writeFile(OUTPUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`updated ${OUTPUT} with ${concernMatches.length} Sporttery matches`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
