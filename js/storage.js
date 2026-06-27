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
    onboarded: false,
  },
  txns: [],                 // {id,date,type,amount,category,memo,planned}
});

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY)) || blank();
  } catch {
    cache = blank();
  }
  cache.settings = Object.assign(blank().settings, cache.settings);
  cache.txns = Array.isArray(cache.txns) ? cache.txns : [];
  cache.mascot = cache.mascot && typeof cache.mascot === "object" ? cache.mascot : {};
  return cache;
}

// 마스코트 커스텀 이미지(기분별) — 사용자가 올린 이미지는 이 기기에만 저장됨
export function getMascot() { return load().mascot; }
export function setMascot(mood, dataURL) { load(); cache.mascot[mood] = dataURL; save(); }
export function clearMascot(mood) { load(); delete cache.mascot[mood]; save(); }

export function save() {
  localStorage.setItem(KEY, JSON.stringify(cache));
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
  cache = data;
  cache.settings = Object.assign(blank().settings, cache.settings);
  cache.mascot = cache.mascot && typeof cache.mascot === "object" ? cache.mascot : {};
  save();
}
export function resetAll() {
  cache = blank();
  save();
}
