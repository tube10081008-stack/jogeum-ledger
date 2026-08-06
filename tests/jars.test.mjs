// 저금통 봉인형 — 넣은 돈은 '쓸 수 있는 돈'에서 빠지고, 게임화 지표에 반영된다
import { openApp, blankData, computeIn, earlyThisMonth } from "./harness.mjs";

export const name = "저금통 봉인 · 게임화 연동";

// log 없는 구버전 저금통 — 마이그레이션이 깨지지 않아야 한다
const data = () => blankData({
  txns: [
    { id: "i", date: earlyThisMonth(1), type: "income", amount: 3000000, category: "salary", memo: "월급" },
    { id: "e", date: earlyThisMonth(2), type: "expense", amount: 400000, category: "food", memo: "장보기" },
  ],
  jars: [{ id: "j1", name: "일본 여행", emoji: "✈️", target: 1000000, saved: 200000 }],
});

const snap = (page) => computeIn(page, (c, g) => ({
  locked: c.jarLocked, month: c.jarThisMonth, done: c.jarDone, deposits: c.jarDeposits,
  allowance: Math.round(c.todayAllowance), budgetLeft: c.budgetLeft,
  projected: c.projected, saved: c.saved, xp: g.xp,
  badges: g.badges.filter((b) => b.got).map((b) => b.id),
}));

export async function run({ browser, baseURL, check }) {
  const page = await openApp(browser, baseURL, { data: data(), viewport: { width: 420, height: 900 } });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.waitForSelector(".jarlock");

  const before = await snap(page);
  check("구버전 저금통이 깨지지 않는다", before.locked === 200000);
  check("날짜 모를 과거 입금은 이번 달로 치지 않는다", before.month === 0);
  check("예상 잔액에서 봉인액이 빠진다", before.projected === before.saved - 200000);
  check("올해 목표 진행은 그대로", before.saved === 2600000);
  check("뱃지: 첫 저금통", before.badges.includes("jar1"));
  check("뱃지: 봉인 10만", before.badges.includes("jarlock"));
  check("뱃지: 저금통 완성은 아직", !before.badges.includes("jarfull"));
  check("봉인 배너가 보인다", (await page.textContent(".jarlock")).includes("봉인된 돈"));

  // 30만원 넣기 → 이번 달 예산에서 빠져야 한다
  await page.click('[data-jar="j1"]');
  await page.fill("#j-amt", "300000");
  await page.click("#j-deposit");
  await page.waitForTimeout(400);

  const after = await snap(page);
  check("봉인 총액이 늘어난다", after.locked === 500000);
  check("이번 달 봉인액이 잡힌다", after.month === 300000);
  check("입금 기록이 남는다", after.deposits === 1);
  check("쓸 수 있는 돈이 그만큼 준다", after.budgetLeft === before.budgetLeft - 300000);
  check("오늘 쓸 수 있는 돈도 감소", after.allowance < before.allowance);
  check("XP가 오른다", after.xp > before.xp);

  await page.click('.nav__btn[data-route="quest"]');
  await page.waitForTimeout(300);
  check("주간 도전에 저금통 과제", (await page.textContent("#view")).includes("저금통에 1번 넣기"));

  // 빼면 원래대로
  await page.click('.nav__btn[data-route="home"]');
  await page.click('[data-jar="j1"]');
  await page.fill("#j-amt", "300000");
  await page.click("#j-withdraw");
  await page.waitForTimeout(400);

  const back = await snap(page);
  check("빼면 원래대로 돌아온다", back.locked === 200000 && back.month === 0);

  check("콘솔·페이지 오류 없음", page.__errors.length === 0);
  if (page.__errors.length) console.log("   ", page.__errors.join("\n    "));
  await page.close();
}
