// 이번 달 목표 — 연중에 시작해도 실제로 필요한 금액을 알려줘야 한다.
// 연 목표를 늘 12로 나누면(예전 동작) 8월에 1,000만 목표를 세운 사람에게 83만이라고 알려주고,
// 그대로 따라가면 5개월 × 83만 = 417만으로 목표에 한참 못 미친다.
import { openApp, blankData, computeIn, earlyThisMonth } from "./harness.mjs";

export const name = "이번 달 저축 목표 계산";

const GOAL = 10000000;
const monthsLeftNow = () => 12 - (new Date().getMonth() + 1) + 1;   // 이번 달 포함

const withGoal = (over = {}) => blankData({
  settings: { ...blankData().settings, yearGoal: GOAL, startBalance: 0, monthlyBudget: 0 },
  ...over,
});

const snap = (page) => computeIn(page, (c) => ({
  target: Math.round(c.monthlyTarget), even: Math.round(c.monthlyEven),
  monthsLeft: c.monthsLeftInclusive, remaining: Math.round(c.remainingToGoal),
  saved: Math.round(c.saved), reached: c.goalReached,
}));

export async function run({ browser, baseURL, check }) {
  // ── 아직 저축이 없을 때: 남은 개월로 나눈 금액이어야 한다
  {
    const page = await openApp(browser, baseURL, { data: withGoal() });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    const s = await snap(page);
    const expected = Math.round(GOAL / monthsLeftNow());

    check(`남은 개월이 ${monthsLeftNow()}개월로 계산된다`, s.monthsLeft === monthsLeftNow());
    check("이번 달 목표 = 남은 목표 ÷ 남은 개월", s.target === expected);
    check("연 목표를 12로 나눈 값이 아니다", monthsLeftNow() === 12 || s.target !== Math.round(GOAL / 12));
    check("게임화 기준은 균등값으로 따로 유지된다", s.even === Math.round(GOAL / 12));

    const view = await page.textContent("#view");
    check("화면에 이번 달 목표가 표시된다", view.includes("이번 달 목표"));
    check("계산 근거를 알려준다", view.includes(`${monthsLeftNow()}개월`));
    check("콘솔·페이지 오류 없음", page.__errors.length === 0);
    if (page.__errors.length) console.log("   ", page.__errors.join("\n    "));
    await page.close();
  }

  // ── 이미 모은 만큼 목표가 줄어든다
  {
    const page = await openApp(browser, baseURL, {
      data: withGoal({ txns: [
        { id: "i", date: earlyThisMonth(1), type: "income", amount: 4000000, category: "salary", memo: "월급" },
      ] }),
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    const s = await snap(page);
    check("모은 금액이 반영된다", s.saved === 4000000 && s.remaining === GOAL - 4000000);
    check("남은 금액 기준으로 목표가 줄어든다", s.target === Math.round((GOAL - 4000000) / monthsLeftNow()));
    await page.close();
  }

  // ── 목표를 이미 넘겼으면 재촉하지 않는다
  {
    const page = await openApp(browser, baseURL, {
      data: withGoal({ txns: [
        { id: "i", date: earlyThisMonth(1), type: "income", amount: GOAL + 500000, category: "salary", memo: "월급" },
      ] }),
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    const s = await snap(page);
    check("목표 달성이 인식된다", s.reached === true);
    check("남은 금액이 0", s.remaining === 0);
    const view = await page.textContent("#view");
    check("달성 문구가 보인다", view.includes("목표 달성"));
    await page.close();
  }

  // ── 목표를 세우지 않았으면 0
  {
    const page = await openApp(browser, baseURL, {
      data: blankData({ settings: { ...blankData().settings, yearGoal: 0 } }),
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    const s = await snap(page);
    check("목표가 없으면 이번 달 목표도 0", s.target === 0 && s.even === 0);
    await page.close();
  }
}
