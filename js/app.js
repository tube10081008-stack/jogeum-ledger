// 앱 오케스트레이터 — 라우팅 / 렌더 / 이벤트 / PWA 등록
import { compute } from "./state.js";
import { addTxn, updateTxn, removeTxn, setSettings, exportJSON, importJSON, resetAll, setMascot, clearMascot,
  setBudget, addJar, depositJar, removeJar, addRecurring, removeRecurring, toggleRecurring, materializeRecurring } from "./storage.js";
import { homeView, historyView, plannedView, questView, insightsView, addSheet, settingsSheet, jarSheet, recurringSheet } from "./views.js";
import * as sync from "./sync.js";
import { won, wonShort } from "./format.js";

const $ = (s, r = document) => r.querySelector(s);
const viewEl = $("#view");
const sheetEl = $("#sheet");
const panelEl = $("#sheet-panel");

let route = "home";
const ROUTES = { home: homeView, history: historyView, planned: plannedView, insights: insightsView, quest: questView };

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
  // 금액 천단위 콤마 + 환산 동기부여
  const amt = $("#f-amount", panelEl);
  amt?.addEventListener("input", () => {
    const n = numFrom(amt.value);
    amt.value = n ? n.toLocaleString("ko-KR") : "";
    updateConvert();
  });
  updateConvert();

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

// 지출 입력 시 "라떼 N잔 / 목표 N일 늦어짐" 환산 표시
function updateConvert() {
  const el = $("#f-convert", panelEl);
  if (!el) return;
  const type = panelEl.querySelector("#seg-type .on")?.dataset.type;
  const amt = numFrom($("#f-amount", panelEl)?.value);
  if (type !== "expense" || amt <= 0) { el.textContent = ""; return; }
  const c = compute();
  const parts = [];
  const lattes = Math.round(amt / 5000);
  if (lattes >= 1) parts.push(`☕ 라떼 ${lattes}잔`);
  if (c.goal > 0) {
    const days = amt / (c.goal / 365);
    if (days >= 0.5) parts.push(`🎯 목표 ${days >= 10 ? Math.round(days) : days.toFixed(1)}일 늦어져요`);
  }
  el.innerHTML = parts.join("　·　");
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

  // 예산(월 예산 + 카테고리 봉투)
  $("#s-budget", panelEl)?.addEventListener("input", () => {
    const n = numFrom($("#s-budget", panelEl).value);
    $("#s-budget", panelEl).value = n ? n.toLocaleString("ko-KR") : "";
  });
  panelEl.querySelectorAll("[data-budget]").forEach((el) =>
    el.addEventListener("input", () => {
      const n = numFrom(el.value);
      el.value = n ? n.toLocaleString("ko-KR") : "";
    }));
  $("#s-budget-save", panelEl)?.addEventListener("click", () => {
    setSettings({ monthlyBudget: numFrom($("#s-budget", panelEl)?.value) });
    panelEl.querySelectorAll("[data-budget]").forEach((el) => setBudget(el.dataset.budget, numFrom(el.value)));
    toast("예산을 저장했어요"); closeSheet(); render();
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

  // 클라우드 백업(GitHub Gist)
  $("#sync-connect", panelEl)?.addEventListener("click", async () => {
    const token = $("#sync-token", panelEl)?.value || "";
    if (!token.trim()) return toast("토큰을 붙여넣어 주세요");
    toast("연결 중…");
    try {
      await sync.connect(token);
      toast("연결됐어요 ☁️ 자동 백업 시작!");
      openSettings(); render();
    } catch (e) { toast("연결 실패: " + e.message); }
  });
  $("#sync-now", panelEl)?.addEventListener("click", async () => {
    toast("동기화 중…");
    try { await sync.syncNow(); toast("동기화 완료 ☁️"); openSettings(); render(); }
    catch (e) { toast("동기화 실패: " + e.message); }
  });
  $("#sync-off", panelEl)?.addEventListener("click", () => {
    if (confirm("클라우드 연결을 해제할까요? (기기 데이터는 유지, Gist는 남아있어요)")) {
      sync.disconnect(); toast("연결을 해제했어요"); openSettings();
    }
  });
  updateSyncBadge();

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

/* ---------- 저금통 시트 ---------- */
function openJarNew() {
  openSheet(jarSheet());
  let emoji = "🐖";
  panelEl.querySelectorAll("#j-emoji .chip").forEach((ch) =>
    ch.addEventListener("click", () => {
      panelEl.querySelectorAll("#j-emoji .chip").forEach((x) => x.classList.remove("on"));
      ch.classList.add("on"); emoji = ch.dataset.emoji;
    }));
  const tgt = $("#j-target", panelEl);
  tgt?.addEventListener("input", () => { const n = numFrom(tgt.value); tgt.value = n ? n.toLocaleString("ko-KR") : ""; });
  $("#j-create", panelEl)?.addEventListener("click", () => {
    const name = $("#j-name", panelEl)?.value.trim();
    const target = numFrom(tgt?.value);
    if (!name) return toast("이름을 입력해주세요");
    if (target <= 0) return toast("목표 금액을 입력해주세요");
    addJar({ name, emoji, target });
    toast("저금통을 만들었어요 🐖"); closeSheet(); render();
  });
}

function openJar(jar) {
  openSheet(jarSheet(jar));
  const amt = $("#j-amt", panelEl);
  amt?.addEventListener("input", () => { const n = numFrom(amt.value); amt.value = n ? n.toLocaleString("ko-KR") : ""; });
  const move = (sign) => {
    const v = numFrom(amt?.value);
    if (v <= 0) return toast("금액을 입력해주세요");
    depositJar(jar.id, sign * v);
    toast(sign > 0 ? "넣었어요 💰" : "뺐어요"); closeSheet(); render();
  };
  $("#j-deposit", panelEl)?.addEventListener("click", () => move(1));
  $("#j-withdraw", panelEl)?.addEventListener("click", () => move(-1));
  $("#j-del", panelEl)?.addEventListener("click", () => {
    if (confirm("이 저금통을 삭제할까요?")) { removeJar(jar.id); toast("삭제했어요"); closeSheet(); render(); }
  });
}

/* ---------- 반복 거래 시트 ---------- */
function openRecurring() {
  openSheet(recurringSheet());
  const amt = $("#r-amount", panelEl);
  amt?.addEventListener("input", () => { const n = numFrom(amt.value); amt.value = n ? n.toLocaleString("ko-KR") : ""; });
  // 지출/수입 토글 → 분류 칩 교체
  panelEl.querySelectorAll("#r-type button").forEach((b) =>
    b.addEventListener("click", () => {
      panelEl.querySelectorAll("#r-type button").forEach((x) => x.classList.remove("on", "exp", "inc"));
      b.classList.add("on", b.dataset.type === "expense" ? "exp" : "inc");
      const cats = (b.dataset.type === "income")
        ? [["salary","💼 월급"],["side","💡 부수입"],["gift","🎁 용돈/선물"],["etc_i","✏️ 기타"]]
        : [["food","🍚 식비"],["cafe","☕ 카페/간식"],["transport","🚌 교통"],["shopping","🛍️ 쇼핑"],["fun","🎮 여가"],["health","💊 건강"],["home","🏠 생활/주거"],["etc_e","✏️ 기타"]];
      $("#r-cats", panelEl).innerHTML = cats.map(([id, lbl]) => `<button class="chip" data-cat="${id}">${lbl}</button>`).join("");
      wireCatChips();
    }));
  function wireCatChips() {
    panelEl.querySelectorAll("#r-cats .chip").forEach((ch) =>
      ch.addEventListener("click", () => {
        panelEl.querySelectorAll("#r-cats .chip").forEach((x) => x.classList.remove("on"));
        ch.classList.add("on");
      }));
  }
  wireCatChips();
  $("#r-save", panelEl)?.addEventListener("click", () => {
    const type = panelEl.querySelector("#r-type .on")?.dataset.type || "expense";
    const amount = numFrom(amt?.value);
    const category = panelEl.querySelector("#r-cats .chip.on")?.dataset.cat || "";
    const day = Math.max(1, Math.min(31, parseInt($("#r-day", panelEl)?.value) || 1));
    const memo = $("#r-memo", panelEl)?.value.trim() || "";
    if (amount <= 0) return toast("금액을 입력해주세요");
    if (!category) return toast("분류를 선택해주세요");
    addRecurring({ type, amount, category, day, memo });
    const n = materializeRecurring(new Date().toISOString().slice(0, 10));
    toast(n ? `추가했어요 · ${n}건 자동 기록` : "반복 거래를 추가했어요");
    closeSheet(); render();
  });
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

// 미래 시뮬레이터 슬라이더
viewEl.addEventListener("input", (e) => {
  const r = e.target.closest("#sim-range");
  if (!r) return;
  const pct = +r.value;
  const saved = +r.dataset.saved, inc = +r.dataset.inc, exp = +r.dataset.exp, left = +r.dataset.left, goal = +r.dataset.goal;
  const adj = saved + left * (inc - exp * (1 + pct / 100));
  $("#sim-pct").textContent = (pct > 0 ? "+" : "") + pct + "%";
  $("#sim-result").textContent = wonShort(adj);
  $("#sim-vs").textContent = goal > 0 ? (adj >= goal ? "목표 달성 ✅" : wonShort(goal - adj) + " 부족") : "-";
});

viewEl.addEventListener("click", (e) => {
  const edit = e.target.closest("[data-edit]");
  if (edit) {
    const c = compute();
    const t = c.txns.find((x) => x.id === edit.dataset.edit);
    if (t) openAdd({ edit: t });
    return;
  }
  const recurDel = e.target.closest("[data-recur-del]");
  if (recurDel) {
    if (confirm("이 반복 거래를 삭제할까요? (이미 만들어진 기록은 유지돼요)")) {
      removeRecurring(recurDel.dataset.recurDel); toast("삭제했어요"); render();
    }
    return;
  }
  const recur = e.target.closest("[data-recur]");
  if (recur) { toggleRecurring(recur.dataset.recur); toast("반복 상태를 변경했어요"); render(); return; }

  const jar = e.target.closest("[data-jar]");
  if (jar) {
    const j = compute().jars.find((x) => x.id === jar.dataset.jar);
    if (j) openJar(j);
    return;
  }

  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "settings") return openSettings();
  if (act === "add-planned") return openAdd({ type: "expense", planned: true });
  if (act === "add-jar") return openJarNew();
  if (act === "add-recurring") return openRecurring();
  const r = e.target.closest("[data-route]")?.dataset.route;
  if (r) go(r);
});

function updateSyncBadge() {
  const el = $("#sync-badge", panelEl);
  if (!el) return;
  const map = { idle: "#54b487", syncing: "#f4c152", error: "#e26d6d", off: "#b9c4c0" };
  const label = { idle: "동기화됨", syncing: "동기화 중", error: "오류", off: "꺼짐" };
  el.style.color = map[sync.getStatus()] || "#b9c4c0";
  el.title = label[sync.getStatus()] || "";
}
sync.onStatus(updateSyncBadge);

/* ---------- 시작 ---------- */
function maybeOnboard() {
  if (!compute().settings.onboarded) openSettings({ onboarding: true });
}

materializeRecurring(new Date().toISOString().slice(0, 10));  // 반복 거래 자동 생성
render();
sync.start();                       // 변경 자동 업로드 연결
if (sync.isConfigured()) {
  // 시작 시 원격과 1회 동기화 → 더 최신 데이터 채택 후 렌더
  sync.syncNow().then(() => {
    materializeRecurring(new Date().toISOString().slice(0, 10));
    render(); maybeOnboard();
  }).catch(() => maybeOnboard());
} else {
  maybeOnboard();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
