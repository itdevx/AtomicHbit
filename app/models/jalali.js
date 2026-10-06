/** Lightweight Gregorian ↔ Jalali helpers (Iran) */
function div(a, b) { return Math.floor(a / b); }

function toJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) { jy += div(days - 1, 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // Esfand: leap?
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let bl = breaks.length, jp = breaks[0], jm2, jump = 0, leap, n, i;
  if (jy < jp || jy >= breaks[bl - 1]) {
    leap = (jy % 33 % 4 === 1);
  } else {
    for (i = 1; i < bl; i++) {
      jm2 = breaks[i];
      jump = jm2 - jp;
      if (jy < jm2) break;
      jp = jm2;
    }
    n = jy - jp;
    leap = ((jump - n) < 6) ? (n + 1) % jump % 4 === 0 : false;
  }
  return leap ? 30 : 29;
}

const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const WEEKDAYS = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];

function nowIran() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short'
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  const gy = +parts.year, gm = +parts.month, gd = +parts.day;
  const j = toJalali(gy, gm, gd);
  const time = `${parts.hour}:${parts.minute}:${parts.second}`;
  const dateStr = `${j.jy}/${String(j.jm).padStart(2,'0')}/${String(j.jd).padStart(2,'0')}`;
  return {
    ...j,
    time,
    dateStr,
    monthName: MONTHS[j.jm - 1],
    monthLen: jalaliMonthLength(j.jy, j.jm),
    display: `${WEEKDAYS[new Date().getDay()]} ${j.jd} ${MONTHS[j.jm - 1]} ${j.jy} · ${time}`
  };
}

function gregorianKeyIran() {
  // YYYY-MM-DD in Iran for logging
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

module.exports = { toJalali, jalaliMonthLength, MONTHS, nowIran, gregorianKeyIran };
