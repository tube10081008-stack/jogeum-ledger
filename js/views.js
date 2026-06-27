// 화면 렌더링 (HTML 문자열 생성 — 이벤트는 app.js가 위임 처리)
import { won, wonShort, fmtDayLabel, fmtDate, esc, todayISO } from "./format.js";
import { CATEGORIES, catOf } from "./storage.js";
import { mascot, mascotSVG, mascotState, MOODS } from "./mascot.js";
import { getMascot } from "./storage.js";
import { info as syncInfo } from "./sync.js";
import { gameStats } from "./gamification.js";

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
  ${body}`;
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
