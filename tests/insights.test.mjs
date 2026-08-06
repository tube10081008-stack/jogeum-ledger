// 분석 탭 + AI 코치에 넘어가는 집계 — "게임에 얼마 썼어?"에 답할 수 있어야 한다
import { openApp, blankData, earlyThisMonth, thisMonth, lastMonth } from "./harness.mjs";

export const name = "분석 탭 · 코치 집계";

const data = () => blankData({
  txns: [
    // 이번 달 — 여가(게임) 3건: 55000 + 32000 + 13000
    { id: "a", date: earlyThisMonth(3), type: "expense", amount: 55000, category: "fun", memo: "게임 결제" },
    { id: "b", date: earlyThisMonth(4), type: "expense", amount: 32000, category: "fun", memo: "게임" },
    { id: "c", date: earlyThisMonth(5), type: "expense", amount: 13000, category: "fun", memo: "게임" },
    { id: "d", date: earlyThisMonth(6), type: "expense", amount: 9000, category: "food", memo: "김밥" },
    { id: "e", date: earlyThisMonth(1), type: "income", amount: 1500000, category: "salary", memo: "월급" },
    { id: "f", date: earlyThisMonth(2), type: "income", amount: 120000, category: "side", memo: "세차" },
    // 지난 달
    { id: "g", date: lastMonth() + "-10", type: "expense", amount: 40000, category: "cafe", memo: "커피" },
    { id: "h", date: lastMonth() + "-02", type: "income", amount: 1500000, category: "salary", memo: "월급" },
  ],
});

export async function run({ browser, baseURL, check }) {
  const page = await openApp(browser, baseURL, {
    data: data(), ai: { key: "k", model: "m" }, viewport: { width: 420, height: 900 },
  });

  // Gemini 호출을 가로채 실제로 넘어가는 컨텍스트를 검사
  let sys = "";
  await page.route("**/generativelanguage.googleapis.com/**", async (route) => {
    sys = JSON.parse(route.request().postData() || "{}").systemInstruction?.parts?.[0]?.text || "";
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "여가 3건 합계 10만원이야" }] } }] }),
    });
  });

  await page.goto(baseURL, { waitUntil: "networkidle" });

  // ── 코치: 지출 항목 질문에 필요한 집계가 실려 나가는가
  await page.click("#home-coach");
  await page.fill("#chat-input", "게임에 이번달 총 얼마 썼어?");
  await page.click("#chat-send");
  await page.waitForFunction(() => document.querySelector("#chat-log")?.textContent.includes("여가 3건"), { timeout: 10000 });

  const agg = JSON.parse((sys.match(/월별집계\(JSON\): (\{.*?\})\n거래내역/s) || [])[1] || "{}");
  const game = (agg.이번달?.지출_항목별 || []).find((x) => x.항목 === "게임");
  const fun = (agg.이번달?.지출_분류별 || []).find((x) => x.분류 === "여가");
  check("항목별 집계: 게임 45,000원 2건", game?.금액 === 45000 && game?.건수 === 2);
  check("분류별 집계: 여가 100,000원", fun?.금액 === 100000);
  check("수입 항목도 집계된다 (세차)", (agg.이번달?.수입_항목별 || []).some((x) => x.항목 === "세차"));
  check("지난달 집계도 함께 넘어간다", agg.지난달?.월 === lastMonth());
  check("지출도 답하도록 지시가 들어있다", sys.includes("나눠져 있지 않아 모르겠다"));
  check("저금통 정보가 컨텍스트에 있다", sys.includes("저금통"));
  await page.click("[data-close]");

  // ── 분석 탭
  await page.click('.nav__btn[data-route="insights"]');
  await page.waitForSelector(".mnav");
  const cur = await page.textContent("#view");
  const [y, m] = thisMonth().split("-");
  check("이번 달이 기본 표시된다", (await page.textContent(".mnav__t")).includes(`${y}년 ${+m}월`));
  check("카테고리별 수입 카드", cur.includes("카테고리별 수입"));
  check("항목별 지출 TOP", cur.includes("항목별 지출 TOP"));
  check("항목별 수입 TOP", cur.includes("항목별 수입 TOP"));
  check("저축률 표시", cur.includes("저축률"));
  check("다음 달로는 갈 수 없다", await page.isDisabled('[data-mshift="1"]'));

  // 지난달로 이동
  await page.click('[data-mshift="-1"]');
  const [py, pm] = lastMonth().split("-");
  await page.waitForFunction((t) => document.querySelector(".mnav__t")?.textContent.includes(t), `${py}년 ${+pm}월`, { timeout: 5000 });
  const prev = await page.textContent("#view");
  check("지난달로 이동된다", prev.includes(`${py}년 ${+pm}월`));
  check("지난달 데이터가 보인다 (커피)", prev.includes("커피"));
  check("과거 달에서는 다음 달 이동 가능", !(await page.isDisabled('[data-mshift="1"]')));

  // 탭을 나갔다 오면 이번 달로 복귀
  await page.click('.nav__btn[data-route="home"]');
  await page.click('.nav__btn[data-route="insights"]');
  check("탭 재진입 시 이번 달", (await page.textContent(".mnav__t")).includes(`${y}년 ${+m}월`));

  check("콘솔·페이지 오류 없음", page.__errors.length === 0);
  if (page.__errors.length) console.log("   ", page.__errors.join("\n    "));
  await page.close();
}
