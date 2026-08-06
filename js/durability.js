// 데이터 보존 — 브라우저가 저장소를 지우지 못하게 요청하고, 백업이 없으면 사용자를 재촉한다.
// 이 앱은 모든 데이터가 기기에 있으므로 백업 없는 상태가 곧 데이터 손실 위험이다.
// (실제로 저장소가 통째로 비워지는 사고가 있었다 — 그때 백업이 유일한 복구 수단이었다)
const KEY = "jogeum.durability.v1";   // 기기 전용 — 동기화 대상 아님

const blank = () => ({
  persistAsked: false,     // persist() 요청을 해봤는지
  persistGranted: false,   // 브라우저가 허용했는지
  lastExportAt: 0,         // 마지막으로 백업 파일을 내려받은 시각
  nudgeHiddenUntil: 0,     // "나중에" 누른 경우 다시 띄우지 않을 시점
});

let cfg = null;
function get() {
  if (!cfg) { try { cfg = { ...blank(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { cfg = blank(); } }
  return cfg;
}
function put(patch) { Object.assign(get(), patch); localStorage.setItem(KEY, JSON.stringify(cfg)); }

export function info() { return { ...get() }; }
export function markExported() { put({ lastExportAt: Date.now() }); }
export function snoozeNudge(days = 7) { put({ nudgeHiddenUntil: Date.now() + days * 86400000 }); }

/* ---------- 저장소 영속성 ----------
 * 기본적으로 브라우저는 localStorage를 '지워도 되는 임시 데이터'로 본다.
 * persist()는 "지우지 말아 달라"는 요청이며, 허용되면 사용자가 직접 지우기 전까지 유지된다.
 * 브라우저마다 판단 기준이 달라(설치 여부·방문 빈도 등) 거절될 수 있으므로 결과를 저장해 안내에 쓴다. */
export async function ensurePersisted() {
  if (!navigator.storage || !navigator.storage.persist) return "unsupported";
  try {
    if (await navigator.storage.persisted()) { put({ persistAsked: true, persistGranted: true }); return "granted"; }
    const ok = await navigator.storage.persist();
    put({ persistAsked: true, persistGranted: ok });
    return ok ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

export function persistLabel() {
  if (!navigator.storage || !navigator.storage.persist) return { text: "확인 불가", safe: false };
  const c = get();
  if (c.persistGranted) return { text: "보호됨", safe: true };
  return { text: c.persistAsked ? "보호 안 됨" : "미확인", safe: false };
}

/* ---------- 백업 위험도 ----------
 * cloudOn: 클라우드 백업(Gist 등)이 연결돼 있는지
 * 기록이 쌓였는데 백업 수단이 하나도 없으면 위험으로 본다. */
const DAY = 86400000;
export const EXPORT_STALE_DAYS = 14;

export function backupState(c, cloudOn) {
  const d = get();
  const txnCount = (c.actual || []).length;
  const exportAgeDays = d.lastExportAt ? Math.floor((Date.now() - d.lastExportAt) / DAY) : null;
  const hasFileBackup = exportAgeDays !== null && exportAgeDays < EXPORT_STALE_DAYS;

  let level = "ok";            // ok | warn | risk
  let reason = "";
  if (cloudOn) {
    level = "ok";
    reason = "클라우드에 자동 백업되고 있어요";
  } else if (hasFileBackup) {
    level = "warn";
    reason = `${exportAgeDays === 0 ? "오늘" : exportAgeDays + "일 전"} 백업 파일을 저장했어요`;
  } else if (txnCount >= 3) {
    level = "risk";
    reason = exportAgeDays === null
      ? "아직 백업을 한 번도 하지 않았어요"
      : `마지막 백업이 ${exportAgeDays}일 전이에요`;
  } else {
    level = "ok";              // 기록이 거의 없으면 재촉하지 않는다
    reason = "";
  }
  return {
    level, reason, txnCount, exportAgeDays,
    persist: persistLabel(),
    // 위험하고, 사용자가 "나중에"로 미뤄둔 기간이 지났을 때만 홈에 띄운다
    showNudge: level === "risk" && Date.now() >= (d.nudgeHiddenUntil || 0),
  };
}
