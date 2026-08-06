// 백업 대상: GitHub 비공개 Gist
// 자격증명(토큰)은 이 기기 localStorage에만 저장되고 저장소엔 올라가지 않는다.
const FILE = "jogeum-backup.json";
const DESC = "조금만 가계부 백업 (앱 자동동기화)";

export const id = "gist";
export const label = "GitHub Gist";
export const available = () => true;              // 별도 설정 없이 언제나 선택 가능
export const isConfigured = (cfg) => !!(cfg && cfg.token);
export const clear = () => ({});

export function describe(cfg) {
  return { label, detail: isConfigured(cfg) ? "비공개 Gist에 자동 저장" : "" };
}

async function gh(cfg, path, opt = {}) {
  const res = await fetch("https://api.github.com" + path, {
    ...opt,
    headers: {
      Authorization: "Bearer " + cfg.token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opt.headers || {}),
    },
  });
  if (res.status === 401) throw new Error("토큰이 올바르지 않아요 (401)");
  if (!res.ok) throw new Error("GitHub 오류 " + res.status);
  return res.json();
}

// 토큰으로 연결하고 기존 백업 Gist를 찾아둔다 (데이터 비교·복원은 sync.js가 판단)
export async function connect(cfg, token) {
  const next = { token: String(token || "").trim() };
  const gists = await gh(next, "/gists?per_page=100");
  const found = gists.find((g) => g.description === DESC && g.files && g.files[FILE]);
  if (found) next.gistId = found.id;
  return next;
}

export async function read(cfg) {
  if (!cfg.gistId) return null;
  const g = await gh(cfg, "/gists/" + cfg.gistId);
  const file = g.files && g.files[FILE];
  if (!file) return null;
  let content = file.content;
  if (file.truncated && file.raw_url) content = await (await fetch(file.raw_url)).text();
  try { return JSON.parse(content); } catch { return null; }
}

export async function write(cfg, text) {
  const body = { description: DESC, public: false, files: { [FILE]: { content: text } } };
  if (cfg.gistId) {
    await gh(cfg, "/gists/" + cfg.gistId, { method: "PATCH", body: JSON.stringify(body) });
    return cfg;
  }
  const g = await gh(cfg, "/gists", { method: "POST", body: JSON.stringify(body) });
  return { ...cfg, gistId: g.id };
}

// 수정 이력에서 과거 백업을 가져온다 (실수로 지웠을 때의 복구 수단)
export async function revisions(cfg, limit = 20) {
  if (!cfg.gistId) return [];
  const g = await gh(cfg, "/gists/" + cfg.gistId);
  const out = [];
  for (const h of (g.history || []).slice(0, limit)) {
    try {
      const rev = await gh(cfg, "/gists/" + cfg.gistId + "/" + h.version);
      const f = rev.files && rev.files[FILE];
      let content = f ? f.content : null;
      if (f && f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
      let data = null; try { data = JSON.parse(content); } catch {}
      out.push({ version: h.version, date: h.committed_at, data,
        txns: data && Array.isArray(data.txns) ? data.txns.length : 0 });
    } catch {}
  }
  return out;
}
