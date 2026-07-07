// Gemini(Google Generative Language) 클라이언트 — 브라우저에서 직접 호출
// 키/모델은 이 기기 localStorage에만 저장(저장소·공개 URL 미포함).
// 비용은 사용자 키로 청구됨. 1인용 개인 사용 전제.
import { CATEGORIES, catOf } from "./storage.js";

const AKEY = "jogeum.ai.v1";       // { key, model }
const BASE = "https://generativelanguage.googleapis.com/v1beta";
let cfg = null;

function getCfg() {
  if (!cfg) { try { cfg = JSON.parse(localStorage.getItem(AKEY)) || {}; } catch { cfg = {}; } }
  return cfg;
}
function saveCfg() { localStorage.setItem(AKEY, JSON.stringify(cfg)); }
export function info() { const c = getCfg(); return { key: !!c.key, model: c.model }; }
export function isReady() { const c = getCfg(); return !!(c.key && c.model); }
export function setModel(model) { getCfg(); cfg.model = model; saveCfg(); }
export function setKey(key) { getCfg(); cfg.key = key.trim(); saveCfg(); }
export function disconnect() { cfg = {}; saveCfg(); }

// 현재 키로 사용 가능한(generateContent 지원) 모델 목록
export async function listModels(key) {
  const k = (key || getCfg().key || "").trim();
  const res = await fetch(`${BASE}/models?key=${encodeURIComponent(k)}&pageSize=200`);
  if (res.status === 400 || res.status === 403) throw new Error("키가 올바르지 않아요");
  if (!res.ok) throw new Error("모델 목록 오류 " + res.status);
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName || m.name }))
    // 최신/플래시 우선 정렬
    .sort((a, b) => b.id.localeCompare(a.id));
}

// 공통 생성 호출
async function generate({ system, prompt, image, json = false, temperature = 0.4 }) {
  const c = getCfg();
  if (!c.key || !c.model) throw new Error("AI가 설정되지 않았어요");
  const parts = [];
  if (prompt) parts.push({ text: prompt });
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature, ...(json ? { responseMimeType: "application/json" } : {}) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(`${BASE}/models/${c.model}:generateContent?key=${encodeURIComponent(c.key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = "AI 오류 " + res.status;
    try { msg = (await res.json()).error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return text;
}

function catList(type) {
  return CATEGORIES[type].map((c) => `${c.id}(${c.label})`).join(", ");
}
function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/[\[{][\s\S]*[\]}]/);     // 코드펜스 등 제거 후 재시도
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// 거래 후보 정규화
function normalizeTxns(arr, today) {
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => {
    const type = t.type === "income" ? "income" : "expense";
    const valid = CATEGORIES[type].some((c) => c.id === t.category);
    return {
      type,
      amount: Math.round(Number(t.amount) || 0),
      category: valid ? t.category : (type === "income" ? "etc_i" : "etc_e"),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : today,
      memo: String(t.memo || "").slice(0, 40),
    };
  }).filter((t) => t.amount > 0);
}

// 1) 자연어 → 거래 후보 배열
export async function parseTransactions(textInput, today) {
  const sys = `너는 한국어 가계부 도우미야. 사용자의 한 줄 입력을 거래 목록(JSON 배열)으로 바꿔.
오늘은 ${today}. 각 항목: {type:"expense"|"income", amount:정수(원), category, date:"YYYY-MM-DD", memo}.
지출 분류 id: ${catList("expense")}. 수입 분류 id: ${catList("income")}.
금액에 '천','만' 단위가 있으면 숫자로 환산(9천=9000, 1만5천=15000). 날짜 표현(어제,그제,3일전)은 오늘 기준으로 계산.
설명 없이 JSON 배열만 출력.`;
  const text = await generate({ system: sys, prompt: textInput, json: true, temperature: 0.2 });
  return normalizeTxns(parseJSON(text), today);
}

// 2) 영수증 이미지 → 거래 후보 배열
export async function extractReceipt(image, today) {
  const sys = `영수증 이미지에서 결제 항목을 거래 목록(JSON 배열)으로 추출해. 오늘은 ${today}.
각 항목: {type:"expense", amount:정수(원), category, date:"YYYY-MM-DD", memo:상호/품목}.
지출 분류 id: ${catList("expense")}. 총액이 명확하면 항목 합 대신 총액 1건으로. 설명 없이 JSON 배열만.`;
  const text = await generate({ system: sys, prompt: "이 영수증을 분석해줘.", image, json: true, temperature: 0.1 });
  return normalizeTxns(parseJSON(text), today);
}

// 5) 메모/상호 → 카테고리 id 추론
export async function classify(memo, type) {
  const sys = `다음 ${type === "income" ? "수입" : "지출"} 설명에 가장 알맞은 분류 id 하나만 JSON으로.
형식: {"category":"<id>"}. 가능한 id: ${catList(type)}. 설명 외 텍스트 금지.`;
  const text = await generate({ system: sys, prompt: memo, json: true, temperature: 0 });
  const o = parseJSON(text);
  const id = o && o.category;
  return CATEGORIES[type].some((c) => c.id === id) ? id : null;
}

// 3) AI 코치 — 재정 요약 컨텍스트 + 대화
export async function coach(history, c) {
  const top = (c.envelopes || []).slice(0, 3);
  const ctx = {
    올해목표: c.goal, 현재저축: Math.round(c.saved), 진행률: Math.round(c.progress * 100) + "%",
    이번달수입: Math.round(c.mIn), 이번달지출: Math.round(c.mOut), 이번달순저축: Math.round(c.mNet),
    월지출예산: c.monthlyBudget, 오늘쓸수있는돈: Math.round(c.todayAllowance),
    무지출연속: c.noSpendStreak, 남은개월: c.monthsLeft,
  };
  const sys = `너는 '조구미'라는 귀여운 아기공룡 가계부 코치야. 한국어로 친근하고 간결하게(3~5문장),
이모지 약간. 아래 사용자 재정 데이터(JSON)에 근거해 구체적으로 조언해. 숫자는 만원 단위로 읽기 쉽게.
모르면 모른다고 해. 데이터: ${JSON.stringify(ctx)}`;
  // 대화 history: [{role:'user'|'model', text}]
  const c2 = getCfg();
  const contents = history.map((h) => ({ role: h.role, parts: [{ text: h.text }] }));
  const res = await fetch(`${BASE}/models/${c2.model}:generateContent?key=${encodeURIComponent(c2.key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents,
      generationConfig: { temperature: 0.6 } }),
  });
  if (!res.ok) { let m = "AI 오류 " + res.status; try { m = (await res.json()).error?.message || m; } catch {} throw new Error(m); }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "(응답 없음)";
}

// 4) AI 리포트 — 자연어 내러티브 + 행동 제안
export async function report(period, ctx) {
  const label = period === "week" ? "이번 주" : "이번 달";
  const sys = `너는 '조구미'라는 다정한 아기공룡 가계부 코치야. 아래 데이터(JSON)로 ${label} 리포트를 써.
- 한국어, 따뜻하고 간결하게. 먼저 3~4문장 요약(잘한 점 칭찬 + 개선점 1가지).
- 그다음 '이렇게 해볼까요?' 아래 구체적 행동 3가지를 짧은 불릿(-)으로.
- 숫자는 만원 단위로 읽기 쉽게. 이모지 약간 🦕. 데이터: ${JSON.stringify(ctx)}`;
  return generate({ system: sys, prompt: `${label} 리포트를 써줘.`, temperature: 0.6 });
}

// 5) AI 맞춤 절약 미션 3개
export async function missions(ctx) {
  const sys = `아래 소비 데이터를 보고 '이번 주' 맞춤 절약 미션 3개를 JSON 배열로 만들어.
각 항목: {title:"짧고 구체적인 미션", tip:"한 줄 팁"}. 달성 가능하고 개인화되게(예: "카페 주 2회 이하").
설명 없이 JSON 배열만.`;
  const text = await generate({ system: sys, prompt: JSON.stringify(ctx), json: true, temperature: 0.5 });
  const arr = parseJSON(text);
  return Array.isArray(arr) ? arr.slice(0, 3).map((m) => ({
    title: String(m.title || "").slice(0, 40), tip: String(m.tip || "").slice(0, 90),
  })) : [];
}

// 10) 소비 성향 프로파일
export async function profile(features) {
  const sys = `아래 소비 특징(JSON)으로 사용자의 소비 성향을 재미있고 따뜻하게 분석해.
JSON만 출력: {"title":"성향 별명(이모지 포함, 예: 🌙 야식 요정)","desc":"2~3문장","tips":["팁1","팁2"]}.`;
  const text = await generate({ system: sys, prompt: JSON.stringify(features), json: true, temperature: 0.7 });
  const o = parseJSON(text);
  return o && o.title ? { title: String(o.title).slice(0, 40), desc: String(o.desc || "").slice(0, 200),
    tips: Array.isArray(o.tips) ? o.tips.slice(0, 3).map((t) => String(t).slice(0, 80)) : [] } : null;
}

// 10) 충동구매 협상 — 조구미가 다정하게 재고하도록 유도
export async function negotiate(pending, c, history) {
  const cat = catOf("expense", pending.category);
  const delayDays = c.goal > 0 ? Math.round(pending.amount / (c.goal / 365)) : 0;
  const ctx = {
    사려는것: pending.memo || cat.label, 금액: pending.amount, 분류: cat.label,
    오늘쓸수있는돈: Math.round(c.todayAllowance), 목표진행률: Math.round(c.progress * 100) + "%",
    이지출이면목표지연일: delayDays, 이번달지출: Math.round(c.mOut), 월예산: c.monthlyBudget,
  };
  const sys = `너는 '조구미'라는 다정한 아기공룡 코치야. 사용자가 충동적으로 큰 지출을 하려 해.
강요하지 말고, 따뜻하게 공감하면서 '정말 지금 필요한지' 스스로 생각하게 도와줘.
- 한국어, 2~4문장, 이모지 약간 🦕
- 소크라테스식 질문 1개 + 가능하면 현실적 대안이나 '하루만 미뤄보기' 제안
- 목표에 미치는 영향(예: 목표 ${delayDays}일 지연)을 부드럽게 언급
- 마지막은 사용자가 스스로 결정하도록 열어둬. 사라/사지마라 단정하지 마.
사용자 재정·구매 데이터(JSON): ${JSON.stringify(ctx)}`;
  const c2 = getCfg();
  const contents = (history.length ? history : [{ role: "user", text: `${pending.amount}원짜리 ${pending.memo || cat.label} 지금 사려고 해.` }])
    .map((h) => ({ role: h.role, parts: [{ text: h.text }] }));
  const res = await fetch(`${BASE}/models/${c2.model}:generateContent?key=${encodeURIComponent(c2.key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.7 } }),
  });
  if (!res.ok) { let m = "AI 오류 " + res.status; try { m = (await res.json()).error?.message || m; } catch {} throw new Error(m); }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "(응답 없음)";
}

export { catOf };
