// 동기화 안전장치 — 되돌아가면 사용자의 클라우드 백업이 파괴되는 부분.
// 실제로 데이터 손실 사고가 있었던 경로이므로 반드시 유지돼야 한다.
import { openApp, blankData, earlyThisMonth } from "./harness.mjs";

export const name = "동기화 안전장치 (빈 데이터 덮어쓰기 차단)";

const GIST = { token: "test-token", gistId: "g1", lastSync: 1 };

// 원격 Gist를 흉내내고, 업로드된 내용을 가로챈다
async function mockGitHub(page, remote) {
  const state = { pushed: null };
  await page.route("**/api.github.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "PATCH" || req.method() === "POST") {
      state.pushed = JSON.parse(req.postData() || "{}");
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"id":"g1","files":{}}' });
    }
    if (req.url().includes("/gists/g1")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ id: "g1", history: [], files: { "jogeum-backup.json": { content: JSON.stringify(remote) } } }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return state;
}

const remoteWith = (n, extra = {}) => ({
  settings: { yearGoal: 10000000, onboarded: true },
  txns: Array.from({ length: n }, (_, i) => ({
    id: "R" + i, date: earlyThisMonth(1), type: "expense", amount: 1000, category: "food", memo: "원격기록",
  })),
  ...extra,
});

const uploadedCount = (pushed) =>
  pushed ? JSON.parse(pushed.files["jogeum-backup.json"].content).txns.length : null;

export async function run({ browser, baseURL, check }) {
  // ── 사고 재현: 기기 저장소가 비워진 뒤 로컬 updatedAt만 최신인 상태
  {
    const page = await openApp(browser, baseURL, {
      data: blankData({ txns: [], updatedAt: Date.now() }), sync: GIST,
    });
    const gh = await mockGitHub(page, remoteWith(50, { updatedAt: Date.now() - 86400000 }));
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.v1")));
    check("빈 로컬이 클라우드를 덮어쓰지 않는다", uploadedCount(gh.pushed) !== 0);
    check("오히려 원격 기록을 복원한다", local.txns.length === 50);
    await page.close();
  }

  // ── 원격에 updatedAt이 없는 옛 백업도 보호돼야 한다
  {
    const page = await openApp(browser, baseURL, {
      data: blankData({ txns: [], updatedAt: Date.now() }), sync: GIST,
    });
    const gh = await mockGitHub(page, remoteWith(50));      // updatedAt 없음
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.v1")));
    check("updatedAt 없는 백업도 덮어쓰지 않는다", uploadedCount(gh.pushed) !== 0);
    check("그 경우에도 복원된다", local.txns.length === 50);
    await page.close();
  }

  // ── 정상 동작은 그대로여야 한다 (안전장치가 업로드를 막아버리면 백업이 안 됨)
  {
    const local3 = blankData({
      txns: [1, 2, 3].map((i) => ({
        id: "L" + i, date: earlyThisMonth(1), type: "expense", amount: 5000, category: "food", memo: "로컬",
      })),
      updatedAt: Date.now(),
    });
    const page = await openApp(browser, baseURL, { data: local3, sync: GIST });
    const gh = await mockGitHub(page, remoteWith(2, { updatedAt: Date.now() - 86400000 }));
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    check("로컬에 기록이 있으면 정상 업로드된다", uploadedCount(gh.pushed) === 3);
    check("콘솔·페이지 오류 없음", page.__errors.length === 0);
    await page.close();
  }
}
