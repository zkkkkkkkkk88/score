const fs = require("fs/promises");

const API_KEY = process.env.SPORTSDB_API_KEY || "123";
const SPORT = process.env.SPORTSDB_SPORT || "Soccer";
const LIMIT = Number(process.env.SPORTSDB_LIMIT || 16);
const OUTPUT = process.env.SCORE_DATA_OUTPUT || "data/matches.json";
const TZ = "Asia/Shanghai";

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

function pctScore(event, homeScore, awayScore) {
  if (homeScore === null || awayScore === null) return { home: 0.46, draw: 0.28, away: 0.26 };
  if (homeScore > awayScore) return { home: 0.7, draw: 0.18, away: 0.12 };
  if (homeScore < awayScore) return { home: 0.18, draw: 0.18, away: 0.64 };
  return { home: 0.36, draw: 0.42, away: 0.22 };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getStatus(event) {
  const homeScore = event.intHomeScore === null ? null : Number(event.intHomeScore);
  const awayScore = event.intAwayScore === null ? null : Number(event.intAwayScore);
  if (homeScore !== null && awayScore !== null) return "finished";

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

function marketFromEvent(event) {
  const homeScore = event.intHomeScore === null ? null : Number(event.intHomeScore);
  const awayScore = event.intAwayScore === null ? null : Number(event.intAwayScore);
  const scoreModel = pctScore(event, homeScore, awayScore);
  const status = getStatus(event);
  const totalGoals = homeScore === null || awayScore === null ? null : homeScore + awayScore;
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
      reason: status === "finished" ? "根据真实完场比分生成赛果复盘方向。" : "根据真实赛程和基础强弱模型生成赛前方向，等待赔率源补强。",
    },
    ou: {
      line: 2.5,
      pick: goalRange,
      goalRange,
      probability: goalProbability,
      confidence: status === "finished" ? 84 : 62,
      risk: "中",
      reason: status === "finished" ? "根据真实完场比分计算总进球数区间。" : "暂无授权赔率源，先用赛程基础模型给出总进球数观察区间。",
    },
    htft: {
      pick: status === "finished" && homeScore > awayScore ? "胜/胜" : "平/平",
      probability: status === "finished" ? 0.52 : 0.3,
      confidence: status === "finished" ? 70 : 52,
      risk: "高",
      reason: status === "finished" ? "根据真实赛果做半全场复盘方向。" : "半全场需要首发和临场数据支撑，当前仅做观察。",
    },
  };
}

function mapEvent(event, index) {
  const status = getStatus(event);
  const homeScore = event.intHomeScore === null ? null : Number(event.intHomeScore);
  const awayScore = event.intAwayScore === null ? null : Number(event.intAwayScore);
  const homeTeam = event.strHomeTeam || "主队待定";
  const awayTeam = event.strAwayTeam || "客队待定";
  const markets = marketFromEvent(event);
  const liveTag = status === "finished" ? "完场" : status === "live" ? "进行中" : "未开赛";

  return {
    id: String(index + 1).padStart(3, "0"),
    sourceEventId: event.idEvent,
    date: event.dateEvent,
    kickoff: getKickoff(event),
    competition: event.strLeague || event.strEventAlternate || "足球赛事",
    homeTeam,
    awayTeam,
    status,
    score: { home: homeScore, away: awayScore },
    minute: getMinute(event, status),
    tags: ["真实数据", liveTag],
    dataQuality: status === "finished" ? 88 : 76,
    importance: event.strLeague?.includes("World Cup") ? 92 : 72,
    risk: status === "finished" ? "低" : "中",
    odds: { home: 0, draw: 0, away: 0, over25: 0, under25: 0 },
    stats: {
      form: "等待球队近况源",
      attack: status === "finished" ? 72 : 62,
      defense: status === "finished" ? 72 : 62,
      tempo: status === "live" ? 70 : 58,
      homeAway: event.strVenue ? `场地：${event.strVenue}` : "真实赛程源，场地待确认",
    },
    markets,
  };
}

async function fetchDay(dateText) {
  const url = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${dateText}&s=${encodeURIComponent(SPORT)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TheSportsDB ${dateText} 请求失败：${response.status}`);
  const payload = await response.json();
  return payload.events || [];
}

function buildParlays(matches) {
  const candidates = matches.filter((match) => match.status !== "finished");
  const stable = candidates.slice(0, 2);
  const balanced = candidates.slice(0, 3);
  const coverage = candidates.slice(0, 4);

  return [
    stable.length >= 2 && {
      id: "real-stable-2",
      type: "真实数据二串一",
      mode: "all",
      requiredHits: 2,
      matchIds: stable.map((match) => match.id),
      markets: stable.map(() => "wdl"),
      risk: "中",
      note: "基于真实赛程生成，赛前概率仍需赔率源进一步校准。",
    },
    balanced.length >= 3 && {
      id: "real-balanced-3-2",
      type: "真实数据三串二",
      mode: "atLeast",
      requiredHits: 2,
      matchIds: balanced.map((match) => match.id),
      markets: ["wdl", "ou", "wdl"],
      risk: "中",
      note: "使用真实赛程组合，允许一场失手。",
    },
    coverage.length >= 4 && {
      id: "real-coverage-4-3",
      type: "真实数据四串三",
      mode: "atLeast",
      requiredHits: 3,
      matchIds: coverage.map((match) => match.id),
      markets: ["wdl", "ou", "wdl", "ou"],
      risk: "高",
      note: "覆盖真实赛程中排序靠前的比赛，适合临场前再确认。",
    },
  ].filter(Boolean);
}

function buildTomorrowPool(matches, tomorrow) {
  return matches
    .filter((match) => match.date === tomorrow)
    .slice(0, 5)
    .map((match, index) => ({
      category: index < 2 ? "真实赛程候选" : "明日观察",
      matchId: match.id,
      market: index % 2 === 0 ? "wdl" : "ou",
      reason: "来自真实赛程源，等待赔率、首发和临场事件补强。",
    }));
}

async function main() {
  const dates = process.env.SPORTSDB_DATES?.split(",").map((date) => date.trim()).filter(Boolean) || [dateInShanghai(0), dateInShanghai(1)];
  const eventsByDay = await Promise.all(dates.map(fetchDay));
  const events = eventsByDay.flat().slice(0, LIMIT);
  const matches = events.map(mapEvent);

  const data = {
    generatedAt: nowIsoShanghai(),
    source: {
      type: "real",
      provider: "TheSportsDB",
      sport: SPORT,
      dates,
      note: "赛程和比分来自真实公开 API；赔率、竞彩盘口和预测概率为本地模型或待接入授权数据源。",
    },
    matches,
    parlaySeeds: buildParlays(matches),
    history: [],
    marketHistory: [
      { market: "wdl", name: "胜平负", hits: 0, total: 0, streak: "等待真实复盘数据" },
      { market: "ou", name: "总进球数", hits: 0, total: 0, streak: "等待真实复盘数据" },
      { market: "htft", name: "半全场", hits: 0, total: 0, streak: "等待真实复盘数据" },
    ],
    tomorrowPool: buildTomorrowPool(matches, dates[1]),
  };

  await fs.writeFile(OUTPUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`updated ${OUTPUT} with ${matches.length} real events from ${dates.join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
