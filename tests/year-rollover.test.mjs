// 연도 전환 — 해가 바뀌면 새 목표를 받되 지난해 기록은 보존한다.
// 목표 연도가 앱을 처음 켠 해에 고정돼 있어, 처리하지 않으면 1월 1일에 앱이 깨진다.
import { openApp, blankData, earlyThisMonth } from "./harness.mjs";

export const name = "연도 전환";

const lastYear = () => new Date().getFullYear() - 1;

// 목표 연도가 작년으로 굳어 있는 상태 (해가 바뀐 사용자)
const staleYear = () => blankData({
  settings: { ...blankData().settings, year: lastYear(), yearGoal: 5000000, startBalance: 0 },
  txns: [
    { id: "a", date: earlyThisMonth(1), type: "income", amount: 2000000, category: "salary", memo: "월급" },
    { id: "b", date: earlyThisMonth(2), type: "expense", amount: 500000, category: "food", memo: "생활비" },
    { id: "c", date: `${lastYear()}-05-10`, type: "income", amount: 900000, category: "salary", memo: "작년 월급" },
  ],
});

export async function run({ browser, baseURL, check }) {
  // ── 해가 바뀌면 새해 시트가 뜬다
  {
    const page = await openApp(browser, baseURL, { data: staleYear() });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForSelector("#ry-goal", { timeout: 8000 });
    const sheet = await page.textContent("#sheet-panel");
    check("새해 전환 시트가 뜬다", sheet.includes(`${new Date().getFullYear()}년이 시작됐어요`));
    check("지난해 결산이 보인다", sheet.includes(`${lastYear()}년 마무리`));

    // 남은 일수가 음수로 표시되지 않아야 한다
    const days = await page.evaluate(async () => (await import("./js/state.js")).compute().daysLeftInYear);
    check("남은 일수가 음수가 아니다", days >= 0);

    // 새 목표 저장 (이월 켠 상태)
    await page.fill("#ry-goal", "8000000");
    await page.click("#ry-save");
    await page.waitForSelector("#sheet", { state: "hidden", timeout: 8000 });

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.v1")));
    check("목표 연도가 올해로 갱신된다", saved.settings.year === new Date().getFullYear());
    check("새 목표가 저장된다", saved.settings.yearGoal === 8000000);
    check("지난해 기록이 보존된다", saved.txns.length === 3);
    check("지난해 결산이 기록된다", (saved.settings.history || []).some((h) => h.year === lastYear()));
    check("이월하면 시작 잔액이 넘어온다", saved.settings.startBalance > 0);
    check("콘솔·페이지 오류 없음", page.__errors.length === 0);
    if (page.__errors.length) console.log("   ", page.__errors.join("\n    "));
    await page.close();
  }

  // ── 이월을 끄면 0원부터 시작한다
  {
    const page = await openApp(browser, baseURL, { data: staleYear() });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForSelector("#ry-goal");
    await page.uncheck("#ry-carry");
    await page.fill("#ry-goal", "3000000");
    await page.click("#ry-save");
    await page.waitForSelector("#sheet", { state: "hidden" });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.v1")));
    check("이월을 끄면 시작 잔액이 0", saved.settings.startBalance === 0);
    await page.close();
  }

  // ── 연도가 맞으면 전환 시트가 뜨지 않는다
  {
    const page = await openApp(browser, baseURL, {
      data: blankData({ txns: [{ id: "x", date: earlyThisMonth(1), type: "expense", amount: 1000, category: "food", memo: "" }] }),
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    check("올해면 전환 시트가 뜨지 않는다", !(await page.isVisible("#ry-goal")));
    await page.close();
  }
}
