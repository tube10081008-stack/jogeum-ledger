// 게이미피케이션 — XP / 레벨 / 뱃지 (전부 상태로부터 계산 → 조작/불일치 없음)
import { monthKey } from "./format.js";

const MILESTONES = [0.1, 0.25, 0.5, 0.75, 1.0];

// 레벨 임계값 (누적 XP)
const LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];

// 레벨 타이틀
const TITLES = ["새싹 🌱", "절약 입문 🐣", "알뜰러 🪙", "저축가 🐖", "살림꾼 🧺",
  "자린고비 💪", "저축 고수 🎯", "머니 마스터 💎", "절약왕 👑", "전설의 자산가 🏆"];
export function levelTitle(level) { return TITLES[Math.min(level - 1, TITLES.length - 1)] || TITLES[0]; }

// 주간 도전 과제 (최근 7일 기준, 진행형)
export function weeklyQuests(c) {
  const end = new Date(c.today + "T00:00:00");
  const last7 = [];
  for (let i = 0; i < 7; i++) { const d = new Date(end); d.setDate(d.getDate() - i); last7.push(d.toISOString().slice(0, 10)); }
  const set = new Set(last7);
  const inWeek = c.actual.filter((t) => set.has(t.date));
  const expDays = new Set(inWeek.filter((t) => t.type === "expense").map((t) => t.date));
  const noSpend = last7.filter((d) => d <= c.today && !expDays.has(d)).length;
  const records = inWeek.length;
  const resistedWeek = (c.resistedLog || []).filter((r) => set.has(r.date)).length;
  const q = [
    { icon: "🚯", label: "무지출 2일 만들기", cur: noSpend, target: 2 },
    { icon: "📝", label: "이번 주 7건 기록", cur: records, target: 7 },
    { icon: "🌊", label: "충동 1번 참기", cur: resistedWeek, target: 1 },
  ].map((x) => ({ ...x, cur: Math.min(x.cur, x.target), done: x.cur >= x.target }));
  return q;
}

export function gameStats(c) {
  const reachedMs = MILESTONES.filter((m) => c.progress >= m).length;
  const monthsUnderBudget = monthsHittingTarget(c);
  const questsDone = weeklyQuests(c).filter((q) => q.done).length;

  const xp =
    c.loggedDays.length * 5 +        // 기록 습관
    c.streak * 10 +                   // 현재 연속
    reachedMs * 120 +                 // 목표 이정표
    monthsUnderBudget * 60 +          // 월 저축목표 달성
    (c.bestNoSpend || 0) * 8 +        // 무지출 챌린지
    (c.resistedCount || 0) * 30 +     // 충동 극복
    questsDone * 40 +                 // 주간 도전 과제
    (c.pledgeSuccessCount || 0) * 25; // 무지출 서약 지킴

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
    { id: "rs1", icon: "🌊", label: "충동 극복", got: (c.resistedCount || 0) >= 1 },
    { id: "rs10", icon: "🛡️", label: "충동왕", got: (c.resistedCount || 0) >= 10 },
    { id: "pl1", icon: "🤝", label: "약속 지킴", got: (c.pledgeSuccessCount || 0) >= 1 },
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
