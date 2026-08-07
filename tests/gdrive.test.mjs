// 구글 드라이브 백업 — 사용자 본인 계정에 저장되므로 앱 운영 비용이 들지 않는다.
// 실제 구글 동의 창은 자동화할 수 없어, 토큰 발급만 대역으로 두고
// 그 뒤의 파일 찾기·생성·수정·복원과 안전장치를 검증한다.
import { openApp, blankData, earlyThisMonth } from "./harness.mjs";

export const name = "구글 드라이브 백업";

// GIS(구글 로그인 스크립트) 대역 — 즉시 토큰을 내주도록 한다
const stubGoogle = (page) => page.addInitScript(() => {
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (opts) => ({
          callback: opts.callback,
          requestAccessToken() { this.callback({ access_token: "fake-token", expires_in: 3600 }); },
        }),
      },
    },
  };
});

// 드라이브 API 대역. state.files 로 원격 상태를 흉내낸다.
async function mockDrive(page, { existing = null } = {}) {
  const state = { file: existing, writes: [], created: 0 };
  await page.route("**/www.googleapis.com/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    // 파일 검색
    if (url.includes("/drive/v3/files?q=")) {
      return json({ files: state.file ? [{ id: "file-1", name: "조금만가계부-백업.json" }] : [] });
    }
    // 내용 읽기
    if (/\/drive\/v3\/files\/file-1\?alt=media/.test(url)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: state.file || "null" });
    }
    // 새로 만들기 (multipart)
    if (url.includes("/upload/drive/v3/files?uploadType=multipart")) {
      // multipart 본문의 마지막 파트가 실제 데이터다 (앞 파트는 파일 메타데이터)
      const body = req.postData() || "";
      const at = body.lastIndexOf("\r\n\r\n");
      const payload = at < 0 ? "null" : body.slice(at + 4).replace(/\r\n--[\s\S]*$/, "");
      state.file = payload; state.writes.push(payload); state.created++;
      return json({ id: "file-1" });
    }
    // 덮어쓰기
    if (url.includes("/upload/drive/v3/files/file-1?uploadType=media")) {
      const body = req.postData() || "null";
      state.file = body; state.writes.push(body);
      return json({ id: "file-1" });
    }
    return json({});
  });
  return state;
}

const parseWrite = (raw) => { try { return JSON.parse(raw); } catch { return null; } };
const remoteDoc = (n) => JSON.stringify({
  settings: { yearGoal: 1e7, onboarded: true },
  txns: Array.from({ length: n }, (_, i) => ({
    id: "R" + i, date: earlyThisMonth(1), type: "expense", amount: 1000, category: "food", memo: "원격",
  })),
  updatedAt: Date.now() - 86400000,
});

const localData = (n) => blankData({
  txns: Array.from({ length: n }, (_, i) => ({
    id: "L" + i, date: earlyThisMonth(1), type: "expense", amount: 3000, category: "food", memo: "로컬",
  })),
});

export async function run({ browser, baseURL, check }) {
  // ── 드라이브가 백업 수단으로 노출된다 (클라이언트 ID가 설정돼 있어야 보인다)
  {
    const page = await openApp(browser, baseURL, { data: localData(3) });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    const ids = await page.evaluate(async () =>
      (await import("./js/sync.js")).availableProviders().map((p) => p.id));
    check("드라이브가 선택지에 나온다", ids.includes("gdrive"));
    await page.click('[data-act="settings"]');
    await page.waitForSelector("#sync-gdrive");
    check("설정에 드라이브 버튼이 있다", await page.isVisible("#sync-gdrive"));
    await page.click(".fold summary");                 // 접혀 있는 대체 수단을 펼친다
    check("GitHub 방식도 함께 제공된다", await page.isVisible("#sync-connect"));
    await page.close();
  }

  // ── 처음 연결: 원격에 파일이 없으면 로컬 데이터를 올린다
  {
    const page = await openApp(browser, baseURL, { data: localData(3) });
    await stubGoogle(page);
    const drive = await mockDrive(page);
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.click('[data-act="settings"]');
    await page.click("#sync-gdrive");
    await page.waitForTimeout(1200);

    check("드라이브에 백업 파일을 만든다", drive.created === 1);
    const up = parseWrite(drive.writes[drive.writes.length - 1]);
    check("로컬 기록 3건이 올라간다", up && up.txns.length === 3);

    const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.sync.v1")));
    check("드라이브가 활성 백업으로 저장된다", cfg.provider === "gdrive");
    check("파일 ID를 기억한다", cfg.gdrive && cfg.gdrive.fileId === "file-1");
    check("콘솔·페이지 오류 없음", page.__errors.length === 0);
    if (page.__errors.length) console.log("   ", page.__errors.join("\n    "));
    await page.close();
  }

  // ── 기기가 비었고 드라이브에 기록이 있으면 복원한다 (덮어쓰지 않는다)
  {
    const page = await openApp(browser, baseURL, { data: blankData() });
    await stubGoogle(page);
    const drive = await mockDrive(page, { existing: remoteDoc(40) });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.click('[data-act="settings"]');
    await page.click("#sync-gdrive");
    await page.waitForTimeout(1200);

    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.v1")));
    check("빈 기기에 드라이브 기록이 복원된다", local.txns.length === 40);
    const wroteEmpty = drive.writes.some((w) => { const d = parseWrite(w); return d && d.txns.length === 0; });
    check("빈 데이터로 덮어쓰지 않는다", !wroteEmpty);
    await page.close();
  }

  // ── 자동 백업에서도 안전장치가 걸린다 (프로바이더가 달라져도 규칙은 같아야 한다)
  {
    const page = await openApp(browser, baseURL, {
      data: blankData({ txns: [], updatedAt: Date.now() }),
      sync: { provider: "gdrive", lastSync: 1, gdrive: { connected: true, fileId: "file-1" } },
    });
    await stubGoogle(page);
    const drive = await mockDrive(page, { existing: remoteDoc(40) });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("jogeum.v1")));
    const wroteEmpty = drive.writes.some((w) => { const d = parseWrite(w); return d && d.txns.length === 0; });
    check("드라이브에서도 빈 덮어쓰기가 차단된다", !wroteEmpty);
    check("드라이브에서도 자동 복원된다", local.txns.length === 40);
    await page.close();
  }
}
