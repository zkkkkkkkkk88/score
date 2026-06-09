const fs = require("fs/promises");

const API_BASE = "https://webapi.sporttery.cn/gateway/uniform/fb";
const OUTPUT = process.env.SCORE_DATA_OUTPUT || "data/matches.json";
const PAGE_SIZE = Number(process.env.SPORTTERY_PAGE_SIZE || 80);
const TZ = "Asia/Shanghai";
const PLAN_SCHEMA_VERSION = "exact-goals-v1";

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
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
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
  if (!ids.length) return { map: new Map(), list: [] };
  const url = `${API_BASE}/getMatchLiveV1.qry?matchIds=${ids.join(",")}&eventTc=goals,penalty_shootout&method=live`;
  const value = await getJson(url);
  const list = Array.isArray(value) ? value : [];
  return { map: new Map(list.map((match) => [String(match.matchId), match])), list };
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

function estimateExactGoals(match) {
  const seed = Math.abs(Number(match.homeTeamId || 0) - Number(match.awayTeamId || 0));
  const kickoffHour = Number(String(match.matchTime || "00:00").slice(0, 2));
  const value = (seed + kickoffHour) % 5;
  return value >= 4 ? "4+" : String(value);
}

function buildMarkets(match, status, score) {
  const wdl = scoreModel(match, score);
  const total = score.home === null || score.away === null ? null : score.home + score.away;
  const exactGoals = total === null ? estimateExactGoals(match) : total >= 4 ? "4+" : String(total);
  const exactGoalLabel = `${exactGoals}球`;
  const goalProbability = total === null ? 0.34 : 0.78;

  return {
    wdl: {
      pick: wdl.pick,
      probability: wdl.probability,
      confidence: status === "finished" ? 88 : 64,
      risk: status === "finished" ? "低" : "中",
      reason: status === "finished" ? "根据中国竞彩网完场比分生成赛果复盘方向。" : "根据竞彩编号、赛程位置、主客队和基础胜负模型生成赛前方向。",
    },
    ou: {
      pick: exactGoalLabel,
      exactGoals,
      probability: goalProbability,
      confidence: status === "finished" ? 84 : 62,
      risk: "中",
      reason: status === "finished" ? "根据中国竞彩网完场比分计算具体总进球数。" : "根据赛事类型、赛程时段和默认进球模型给出具体总进球数观察值。",
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
  const sportteryNo = formatSportteryNo(match, index);
  const saleTag = match.saleStatusName || match.matchStatusName || "状态待确认";
  const liveStatusTag = match.matchStatusName && match.matchStatusName !== saleTag ? match.matchStatusName : "";

  return {
    id: String(index + 1).padStart(3, "0"),
    sourceEventId: String(match.matchId),
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
    const actual = total >= 4 ? "4+" : String(total);
    return String(market.exactGoals ?? "").replace("球", "") === actual;
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
    mode: plan.mode,
    requiredHits: plan.requiredHits,
    risk: plan.risk,
    note: plan.note,
    socialNote: plan.socialNote,
    picks,
  };
}

function marketNamesForArchive() {
  return {
    wdl: "胜平负",
    ou: "总进球数",
    htft: "半全场",
  };
}

function formatArchivePick(marketKey, market) {
  return marketKey === "ou" ? `${market.exactGoals ?? String(market.pick).replace("球", "")}球` : market.pick;
}

function evaluateArchivedPlan(plan, matches) {
  const picks = plan.picks
    .map((pick) => {
      const match = matches.find((item) => item.sourceEventId === pick.sourceEventId);
      if (!match) return { ...pick, status: "pending", hit: null, score: "" };
      const score = match.score.home === null || match.score.away === null ? "" : `${match.score.home}-${match.score.away}`;
      const market = {
        pick: pick.pick,
        exactGoals: pick.marketKey === "ou" ? pick.exactGoals ?? String(pick.pick).replace("球", "") : undefined,
      };
      const hit = isPickHit(match, pick.marketKey, market);
      return {
        ...pick,
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
  const archive = Array.isArray(oldData?.planArchive) ? oldData.planArchive : [];
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

function buildDailyPlanSummaries(planArchive) {
  const byDate = new Map();

  planArchive.forEach((plan) => {
    if (!byDate.has(plan.date)) {
      byDate.set(plan.date, {
        date: plan.date,
        totalPlans: 0,
        reviewedPlans: 0,
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
  const liveData = await fetchLive(concernRaw);
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

  const concernMatches = [...rawByEventId.values()].sort(sortRawMatches).map(mapMatch);
  const allMatches = [...allByEventId.values()].sort(sortRawMatches).map(mapMatch);
  const plans = buildPurchasePlans(concernMatches);
  const generatedAt = nowIsoShanghai();
  const today = todayInShanghai();
  const planArchive = buildPlanArchive(oldData, plans, concernMatches, allMatches, generatedAt, today);
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
      note: "赛程、竞彩编号、销售状态和比分来自中国竞彩网公开接口；购买方向为本地模型估算，仅作信息分析。",
    },
    matches: concernMatches,
    purchasePlans: plans,
    parlaySeeds: plans,
    planArchive,
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
