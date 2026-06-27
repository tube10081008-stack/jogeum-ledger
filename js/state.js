// 파생 계산 (저장 데이터로부터 모든 지표를 그때그때 계산 → 상태 불일치 없음)
import { load } from "./storage.js";
import { todayISO, monthKey, yearKey, daysBetween, toISO } from "./format.js";

export function compute() {
  const { settings, txns, jars, recurring } = load();
  const year = String(settings.year);
  const today = todayISO();
  const thisMonth = monthKey(today);

  const actual = txns.filter((t) => !t.planned);
  const planned = txns.filter((t) => t.planned);

  // 올해 실현 수입/지출
  const yIn = sum(actual, year, "income");
  const yOut = sum(actual, year, "expense");
  const saved = settings.startBalance + yIn - yOut;          // 올해 순저축(=목표 진행)
  const goal = settings.yearGoal || 0;
  const progress = goal > 0 ? clamp(saved / goal, 0, 1) : 0;

  // 이번 달
  const mIn = sumMonth(actual, thisMonth, "income");
  const mOut = sumMonth(actual, thisMonth, "expense");
  const mNet = mIn - mOut;
  const monthlyTarget = goal > 0 ? goal / 12 : 0;            // 월 저축 목표
  const monthPace = monthlyTarget > 0 ? mNet / monthlyTarget : 0;

  // 예정(미래 계획) — 앞으로 30일
  const upcoming = planned
    .filter((t) => t.date >= today && daysBetween(today, t.date) <= 60)
    .sort((a, b) => a.date.localeCompare(b.date));
  const plInRaw = planned.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const plOutRaw = planned.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const projected = saved + plInRaw - plOutRaw;             // 계획 반영 연말 예상 잔액

  // 기록 습관 / 연속일
  const loggedDays = [...new Set(actual.map((t) => t.date))].sort();
  const streak = currentStreak(loggedDays, today);

  // 남은 정보
  const daysLeftInYear = daysBetween(today, `${year}-12-31`);
  const remainingToGoal = Math.max(0, goal - saved);

  // 무지출 챌린지: 지출이 0원인 날
  const expenseDays = new Set(actual.filter((t) => t.type === "expense").map((t) => t.date));
  const firstDay = [...new Set(actual.map((t) => t.date))].sort()[0];
  let noSpendStreak = 0, bestNoSpend = 0, noSpendThisMonth = 0;
  if (firstDay) {
    // 오늘부터 거슬러 연속 무지출
    for (let d = today; d >= firstDay && !expenseDays.has(d); d = shiftDay(d, -1)) noSpendStreak++;
    // 최고 기록 + 이번 달 무지출 일수
    let run = 0;
    for (let d = firstDay; d <= today; d = shiftDay(d, 1)) {
      if (!expenseDays.has(d)) { run++; bestNoSpend = Math.max(bestNoSpend, run); } else run = 0;
      if (monthKey(d) === thisMonth && !expenseDays.has(d)) noSpendThisMonth++;
    }
  }

  // 미래 시뮬레이터용 월평균 (기록 있는 달 기준)
  const mMap = {};
  for (const t of actual) {
    const k = monthKey(t.date);
    (mMap[k] = mMap[k] || { inc: 0, exp: 0 })[t.type === "income" ? "inc" : "exp"] += t.amount;
  }
  const mks = Object.keys(mMap);
  const nM = mks.length || 1;
  const avgMonthlyIncome = mks.reduce((s, k) => s + mMap[k].inc, 0) / nM;
  const avgMonthlyExpense = mks.reduce((s, k) => s + mMap[k].exp, 0) / nM;
  const monthsLeft = Math.max(0, 12 - (new Date(today + "T00:00:00").getMonth() + 1));

  // 오늘 쓸 수 있는 돈 (월 예산 기준)
  const d = new Date(today + "T00:00:00");
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daysLeftInMonth = daysInMonth - d.getDate() + 1;     // 오늘 포함
  const monthlyBudget = settings.monthlyBudget || 0;
  const budgetLeft = monthlyBudget > 0 ? monthlyBudget - mOut : 0;
  const todayAllowance = monthlyBudget > 0 ? Math.max(0, budgetLeft) / daysLeftInMonth : 0;

  // 카테고리별 봉투 사용량 (이번 달)
  const budgets = settings.budgets || {};
  const envelopes = Object.keys(budgets).map((cat) => {
    const limit = budgets[cat];
    const spent = actual.filter((t) => t.type === "expense" && t.category === cat &&
      monthKey(t.date) === thisMonth).reduce((s, t) => s + t.amount, 0);
    return { cat, limit, spent, ratio: limit > 0 ? spent / limit : 0 };
  }).sort((a, b) => b.ratio - a.ratio);

  return {
    settings, txns, actual, planned, jars: jars || [], recurring: recurring || [],
    year, today, thisMonth,
    yIn, yOut, saved, goal, progress, remainingToGoal,
    mIn, mOut, mNet, monthlyTarget, monthPace,
    upcoming, plInRaw, plOutRaw, projected,
    loggedDays, streak, daysLeftInYear,
    monthlyBudget, budgetLeft, todayAllowance, daysLeftInMonth, daysInMonth, envelopes,
    noSpendStreak, bestNoSpend, noSpendThisMonth,
    avgMonthlyIncome, avgMonthlyExpense, monthsLeft,
  };
}

// 날짜 ISO를 delta일 이동
function shiftDay(iso, delta) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

function sum(arr, year, type) {
  return arr.filter((t) => t.type === type && yearKey(t.date) === year)
    .reduce((s, t) => s + t.amount, 0);
}
function sumMonth(arr, mk, type) {
  return arr.filter((t) => t.type === type && monthKey(t.date) === mk)
    .reduce((s, t) => s + t.amount, 0);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 오늘 또는 어제부터 거슬러 올라가는 연속 기록일 수
function currentStreak(days, today) {
  if (!days.length) return 0;
  const set = new Set(days);
  const last = days[days.length - 1];
  // 마지막 기록이 어제보다 오래됐으면 연속 끊김
  const gap = daysBetween(last, today);
  if (gap > 1) return 0;
  let streak = 0;
  let cursor = last;
  while (set.has(cursor)) {
    streak++;
    const d = new Date(cursor + "T00:00:00");
    d.setDate(d.getDate() - 1);
    cursor = toISO(d);
  }
  return streak;
}
