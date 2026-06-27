// 포맷/날짜 유틸
export const won = (n) => (n < 0 ? "-" : "") + "₩" + Math.abs(Math.round(n)).toLocaleString("ko-KR");
export const wonShort = (n) => {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 100000000) return s + (a / 100000000).toFixed(a % 100000000 ? 1 : 0) + "억";
  if (a >= 10000) return s + (a / 10000).toFixed(a % 10000 ? 1 : 0) + "만";
  return won(n);
};

export const todayISO = () => toISO(new Date());
export const toISO = (d) => {
  const z = new Date(d);
  z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
  return z.toISOString().slice(0, 10);
};
export const parseISO = (s) => new Date(s + "T00:00:00");

export const fmtDate = (iso) => {
  const d = parseISO(iso);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
};
export const fmtDayLabel = (iso) => {
  const t = todayISO();
  if (iso === t) return "오늘";
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === toISO(y)) return "어제";
  return fmtDate(iso);
};

export const monthKey = (iso) => iso.slice(0, 7);            // YYYY-MM
export const yearKey = (iso) => iso.slice(0, 4);             // YYYY
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
