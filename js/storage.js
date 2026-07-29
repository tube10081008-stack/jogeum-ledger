// 로컬 저장소 (1인용 — 서버 없음, 전부 기기에 저장)
const KEY = "jogeum.v1";

export const CATEGORIES = {
  expense: [
    { id: "food", label: "식비", icon: "🍚" },
    { id: "cafe", label: "카페/간식", icon: "☕" },
    { id: "transport", label: "교통", icon: "🚌" },
    { id: "shopping", label: "쇼핑", icon: "🛍️" },
    { id: "fun", label: "여가", icon: "🎮" },
    { id: "health", label: "건강", icon: "💊" },
    { id: "home", label: "생활/주거", icon: "🏠" },
    { id: "etc_e", label: "기타", icon: "✏️" },
  ],
  income: [
    { id: "salary", label: "월급", icon: "💼" },
    { id: "side", label: "부수입", icon: "💡" },
    { id: "gift", label: "용돈/선물", icon: "🎁" },
    { id: "etc_i", label: "기타", icon: "✏️" },
  ],
};
export const catOf = (type, id) =>
  CATEGORIES[type].find((c) => c.id === id) || { id, label: id, icon: "✏️" };

const blank = () => ({
  settings: {
    yearGoal: 0,            // 올해 목표 저축액
    startBalance: 0,        // 연초 시작 잔액
    year: new Date().getFullYear(),
    monthlyBudget: 0,       // 월 지출 예산 (오늘 쓸 수 있는 돈 계산용)
    budgets: {},            // 카테고리별 월 봉투 예산 {catId: 금액}
    impulseOn: true,        // 충동구매 협상 사용
    impulseThreshold: 50000,// 이 금액 이상 지출이면 협상 발동
    onboarded: false,
  },
  txns: [],                 // {id,date,type,amount,category,memo,planned,rid,period}
  jars: [],                 // 저금통(추가 목표) {id,name,emoji,target,saved}
  recurring: [],            // 반복 거래 {id,type,amount,category,memo,day,active,createdAt}
  wishlist: [],             // 충동 보류 {id,name,amount,category,addedAt,cooldownUntil}
  resisted: [],             // 참은 기록 {date,amount,name}
  pledges: [],              // 무지출 서약한 날짜들 ["YYYY-MM-DD"]
  aiMissions: [],           // AI 절약 미션 {title,tip,done}
});

// 불러온 데이터에 빠진 필드 보강 (load/applyRemote/import 공통)
function normalize(c) {
  c.settings = Object.assign(blank().settings, c.settings);
  if (!c.settings.budgets || typeof c.settings.budgets !== "object") c.settings.budgets = {};
  c.txns = Array.isArray(c.txns) ? c.txns : [];
  c.mascot = c.mascot && typeof c.mascot === "object" ? c.mascot : {};
  c.jars = Array.isArray(c.jars) ? c.jars : [];
  // 구버전 저금통엔 입금 기록(log)이 없다 — 빈 배열로 보강(과거 입금은 날짜 불명이라 이번 달로 치지 않음)
  c.jars.forEach((j) => { if (!Array.isArray(j.log)) j.log = []; });
  c.recurring = Array.isArray(c.recurring) ? c.recurring : [];
  c.wishlist = Array.isArray(c.wishlist) ? c.wishlist : [];
  c.resisted = Array.isArray(c.resisted) ? c.resisted : [];
  c.pledges = Array.isArray(c.pledges) ? c.pledges : [];
  c.aiMissions = Array.isArray(c.aiMissions) ? c.aiMissions : [];
  return c;
}

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY)) || blank();
  } catch {
    cache = blank();
  }
  return normalize(cache);
}

// 마스코트 커스텀 이미지(기분별) — 사용자가 올린 이미지는 이 기기에만 저장됨
export function getMascot() { return load().mascot; }
export function setMascot(mood, dataURL) { load(); cache.mascot[mood] = dataURL; save(); }
export function clearMascot(mood) { load(); delete cache.mascot[mood]; save(); }

// 변경 구독 (동기화 모듈이 사용)
const listeners = [];
export function subscribe(fn) { listeners.push(fn); }

export function getUpdatedAt() { return load().updatedAt || 0; }

// touch=true면 변경시각 갱신, silent=true면 구독자에게 알리지 않음(원격에서 받아쓸 때)
export function save({ touch = true, silent = false } = {}) {
  if (touch) cache.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(cache));
  if (!silent) listeners.forEach((f) => f());
}

// 원격(Gist)에서 받은 데이터를 그대로 적용 (시각 보존, 재푸시 유발 안 함)
export function applyRemote(data) {
  cache = normalize(data);
  save({ touch: false, silent: true });
}

export function setSettings(patch) {
  load();
  Object.assign(cache.settings, patch);
  save();
}

export function addTxn(t) {
  load();
  cache.txns.push({ ...t, id: crypto.randomUUID() });
  save();
}
export function updateTxn(id, patch) {
  load();
  const t = cache.txns.find((x) => x.id === id);
  if (t) { Object.assign(t, patch); save(); }
}
export function removeTxn(id) {
  load();
  cache.txns = cache.txns.filter((x) => x.id !== id);
  save();
}

export function exportJSON() {
  return JSON.stringify(load(), null, 2);
}
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.txns)) throw new Error("형식이 올바르지 않습니다");
  cache = normalize(data);
  save();
}

/* ---------- 봉투 예산 ---------- */
export function setBudget(catId, amount) {
  load();
  if (amount > 0) cache.settings.budgets[catId] = amount;
  else delete cache.settings.budgets[catId];
  save();
}

/* ---------- 저금통(추가 목표) ---------- */
export function addJar(j) { load(); cache.jars.push({ id: crypto.randomUUID(), saved: 0, log: [], ...j }); save(); }
export function updateJar(id, patch) {
  load(); const j = cache.jars.find((x) => x.id === id);
  if (j) { Object.assign(j, patch); save(); }
}
// 넣기/빼기 — 날짜별 기록(log)을 남겨 '이번 달 봉인액' 계산에 쓴다
export function depositJar(id, amount) {
  load(); const j = cache.jars.find((x) => x.id === id);
  if (!j) return;
  const before = j.saved || 0;
  j.saved = Math.max(0, before + amount);
  const delta = j.saved - before;                 // 0 미만 방지가 반영된 실제 변화량
  if (delta !== 0) {
    if (!Array.isArray(j.log)) j.log = [];
    j.log.push({ date: new Date().toISOString().slice(0, 10), amount: delta });
  }
  save();
}
export function removeJar(id) { load(); cache.jars = cache.jars.filter((x) => x.id !== id); save(); }

/* ---------- 충동 보류(위시리스트) · 참은 기록 ---------- */
export function addWishlist(w) {
  load();
  const now = Date.now();
  cache.wishlist.push({ id: crypto.randomUUID(), addedAt: now, cooldownUntil: now + 24 * 3600 * 1000, ...w });
  save();
}
export function removeWishlist(id) { load(); cache.wishlist = cache.wishlist.filter((x) => x.id !== id); save(); }
export function recordResist(amount, name) {
  load();
  cache.resisted.push({ date: new Date().toISOString().slice(0, 10), amount: Math.round(amount) || 0, name: name || "" });
  save();
}
export function addPledge(date) {
  load();
  if (!cache.pledges.includes(date)) { cache.pledges.push(date); save(); }
}
export function setAiMissions(arr) {
  load();
  cache.aiMissions = (arr || []).map((m) => ({ title: m.title, tip: m.tip, done: false }));
  save();
}
export function toggleAiMission(i) {
  load();
  if (cache.aiMissions[i]) { cache.aiMissions[i].done = !cache.aiMissions[i].done; save(); }
}

/* ---------- 반복 거래 ---------- */
export function addRecurring(r) {
  load();
  cache.recurring.push({ id: crypto.randomUUID(), active: true, createdAt: new Date().toISOString().slice(0, 10), ...r });
  save();
}
export function removeRecurring(id) { load(); cache.recurring = cache.recurring.filter((x) => x.id !== id); save(); }
export function toggleRecurring(id) {
  load(); const r = cache.recurring.find((x) => x.id === id);
  if (r) { r.active = !r.active; save(); }
}

// 반복 규칙을 실제 거래로 생성(중복 방지: rid+period). 생성 건수 반환.
export function materializeRecurring(todayISO) {
  load();
  let made = 0;
  const today = new Date(todayISO + "T00:00:00");
  for (const r of cache.recurring) {
    if (!r.active) continue;
    const start = new Date((r.createdAt || todayISO) + "T00:00:00");
    let y = start.getFullYear(), m = start.getMonth();
    while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
      const period = `${y}-${String(m + 1).padStart(2, "0")}`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const day = Math.min(r.day || 1, lastDay);
      const date = `${period}-${String(day).padStart(2, "0")}`;
      if (new Date(date + "T00:00:00") <= today &&
          !cache.txns.some((t) => t.rid === r.id && t.period === period)) {
        cache.txns.push({
          id: crypto.randomUUID(), date, type: r.type, amount: r.amount,
          category: r.category, memo: r.memo || "", planned: false, rid: r.id, period,
        });
        made++;
      }
      m++; if (m > 11) { m = 0; y++; }
    }
  }
  if (made) save();
  return made;
}
export function resetAll() {
  cache = blank();
  save();
}
