// 데이터 보존 — 백업이 없으면 경고하고, 있으면 조용해야 한다.
// 저장소가 통째로 비워지는 사고를 겪은 뒤 추가된 안전장치다.
import { openApp, blankData, earlyThisMonth } from "./harness.mjs";

export const name = "데이터 보존 (영속성 · 백업 유도)";

const withTxns = (n) => blankData({
  txns: Array.from({ length: n }, (_, i) => ({
    id: "t" + i, date: earlyThisMonth(1), type: "expense", amount: 5000, category: "food", memo: "기록",
  })),
});

const GIST = { token: "t", gistId: "g1", lastSync: Date.now() };

export async function run({ browser, baseURL, check }) {
  // ── 기록이 쌓였는데 백업 수단이 없으면 경고한다
  {
    const page = await openApp(browser, baseURL, { data: withTxns(5) });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    check("백업이 없으면 경고 카드가 뜬다", await page.isVisible(".risk"));
    check("경고에 기록 건수가 나온다", (await page.textContent(".risk")).includes("5건"));

    // "일주일 뒤에" 누르면 사라지고, 다시 열어도 안 뜬다
    await page.click('[data-act="nudge-later"]');
    await page.waitForTimeout(200);
    check("나중에 누르면 사라진다", !(await page.isVisible(".risk")));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    check("다시 열어도 뜨지 않는다", !(await page.isVisible(".risk")));
    check("콘솔·페이지 오류 없음", page.__errors.length === 0);
    await page.close();
  }

  // ── 기록이 거의 없을 땐 재촉하지 않는다
  {
    const page = await openApp(browser, baseURL, { data: withTxns(1) });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    check("기록이 적으면 재촉하지 않는다", !(await page.isVisible(".risk")));
    await page.close();
  }

  // ── 클라우드 백업이 연결돼 있으면 경고하지 않는다
  {
    const page = await openApp(browser, baseURL, { data: withTxns(20), sync: GIST });
    await page.route("**/api.github.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"id":"g1","files":{}}' }));
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    check("클라우드가 있으면 경고하지 않는다", !(await page.isVisible(".risk")));
    await page.close();
  }

  // ── 백업 파일을 저장하면 경고가 사라지고 상태가 기록된다
  {
    const page = await openApp(browser, baseURL, { data: withTxns(8) });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    check("경고가 떠 있다", await page.isVisible(".risk"));

    const dl = page.waitForEvent("download", { timeout: 8000 });
    await page.click('[data-act="backup-now"]');
    const file = await dl;
    check("백업 파일이 내려받아진다", /jogeum-backup-\d{4}-\d{2}-\d{2}\.json/.test(file.suggestedFilename()));
    await page.waitForTimeout(300);
    check("백업 후 경고가 사라진다", !(await page.isVisible(".risk")));

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.durability.v1")));
    check("마지막 백업 시각이 기록된다", saved && saved.lastExportAt > 0);
    check("콘솔·페이지 오류 없음", page.__errors.length === 0);
    await page.close();
  }

  // ── 저장소 보호(persist) 요청과 설정 화면 표시
  {
    const page = await openApp(browser, baseURL, { data: withTxns(8) });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.durability.v1") || "{}"));
    check("시작 시 저장소 보호를 요청한다", d.persistAsked === true);

    await page.click('[data-act="settings"]');
    await page.waitForSelector(".safety");
    const safety = await page.textContent(".safety");
    check("설정에 백업 상태가 보인다", safety.includes("백업 상태"));
    check("설정에 저장소 보호 상태가 보인다", safety.includes("저장소 보호"));
    await page.close();
  }
}
