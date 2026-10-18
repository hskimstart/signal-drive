// E-GEN 진료시간(dutyTime1s~8c)으로 "지금 문 열었는지"를 계산한다.
// 1=월 … 7=일, 8=공휴일. 시간은 "0900", "1830"처럼 오고, 밤샘은 "2400" 이상이나 마감<시작으로 온다.

// 공휴일(대체공휴일 포함). 매년 정부 발표로 갱신하고, HOLIDAYS 환경변수로 덧붙일 수 있다.
const BUILTIN_HOLIDAYS = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02',
  '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-03', '2026-06-06', '2026-08-15',
  '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05',
  '2026-10-09', '2026-12-25',
];

const holidays = new Set([
  ...BUILTIN_HOLIDAYS,
  ...(process.env.HOLIDAYS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);

const DAY_NAMES = ['', '월', '화', '수', '목', '금', '토', '일'];

export function kstNow(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  const ymd = k.toISOString().slice(0, 10);
  const jsDay = k.getUTCDay(); // 0=일
  const weekday = jsDay === 0 ? 7 : jsDay;
  return {
    ymd,
    weekday,
    dayIndex: holidays.has(ymd) ? 8 : weekday,
    minutes: k.getUTCHours() * 60 + k.getUTCMinutes(),
  };
}

function toMinutes(hhmm) {
  if (hhmm == null) return null;
  const s = String(hhmm).padStart(4, '0');
  if (!/^\d{4}$/.test(s)) return null;
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(2));
}

function fmt(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// 하루치 영업 구간 [시작, 끝) (분 단위, 끝은 1440을 넘을 수 있음)
function span(item, dayIndex) {
  const s = toMinutes(item[`dutyTime${dayIndex}s`]);
  let c = toMinutes(item[`dutyTime${dayIndex}c`]);
  if (s == null || c == null) return null;
  if (c <= s) c += 1440;
  return [s, c];
}

function prevDayIndex(now) {
  // 어제가 공휴일이었는지는 따지지 않고 요일로만 본다(밤샘 영업 이어짐 확인용).
  return now.weekday === 1 ? 7 : now.weekday - 1;
}

export function openStatus(item, date = new Date()) {
  const now = kstNow(date);
  const hasAnyHours = [1, 2, 3, 4, 5, 6, 7, 8].some((d) => span(item, d));
  if (!hasAnyHours) return { known: false, open: null, todayText: '진료시간 정보 없음' };

  // 공휴일인데 공휴일 진료시간(dutyTime8)이 없으면 쉬는 것으로 본다.
  const today = span(item, now.dayIndex);
  const yesterday = span(item, prevDayIndex(now));

  // 어젯밤부터 이어지는 영업(예: 22:00~02:00)
  if (yesterday && yesterday[1] > 1440 && now.minutes < yesterday[1] - 1440) {
    const left = yesterday[1] - 1440 - now.minutes;
    return {
      known: true, open: true, closingSoon: left <= 60,
      todayText: `${fmt(yesterday[0])} ~ ${fmt(yesterday[1])}`,
      closesAt: fmt(yesterday[1]),
    };
  }

  const label = now.dayIndex === 8 ? '공휴일' : `${DAY_NAMES[now.weekday]}요일`;
  if (!today) return { known: true, open: false, dayOff: true, todayText: `${label} 쉬는 날` };

  const [s, c] = today;
  const open = now.minutes >= s && now.minutes < c;
  return {
    known: true,
    open,
    closingSoon: open && c - now.minutes <= 60,
    todayText: `${fmt(s)} ~ ${fmt(c)}`,
    closesAt: fmt(c),
    opensAt: !open && now.minutes < s ? fmt(s) : undefined,
  };
}
