// 게이미피케이션 — XP / 레벨 / 뱃지 (전부 상태로부터 계산 → 조작/불일치 없음)
import { monthKey } from "./format.js";

const MILESTONES = [0.1, 0.25, 0.5, 0.75, 1.0];

// 레벨 임계값 (누적 XP)
const LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];

export function gameStats(c) {
  const reachedMs = MILESTONES.filter((m) => c.progress >= m).length;
  const monthsUnderBudget = monthsHittingTarget(c);

  const xp =
    c.loggedDays.length * 5 +        // 기록 습관
    c.streak * 10 +                   // 현재 연속
    reachedMs * 120 +                 // 목표 이정표
    monthsUnderBudget * 60 +          // 월 저축목표 달성
    (c.bestNoSpend || 0) * 8;         // 무지출 챌린지

  let level = 1, cur = 0, next = LEVELS[1];
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i]) { level = i + 1; cur = LEVELS[i]; next = LEVELS[i + 1] ?? LEVELS[i]; }
  }
  const span = Math.max(1, next - cur);
  const lvlPct = next === cur ? 100 : Math.round(((xp - cur) / span) * 100);

  const badges = [
    { id: "first", icon: "🌱", label: "첫 기록", got: c.loggedDays.length >= 1 },
    { id: "week", icon: "🔥", label: "7일 연속", got: c.streak >= 7 },
    { id: "month", icon: "📅", label: "30일 연속", got: c.streak >= 30 },
    { id: "saver", icon: "🐷", label: "월 목표달성", got: monthsUnderBudget >= 1 },
    { id: "m25", icon: "🥉", label: "목표 25%", got: c.progress >= 0.25 },
    { id: "m50", icon: "🥈", label: "목표 50%", got: c.progress >= 0.5 },
    { id: "m75", icon: "🥇", label: "목표 75%", got: c.progress >= 0.75 },
    { id: "m100", icon: "👑", label: "목표 달성", got: c.progress >= 1 },
    { id: "ns3", icon: "🚯", label: "무지출 3일", got: (c.bestNoSpend || 0) >= 3 },
    { id: "ns7", icon: "🧘", label: "무지출 7일", got: (c.bestNoSpend || 0) >= 7 },
  ];

  return { xp, level, lvlPct, next, cur, badges, reachedMs, monthsUnderBudget };
}

// 월 저축목표(연목표/12)를 넘긴 '지난 달' 수
function monthsHittingTarget(c) {
  if (c.monthlyTarget <= 0) return 0;
  const byMonth = {};
  for (const t of c.actual) {
    const k = monthKey(t.date);
    if (k >= c.thisMonth) continue; // 진행 중인 이번 달은 제외
    byMonth[k] = byMonth[k] || 0;
    byMonth[k] += t.type === "income" ? t.amount : -t.amount;
  }
  return Object.values(byMonth).filter((net) => net >= c.monthlyTarget).length;
}
