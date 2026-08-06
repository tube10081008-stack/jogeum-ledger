// 백업 대상: 사용자 본인의 구글 드라이브
//
// 왜 이 방식인가
// - 저장 비용이 사용자 몫이라 앱을 무료로 유지할 수 있다.
// - 데이터가 개발자 서버를 거치지 않으므로 재무 정보를 대신 보관할 책임이 없다.
// - drive.file 범위는 '이 앱이 만든 파일'에만 접근한다. 사용자의 다른 파일은 볼 수 없고,
//   백업 파일은 사용자의 드라이브에 그대로 보여서 언제든 직접 열고 내려받을 수 있다.
//
// 클라이언트 ID는 공개돼도 되는 값이다(비밀키는 브라우저 앱에서 쓰지 않는다).
// 값이 비어 있으면 이 백업 수단은 목록에 나타나지 않는다.
export const CLIENT_ID = "";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const FILE_NAME = "조금만가계부-백업.json";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export const id = "gdrive";
export const label = "구글 드라이브";
export const available = () => !!CLIENT_ID;
export const isConfigured = (cfg) => !!(cfg && cfg.connected);
export const clear = () => ({});

export function describe(cfg) {
  return { label, detail: isConfigured(cfg) ? `내 드라이브의 ${FILE_NAME}` : "" };
}

/* ---------- 액세스 토큰 ----------
 * 토큰은 1시간짜리라 메모리에만 들고, 만료되면 조용히 다시 받는다.
 * 조용한 재발급이 실패하면(구글 세션 만료 등) 사용자에게 다시 연결을 요청해야 한다. */
let token = null;         // { value, expiresAt }
let tokenClient = null;

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const exist = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (exist) { exist.addEventListener("load", resolve); exist.addEventListener("error", reject); return; }
    const s = document.createElement("script");
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("구글 로그인 스크립트를 불러오지 못했어요"));
    document.head.appendChild(s);
  });
}

// interactive=true면 동의 창을 띄운다. 자동 백업 중에는 창을 띄우면 안 되므로 false로 조용히 시도한다.
async function getToken({ interactive = false } = {}) {
  if (token && Date.now() < token.expiresAt - 60000) return token.value;
  if (!CLIENT_ID) throw new Error("구글 드라이브가 설정되지 않았어요");
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE, callback: () => {},
    });
  }
  return new Promise((resolve, reject) => {
    tokenClient.callback = (res) => {
      if (res.error) return reject(new Error(res.error === "popup_closed_by_user"
        ? "로그인을 취소했어요" : "구글 인증 실패: " + res.error));
      token = { value: res.access_token, expiresAt: Date.now() + (res.expires_in || 3600) * 1000 };
      resolve(token.value);
    };
    try {
      tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
    } catch (e) { reject(e); }
  });
}

async function api(url, opt = {}) {
  const t = await getToken();
  const res = await fetch(url, { ...opt, headers: { Authorization: "Bearer " + t, ...(opt.headers || {}) } });
  if (res.status === 401 || res.status === 403) {
    token = null;                                  // 만료로 보고 한 번만 다시 시도
    const t2 = await getToken();
    const retry = await fetch(url, { ...opt, headers: { Authorization: "Bearer " + t2, ...(opt.headers || {}) } });
    if (!retry.ok) throw new Error("구글 드라이브 오류 " + retry.status);
    return retry;
  }
  if (!res.ok) throw new Error("구글 드라이브 오류 " + res.status);
  return res;
}

// 앱이 만든 백업 파일 찾기 (drive.file 범위라 다른 파일은 애초에 검색되지 않는다)
async function findFile() {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const res = await api(`${API}/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=10`);
  const data = await res.json();
  return (data.files || [])[0]?.id || null;
}

export async function connect(cfg) {
  await getToken({ interactive: true });           // 동의 창 — 사용자가 직접 누른 시점에만 호출된다
  const fileId = await findFile();
  return { connected: true, ...(fileId ? { fileId } : {}) };
}

export async function read(cfg) {
  const fileId = cfg.fileId || (await findFile());
  if (!fileId) return null;
  const res = await api(`${API}/files/${fileId}?alt=media`);
  try { return JSON.parse(await res.text()); } catch { return null; }
}

export async function write(cfg, text) {
  const blob = new Blob([text], { type: "application/json" });
  let fileId = cfg.fileId || (await findFile());
  if (fileId) {
    await api(`${UPLOAD}/files/${fileId}?uploadType=media`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: blob,
    });
    return { ...cfg, connected: true, fileId };
  }
  // 새로 만들 때만 메타데이터가 필요해 multipart로 올린다
  const boundary = "jogeum" + Math.random().toString(36).slice(2);
  const meta = { name: FILE_NAME, mimeType: "application/json",
    description: "조금만 가계부 백업 (앱 자동동기화)" };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${text}\r\n--${boundary}--`;
  const res = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  const created = await res.json();
  return { ...cfg, connected: true, fileId: created.id };
}

// 드라이브가 보관하는 파일 버전들 (실수로 덮어썼을 때의 복구 수단)
export async function revisions(cfg, limit = 20) {
  const fileId = cfg.fileId || (await findFile());
  if (!fileId) return [];
  const res = await api(`${API}/files/${fileId}/revisions?fields=revisions(id,modifiedTime)&pageSize=${limit}`);
  const list = ((await res.json()).revisions || []).slice(-limit).reverse();
  const out = [];
  for (const r of list) {
    try {
      const body = await api(`${API}/files/${fileId}/revisions/${r.id}?alt=media`);
      let data = null; try { data = JSON.parse(await body.text()); } catch {}
      out.push({ version: r.id, date: r.modifiedTime, data,
        txns: data && Array.isArray(data.txns) ? data.txns.length : 0 });
    } catch {}
  }
  return out;
}

export function disconnect() { token = null; tokenClient = null; }
