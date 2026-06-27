// 화면 렌더링 (HTML 문자열 생성 — 이벤트는 app.js가 위임 처리)
import { won, wonShort, fmtDayLabel, fmtDate, esc, todayISO } from "./format.js";
import { CATEGORIES, catOf } from "./storage.js";
import { mascot, mascotSVG, mascotState, MOODS } from "./mascot.js";
import { getMascot } from "./storage.js";
import { info as syncInfo } from "./sync.js";
import { gameStats } from "./gamification.js";
import { categoryBreakdown, monthlySeries, dailySpend, monthDiff, donutSVG, PALETTE } from "./insights.js";
import { parseISO } from "./format.js";

/* ---------- 홈 ---------- */
export function homeView(c) {
  const m = mascotState(c);
  const g = gameStats(c);
  const pct = Math.round(c.progress * 100);
  const overMonth = c.mNet < c.monthlyTarget && c.monthlyTarget > 0;
  const mPctRaw = c.monthlyTarget > 0 ? (c.mNet / c.monthlyTarget) * 100 : 0;
  const mPct = Math.max(0, Math.min(100, Math.round(mPctRaw)));

  return `
  <div class="mascot-wrap">
    ${mascot(m.mood, 130)}
    <div class="mascot-bubble">${esc(m.msg)}</div>
  </div>

  <div class="card center">
    <div class="card__head"><span class="card__title">${c.year}년 저축 목표</span>
      <button class="link" data-act="settings">목표 수정</button></div>
    <div class="ring" style="--p:${pct}">
      <div class="ring__in">
        <div class="ring__pct">${pct}%</div>
        <div class="ring__lbl">${wonShort(c.saved)} / ${wonShort(c.goal)}</div>
      </div>
    </div>
    <div class="muted" style="font-size:.85rem">
      목표까지 <b>${won(c.remainingToGoal)}</b> · 올해 ${c.daysLeftInYear}일 남음
    </div>
  </div>

  ${allowanceCard(c)}

  <div class="card">
    <div class="card__head"><span class="card__title">이번 달</span>
      <span class="muted" style="font-size:.78rem">월 저축목표 ${wonShort(c.monthlyTarget)}</span></div>
    <div class="grid3">
      <div class="stat"><div class="stat__v pos">${wonShort(c.mIn)}</div><div class="stat__l">수입</div></div>
      <div class="stat"><div class="stat__v neg">${wonShort(c.mOut)}</div><div class="stat__l">지출</div></div>
      <div class="stat"><div class="stat__v ${c.mNet >= 0 ? "pos" : "neg"}">${wonShort(c.mNet)}</div><div class="stat__l">순저축</div></div>
    </div>
    <div class="bar"><div class="bar__fill ${overMonth ? "over" : ""}" style="width:${mPct}%"></div></div>
    <div class="muted" style="font-size:.78rem;margin-top:6px">
      ${c.monthlyTarget > 0 ? `이번 달 저축목표의 <b>${Math.round(mPctRaw)}%</b> 달성` : "목표를 설정하면 진행률이 표시돼요"}
    </div>
  </div>

  <div class="card">
    <div class="card__head"><span class="card__title">계획 반영 연말 예상</span>
      <button class="link" data-route="planned">예정 관리</button></div>
    <div class="grid2">
      <div class="stat"><div class="stat__v">${wonShort(c.projected)}</div><div class="stat__l">예상 잔액</div></div>
      <div class="stat"><div class="stat__v ${c.projected >= c.goal ? "pos" : "neg"}">
        ${c.projected >= c.goal ? "목표 달성 가능 ✅" : wonShort(c.goal - c.projected) + " 부족"}</div>
        <div class="stat__l">목표 대비</div></div>
    </div>
  </div>

  ${jarsCard(c)}

  <div class="card level">
    <div class="level__badge">Lv.${g.level}</div>
    <div class="level__info">
      <div style="font-weight:700">레벨 ${g.level} · ${g.xp} XP</div>
      <div class="xpbar"><div class="xpbar__fill" style="width:${g.lvlPct}%"></div></div>
      <div class="muted" style="font-size:.76rem;margin-top:5px">
        🔥 ${c.streak}일 연속 기록 · 뱃지 ${g.badges.filter((b) => b.got).length}/${g.badges.length}
      </div>
    </div>
  </div>`;
}

// 오늘 쓸 수 있는 돈
function allowanceCard(c) {
  if (c.monthlyBudget <= 0) {
    return `<div class="card center" data-act="settings" style="cursor:pointer">
      <div class="muted" style="font-size:.88rem">💸 <b>월 지출 예산</b>을 정하면 "오늘 쓸 수 있는 돈"을 알려줄게요</div>
    </div>`;
  }
  const over = c.budgetLeft < 0;
  const usedPct = Math.min(100, Math.round((c.mOut / c.monthlyBudget) * 100));
  return `<div class="card center allow ${over ? "allow--over" : ""}">
    <div class="card__head" style="justify-content:center"><span class="card__title">오늘 쓸 수 있는 돈</span></div>
    <div class="allow__big ${over ? "neg" : ""}">${over ? "예산 초과!" : won(c.todayAllowance)}</div>
    <div class="bar"><div class="bar__fill ${over ? "over" : ""}" style="width:${usedPct}%"></div></div>
    <div class="muted" style="font-size:.78rem;margin-top:6px">
      이번 달 예산 ${wonShort(c.monthlyBudget)} 중 ${wonShort(c.mOut)} 사용 · 남은 ${c.daysLeftInMonth}일
    </div>
  </div>`;
}

// 저금통(추가 목표)
function jarsCard(c) {
  const jars = c.jars || [];
  const rows = jars.map((j) => {
    const pct = j.target > 0 ? Math.min(100, Math.round((j.saved / j.target) * 100)) : 0;
    return `<div class="jar" data-jar="${j.id}">
      <div class="jar__emoji">${esc(j.emoji || "🐖")}</div>
      <div class="jar__body">
        <div class="jar__top"><b>${esc(j.name)}</b><span class="muted">${pct}%</span></div>
        <div class="bar"><div class="bar__fill" style="width:${pct}%"></div></div>
        <div class="muted" style="font-size:.74rem;margin-top:4px">${won(j.saved)} / ${won(j.target)}</div>
      </div>
    </div>`;
  }).join("");
  return `<div class="card">
    <div class="card__head"><span class="card__title">저금통 (추가 목표)</span>
      <button class="link" data-act="add-jar">＋ 추가</button></div>
    ${jars.length ? rows : `<div class="muted" style="font-size:.82rem">여행·비상금 같은 목표를 만들어 따로 모아보세요 🐖</div>`}
  </div>`;
}

/* ---------- 내역 ---------- */
export function historyView(c) {
  const items = [...c.actual].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return `<h1 class="screen-title">내역</h1>${
    items.length ? groupByDay(items) : emptyBox("아직 기록이 없어요.<br>＋ 버튼으로 첫 기록을 남겨봐요!")
  }`;
}

/* ---------- 예정 ---------- */
export function plannedView(c) {
  const list = [...c.planned].sort((a, b) => a.date.localeCompare(b.date));
  const body = list.length
    ? list.map((t) => txRow(t)).join("")
    : emptyBox("예정된 수입·지출을 등록해<br>미리 통제해보세요. (예: 월급, 구독료)");
  return `
  <h1 class="screen-title">예정</h1>
  <div class="card">
    <div class="grid2">
      <div class="stat"><div class="stat__v pos">+${wonShort(c.plInRaw)}</div><div class="stat__l">예정 수입</div></div>
      <div class="stat"><div class="stat__v neg">-${wonShort(c.plOutRaw)}</div><div class="stat__l">예정 지출</div></div>
    </div>
  </div>
  <button class="btn ghost" data-act="add-planned" style="margin-bottom:14px">＋ 예정 항목 추가</button>

  <div class="card__head"><span class="card__title">반복 거래</span>
    <button class="link" data-act="add-recurring">＋ 추가</button></div>
  ${recurringList(c)}

  <div class="card__head" style="margin-top:6px"><span class="card__title">예정 항목</span></div>
  ${body}`;
}

function recurringList(c) {
  const rs = c.recurring || [];
  if (!rs.length) return `<div class="card"><div class="muted" style="font-size:.82rem">
    월급·구독료처럼 매달 반복되는 거래를 등록하면 <b>자동으로 기록</b>돼요.</div></div>`;
  return rs.map((r) => {
    const cat = catOf(r.type, r.category);
    return `<div class="tx ${r.active ? "" : "planned"}">
      <div class="tx__ico" data-recur="${r.id}">${cat.icon}</div>
      <div class="tx__body" data-recur="${r.id}">
        <div class="tx__cat">${esc(cat.label)} <span class="tx__tag">매월 ${r.day}일</span>${r.active ? "" : ` <span class="muted">(중지)</span>`}</div>
        <div class="tx__memo">${esc(r.memo || "")}</div>
      </div>
      <div class="tx__amt ${r.type === "income" ? "pos" : "neg"}">${r.type === "income" ? "+" : "-"}${won(r.amount)}</div>
      <button class="recur-x" data-recur-del="${r.id}">✕</button>
    </div>`;
  }).join("");
}

/* ---------- 도전 ---------- */
export function questView(c) {
  const g = gameStats(c);
  return `
  <h1 class="screen-title">도전</h1>
  <div class="mascot-wrap">${mascot(g.level >= 5 ? "celebrate" : "happy", 110)}</div>
  <div class="card level">
    <div class="level__badge">Lv.${g.level}</div>
    <div class="level__info">
      <div style="font-weight:800;font-size:1.05rem">${g.xp} XP</div>
      <div class="xpbar"><div class="xpbar__fill" style="width:${g.lvlPct}%"></div></div>
      <div class="muted" style="font-size:.76rem;margin-top:5px">다음 레벨까지 ${Math.max(0, g.next - g.xp)} XP</div>
    </div>
  </div>
  <div class="card">
    <div class="card__head"><span class="card__title">🚯 무지출 챌린지</span>
      <span class="muted" style="font-size:.78rem">최고 ${c.bestNoSpend || 0}일</span></div>
    <div class="grid3">
      <div class="stat"><div class="stat__v ${c.noSpendStreak > 0 ? "pos" : ""}">${c.noSpendStreak || 0}일</div><div class="stat__l">연속 무지출</div></div>
      <div class="stat"><div class="stat__v">${c.noSpendThisMonth || 0}일</div><div class="stat__l">이번 달</div></div>
      <div class="stat"><div class="stat__v">${c.bestNoSpend || 0}일</div><div class="stat__l">최고 기록</div></div>
    </div>
    <div class="muted" style="font-size:.78rem;margin-top:8px">${
      c.noSpendStreak > 0 ? `오늘까지 ${c.noSpendStreak}일째 지출 0원! 조구미가 신났어요 🎉`
        : "지출 없는 하루를 만들어 무지출 잔디를 심어보세요 🌱"
    }</div>
  </div>

  <div class="card">
    <div class="card__title" style="margin-bottom:12px">뱃지</div>
    <div class="badges">
      ${g.badges.map((b) => `
        <div class="badge ${b.got ? "on" : "locked"}">
          <div class="badge__ic">${b.icon}</div>${esc(b.label)}
        </div>`).join("")}
    </div>
  </div>
  <div class="card">
    <div class="card__title" style="margin-bottom:8px">XP 얻는 법</div>
    <div class="muted" style="font-size:.85rem;line-height:1.8">
      📝 하루 기록 +5 · 🔥 연속일마다 +10<br>
      🐷 월 저축목표 달성 +60 · 🎯 목표 이정표(25·50·75·100%) +120
    </div>
  </div>
  <button class="btn ghost" data-act="settings">⚙️ 설정 · 데이터 백업</button>`;
}

/* ---------- 분석 ---------- */
export function insightsView(c) {
  const bd = categoryBreakdown(c.actual, c.thisMonth);
  const slices = bd.items.slice(0, PALETTE.length).map((it, i) => ({ ...it, color: PALETTE[i] }));
  const series = monthlySeries(c.actual, 6, c.today);
  const maxExp = Math.max(1, ...series.map((s) => s.exp));
  const diff = monthDiff(c.actual, c.thisMonth, c.today);

  const donut = bd.total > 0
    ? `<div class="donut-wrap">
        ${donutSVG(slices)}
        <div class="donut-mid"><div class="muted" style="font-size:.72rem">이번 달 지출</div>
          <b style="font-size:1.05rem">${wonShort(bd.total)}</b></div>
       </div>
       <div class="legend">${slices.map((s) => {
         const cat = catOf("expense", s.cat);
         return `<div class="legend__i"><span class="dot" style="background:${s.color}"></span>
           ${cat.icon} ${esc(cat.label)} <b>${Math.round(s.ratio * 100)}%</b></div>`;
       }).join("")}</div>`
    : `<div class="muted center" style="padding:20px">이번 달 지출 기록이 쌓이면 분석이 보여요 📊</div>`;

  return `
  <h1 class="screen-title">분석</h1>
  <div class="card">
    <div class="card__title" style="margin-bottom:10px">카테고리별 지출</div>
    ${donut}
  </div>

  <div class="card">
    <div class="card__title" style="margin-bottom:12px">최근 6개월 지출</div>
    <div class="trend">${series.map((s) => `
      <div class="trend__col">
        <div class="trend__bar" style="height:${Math.round((s.exp / maxExp) * 90)}px"
          title="${won(s.exp)}"></div>
        <div class="trend__lbl">${s.label}</div>
      </div>`).join("")}</div>
  </div>

  <div class="card">
    <div class="card__title" style="margin-bottom:10px">${c.thisMonth.slice(5)}월 지출 달력</div>
    ${heatmap(c)}
  </div>

  ${simulatorCard(c)}

  ${reportCard(c, diff)}`;
}

// 미래 시뮬레이터 (월 지출 ±% → 연말 예상 잔액)
function simulatorCard(c) {
  const base = c.saved + c.monthsLeft * (c.avgMonthlyIncome - c.avgMonthlyExpense);
  if (c.avgMonthlyExpense <= 0 && c.avgMonthlyIncome <= 0) {
    return `<div class="card"><div class="card__title" style="margin-bottom:6px">미래 시뮬레이터</div>
      <div class="muted" style="font-size:.84rem">기록이 쌓이면 "월 지출을 줄이면 연말에 얼마?"를 시뮬레이션해줄게요.</div></div>`;
  }
  return `<div class="card">
    <div class="card__title" style="margin-bottom:4px">미래 시뮬레이터</div>
    <div class="muted" style="font-size:.78rem;margin-bottom:10px">
      월 평균: 수입 ${wonShort(c.avgMonthlyIncome)} · 지출 ${wonShort(c.avgMonthlyExpense)} · 올해 ${c.monthsLeft}개월 남음
    </div>
    <div class="sim-row"><span>월 지출</span><b id="sim-pct">0%</b></div>
    <input type="range" id="sim-range" class="sim-range" min="-50" max="50" step="5" value="0"
      data-saved="${Math.round(c.saved)}" data-inc="${Math.round(c.avgMonthlyIncome)}"
      data-exp="${Math.round(c.avgMonthlyExpense)}" data-left="${c.monthsLeft}" data-goal="${c.goal}" />
    <div class="sim-out">
      <div class="stat"><div class="stat__v" id="sim-result">${wonShort(base)}</div><div class="stat__l">연말 예상 잔액</div></div>
      <div class="stat"><div class="stat__v" id="sim-vs">${c.goal > 0 ? (base >= c.goal ? "목표 달성 ✅" : wonShort(c.goal - base) + " 부족") : "-"}</div><div class="stat__l">목표 대비</div></div>
    </div>
  </div>`;
}

function heatmap(c) {
  const map = dailySpend(c.actual, c.thisMonth);
  const max = Math.max(1, ...Object.values(map));
  const d = parseISO(c.thisMonth + "-01");
  const firstDow = d.getDay();
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(`<div class="hm-cell hm-empty"></div>`);
  for (let day = 1; day <= days; day++) {
    const iso = `${c.thisMonth}-${String(day).padStart(2, "0")}`;
    const v = map[iso] || 0;
    const lvl = v === 0 ? 0 : Math.ceil((v / max) * 4);
    cells.push(`<div class="hm-cell hm-${lvl}" title="${fmtDate(iso)} · ${won(v)}">${day}</div>`);
  }
  return `<div class="hm-grid">
    ${["일","월","화","수","목","금","토"].map((w) => `<div class="hm-dow">${w}</div>`).join("")}
    ${cells.join("")}</div>`;
}

function reportCard(c, diff) {
  const up = diff.diffs[0];
  let line = "이번 달은 지난달과 비슷해요.";
  if (diff.prevTotal === 0) line = "다음 달이면 지난달과 비교해드릴게요.";
  else if (up) {
    const cat = catOf("expense", up.cat);
    line = up.diff > 0
      ? `${cat.icon} <b>${esc(cat.label)}</b> 지출이 지난달보다 <b class="neg">${wonShort(up.diff)}</b> 늘었어요.`
      : `${cat.icon} <b>${esc(cat.label)}</b> 지출을 지난달보다 <b class="pos">${wonShort(-up.diff)}</b> 줄였어요! 👏`;
  }
  const totalLine = diff.prevTotal > 0
    ? `총 지출 ${diff.totalDiff <= 0 ? `<b class="pos">${wonShort(-diff.totalDiff)} 절약</b>` : `<b class="neg">${wonShort(diff.totalDiff)} 증가</b>`} (지난달 대비)`
    : "";
  return `<div class="card">
    <div class="card__head"><span class="card__title">이번 달 리포트</span></div>
    <div class="report">
      ${mascot(diff.totalDiff <= 0 ? "happy" : "worried", 70)}
      <div><div style="font-size:.92rem;line-height:1.6">${line}</div>
        <div class="muted" style="font-size:.8rem;margin-top:4px">${totalLine}</div></div>
    </div>
  </div>`;
}

/* ---------- 공통 조각 ---------- */
function groupByDay(items) {
  const days = {};
  for (const t of items) (days[t.date] = days[t.date] || []).push(t);
  return Object.keys(days).sort((a, b) => b.localeCompare(a)).map((d) => {
    const list = days[d];
    const net = list.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
    return `<div class="tx-day">
      <div class="tx-day__h"><span>${fmtDayLabel(d)}</span>
        <span class="${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : ""}${won(net)}</span></div>
      ${list.map((t) => txRow(t)).join("")}
    </div>`;
  }).join("");
}

function txRow(t) {
  const cat = catOf(t.type, t.category);
  const sign = t.type === "income" ? "+" : "-";
  return `<div class="tx ${t.planned ? "planned" : ""}" data-edit="${t.id}">
    <div class="tx__ico">${cat.icon}</div>
    <div class="tx__body">
      <div class="tx__cat">${esc(cat.label)}${t.planned ? `<span class="tx__tag">예정</span>` : ""}</div>
      <div class="tx__memo">${esc(t.memo || (t.planned ? fmtDate(t.date) : ""))}</div>
    </div>
    <div class="tx__amt ${t.type === "income" ? "pos" : "neg"}">${sign}${won(t.amount)}</div>
  </div>`;
}

function emptyBox(html) {
  return `<div class="empty">${mascot("sleepy", 96)}<p>${html}</p></div>`;
}

/* ---------- 바텀시트: 입력 ---------- */
export function addSheet({ type = "expense", planned = false, edit = null } = {}) {
  const t = edit || { type, planned, amount: "", category: "", memo: "", date: todayISO() };
  const cats = CATEGORIES[t.type];
  return `
  <div class="sheet__title">${edit ? "기록 수정" : planned ? "예정 항목 추가" : "기록하기"}</div>
  <div class="seg" id="seg-type">
    <button data-type="expense" class="${t.type === "expense" ? "on exp" : ""}">지출</button>
    <button data-type="income" class="${t.type === "income" ? "on inc" : ""}">수입</button>
  </div>
  <div class="field">
    <label>금액</label>
    <input class="input amount" id="f-amount" inputmode="numeric" placeholder="0"
      value="${t.amount ? Number(t.amount).toLocaleString("ko-KR") : ""}" />
    <div id="f-convert" class="convert"></div>
  </div>
  <div class="field">
    <label>분류</label>
    <div class="chips" id="f-cats">
      ${cats.map((cc) => `<button class="chip ${t.category === cc.id ? "on" : ""}" data-cat="${cc.id}">${cc.icon} ${cc.label}</button>`).join("")}
    </div>
  </div>
  <div class="row">
    <div class="field"><label>날짜</label>
      <input class="input" id="f-date" type="date" value="${t.date}" /></div>
    <div class="field"><label>메모 (선택)</label>
      <input class="input" id="f-memo" placeholder="예: 점심" value="${esc(t.memo || "")}" /></div>
  </div>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:.9rem">
    <input type="checkbox" id="f-planned" ${t.planned ? "checked" : ""} style="width:18px;height:18px" />
    예정 항목 (아직 실현되지 않은 계획)
  </label>
  <button class="btn primary" id="f-save">${edit ? "수정 저장" : "저장"}</button>
  ${edit ? `<button class="btn danger" id="f-del" style="margin-top:10px">삭제</button>` : ""}`;
}

/* ---------- 바텀시트: 저금통 ---------- */
export function jarSheet(jar = null) {
  const j = jar || { name: "", emoji: "🐖", target: "", saved: 0 };
  const emojis = ["🐖", "✈️", "🏠", "🚗", "🎓", "💍", "🎮", "🎁", "🏥", "🌴"];
  return `
  <div class="sheet__title">${jar ? "저금통" : "새 저금통"}</div>
  ${jar ? `<div class="center" style="font-size:2.4rem;margin-bottom:6px">${esc(j.emoji)}</div>
    <div class="center" style="margin-bottom:10px"><b>${esc(j.name)}</b>
      <div class="muted">${won(j.saved)} / ${won(j.target)}</div></div>
    <div class="row">
      <div class="field"><label>넣기/빼기 금액</label>
        <input class="input amount" id="j-amt" inputmode="numeric" placeholder="0" /></div>
    </div>
    <div class="row">
      <button class="btn primary" id="j-deposit">＋ 넣기</button>
      <button class="btn ghost" id="j-withdraw">－ 빼기</button>
    </div>
    <button class="btn danger" id="j-del" style="margin-top:10px">저금통 삭제</button>`
  : `
    <div class="field"><label>이름</label>
      <input class="input" id="j-name" placeholder="예: 일본 여행" value="${esc(j.name)}" /></div>
    <div class="field"><label>아이콘</label>
      <div class="chips" id="j-emoji">
        ${emojis.map((e, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-emoji="${e}">${e}</button>`).join("")}
      </div></div>
    <div class="field"><label>목표 금액</label>
      <input class="input amount" id="j-target" inputmode="numeric" placeholder="0" /></div>
    <button class="btn primary" id="j-create">만들기</button>`}`;
}

/* ---------- 바텀시트: 반복 거래 ---------- */
export function recurringSheet() {
  return `
  <div class="sheet__title">반복 거래 추가</div>
  <div class="seg" id="r-type">
    <button data-type="expense" class="on exp">지출</button>
    <button data-type="income" class="on">수입</button>
  </div>
  <div class="field"><label>금액</label>
    <input class="input amount" id="r-amount" inputmode="numeric" placeholder="0" /></div>
  <div class="field"><label>분류</label>
    <div class="chips" id="r-cats">
      ${CATEGORIES.expense.map((cc) => `<button class="chip" data-cat="${cc.id}">${cc.icon} ${cc.label}</button>`).join("")}
    </div></div>
  <div class="row">
    <div class="field"><label>매월 며칠</label>
      <input class="input" id="r-day" type="number" min="1" max="31" value="1" /></div>
    <div class="field"><label>메모 (선택)</label>
      <input class="input" id="r-memo" placeholder="예: 넷플릭스" /></div>
  </div>
  <button class="btn primary" id="r-save">추가하기</button>
  <div class="muted" style="font-size:.76rem;margin-top:8px">추가하면 지난 달부터 오늘까지 해당 날짜에 자동 기록돼요.</div>`;
}

/* ---------- 클라우드 백업(GitHub Gist) 섹션 ---------- */
function cloudSection() {
  const s = syncInfo();
  if (s.configured) {
    const last = s.lastSync ? new Date(s.lastSync).toLocaleString("ko-KR") : "아직 없음";
    return `
      <div class="card__title" style="margin-bottom:4px">클라우드 백업 · GitHub <span id="sync-badge" class="sync-badge">●</span></div>
      <div class="muted" style="font-size:.76rem;margin-bottom:10px">
        연결됨 — 기록할 때마다 비공개 Gist에 자동 저장돼요.<br>마지막 동기화: <b>${last}</b>
      </div>
      <div class="row">
        <button class="btn ghost" id="sync-now">지금 동기화</button>
        <button class="btn ghost" id="sync-off">연결 해제</button>
      </div>`;
  }
  return `
    <div class="card__title" style="margin-bottom:4px">클라우드 백업 · GitHub (선택)</div>
    <div class="muted" style="font-size:.76rem;margin-bottom:10px">
      비공개 Gist에 자동 백업하면 <b>캐시 삭제·기기 변경에도</b> 데이터가 안전해요.
      토큰은 이 기기에만 저장되고 저장소엔 올라가지 않아요.
    </div>
    <ol class="muted" style="font-size:.76rem;margin:0 0 10px 18px;line-height:1.7">
      <li><a class="link" href="https://github.com/settings/tokens/new?scopes=gist&description=조금만가계부" target="_blank" rel="noopener">이 링크</a>로 토큰 생성 (scope <b>gist</b>만 체크)</li>
      <li>생성된 <b>ghp_…</b> 토큰을 아래에 붙여넣고 연결</li>
    </ol>
    <div class="field">
      <input class="input" id="sync-token" type="password" placeholder="ghp_… 토큰 붙여넣기"
        autocomplete="off" />
    </div>
    <button class="btn primary" id="sync-connect">연결하기</button>`;
}

/* ---------- 바텀시트: 온보딩 / 설정 ---------- */
export function settingsSheet(c, { onboarding = false } = {}) {
  return `
  <div class="sheet__title">${onboarding ? "환영해요! 목표를 정해요 🌱" : "설정"}</div>
  ${onboarding ? `<div class="center" style="margin-bottom:8px">${mascot("happy", 96)}</div>` : ""}
  <div class="field">
    <label>올해(${c.year}) 저축 목표</label>
    <input class="input amount" id="s-goal" inputmode="numeric" placeholder="0"
      value="${c.goal ? c.goal.toLocaleString("ko-KR") : ""}" />
  </div>
  <div class="field">
    <label>연초 시작 잔액 (선택)</label>
    <input class="input" id="s-start" inputmode="numeric" placeholder="0"
      value="${c.settings.startBalance ? c.settings.startBalance.toLocaleString("ko-KR") : ""}" />
  </div>
  <button class="btn primary" id="s-save">${onboarding ? "시작하기" : "저장"}</button>
  ${onboarding ? "" : `
    <hr class="soft"/>
    <div class="card__title" style="margin-bottom:8px">예산 (소비 통제)</div>
    <div class="field">
      <label>월 지출 예산 — "오늘 쓸 수 있는 돈" 계산</label>
      <input class="input amount" id="s-budget" inputmode="numeric" placeholder="0"
        value="${c.monthlyBudget ? c.monthlyBudget.toLocaleString("ko-KR") : ""}" />
    </div>
    <label class="muted" style="font-size:.78rem;display:block;margin-bottom:6px">카테고리별 봉투 (선택) — 비우면 미설정</label>
    ${CATEGORIES.expense.map((cc) => `
      <div class="env-row">
        <span class="env-row__c">${cc.icon} ${cc.label}</span>
        <input class="input env-row__i" inputmode="numeric" placeholder="0"
          data-budget="${cc.id}" value="${c.settings.budgets[cc.id] ? c.settings.budgets[cc.id].toLocaleString("ko-KR") : ""}" />
      </div>`).join("")}
    <button class="btn ghost" id="s-budget-save" style="margin-top:10px">예산 저장</button>
    <hr class="soft"/>
    <div class="card__title" style="margin-bottom:4px">마스코트 꾸미기</div>
    <div class="muted" style="font-size:.76rem;margin-bottom:10px">
      기분별 이미지를 올리면 그 캐릭터로 바뀌어요. 올린 이미지는 <b>이 기기에만</b> 저장되고
      저장소·공개 주소엔 올라가지 않아요. (안 올린 칸은 기본 캐릭터)
    </div>
    <div class="mascot-grid">
      ${MOODS.map((mo) => {
        const cur = getMascot()[mo.id];
        return `<div class="ms-slot">
          <div class="ms-pre">${cur
            ? `<img src="${cur}" alt="" /><button class="ms-x" data-msdel="${mo.id}">✕</button>`
            : mascotSVG(mo.id, 56)}</div>
          <label class="ms-up">${mo.label}
            <input type="file" accept="image/*" data-msup="${mo.id}" hidden />
          </label>
        </div>`;
      }).join("")}
    </div>
    <hr class="soft"/>
    ${cloudSection()}
    <hr class="soft"/>
    <div class="card__title" style="margin-bottom:8px">데이터 (1인용 · 기기에만 저장)</div>
    <div class="row">
      <button class="btn ghost" id="s-export">백업 내보내기</button>
      <button class="btn ghost" id="s-import">불러오기</button>
    </div>
    <button class="btn danger" id="s-reset" style="margin-top:10px">전체 초기화</button>
    <input type="file" id="s-file" accept="application/json" hidden />
  `}`;
}
