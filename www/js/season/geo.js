// Where scouts can be sent. Seven places have a scout to themselves because most of baseball's talent comes from them;
// everywhere else is covered by the region it sits in, so a scout in Europe is looking at a dozen countries at once and
// can easily miss a boy in one of them.
//   d: how far the local youngsters sit below the international class (bigger is rawer); age: the range found at.
export const DESTS = [
  'USA', 'Dominican Republic', 'Venezuela', 'Puerto Rico', 'Japan', 'South Korea', 'Canada',
  'North America', 'Central America & Caribbean', 'South America', 'Europe', 'Asia & Pacific',
];
export const REGIONS = new Set(['North America', 'Central America & Caribbean', 'South America', 'Europe', 'Asia & Pacific']);

const C = (dest, w, d, lo, hi) => ({ dest, w, d, age: [lo, hi] });
export const COUNTRY = {
  USA: C('USA', 1, 7, 17, 21), Canada: C('Canada', 1, 8, 17, 21), 'Puerto Rico': C('Puerto Rico', 1, 9, 16, 20),
  'Dominican Republic': C('Dominican Republic', 1, 12, 16, 17), Venezuela: C('Venezuela', 1, 12, 16, 17),
  Japan: C('Japan', 1, 7, 18, 22), 'South Korea': C('South Korea', 1, 7, 18, 22),
  Mexico: C('North America', 1, 12, 16, 19),
  Cuba: C('Central America & Caribbean', 3, 12, 16, 18), Panama: C('Central America & Caribbean', 2, 12, 16, 17), Nicaragua: C('Central America & Caribbean', 1.5, 12, 16, 17),
  Curacao: C('Central America & Caribbean', 1, 13, 16, 19), Aruba: C('Central America & Caribbean', 0.5, 14, 16, 19), Bahamas: C('Central America & Caribbean', 0.5, 14, 16, 19),
  Honduras: C('Central America & Caribbean', 0.5, 14, 16, 19), Haiti: C('Central America & Caribbean', 0.5, 14, 16, 19), Jamaica: C('Central America & Caribbean', 0.4, 14, 16, 19),
  Colombia: C('South America', 3, 12, 16, 17), Brazil: C('South America', 2, 14, 16, 19), Peru: C('South America', 0.5, 15, 16, 19), Argentina: C('South America', 0.5, 15, 16, 19), Ecuador: C('South America', 0.5, 15, 16, 19),
  Netherlands: C('Europe', 2, 13, 16, 20), Italy: C('Europe', 2, 13, 16, 20), Spain: C('Europe', 1, 14, 16, 20), Germany: C('Europe', 1, 15, 16, 20),
  'United Kingdom': C('Europe', 1, 15, 16, 20), France: C('Europe', 0.5, 15, 16, 20), 'Czech Republic': C('Europe', 0.5, 15, 16, 20),
  Belarus: C('Europe', 0.3, 16, 16, 19), Ukraine: C('Europe', 0.3, 16, 16, 19), Russia: C('Europe', 0.3, 16, 16, 19), Lithuania: C('Europe', 0.3, 16, 16, 19),
  Taiwan: C('Asia & Pacific', 3, 11, 16, 20), Australia: C('Asia & Pacific', 2, 12, 16, 20), China: C('Asia & Pacific', 1, 15, 16, 20), 'New Zealand': C('Asia & Pacific', 0.5, 15, 16, 20),
  Philippines: C('Asia & Pacific', 0.3, 16, 16, 20), Thailand: C('Asia & Pacific', 0.3, 16, 16, 20), 'South Africa': C('Asia & Pacific', 0.4, 16, 16, 20), Uganda: C('Asia & Pacific', 0.3, 16, 16, 20),
};

/** The place a country is covered from: itself, or its region. */
export const destOf = (country) => (DESTS.includes(country) ? country : COUNTRY[country]?.dest ?? 'Asia & Pacific');
export const countriesIn = (dest) => Object.entries(COUNTRY).filter(([, v]) => v.dest === dest).map(([k, v]) => ({ name: k, ...v }));
/** One of the countries a place covers, in proportion to how much baseball it has. */
export function pickCountry(dest, rng) {
  const cs = countriesIn(dest);
  if (!cs.length) return dest;
  let x = rng.next() * cs.reduce((a, c) => a + c.w, 0);
  for (const c of cs) { x -= c.w; if (x <= 0) return c.name; }
  return cs.at(-1).name;
}
