// 클라우드 백업 조율자 — 어떤 저장소를 쓰든 동일한 규칙으로 동기화한다.
//
// 저장 위치는 사용자가 고른다(GitHub Gist / 구글 드라이브). 어느 쪽이든 데이터는
// 사용자 본인 계정에 저장되며 개발자 서버를 거치지 않는다.
//
// 안전 규칙(모든 저장소에 공통 — 실제 데이터 손실 사고에서 나온 것):
//   빈 로컬이 채워진 원격을 절대 덮어쓰지 않는다. 기기 저장소가 초기화되면
//   로컬은 0건이 되는데, 그 상태로 업로드하면 유일한 백업이 파괴된다.
import { load, exportJSON, applyRemote, subscribe, getUpdatedAt } from "./storage.js";
import * as gist from "./providers/gist.js";
import * as gdrive from "./providers/gdrive.js";

const SKEY = "jogeum.sync.v1";
const PROVIDERS = { [gist.id]: gist, [gdrive.id]: gdrive };

let cfg = null;
let status = "off";            // off | idle | syncing | error
let statusCb = null;
let debounce = null;
let wired = false;

/* ---------- 설정 저장 ---------- */
// 구버전은 {token, gistId, lastSync} 형태였다 — 프로바이더 구조로 옮겨준다.
function migrate(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (raw.provider || !raw.token) return raw;
  return { provider: gist.id, lastSync: raw.lastSync || 0,
    [gist.id]: { token: raw.token, gistId: raw.gistId } };
}
function getCfg() {
  if (!cfg) { try { cfg = migrate(JSON.parse(localStorage.getItem(SKEY))); } catch { cfg = {}; } }
  return cfg;
}
function saveCfg() { localStorage.setItem(SKEY, JSON.stringify(cfg)); }

const provider = () => PROVIDERS[getCfg().provider] || null;
const slice = () => getCfg()[getCfg().provider] || {};
function putSlice(next) { cfg[cfg.provider] = next; saveCfg(); }

/* ---------- 상태 ---------- */
export function isConfigured() {
  const p = provider();
  return !!(p && p.isConfigured(slice()));
}
export function info() {
  const p = provider();
  const s = slice();
  const d = p ? p.describe(s) : { label: "", detail: "" };
  return {
    configured: isConfigured(), provider: getCfg().provider || null,
    providerLabel: d.label, providerDetail: d.detail,
    lastSync: getCfg().lastSync, gistId: s.gistId,
  };
}
// 사용자가 고를 수 있는 백업 수단 (설정이 안 된 것은 빠진다)
export const availableProviders = () =>
  Object.values(PROVIDERS).filter((p) => p.available()).map((p) => ({ id: p.id, label: p.label }));

export function onStatus(fn) { statusCb = fn; }
export function getStatus() { return status; }
function setStatus(s) { status = s; statusCb && statusCb(s); }

const countOf = (data) => (data && Array.isArray(data.txns) ? data.txns.length : 0);
const localCount = () => (load().txns || []).length;

/* ---------- 연결 ----------
 * 빈 로컬이 원격을 덮어쓰지 않도록, 양쪽 데이터를 비교해 판단한다.
 *   원격에만 있음 → 복원(pulled) / 양쪽에 있음 → 사용자 선택(conflict) / 그 외 → 업로드 */
export async function connect(credential, providerId = gist.id) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error("알 수 없는 백업 수단이에요");
  setStatus("syncing");
  try {
    getCfg();
    cfg.provider = providerId;
    putSlice(await p.connect(slice(), credential));
    wire();

    const remote = await p.read(slice()).catch(() => null);
    const rCount = countOf(remote);
    const lCount = localCount();

    if (rCount > 0 && lCount === 0) {
      applyRemote(remote);
      cfg.lastSync = Date.now(); saveCfg(); setStatus("idle");
      return { action: "pulled", count: rCount };
    }
    if (rCount > 0 && lCount > 0) {
      setStatus("idle");
      return { action: "conflict", remoteCount: rCount, localCount: lCount };
    }
    await pushNow();
    setStatus("idle");
    return { action: "pushed", count: lCount };
  } catch (e) { setStatus("error"); throw e; }
}

// 충돌 시 사용자 선택 적용: 'remote'=클라우드 불러오기, 'local'=이 기기로 덮어쓰기
export async function resolveConflict(choice) {
  const p = provider();
  if (!p) return;
  setStatus("syncing");
  try {
    if (choice === "remote") {
      const remote = await p.read(slice());
      if (remote) applyRemote(remote);
    } else {
      await pushNow();          // 사용자가 명시적으로 고른 경우라 안전장치를 적용하지 않는다
    }
    cfg.lastSync = Date.now(); saveCfg(); setStatus("idle");
  } catch (e) { setStatus("error"); throw e; }
}

export function disconnect() {
  const p = provider();
  p?.disconnect?.();
  cfg = {}; saveCfg(); setStatus("off");
}

/* ---------- 업로드 ---------- */
async function pushNow() {
  const p = provider();
  if (!p) return;
  putSlice(await p.write(slice(), exportJSON()));
  cfg.lastSync = Date.now(); saveCfg();
}

// 안전장치: 로컬이 비었는데 원격에 기록이 있으면 업로드하지 않고 오히려 복원한다.
// (기기 저장소가 초기화된 상태로 업로드되면 백업이 파괴된다)
// true를 반환하면 업로드를 건너뛴다.
async function blockEmptyOverwrite() {
  if (localCount() > 0) return false;
  const p = provider();
  let remote = null;
  try { remote = await p.read(slice()); } catch { return true; }   // 확인 불가 → 업로드 보류
  if (countOf(remote) > 0) { applyRemote(remote); return true; }
  return false;
}

async function pushSafe() {
  if (!isConfigured()) return;
  setStatus("syncing");
  try {
    if (await blockEmptyOverwrite()) { setStatus("idle"); return; }
    await pushNow(); setStatus("idle");
  } catch { setStatus("error"); }
}

/* ---------- 양방향 1회 동기화 ---------- */
export async function syncNow() {
  if (!isConfigured()) return false;
  const p = provider();
  setStatus("syncing");
  try {
    const remote = await p.read(slice());
    const localT = getUpdatedAt();
    const rCount = countOf(remote);
    // 원격이 더 최신이거나, 로컬이 비었는데 원격에 기록이 있으면 받아쓴다.
    // 후자가 기기 초기화 사고에서 백업을 지켜준다.
    if (remote && ((remote.updatedAt || 0) > localT || (localCount() === 0 && rCount > 0))) {
      applyRemote(remote);
    } else {
      await pushNow();
    }
    cfg.lastSync = Date.now(); saveCfg();
    setStatus("idle");
    return true;
  } catch (e) { setStatus("error"); throw e; }
}

/* ---------- 과거 버전 복원 ---------- */
export async function getRevisions(limit = 20) {
  const p = provider();
  if (!p || !p.revisions) return [];
  return p.revisions(slice(), limit);
}
export async function restoreRevision(data) {
  applyRemote(data);
  await pushNow();
  setStatus("idle");
}

/* ---------- 자동 업로드 ---------- */
// 로컬 변경 → 1.5초 디바운스 후 업로드
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

export function start() { wire(); }
