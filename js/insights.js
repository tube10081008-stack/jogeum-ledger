// 분석 화면용 파생 계산
import { monthKey } from "./format.js";

// 이번 달(또는 지정 월) 카테고리별 지출 분해
export function categoryBreakdown(actual, mk) {
  const by = {};
  for (const t of actual) {
    if (t.type !== "expense" || monthKey(t.date) !== mk) continue;
    by[t.category] = (by[t.category] || 0) + t.amount;
  }
  const total = Object.values(by).reduce((s, v) => s + v, 0);
  const items = Object.entries(by)
    .map(([cat, amt]) => ({ cat, amt, ratio: total > 0 ? amt / total : 0 }))
    .sort((a, b) => b.amt - a.amt);
  return { items, total };
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
