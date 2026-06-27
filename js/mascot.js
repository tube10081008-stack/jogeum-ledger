// 마스코트 "조구미" — 오리지널 아기공룡 (조구만 분위기, 저작권 회피용 자체 제작)
// mood: celebrate | happy | neutral | worried | sad | sleepy
// 사용자가 기분별 커스텀 이미지를 올리면(기기 로컬 저장) 그 이미지를 우선 표시.
import { getMascot } from "./storage.js";

export const MOODS = [
  { id: "happy", label: "기쁨 😊" },
  { id: "celebrate", label: "축하 🎉" },
  { id: "neutral", label: "보통 🙂" },
  { id: "worried", label: "걱정 🤔" },
  { id: "sad", label: "슬픔 😢" },
  { id: "sleepy", label: "졸림 😴" },
];

// 화면 표시용: 커스텀 이미지가 있으면 <img>, 없으면 기본 SVG
export function mascot(mood = "neutral", size = 140) {
  const custom = getMascot()[mood];
  if (custom) {
    return `<img class="mascot" src="${custom}" width="${size}" height="${size}"
      alt="마스코트" style="object-fit:contain;border-radius:18px" />`;
  }
  return mascotSVG(mood, size);
}

export function mascotSVG(mood = "neutral", size = 140) {
  const eyes = {
    celebrate: `<path d="M76 92 l5 -6 5 6" stroke="#2f3a38" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                <path d="M106 92 l5 -6 5 6" stroke="#2f3a38" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    happy: `<path d="M76 94 q5 -7 10 0" stroke="#2f3a38" stroke-width="3.5" fill="none" stroke-linecap="round"/>
            <path d="M106 94 q5 -7 10 0" stroke="#2f3a38" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    neutral: `<circle cx="81" cy="94" r="6.5" fill="#2f3a38"/><circle cx="111" cy="94" r="6.5" fill="#2f3a38"/>
              <circle cx="83" cy="91" r="2.2" fill="#fff"/><circle cx="113" cy="91" r="2.2" fill="#fff"/>`,
    worried: `<circle cx="81" cy="95" r="6" fill="#2f3a38"/><circle cx="111" cy="95" r="6" fill="#2f3a38"/>
              <path d="M73 84 l12 4 M119 84 l-12 4" stroke="#2f3a38" stroke-width="2.6" stroke-linecap="round"/>`,
    sad: `<circle cx="81" cy="96" r="6" fill="#2f3a38"/><circle cx="111" cy="96" r="6" fill="#2f3a38"/>
          <path d="M74 88 q7 -5 13 -1 M118 88 q-7 -5 -13 -1" stroke="#2f3a38" stroke-width="2.6" fill="none" stroke-linecap="round"/>
          <circle cx="120" cy="104" r="3.5" fill="#9ad4f0"/>`,
    sleepy: `<path d="M75 94 h12 M105 94 h12" stroke="#2f3a38" stroke-width="3.2" stroke-linecap="round"/>
             <text x="128" y="78" font-size="14" fill="#9bb0aa" font-weight="800">z</text>`,
  }[mood] || "";

  const mouth = {
    celebrate: `<path d="M86 108 q10 14 20 0 z" fill="#e26d6d"/>`,
    happy: `<path d="M88 109 q8 9 16 0" stroke="#2f3a38" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    neutral: `<path d="M90 110 q6 6 12 0" stroke="#2f3a38" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    worried: `<path d="M90 112 h12" stroke="#2f3a38" stroke-width="3" stroke-linecap="round"/>`,
    sad: `<path d="M89 114 q7 -7 14 0" stroke="#2f3a38" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    sleepy: `<ellipse cx="96" cy="112" rx="4" ry="5" fill="#2f3a38"/>`,
  }[mood] || "";

  const extra = mood === "celebrate"
    ? `<text x="40" y="60" font-size="20">✨</text><text x="138" y="70" font-size="18">⭐</text>`
    : "";

  return `<svg class="mascot" viewBox="0 0 192 180" width="${size}" height="${size}"
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label="마스코트 조구미">
    ${extra}
    <ellipse cx="96" cy="166" rx="44" ry="8" fill="#d8ece0"/>
    <path d="M70 70 q8 -18 16 -2 q8 -16 16 0 q8 -14 14 4" fill="#54b487"/>
    <circle cx="96" cy="104" r="46" fill="#7ed6a7"/>
    <ellipse cx="96" cy="116" rx="27" ry="25" fill="#eafaf0"/>
    <ellipse cx="62" cy="138" rx="11" ry="9" fill="#7ed6a7"/>
    <ellipse cx="130" cy="138" rx="11" ry="9" fill="#7ed6a7"/>
    ${eyes}
    <circle cx="72" cy="108" r="5" fill="#f7b9b0" opacity=".85"/>
    <circle cx="120" cy="108" r="5" fill="#f7b9b0" opacity=".85"/>
    ${mouth}
  </svg>`;
}

// 상태 → 기분 + 한마디
export function mascotState(c) {
  if (!c.settings.onboarded || c.goal <= 0) {
    return { mood: "happy", msg: "안녕! 올해 목표부터 같이 정해볼까? 🌱" };
  }
  if (c.progress >= 1) return { mood: "celebrate", msg: "목표 달성! 너 진짜 대단하다 🎉" };
  if (c.streak >= 7) return { mood: "celebrate", msg: `${c.streak}일 연속 기록 중! 습관 만렙 가자 🔥` };
  if (c.monthPace >= 1) return { mood: "happy", msg: "이번 달 저축 목표 넘었어! 멋져 ✨" };
  if (c.monthPace >= 0.5) return { mood: "happy", msg: "이번 달 순항 중! 이대로 가자 😊" };
  if (c.mNet < 0) return { mood: "sad", msg: "이번 달 지출이 좀 많았네… 내일은 조금만! 💧" };
  if (c.monthPace < 0.2) return { mood: "worried", msg: "저축 속도가 느려. 작은 것부터 줄여볼까? 🤔" };
  return { mood: "neutral", msg: "오늘도 기록 한 번! 작은 습관이 큰 돈 돼 💪" };
}
