// 기본 동작 — 온보딩부터 기록·화면 전환까지 앱이 살아있는지
import { openApp, iso } from "./harness.mjs";

export const name = "기본 동작 (온보딩 · 기입 · 화면 전환)";

export async function run({ browser, baseURL, check }) {
  // 데이터를 넣지 않고 시작 → 첫 사용자 흐름
  const page = await openApp(browser, baseURL, { skipPromo: false });
  await page.goto(baseURL, { waitUntil: "networkidle" });

  // 온보딩 시트가 떠야 한다
  await page.waitForSelector("#sheet:not([hidden])", { timeout: 8000 });
  check("첫 실행에 온보딩이 뜬다", await page.isVisible("#s-goal"));

  await page.fill("#s-goal", "3000000");
  await page.click("#s-save");
  await page.waitForSelector("#sheet", { state: "hidden", timeout: 8000 });

  // 지출 기입
  await page.click("#fab");
  await page.waitForSelector("#sheet:not([hidden])");
  await page.fill("#f-amount", "9000");
  await page.click('#f-cats .chip[data-cat="food"]');
  await page.click("#f-save");
  await page.waitForSelector("#sheet", { state: "hidden", timeout: 8000 });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.v1")));
  check("기록이 저장된다", saved.txns.length === 1 && saved.txns[0].amount === 9000);
  check("오늘 날짜로 기록된다", saved.txns[0].date === new Date().toISOString().slice(0, 10));
  check("목표 설정이 저장된다", saved.settings.yearGoal === 3000000 && saved.settings.onboarded === true);
  check("기록이 화면에 보인다", (await page.textContent("body")).includes("9,000"));

  // 모든 화면이 렌더된다
  for (const route of ["history", "planned", "insights", "quest", "home"]) {
    await page.click(`.nav__btn[data-route="${route}"]`);
    await page.waitForTimeout(150);
    const html = await page.innerHTML("#view");
    check(`${route} 화면이 렌더된다`, html.length > 50);
  }

  check("콘솔·페이지 오류 없음", page.__errors.length === 0);
  if (page.__errors.length) console.log("   ", page.__errors.join("\n    "));
  await page.close();
}
