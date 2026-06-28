// GitHub 비공개 Gist 자동 동기화 (서버/DB 없이 클라이언트에서 직접)
// - 데이터(JSON 1개)를 사용자의 비공개 Gist에 저장/복원
// - 토큰은 이 기기 localStorage에만 저장(저장소엔 절대 안 들어감), scope=gist 권장
// - 충돌 처리: updatedAt이 더 최신인 쪽을 채택 (1인용 → last-write-wins)
import { load, exportJSON, applyRemote, subscribe, getUpdatedAt } from "./storage.js";

const SKEY = "jogeum.sync.v1";
const FILE = "jogeum-backup.json";
const DESC = "조금만 가계부 백업 (앱 자동동기화)";

let cfg = null;
let status = "off";            // off | idle | syncing | error
let statusCb = null;
let debounce = null;
let wired = false;

function getCfg() {
  if (!cfg) { try { cfg = JSON.parse(localStorage.getItem(SKEY)) || {}; } catch { cfg = {}; } }
  return cfg;
}
function saveCfg() { localStorage.setItem(SKEY, JSON.stringify(cfg)); }

export function isConfigured() { return !!getCfg().token; }
export function info() { const c = getCfg(); return { configured: !!c.token, gistId: c.gistId, lastSync: c.lastSync }; }
export function onStatus(fn) { statusCb = fn; }
export function getStatus() { return status; }
function setStatus(s) { status = s; statusCb && statusCb(s); }

async function gh(path, opt = {}) {
  const c = getCfg();
  const res = await fetch("https://api.github.com" + path, {
    ...opt,
    headers: {
      Authorization: "Bearer " + c.token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opt.headers || {}),
    },
  });
  if (res.status === 401) throw new Error("토큰이 올바르지 않아요 (401)");
  if (!res.ok) throw new Error("GitHub 오류 " + res.status);
  return res.json();
}

async function findExistingGist() {
  const gists = await gh("/gists?per_page=100");
  const f = gists.find((g) => g.description === DESC && g.files && g.files[FILE]);
  return f ? f.id : null;
}

async function remoteData() {
  const c = getCfg();
  if (!c.gistId) return null;
  const g = await gh("/gists/" + c.gistId);
  const file = g.files && g.files[FILE];
  if (!file) return null;
  let content = file.content;
  if (file.truncated && file.raw_url) content = await (await fetch(file.raw_url)).text();
  try { return JSON.parse(content); } catch { return null; }
}

async function pushNow() {
  const c = getCfg();
  const body = { description: DESC, public: false, files: { [FILE]: { content: exportJSON() } } };
  if (c.gistId) {
    await gh("/gists/" + c.gistId, { method: "PATCH", body: JSON.stringify(body) });
  } else {
    const g = await gh("/gists", { method: "POST", body: JSON.stringify(body) });
    cfg.gistId = g.id;
  }
  cfg.lastSync = Date.now(); saveCfg();
}

// 토큰으로 최초 연결 (안전): 빈 로컬이 채워진 원격을 덮어쓰지 않음.
// 양쪽 다 데이터가 있으면 사용자에게 선택을 넘김(conflict).
export async function connect(token) {
  cfg = { token: token.trim() };
  saveCfg();
  setStatus("syncing");
  try {
    cfg.gistId = await findExistingGist();
    saveCfg();
    const remote = cfg.gistId ? await remoteData() : null;
    const rCount = remote && Array.isArray(remote.txns) ? remote.txns.length : 0;
    const lCount = Array.isArray(load().txns) ? load().txns.length : 0;
    wire();
    if (rCount > 0 && lCount === 0) {                 // 원격에만 데이터 → 복원
      applyRemote(remote); cfg.lastSync = Date.now(); saveCfg(); setStatus("idle");
      return { action: "pulled", count: rCount };
    }
    if (rCount > 0 && lCount > 0) {                   // 양쪽 데이터 → 사용자 선택
      setStatus("idle");
      return { action: "conflict", remoteCount: rCount, localCount: lCount };
    }
    await pushNow();                                  // 원격 없음/빈 → 로컬 올림
    setStatus("idle");
    return { action: "pushed", count: lCount };
  } catch (e) { setStatus("error"); throw e; }
}

// 충돌 시 사용자 선택 적용: 'remote'=클라우드 불러오기, 'local'=이 기기로 덮어쓰기
export async function resolveConflict(choice) {
  setStatus("syncing");
  try {
    if (choice === "remote") {
      const remote = await remoteData();
      if (remote) applyRemote(remote);
    } else {
      await pushNow();
    }
    cfg.lastSync = Date.now(); saveCfg(); setStatus("idle");
  } catch (e) { setStatus("error"); throw e; }
}

// Gist 수정 이력에서 과거 백업들을 가져옴 (복구용)
export async function getRevisions(limit = 20) {
  const c = getCfg();
  if (!c.gistId) return [];
  const g = await gh("/gists/" + c.gistId);
  const hist = (g.history || []).slice(0, limit);
  const out = [];
  for (const h of hist) {
    try {
      const rev = await gh("/gists/" + c.gistId + "/" + h.version);
      const f = rev.files && rev.files[FILE];
      let content = f ? f.content : null;
      if (f && f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
      let data = null; try { data = JSON.parse(content); } catch {}
      out.push({
        version: h.version, date: h.committed_at,
        txns: data && Array.isArray(data.txns) ? data.txns.length : 0, data,
      });
    } catch {}
  }
  return out;
}

// 선택한 과거 백업으로 되돌리고 즉시 다시 올림
export async function restoreRevision(data) {
  applyRemote(data);
  await pushNow();
  cfg.lastSync = Date.now(); saveCfg(); setStatus("idle");
}

export function disconnect() {
  cfg = {}; saveCfg(); setStatus("off");
}

// 양방향 1회 동기화: 더 최신인 쪽을 채택
export async function syncNow() {
  if (!isConfigured()) return false;
  setStatus("syncing");
  try {
    const remote = await remoteData();
    const localT = getUpdatedAt();
    if (remote && (remote.updatedAt || 0) > localT) {
      applyRemote(remote);    // 원격이 더 최신 → 받아씀
    } else {
      await pushNow();        // 로컬이 최신(또는 원격 없음) → 올림
    }
    setStatus("idle");
    return true;
  } catch (e) { setStatus("error"); throw e; }
}

async function pushSafe() {
  if (!isConfigured()) return;
  setStatus("syncing");
  try { await pushNow(); setStatus("idle"); } catch { setStatus("error"); }
}

// 로컬 변경 → 1.5초 디바운스 후 자동 업로드
function wire() {
  if (wired) { if (isConfigured() && status === "off") setStatus("idle"); return; }
  wired = true;
  subscribe(() => {
    if (!isConfigured()) return;
    clearTimeout(debounce);
    debounce = setTimeout(pushSafe, 1500);
  });
  if (isConfigured()) setStatus("idle");
}

// 앱 시작 시 호출
export function start() { wire(); }
