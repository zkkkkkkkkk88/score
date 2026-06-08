const fs = require("fs/promises");

const API_KEY = process.env.SPORTSDB_API_KEY || "123";
const SPORT = process.env.SPORTSDB_SPORT || "Soccer";
const LIMIT = Number(process.env.SPORTSDB_LIMIT || 16);
const OUTPUT = process.env.SCORE_DATA_OUTPUT || "data/matches.json";
const TZ = "Asia/Shanghai";

const leagueNames = {
  "Argentina Primera B Metropolitana": "阿根廷大都会乙级联赛",
  "Argentinian Primera C": "阿根廷丙级联赛",
  "Swedish Division 1 South": "瑞典南区一级联赛",
  "CONMEBOL Liga de Naciones Femenina": "南美足联女子国家联赛",
};

const teamNames = {
  "UAI Urquiza": "乌尔基萨大学竞技",
  Liniers: "利尼尔斯",
  Berazategui: "贝拉萨特吉",
  "Juventud Unida": "尤文图德联",
  "Ängelholm": "恩厄尔霍尔姆",
  "BK Olympic": "奥林匹克俱乐部",
  "Ecuador Women": "厄瓜多尔女子队",
  "Argentina Women": "阿根廷女子队",
  "Paraguay Women": "巴拉圭女子队",
  "Colombia Women": "哥伦比亚女子队",
  "Peru Women": "秘鲁女子队",
  "Bolivia Women": "玻利维亚女子队",
};

const venueNames = {
  "Estadio Monumental de Villa Lynch": "维拉林奇纪念球场",
  "Estadio Norman Lee": "诺曼李球场",
  "Änglavallen": "恩格拉瓦伦球场",
};

function translate(value, dictionary, fallback = "待确认") {
  if (!value) return fallback;
  return dictionary[value] || value;
}

function dateInShanghai(offset = 0) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offset);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${bag.year}-${bag.month}-${bag.day}`;
}

function nowIsoShanghai() {
  const date = new Date();
  const offsetMs = 8 * 60 * 60 * 1000;
  return new Date(date.getTime() + offsetMs).toISOString().replace("Z", "+08:00");
}

function addMinutes(dateText, timeText, minutes) {
  const time = timeText || "00:00:00";
  const normalized = time.length === 5 ? `${time}:00` : time;
  const date = new Date(`${dateText}T${normalized}+08:00`);
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getScore(event) {
  const home = event.intHomeScore === null ? null : Number(event.intHomeScore);
  const away = event.intAwayScore === null ? null : Number(event.intAwayScore);
  return { home, away };
}

function getStatus(event) {
  const score = getScore(event);
  if (score.home !== null && score.away !== null) return "finished";

  const start = addMinutes(event.dateEvent, event.strTime, 0);
  const end = addMinutes(event.dateEvent, event.strTime, 130);
  const now = new Date();
  if (now >= start && now <= end) return "live";
  return "pre";
}

function getMinute(event, status) {
  if (status === "finished") return 90;
  if (status !== "live") return null;
  const start = addMinutes(event.dateEvent, event.strTime, 0);
  return clamp(Math.floor((Date.now() - start.getTime()) / 60000), 1, 90);
}

function getKickoff(event) {
  const raw = event.strTime || "00:00:00";
  return raw.slice(0, 5);
}

function pctScore(homeScore, awayScore) {
  if (homeScore === null || awayScore === null) return { home: 0.46, draw: 0.28, away: 0.26 };
  if (homeScore > awayScore) return { home: 0.7, draw: 0.18, away: 0.12 };
  if (homeScore < awayScore) return { home: 0.18, draw: 0.18, away: 0.64 };
  return { home: 0.36, draw: 0.42, away: 0.22 };
}

function marketFromEvent(event) {
  const status = getStatus(event);
  const score = getScore(event);
  const scoreModel = pctScore(score.home, score.away);
  const totalGoals = score.home === null || score.away === null ? null : score.home + score.away;
  const goalRange = totalGoals === null ? "0-2球" : totalGoals >= 3 ? "3球及以上" : "0-2球";
  const goalProbability = totalGoals === null ? 0.54 : totalGoals >= 3 ? 0.68 : 0.66;
  const wdlPick = scoreModel.home >= scoreModel.draw && scoreModel.home >= scoreModel.away ? "主胜" : scoreModel.away >= scoreModel.draw ? "客胜" : "平";
  const wdlProbability = Math.max(scoreModel.home, scoreModel.draw, scoreModel.away);

  return {
    wdl: {
      pick: wdlPick,
      probability: clamp(wdlProbability, 0.34, 0.82),
      confidence: status === "finished" ? 88 : 64,
      risk: status === "finished" ? "低" : "中",
      reason: status === "finished" ? "根据真实完场比分生成赛果复盘方向。" : "根据真实赛程、主客位置和基础胜负模型生成赛前方向。",
    },
    ou: {
      line: 2.5,
      pick: goalRange,
      goalRange,
      probability: goalProbability,
      confidence: status === "finished" ? 84 : 62,
      risk: "中",
      reason: status === "finished" ? "根据真实完场比分计算总进球数区间。" : "根据赛程节奏和默认进球模型给出总进球数观察区间。",
    },
    htft: {
      pick: status === "finished" && score.home > score.away ? "胜/胜" : "平/平",
      probability: status === "finished" ? 0.52 : 0.3,
      confidence: status === "finished" ? 70 : 52,
      risk: "高",
      reason: status === "finished" ? "根据真实赛果做半全场复盘方向。" : "半全场受首发、战术和早段事件影响较大，当前仅做观察。",
    },
  };
}

function socialFactorsFromEvent(event, status) {
  const league = translate(event.strLeague, leagueNames, "足球赛事");
  const isNational = league.includes("国家") || league.includes("南美");
  const isLowerLeague = league.includes("乙级") || league.includes("丙级") || league.includes("一级");

  return {
    clubMotivation: isNational
      ? "国家队或地区代表队比赛通常受荣誉、排名和出线形势影响，需关注阵容轮换与备战优先级。"
      : "俱乐部赛事需关注保级、升级、轮换和赛程密度；当前未接入积分榜，按中性偏谨慎处理。",
    politicalFactor: isNational
      ? "涉及国家或地区代表队时，舆论压力可能放大比赛态度，但不能直接等同于赛果倾向。"
      : "普通俱乐部联赛政治因素通常较弱，主要观察地方舆情、德比属性和管理层压力。",
    integrityRisk: isLowerLeague
      ? "低级别或关注度较低赛事信息透明度相对有限，若缺少首发、伤停和监管信息，应降低方案权重。"
      : "当前仅基于公开赛程源，未发现可核验异常；不对任何球队作未经证实的假赛判断。",
    consequence:
      status === "finished"
        ? "完场比分已生成，可用于回看方案是否命中并调整后续模型权重。"
        : "若临场出现异常红牌、突然轮换或舆情事件，可能改变购买方案，应等待赛前确认。",
    recommendation: isLowerLeague ? "建议小权重观察，优先选择信息更透明的比赛组合。" : "可纳入观察池，但仍需结合首发和实时事件确认。",
  };
}

function mapEvent(event, index) {
  const status = getStatus(event);
  const score = getScore(event);
  const homeTeam = translate(event.strHomeTeam, teamNames, "主队待定");
  const awayTeam = translate(event.strAwayTeam, teamNames, "客队待定");
  const competition = translate(event.strLeague || event.strEventAlternate, leagueNames, "足球赛事");
  const venue = translate(event.strVenue, venueNames, "");
  const markets = marketFromEvent(event);
  const liveTag = status === "finished" ? "完场" : status === "live" ? "进行中" : "未开赛";

  return {
    id: String(index + 1).padStart(3, "0"),
    sourceEventId: event.idEvent,
    date: event.dateEvent,
    kickoff: getKickoff(event),
    competition,
    homeTeam,
    awayTeam,
    status,
    score,
    minute: getMinute(event, status),
    tags: ["真实数据", liveTag],
    dataQuality: status === "finished" ? 88 : 76,
    importance: competition.includes("世界杯") ? 92 : 72,
    risk: status === "finished" ? "低" : "中",
    stats: {
      form: "等待球队近况源",
      attack: status === "finished" ? 72 : 62,
      defense: status === "finished" ? 72 : 62,
      tempo: status === "live" ? 70 : 58,
      homeAway: venue ? `场地：${venue}` : "真实赛程源，场地待确认",
    },
    markets,
    socialFactors: socialFactorsFromEvent({ ...event, strLeague: competition }, status),
  };
}

async function readExistingData() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT, "utf8"));
  } catch {
    return null;
  }
}

async function fetchDay(dateText) {
  const url = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${dateText}&s=${encodeURIComponent(SPORT)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TheSportsDB ${dateText} 请求失败：${response.status}`);
  const payload = await response.json();
  return payload.events || [];
}

function chooseSocialNote(matches) {
  const hasLowerLeague = matches.some((match) => match.socialFactors?.integrityRisk.includes("信息透明度"));
  return hasLowerLeague ? "组合含信息透明度较低赛事，建议降低权重并等待首发确认。" : "组合未见可核验异常，按常规谨慎方案处理。";
}

function buildPurchasePlans(matches) {
  const candidates = matches.filter((match) => match.status !== "finished");
  const stable = candidates.slice(0, 2);
  const balanced = candidates.slice(0, 3);
  const coverage = candidates.slice(0, 4);

  return [
    stable.length >= 2 && {
      id: "real-stable-2",
      type: "真实数据二串一购买方案",
      mode: "all",
      requiredHits: 2,
      matchIds: stable.map((match) => match.id),
      eventIds: stable.map((match) => match.sourceEventId),
      markets: stable.map(() => "wdl"),
      risk: "中",
      note: "基于真实赛程生成，优先选择胜平负方向较清晰的比赛。",
      socialNote: chooseSocialNote(stable),
    },
    balanced.length >= 3 && {
      id: "real-balanced-3-2",
      type: "真实数据三串二购买方案",
      mode: "atLeast",
      requiredHits: 2,
      matchIds: balanced.map((match) => match.id),
      eventIds: balanced.map((match) => match.sourceEventId),
      markets: ["wdl", "ou", "wdl"],
      risk: "中",
      note: "使用胜平负和总进球数混合，允许一场失手。",
      socialNote: chooseSocialNote(balanced),
    },
    coverage.length >= 4 && {
      id: "real-coverage-4-3",
      type: "真实数据四串三购买方案",
      mode: "atLeast",
      requiredHits: 3,
      matchIds: coverage.map((match) => match.id),
      eventIds: coverage.map((match) => match.sourceEventId),
      markets: ["wdl", "ou", "wdl", "ou"],
      risk: "高",
      note: "覆盖真实赛程中排序靠前的比赛，适合临场前再确认。",
      socialNote: chooseSocialNote(coverage),
    },
  ].filter(Boolean);
}

function actualWdl(match) {
  if (match.score.home > match.score.away) return "主胜";
  if (match.score.home < match.score.away) return "客胜";
  return "平";
}

function isPickHit(match, marketKey, market) {
  if (match.status !== "finished") return null;
  if (marketKey === "wdl") return market.pick === actualWdl(match);
  if (marketKey === "ou") {
    const total = match.score.home + match.score.away;
    return market.goalRange === (total >= 3 ? "3球及以上" : "0-2球");
  }
  return null;
}

function evaluatePlan(plan, matches) {
  const picks = plan.markets.map((marketKey, index) => {
    const match = matches.find((item) => item.sourceEventId === plan.eventIds?.[index]) || matches.find((item) => item.id === plan.matchIds[index]);
    if (!match) return null;
    return { match, marketKey, market: match.markets[marketKey], hit: isPickHit(match, marketKey, match.markets[marketKey]) };
  }).filter(Boolean);

  const settled = picks.filter((pick) => pick.hit !== null);
  const hits = settled.filter((pick) => pick.hit).length;
  if (!settled.length || settled.length < picks.length) return null;

  const isHit = plan.mode === "all" ? hits === picks.length : hits >= plan.requiredHits;
  return {
    date: matches[0]?.date || dateInShanghai(0),
    type: plan.type,
    result: isHit ? "hit" : "miss",
    probability: picks.reduce((sum, pick) => sum + pick.market.probability, 0) / picks.length,
    detail: `${hits}/${picks.length} 命中`,
  };
}

function buildHistory(oldData, matches, plans) {
  const oldHistory = oldData?.history || [];
  const oldPlans = oldData?.parlaySeeds || oldData?.purchasePlans || [];
  const reviewed = oldPlans.map((plan) => evaluatePlan(plan, matches)).filter(Boolean);
  const seen = new Set();

  return [...reviewed, ...oldHistory].filter((item) => {
    const key = `${item.date}-${item.type}-${item.detail || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMarketHistory(matches) {
  const buckets = [
    { market: "wdl", name: "胜平负", hits: 0, total: 0, streak: "等待更多完场数据" },
    { market: "ou", name: "总进球数", hits: 0, total: 0, streak: "等待更多完场数据" },
    { market: "htft", name: "半全场", hits: 0, total: 0, streak: "只做观察" },
  ];

  matches.forEach((match) => {
    buckets.forEach((bucket) => {
      const market = match.markets[bucket.market];
      const hit = isPickHit(match, bucket.market, market);
      if (hit === null) return;
      bucket.total += 1;
      if (hit) bucket.hits += 1;
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

function buildTomorrowPool(matches, tomorrow) {
  return matches
    .filter((match) => match.date === tomorrow)
    .slice(0, 5)
    .map((match, index) => ({
      category: index < 2 ? "真实赛程候选" : "明日观察",
      matchId: match.id,
      market: index % 2 === 0 ? "wdl" : "ou",
      reason: "来自真实赛程源，等待首发、赛程压力和临场事件补强。",
    }));
}

async function main() {
  const dates = process.env.SPORTSDB_DATES?.split(",").map((date) => date.trim()).filter(Boolean) || [dateInShanghai(0), dateInShanghai(1)];
  const oldData = await readExistingData();
  const eventsByDay = await Promise.all(dates.map(fetchDay));
  const events = eventsByDay.flat().slice(0, LIMIT);
  const matches = events.map(mapEvent);
  const plans = buildPurchasePlans(matches);
  const history = buildHistory(oldData, matches, plans);

  const data = {
    generatedAt: nowIsoShanghai(),
    source: {
      type: "real",
      provider: "TheSportsDB",
      sport: SPORT,
      dates,
      note: "赛程和比分来自真实公开 API；购买方向为本地模型估算，仅作信息分析。",
    },
    matches,
    purchasePlans: plans,
    parlaySeeds: plans,
    history,
    autoReview: buildAutoReview(history),
    marketHistory: buildMarketHistory(matches),
    tomorrowPool: buildTomorrowPool(matches, dates[1]),
  };

  await fs.writeFile(OUTPUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`updated ${OUTPUT} with ${matches.length} real events from ${dates.join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
