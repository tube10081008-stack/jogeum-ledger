// 테스트 공통 도구 — 정적 서버, 브라우저, 데이터 시드, 검증 수집
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// 앱을 그대로 서빙하는 최소 정적 서버 (빌드 단계가 없으므로 파일을 바로 내보낸다)
export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const file = path.join(ROOT, rel);
    // 저장소 밖 접근 차단
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, baseURL: `http://127.0.0.1:${server.address().port}/` }));
  });
}

/* ---------- 날짜 도구 ----------
 * 테스트는 실행 시점 기준 상대 날짜만 쓴다. 고정 날짜를 쓰면 달이 바뀔 때 CI가 깨진다. */
export const iso = (d = new Date()) => {
  const z = new Date(d);
  z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
  return z.toISOString().slice(0, 10);
};
export const dayOfThisMonth = (n) => {
  const d = new Date();
  return `${iso(d).slice(0, 7)}-${String(n).padStart(2, "0")}`;
};
export const thisMonth = () => iso().slice(0, 7);
export const lastMonth = () => {
  const d = new Date();
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
};
// 이번 달에서 안전하게 쓸 수 있는 '오늘 이전' 날짜 (1일~오늘 사이)
export const earlyThisMonth = (n = 1) => dayOfThisMonth(Math.min(n, new Date().getDate()));

/* ---------- 앱 데이터 시드 ---------- */
export const blankData = (over = {}) => ({
  settings: {
    yearGoal: 10000000, startBalance: 0, year: new Date().getFullYear(),
    monthlyBudget: 1000000, budgets: {}, impulseOn: true, impulseThreshold: 50000, onboarded: true,
  },
  txns: [], jars: [], recurring: [], wishlist: [], resisted: [], pledges: [], aiMissions: [],
  updatedAt: Date.now(), ...over,
});

// 온보딩·광고팝업을 건너뛰고 원하는 상태로 앱을 띄운다
export async function openApp(browser, baseURL, { data, sync, ai, skipPromo = true, viewport } = {}) {
  const page = await browser.newPage(viewport ? { viewport } : {});
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.addInitScript(([data, sync, ai, promo]) => {
    if (data) localStorage.setItem("jogeum.v1", JSON.stringify(data));
    if (sync) localStorage.setItem("jogeum.sync.v1", JSON.stringify(sync));
    if (ai) localStorage.setItem("jogeum.ai.v1", JSON.stringify(ai));
    if (promo) localStorage.setItem("jogeum.promo", promo);
  }, [data || null, sync || null, ai || null, skipPromo ? iso() : null]);
  page.__errors = errors;
  return page;
}

// 앱 내부 상태를 그대로 읽는다 (화면 문자열 매칭보다 견고함)
export const computeIn = (page, fn) => page.evaluate(async (src) => {
  const { compute } = await import("./js/state.js");
  const { gameStats } = await import("./js/gamification.js");
  return new Function("c", "g", "return (" + src + ")(c, g)")(compute(), gameStats(compute()));
}, fn.toString());

/* ---------- 검증 수집 ---------- */
export function collector() {
  const results = [];
  return {
    results,
    check(label, ok) { results.push({ label, ok: !!ok }); return !!ok; },
  };
}
