// 파생 계산 (저장 데이터로부터 모든 지표를 그때그때 계산 → 상태 불일치 없음)
import { load } from "./storage.js";
import { todayISO, monthKey, yearKey, daysBetween, toISO } from "./format.js";

export function compute() {
  const { settings, txns } = load();
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

  return {
    settings, txns, actual, planned,
    year, today, thisMonth,
    yIn, yOut, saved, goal, progress, remainingToGoal,
    mIn, mOut, mNet, monthlyTarget, monthPace,
    upcoming, plInRaw, plOutRaw, projected,
    loggedDays, streak, daysLeftInYear,
  };
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
