// 분석 화면용 파생 계산
import { monthKey } from "./format.js";

// 지정 월의 유형별(지출/수입) 카테고리 분해
export function breakdownByType(actual, mk, type = "expense") {
  const by = {};
  for (const t of actual) {
    if (t.type !== type || monthKey(t.date) !== mk) continue;
    by[t.category] = (by[t.category] || 0) + t.amount;
  }
  const total = Object.values(by).reduce((s, v) => s + v, 0);
  const items = Object.entries(by)
    .map(([cat, amt]) => ({ cat, amt, ratio: total > 0 ? amt / total : 0 }))
    .sort((a, b) => b.amt - a.amt);
  return { items, total };
}

// 이번 달(또는 지정 월) 카테고리별 지출 분해
export function categoryBreakdown(actual, mk) {
  return breakdownByType(actual, mk, "expense");
}

// 항목(메모)별 집계 — 같은 메모끼리 묶어 합계·건수. "게임 얼마 썼어?" 같은 질문의 근거가 된다.
export function memoBreakdown(actual, mk, type = "expense", n = 10) {
  const by = {};
  for (const t of actual) {
    if (t.type !== type || monthKey(t.date) !== mk) continue;
    const key = String(t.memo || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    const e = (by[key] = by[key] || { memo: String(t.memo).trim().slice(0, 20), amt: 0, count: 0, cat: t.category });
    e.amt += t.amount;
    e.count++;
  }
  return Object.values(by).sort((a, b) => b.amt - a.amt).slice(0, n);
}

// 금액이 큰 거래 TOP n
export function topTxns(actual, mk, type = "expense", n = 5) {
  return actual.filter((t) => t.type === type && monthKey(t.date) === mk)
    .sort((a, b) => b.amount - a.amount).slice(0, n);
}

// 'YYYY-MM'을 delta개월 이동
export function shiftMonth(mk, delta) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 지정 월 요약: 수입·지출·순저축·저축률
export function monthSummary(actual, mk) {
  let inc = 0, exp = 0;
  for (const t of actual) {
    if (monthKey(t.date) !== mk) continue;
    if (t.type === "income") inc += t.amount; else exp += t.amount;
  }
  return { inc, exp, net: inc - exp, rate: inc > 0 ? (inc - exp) / inc : 0 };
}

// 최근 n개월 수입/지출/순액 시계열 (과거→현재)
export function monthlySeries(actual, n, today) {
  const out = [];
  const base = new Date(today + "T00:00:00");
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let inc = 0, exp = 0;
    for (const t of actual) {
      if (monthKey(t.date) !== mk) continue;
      if (t.type === "income") inc += t.amount; else exp += t.amount;
    }
    out.push({ mk, label: `${d.getMonth() + 1}월`, inc, exp, net: inc - exp });
  }
  return out;
}

// 이번 달 일자별 지출 (히트맵용) → { 'YYYY-MM-DD': 금액 }
export function dailySpend(actual, mk) {
  const map = {};
  for (const t of actual) {
    if (t.type !== "expense" || monthKey(t.date) !== mk) continue;
    map[t.date] = (map[t.date] || 0) + t.amount;
  }
  return map;
}

// 이번 달 vs 지난 달 카테고리 증감 (가장 늘어난/줄어든 항목)
export function monthDiff(actual, thisMk, today) {
  const d = new Date(today + "T00:00:00");
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const prevMk = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const cur = categoryBreakdown(actual, thisMk);
  const old = categoryBreakdown(actual, prevMk);
  const oldMap = Object.fromEntries(old.items.map((i) => [i.cat, i.amt]));
  const diffs = cur.items.map((i) => ({ cat: i.cat, diff: i.amt - (oldMap[i.cat] || 0) }))
    .filter((x) => x.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return { curTotal: cur.total, prevTotal: old.total, totalDiff: cur.total - old.total, diffs };
}

// 도넛(원형) SVG — items: [{ratio, color}], stroke 방식
export function donutSVG(slices, size = 160) {
  const r = 56, c = 2 * Math.PI * r, cx = size / 2;
  let off = 0;
  const segs = slices.map((s) => {
    const len = s.ratio * c;
    const el = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}"
      stroke-width="20" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}"
      transform="rotate(-90 ${cx} ${cx})" />`;
    off += len;
    return el;
  }).join("");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#eef1ee" stroke-width="20"/>
    ${segs}</svg>`;
}

export const PALETTE = ["#7ed6a7", "#54b487", "#f4c152", "#f0a35a", "#e26d6d",
  "#9ad4f0", "#b39ddb", "#a3b18a"];

// 8) 이상 지출 감지: 카테고리별 과거 월평균 대비 이번 달 급증 감지 (순수 연산)
export function anomalies(actual, thisMonth) {
  const byCat = {};
  for (const t of actual) {
    if (t.type !== "expense") continue;
    const mk = monthKey(t.date);
    (byCat[t.category] = byCat[t.category] || {});
    byCat[t.category][mk] = (byCat[t.category][mk] || 0) + t.amount;
  }
  const out = [];
  for (const cat in byCat) {
    const months = byCat[cat];
    const prior = Object.keys(months).filter((m) => m < thisMonth).map((m) => months[m]);
    const cur = months[thisMonth] || 0;
    if (prior.length < 1 || cur <= 0) continue;
    const avg = prior.reduce((s, v) => s + v, 0) / prior.length;
    if (avg <= 0) continue;
    const ratio = cur / avg;
    if (ratio >= 1.5 && cur - avg >= 20000) out.push({ cat, cur, avg, ratio });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

// 10) 소비 성향 특징 추출 (프로파일 AI 컨텍스트)
export function spendingFeatures(actual, today) {
  const exp = actual.filter((t) => t.type === "expense");
  const total = exp.reduce((s, t) => s + t.amount, 0);
  const byCat = {};
  let weekend = 0, weekday = 0;
  const dow = [0, 0, 0, 0, 0, 0, 0];
  for (const t of exp) {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    const d = new Date(t.date + "T00:00:00").getDay();
    dow[d] += t.amount;
    if (d === 0 || d === 6) weekend += t.amount; else weekday += t.amount;
  }
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([cat, amt]) => ({ cat, pct: total > 0 ? Math.round((amt / total) * 100) : 0 }));
  const dowNames = ["일", "월", "화", "수", "목", "금", "토"];
  const topDow = dowNames[dow.indexOf(Math.max(...dow))];
  return {
    거래수: exp.length, 총지출: Math.round(total),
    평균거래액: exp.length ? Math.round(total / exp.length) : 0,
    상위카테고리: topCats, 지출많은요일: topDow,
    주말지출비중: total > 0 ? Math.round((weekend / total) * 100) : 0,
  };
}

// 9) 몬테카를로: 월수입/지출의 변동성을 반영해 연말 잔액 분포·목표 달성 확률 추정
export function monteCarlo(actual, { saved, monthsLeft, goal }, monthKeyFn, runs = 3000) {
  // 월별 수입/지출 집계
  const m = {};
  for (const t of actual) {
    const k = monthKeyFn(t.date);
    (m[k] = m[k] || { inc: 0, exp: 0 })[t.type === "income" ? "inc" : "exp"] += t.amount;
  }
  const incs = Object.values(m).map((x) => x.inc);
  const exps = Object.values(m).map((x) => x.exp);
  if (incs.length < 1 || monthsLeft <= 0) return null;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const std = (a, mu) => a.length < 2 ? mu * 0.15 : Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / (a.length - 1));
  const mi = mean(incs), me = mean(exps);
  const si = std(incs, mi), se = std(exps, me);
  // 표준정규 (Box-Muller)
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const results = [];
  let hit = 0;
  for (let r = 0; r < runs; r++) {
    let bal = saved;
    for (let mo = 0; mo < monthsLeft; mo++) {
      bal += Math.max(0, mi + gauss() * si) - Math.max(0, me + gauss() * se);
    }
    results.push(bal);
    if (goal > 0 && bal >= goal) hit++;
  }
  results.sort((a, b) => a - b);
  const q = (p) => results[Math.floor(p * (results.length - 1))];
  return {
    prob: goal > 0 ? hit / runs : null,
    p10: q(0.1), p50: q(0.5), p90: q(0.9),
    mean: mean(results), monthsLeft,
  };
}
