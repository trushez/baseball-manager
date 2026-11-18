// Key dates of the baseball year and day numbering. Day numbers count from 1 January 2026, so they
// stay whole numbers across seasons and can be stored in saves.

const EPOCH = new Date(2026, 0, 1);
const DAY = 86400000;
export const dayNo = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / DAY);
export const fromDayNo = (n) => new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate() + n);
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Days since 1970 for the date on the calendar, the same whatever the clocks do (summer time moves midnight by an hour). */
export const absDay = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);

/** The first date on or after (month, day) that falls on this weekday (0 = Sunday). */
export function onOrAfter(year, month, day, weekday) {
  const d = new Date(year, month, day);
  return addDays(d, (weekday - d.getDay() + 7) % 7);
}

/** The calendar for a season. Opening Day and the season's end come from the schedule. */
export function keyDates(year = 2027) {
  return {
    spring: new Date(year, 1, 20),          // pitchers and catchers report
    opening: onOrAfter(year, 2, 24, 4),      // the first Thursday on or after 24 March (25 March in 2027)
    allStar: onOrAfter(year, 6, 11, 2),      // the game itself; no games for four days around it (13 July in 2027)
    asbStart: onOrAfter(year, 6, 10, 1),     // the break begins on a Monday (12 July in 2027)
    deadline: new Date(year, 6, 31),         // trade deadline
    september: new Date(year, 8, 1),         // active rosters grow to 28
    minorAAA: onOrAfter(year, 2, 29, 2),     // minor league openers are Tuesdays
    minorRest: onOrAfter(year, 3, 5, 2),
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (d) => MONTHS[d.getMonth()];
export const dateWords = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
