// 앱 오케스트레이터 — 라우팅 / 렌더 / 이벤트 / PWA 등록
import { compute } from "./state.js";
import { addTxn, updateTxn, removeTxn, setSettings, exportJSON, importJSON, resetAll, setMascot, clearMascot } from "./storage.js";
import { homeView, historyView, plannedView, questView, addSheet, settingsSheet } from "./views.js";

const $ = (s, r = document) => r.querySelector(s);
const viewEl = $("#view");
const sheetEl = $("#sheet");
const panelEl = $("#sheet-panel");

let route = "home";
const ROUTES = { home: homeView, history: historyView, planned: plannedView, quest: questView };

function render() {
  const c = compute();
  viewEl.innerHTML = ROUTES[route](c);
  document.querySelectorAll(".nav__btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.route === route));
  viewEl.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

function go(r) { route = r; render(); }

/* ---------- 토스트 ---------- */
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1800);
}

/* ---------- 바텀시트 ---------- */
function openSheet(html) { panelEl.innerHTML = html; sheetEl.hidden = false; }
function closeSheet() { sheetEl.hidden = true; panelEl.innerHTML = ""; }

const numFrom = (v) => Number(String(v).replace(/[^\d]/g, "")) || 0;

/* ---------- 입력 시트 ---------- */
function openAdd(opts = {}) {
  openSheet(addSheet(opts));
  wireAdd(opts);
}

function wireAdd(opts) {
  // 금액 천단위 콤마
  const amt = $("#f-amount", panelEl);
  amt?.addEventListener("input", () => {
    const n = numFrom(amt.value);
    amt.value = n ? n.toLocaleString("ko-KR") : "";
  });

  // 수입/지출 토글 → 현재 입력 보존하며 재렌더
  panelEl.querySelectorAll("#seg-type button").forEach((b) =>
    b.addEventListener("click", () => {
      const cur = collectAdd(opts);
      openAdd({ ...opts, edit: { ...cur, type: b.dataset.type, category: "" } });
    }));

  // 분류 칩
  panelEl.querySelectorAll("#f-cats .chip").forEach((ch) =>
    ch.addEventListener("click", () => {
      panelEl.querySelectorAll("#f-cats .chip").forEach((x) => x.classList.remove("on"));
      ch.classList.add("on");
    }));

  $("#f-save", panelEl)?.addEventListener("click", () => {
    const t = collectAdd(opts);
    if (t.amount <= 0) return toast("금액을 입력해주세요");
    if (!t.category) return toast("분류를 선택해주세요");
    if (opts.edit?.id) { updateTxn(opts.edit.id, t); toast("수정했어요"); }
    else { addTxn(t); toast(t.planned ? "예정 항목을 추가했어요" : "기록 완료! +5 XP 💪"); }
    closeSheet(); render();
  });

  $("#f-del", panelEl)?.addEventListener("click", () => {
    if (opts.edit?.id) { removeTxn(opts.edit.id); toast("삭제했어요"); closeSheet(); render(); }
  });
}

function collectAdd(opts) {
  const type = panelEl.querySelector("#seg-type .on")?.dataset.type
    || opts.edit?.type || opts.type || "expense";
  return {
    type,
    amount: numFrom($("#f-amount", panelEl)?.value),
    category: panelEl.querySelector("#f-cats .chip.on")?.dataset.cat || "",
    memo: $("#f-memo", panelEl)?.value.trim() || "",
    date: $("#f-date", panelEl)?.value || new Date().toISOString().slice(0, 10),
    planned: $("#f-planned", panelEl)?.checked || false,
    id: opts.edit?.id,
  };
}

/* ---------- 설정 / 온보딩 시트 ---------- */
function openSettings({ onboarding = false } = {}) {
  const c = compute();
  openSheet(settingsSheet(c, { onboarding }));

  const goal = $("#s-goal", panelEl);
  const start = $("#s-start", panelEl);
  [goal, start].forEach((el) => el?.addEventListener("input", () => {
    const n = numFrom(el.value);
    el.value = n ? n.toLocaleString("ko-KR") : "";
  }));

  $("#s-save", panelEl)?.addEventListener("click", () => {
    const g = numFrom(goal?.value);
    if (g <= 0) return toast("목표 금액을 입력해주세요");
    setSettings({ yearGoal: g, startBalance: numFrom(start?.value), onboarded: true });
    toast("저장했어요");
    closeSheet(); render();
  });

  // 데이터 백업/복원/초기화
  $("#s-export", panelEl)?.addEventListener("click", () => {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jogeum-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const file = $("#s-file", panelEl);
  $("#s-import", panelEl)?.addEventListener("click", () => file?.click());
  file?.addEventListener("change", async () => {
    try {
      importJSON(await file.files[0].text());
      toast("불러왔어요"); closeSheet(); render();
    } catch (e) { toast("불러오기 실패: " + e.message); }
  });
  $("#s-reset", panelEl)?.addEventListener("click", () => {
    if (confirm("모든 데이터를 삭제할까요? 되돌릴 수 없어요.")) {
      resetAll(); toast("초기화했어요"); closeSheet(); render();
    }
  });

  // 마스코트 이미지 업로드/삭제 (기기 로컬에만 저장)
  panelEl.querySelectorAll("[data-msup]").forEach((inp) =>
    inp.addEventListener("change", async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const dataURL = await compressImage(f, 200);
        setMascot(inp.dataset.msup, dataURL);
        toast("마스코트를 바꿨어요 🦕");
        openSettings(); render();
      } catch { toast("이미지를 불러오지 못했어요"); }
    }));
  panelEl.querySelectorAll("[data-msdel]").forEach((b) =>
    b.addEventListener("click", () => {
      clearMascot(b.dataset.msdel);
      toast("기본 캐릭터로 되돌렸어요");
      openSettings(); render();
    }));
}

// 이미지를 정사각형 캔버스로 축소 → 데이터URL (localStorage 절약)
function compressImage(file, max = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const s = Math.min(max / img.width, max / img.height, 1);
        const w = Math.round(img.width * s), h = Math.round(img.height * s);
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- 전역 이벤트 위임 ---------- */
$("#nav").addEventListener("click", (e) => {
  const b = e.target.closest(".nav__btn");
  if (b) go(b.dataset.route);
});

$("#fab").addEventListener("click", () => openAdd({ type: "expense" }));

sheetEl.addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) closeSheet(); });

viewEl.addEventListener("click", (e) => {
  const edit = e.target.closest("[data-edit]");
  if (edit) {
    const c = compute();
    const t = c.txns.find((x) => x.id === edit.dataset.edit);
    if (t) openAdd({ edit: t });
    return;
  }
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "settings") return openSettings();
  if (act === "add-planned") return openAdd({ type: "expense", planned: true });
  const r = e.target.closest("[data-route]")?.dataset.route;
  if (r) go(r);
});

/* ---------- 시작 ---------- */
render();
if (!compute().settings.onboarded) openSettings({ onboarding: true });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
