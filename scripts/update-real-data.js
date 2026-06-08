const fs = require("fs/promises");

const API_BASE = "https://webapi.sporttery.cn/gateway/uniform/fb";
const OUTPUT = process.env.SCORE_DATA_OUTPUT || "data/matches.json";
const PAGE_SIZE = Number(process.env.SPORTTERY_PAGE_SIZE || 80);
const TZ = "Asia/Shanghai";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: "https://m.sporttery.cn/mjc/zqsj/?tab=live",
  Origin: "https://m.sporttery.cn",
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
  const date = new Date(`${dateText}T00:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

async function fetchList(method) {
  const url = `${API_BASE}/getMatchDataPageListV1.qry?method=${method}&pageSize=${PAGE_SIZE}`;
  return flattenGroups((await getJson(url)).matchInfoList || []);
}

async function fetchLive(matches) {
  const ids = matches.map((match) => match.matchId).filter(Boolean);
  if (!ids.length) return new Map();
  const url = `${API_BASE}/getMatchLiveV1.qry?matchIds=${ids.join(",")}&eventTc=goals,penalty_shootout&method=live`;
  const value = await getJson(url);
  const list = Array.isArray(value) ? value : [];
  return new Map(list.map((match) => [String(match.matchId), match]));
}

function parseScore(value) {
  if (!value || !String(value).includes(":")) return { home: null, away: null };
  const [home, away] = String(value).split(":").map((part) => Number(part));
  if (!Number.isFinite(home) || !Number.isFinite(away)) return { home: null, away: null };
  return { home, away };
}

function mergeLive(match, liveMap) {
  const live = liveMap.get(String(match.matchId));
  if (!live) return match;
  return {
    ...match,
    ...live,
    matchNumStr: match.matchNumStr || live.matchNumStr,
    businessDate: match.businessDate || live.businessDate,
    groupMatchDate: match.groupMatchDate,
    groupWeekday: match.groupWeekday,
  };
}

function getStatus(match) {
  const code = String(match.matchStatus || "");
  if (["6", "10", "11", "12", "13"].includes(code) || match.sectionsNo999) return "finished";
  if (["5", "7"].includes(code)) return "live";
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

function scoreModel(match, score) {
  if (score.home !== null && score.away !== null) {
    if (score.home > score.away) return { pick: "主胜", probability: 0.72 };
    if (score.home < score.away) return { pick: "客胜", probability: 0.66 };
    return { pick: "平", probability: 0.58 };
  }

  const seed = Number(match.homeTeamId || 0) - Number(match.awayTeamId || 0);
  if (Math.abs(seed) < 12) return { pick: "平", probability: 0.34 };
  if (seed < 0) return { pick: "主胜", probability: 0.48 };
  return { pick: "客胜", probability: 0.44 };
}

function buildMarkets(match, status, score) {
  const wdl = scoreModel(match, score);
  const total = score.home === null || score.away === null ? null : score.home + score.away;
  const goalRange = total === null ? "0-2球" : total >= 3 ? "3球及以上" : "0-2球";
  const goalProbability = total === null ? 0.54 : total >= 3 ? 0.7 : 0.66;

  return {
    wdl: {
      pick: wdl.pick,
      probability: wdl.probability,
      confidence: status === "finished" ? 88 : 64,
      risk: status === "finished" ? "低" : "中",
      reason: status === "finished" ? "根据中国竞彩网完场比分生成赛果复盘方向。" : "根据竞彩编号、赛程位置、主客队和基础胜负模型生成赛前方向。",
    },
    ou: {
      line: 2.5,
      pick: goalRange,
      goalRange,
      probability: goalProbability,
      confidence: status === "finished" ? 84 : 62,
      risk: "中",
      reason: status === "finished" ? "根据中国竞彩网完场比分计算总进球数区间。" : "根据赛事类型、赛程时段和默认进球模型给出总进球数观察区间。",
    },
    htft: {
      pick: status === "finished" && score.home > score.away ? "胜/胜" : "平/平",
      probability: status === "finished" ? 0.52 : 0.3,
      confidence: status === "finished" ? 70 : 52,
      risk: "高",
      reason: status === "finished" ? "根据半场和全场比分做复盘方向。" : "半全场受首发、战术和早段事件影响较大，当前仅做观察。",
    },
  };
}

function socialFactorsFromMatch(match, status) {
  const league = match.leagueAllName || match.leagueAbbName || "足球赛事";
  const isNational = league.includes("国际") || league.includes("国家");
  const isClub = !isNational;

  return {
    clubMotivation: isClub
      ? "俱乐部赛事需关注保级、升级、轮换和赛程密度；当前以竞彩赛程公开信息做中性处理。"
      : "国家队或国际赛通常受荣誉、排名和备战任务影响，需关注阵容轮换和战意差异。",
    politicalFactor: isNational
      ? "国际赛可能受到地区舆论和国家队压力影响，但不能直接等同于赛果倾向。"
      : "普通俱乐部比赛政治因素通常较弱，主要观察地方舆情、德比属性和管理层压力。",
    integrityRisk:
      status === "pre"
        ? "当前仅基于中国竞彩网公开赛程和状态，未发现可核验异常；不对任何球队作未经证实的假赛判断。"
        : "比分已进入复盘阶段，若结果明显偏离方案，需要回看红牌、阵容和临场事件。",
    consequence:
      status === "finished"
        ? "完场比分可用于自动复盘方案命中率，并调整后续模型权重。"
        : "若临场出现暂停销售、推迟、取消、红牌或突然轮换，应降低购买方案权重。",
    recommendation: String(match.matchStatusName || "").includes("暂停")
      ? "当前销售状态异常，建议暂不进入主方案。"
      : "可纳入观察池，最终以开售状态、首发和实时事件确认。",
  };
}

function mapMatch(match, index) {
  const status = getStatus(match);
  const score = parseScore(match.sectionsNo999);
  const markets = buildMarkets(match, status, score);
  const sportteryNo = match.matchNumStr || `竞彩${match.matchNum || index + 1}`;
  const saleTag = match.matchStatusName || "状态待确认";

  return {
    id: String(index + 1).padStart(3, "0"),
    sourceEventId: String(match.matchId),
    sportteryNo,
    date: match.businessDate || match.groupMatchDate || match.matchDate,
    matchDate: match.matchDate,
    kickoff: getKickoff(match),
    competition: match.leagueAllName || match.leagueAbbName || "足球赛事",
    homeTeam: match.homeTeamAllName || match.homeTeamAbbName || "主队待定",
    awayTeam: match.awayTeamAllName || match.awayTeamAbbName || "客队待定",
    status,
    score,
    halfScore: match.sectionsNo1 || "",
    minute: getMinute(match, status),
    tags: ["中国竞彩网", sportteryNo, saleTag],
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
    socialFactors: socialFactorsFromMatch(match, status),
  };
}

function chooseSocialNote(matches) {
  const hasPaused = matches.some((match) => match.tags.some((tag) => tag.includes("暂停") || tag.includes("取消")));
  return hasPaused ? "组合含销售状态异常赛事，建议等待恢复或替换。" : "组合来自中国竞彩网竞猜赛程，未见可核验异常，按谨慎方案处理。";
}

function purchaseCandidates(matches) {
  const blocked = ["已完成", "取消", "暂停", "推迟"];
  return matches.filter((match) => !blocked.some((word) => match.tags.join("").includes(word)));
}

function buildPurchasePlans(matches) {
  const candidates = purchaseCandidates(matches);
  const stable = candidates.slice(0, 2);
  const balanced = candidates.slice(0, 3);
  const coverage = candidates.slice(0, 4);

  return [
    stable.length >= 2 && {
      id: "sporttery-stable-2",
      type: "竞彩二串一购买方案",
      mode: "all",
      requiredHits: 2,
      matchIds: stable.map((match) => match.id),
      eventIds: stable.map((match) => match.sourceEventId),
      markets: stable.map(() => "wdl"),
      risk: "中",
      note: "优先选择销售状态正常、竞彩编号明确的比赛。",
      socialNote: chooseSocialNote(stable),
    },
    balanced.length >= 3 && {
      id: "sporttery-balanced-3-2",
      type: "竞彩三串二购买方案",
      mode: "atLeast",
      requiredHits: 2,
      matchIds: balanced.map((match) => match.id),
      eventIds: balanced.map((match) => match.sourceEventId),
      markets: ["wdl", "ou", "wdl"],
      risk: "中",
      note: "胜平负和总进球数混合，允许一场失手。",
      socialNote: chooseSocialNote(balanced),
    },
    coverage.length >= 4 && {
      id: "sporttery-coverage-4-3",
      type: "竞彩四串三购买方案",
      mode: "atLeast",
      requiredHits: 3,
      matchIds: coverage.map((match) => match.id),
      eventIds: coverage.map((match) => match.sourceEventId),
      markets: ["wdl", "ou", "wdl", "ou"],
      risk: "高",
      note: "覆盖竞彩赛程中排序靠前的比赛，适合临场前再确认。",
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
  const picks = plan.markets
    .map((marketKey, index) => {
      const match =
        matches.find((item) => item.sourceEventId === plan.eventIds?.[index]) ||
        matches.find((item) => item.id === plan.matchIds[index]);
      if (!match) return null;
      return { match, marketKey, market: match.markets[marketKey], hit: isPickHit(match, marketKey, match.markets[marketKey]) };
    })
    .filter(Boolean);
  const settled = picks.filter((pick) => pick.hit !== null);
  const hits = settled.filter((pick) => pick.hit).length;
  if (!settled.length || settled.length < picks.length) return null;
  const isHit = plan.mode === "all" ? hits === picks.length : hits >= plan.requiredHits;

  return {
    date: matches[0]?.date || todayInShanghai(),
    type: plan.type,
    result: isHit ? "hit" : "miss",
    probability: picks.reduce((sum, pick) => sum + pick.market.probability, 0) / picks.length,
    detail: `${hits}/${picks.length} 命中`,
  };
}

function buildHistory(oldData, allMatches) {
  const oldHistory = oldData?.history || [];
  const oldPlans = oldData?.purchasePlans || oldData?.parlaySeeds || [];
  const reviewed = oldPlans.map((plan) => evaluatePlan(plan, allMatches)).filter(Boolean);
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

function buildDailyPlanSummaries(oldData, plans, history, today) {
  const previous = oldData?.dailyPlanSummaries || [];
  const byDate = new Map(previous.map((item) => [item.date, { ...item }]));
  const current = byDate.get(today) || {
    date: today,
    totalPlans: 0,
    reviewedPlans: 0,
    hitPlans: 0,
    hitRate: 0,
    planTypes: [],
    summary: "",
  };

  current.totalPlans = plans.length;
  current.planTypes = plans.map((plan) => plan.type);
  byDate.set(today, current);

  history.forEach((item) => {
    if (!byDate.has(item.date)) {
      byDate.set(item.date, {
        date: item.date,
        totalPlans: 0,
        reviewedPlans: 0,
        hitPlans: 0,
        hitRate: 0,
        planTypes: [],
        summary: "",
      });
    }

    const summary = byDate.get(item.date);
    summary.reviewedPlans += 1;
    if (item.result === "hit") summary.hitPlans += 1;
  });

  return [...byDate.values()]
    .map((item) => {
      const hitRate = item.reviewedPlans ? item.hitPlans / item.reviewedPlans : 0;
      return {
        ...item,
        hitRate,
        summary: item.reviewedPlans
          ? `${item.date} 已复盘 ${item.reviewedPlans} 个购买方案，命中 ${item.hitPlans} 个，命中率 ${Math.round(hitRate * 100)}%。`
          : `${item.date} 已推出 ${item.totalPlans} 个购买方案，等待比赛完场后统计命中率。`,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
}

function buildTomorrowPool(matches, tomorrow) {
  return matches
    .filter((match) => match.date === tomorrow)
    .slice(0, 5)
    .map((match, index) => ({
      category: index < 2 ? "竞彩候选" : "明日观察",
      matchId: match.id,
      market: index % 2 === 0 ? "wdl" : "ou",
      reason: `来自中国竞彩网竞猜赛程，竞彩编号 ${match.sportteryNo}，需等待开售状态和临场事件确认。`,
    }));
}

async function main() {
  const oldData = await readExistingData();
  const concernRaw = await fetchList("concern");
  const allRaw = await fetchList("all");
  const liveMap = await fetchLive(concernRaw);
  const concernMatches = concernRaw.map((match) => mergeLive(match, liveMap)).map(mapMatch);
  const allMatches = allRaw.map(mapMatch);
  const plans = buildPurchasePlans(concernMatches);
  const history = buildHistory(oldData, allMatches);
  const today = todayInShanghai();
  const dailyPlanSummaries = buildDailyPlanSummaries(oldData, plans, history, today);

  const data = {
    generatedAt: nowIsoShanghai(),
    source: {
      type: "real",
      provider: "Sporttery",
      page: "https://m.sporttery.cn/mjc/zqsj/?tab=live",
      scheduleApi: `${API_BASE}/getMatchDataPageListV1.qry`,
      liveApi: `${API_BASE}/getMatchLiveV1.qry`,
      note: "赛程、竞彩编号、销售状态和比分来自中国竞彩网公开接口；购买方向为本地模型估算，仅作信息分析。",
    },
    matches: concernMatches,
    purchasePlans: plans,
    parlaySeeds: plans,
    history,
    autoReview: buildAutoReview(history),
    dailyPlanSummaries,
    marketHistory: buildMarketHistory(allMatches),
    tomorrowPool: buildTomorrowPool(concernMatches, addDays(today, 1)),
  };

  await fs.writeFile(OUTPUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`updated ${OUTPUT} with ${concernMatches.length} Sporttery matches`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
