// PWA 설치 자산과 접근성 — 설치 첫인상이 깨지지 않고, 글씨를 키울 수 있어야 한다
export const name = "PWA 설치 자산 · 접근성";

export async function run({ browser, baseURL, check }) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(baseURL, { waitUntil: "networkidle" });

  // ── 매니페스트
  const manifest = await (await page.request.get(baseURL + "manifest.webmanifest")).json();
  const png = (manifest.icons || []).filter((i) => i.type === "image/png");
  const has = (size, purpose) => png.some((i) => i.sizes === `${size}x${size}` && (i.purpose || "any").includes(purpose));
  check("매니페스트에 PNG 192 (any)", has(192, "any"));
  check("매니페스트에 PNG 512 (any)", has(512, "any"));
  check("매니페스트에 maskable 192", has(192, "maskable"));
  check("매니페스트에 maskable 512", has(512, "maskable"));

  // 아이콘 파일이 실제로 존재하고 PNG인지 (매니페스트만 고치고 파일을 빠뜨리는 실수 방지)
  for (const icon of png) {
    const res = await page.request.get(baseURL + icon.src.replace(/^\.\//, ""));
    const buf = await res.body();
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    check(`${icon.src} 파일이 있고 PNG다`, res.ok() && isPng);
  }

  // ── iOS 홈 화면 아이콘 (iOS는 SVG를 지원하지 않는다)
  const apple = await page.getAttribute('link[rel="apple-touch-icon"]', "href");
  check("apple-touch-icon이 PNG다", !!apple && apple.endsWith(".png"));
  check("apple-touch-icon 파일이 있다", (await page.request.get(baseURL + apple.replace(/^\.\//, ""))).ok());

  // ── 접근성: 확대를 막지 않아야 한다
  const viewport = await page.getAttribute('meta[name="viewport"]', "content");
  check("확대를 막지 않는다 (user-scalable)", !/user-scalable\s*=\s*no/.test(viewport));
  check("확대 배율을 제한하지 않는다 (maximum-scale)", !/maximum-scale/.test(viewport));

  // ── 서비스워커가 새 아이콘도 캐시 목록에 포함하는지
  const sw = await (await page.request.get(baseURL + "sw.js")).text();
  check("서비스워커가 PNG 아이콘을 캐시한다", sw.includes("icon-192.png") && sw.includes("icon-512.png"));
  check("서비스워커가 durability.js를 캐시한다", sw.includes("durability.js"));

  await page.close();
  await ctx.close();
}
