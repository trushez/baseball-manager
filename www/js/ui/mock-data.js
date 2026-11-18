// Sample data: two fictional clubs and their players, for the tests and for a match played without a database.
import { Rng } from '../core/rng.js';

const rng = new Rng('mockup-v1');
/** A 20-80 grade near `base`, rounded to 5 as scouts do. */
const g = (base, sd = 6) => Math.max(20, Math.min(80, Math.round(rng.normal(base, sd) / 5) * 5));
/** [present, future] */
const pair = (base, growth = 0) => {
  const now = g(base);
  return [now, Math.min(80, now + Math.round(growth / 5) * 5)];
};

function batter(id, first, last, pos, bats, age, line, today, quality, extra = {}) {
  const young = age < 26 ? 10 : age < 29 ? 5 : 0;
  return {
    id, first, last, pos, bats, throws: extra.throws || 'R', age, today, kind: 'bat',
    avg: line[0], obp: line[1], slg: line[2], hr: line[3], rbi: line[4], pa: line[5],
    vsL: extra.vsL || '.700', vsR: extra.vsR || '.720',
    contract: extra.contract || '1 yr, $780k',
    grades: {
      Contact: pair(quality, young), Power: pair(quality - 3, young), Eye: pair(quality, young / 2),
      'Avoid K': pair(quality - 2, young / 2), Speed: pair(extra.speed || 50), Instincts: pair(50),
      Fielding: pair(extra.field || 50, young / 2), Arm: pair(extra.arm || 50),
    },
  };
}

function pitcher(id, first, last, throws, role, age, line, quality, extra = {}) {
  const young = age < 26 ? 10 : age < 29 ? 5 : 0;
  return {
    id, first, last, pos: 'P', throws, bats: extra.bats || throws, age, role, kind: 'pit',
    era: line[0], ip: line[1], k9: line[2], bb9: line[3], whip: line[4], g: line[5],
    status: extra.status || 'Rested', last3: extra.last3 ?? 0, today: extra.today || null,
    vsL: extra.vsL || '.700', vsR: extra.vsR || '.700',
    contract: extra.contract || '1 yr, $780k',
    pitches: extra.pitches || { 'Four-seam': pair(quality), Slider: pair(quality - 5), Changeup: pair(quality - 10) },
    grades: {
      Stuff: pair(quality, young), Movement: pair(quality - 3, young / 2), Control: pair(quality - 2, young / 2),
      Stamina: pair(role === 'Starter' ? 60 : 35), 'Hold runners': pair(50), Velocity: pair(quality),
    },
  };
}

export const away = {
  id: 'MES', city: 'Mesa', name: 'Rattlers', abbr: 'MES', kitA: '#a3262a', kitB: '#ffffff', acc: '#e0453f',
  record: '9-6',
  lineup: [
    batter('m1', 'Dario', 'Vance', 'CF', 'L', 27, ['.281', '.352', '.441', 2, 7, 62], '1-2, BB', 55, { speed: 65, field: 60, vsL: '.682', vsR: '.811' }),
    batter('m2', 'Tomas', 'Ruiz', 'SS', 'R', 24, ['.264', '.318', '.402', 1, 5, 58], '0-3', 50, { field: 65, arm: 60 }),
    batter('m3', 'Andre', 'Okafor', '1B', 'R', 30, ['.302', '.391', '.566', 5, 16, 64], '2-3, HR, 2B, 3 RBI', 65, { contract: '4 yrs, $88m', vsL: '.990', vsR: '.912' }),
    batter('m4', 'Luis', 'Castillo', 'RF', 'L', 28, ['.255', '.340', '.498', 4, 11, 61], '1-2, 2B', 60, { arm: 65 }),
    batter('m5', 'Grant', 'Hollis', 'DH', 'R', 33, ['.238', '.322', '.430', 3, 9, 57], '0-2, K', 55),
    batter('m6', 'Kenji', 'Mori', '3B', 'R', 26, ['.270', '.330', '.410', 1, 6, 55], '1-2', 50, { field: 60 }),
    batter('m7', 'Sam', 'Pruitt', 'LF', 'S', 25, ['.247', '.301', '.360', 0, 3, 51], '0-1, BB', 45, { speed: 60 }),
    batter('m8', 'Eli', 'Branson', 'C', 'R', 29, ['.221', '.290', '.344', 1, 4, 44], '0-2', 45, { field: 60, arm: 55 }),
    batter('m9', 'Rafael', 'Ibarra', '2B', 'R', 23, ['.259', '.310', '.351', 0, 2, 47], '1-2', 45, { speed: 55, field: 55 }),
  ],
  bench: [],
  bullpen: [],
  pitcher: pitcher('mp1', 'Corey', 'Dunlap', 'R', 'Starter', 29, ['3.42', '23.2', '9.1', '2.7', '1.14', 4], 60,
    { today: { ip: '5.0', h: 5, r: 2, er: 2, bb: 3, k: 6, pc: 81 } }),
};
away.bench = [
  batter('m10', 'Joe', 'Keane', 'C', 'R', 31, ['.210', '.280', '.320', 0, 1, 15], null, 40),
  batter('m11', 'Darnell', 'Pike', 'OF', 'R', 27, ['.240', '.300', '.390', 1, 3, 20], null, 45),
];
away.bullpen = [
  pitcher('mp2', 'Roy', 'Gaines', 'R', 'Closer', 32, ['2.25', '4.0', '11.3', '2.3', '1.00', 4], 60),
  pitcher('mp3', 'Luke', 'Tallis', 'L', 'Setup', 27, ['3.10', '6.2', '9.5', '3.1', '1.21', 6], 55),
  pitcher('mp4', 'Omar', 'Reyes', 'R', 'Matchup', 29, ['3.38', '5.1', '8.4', '3.4', '1.31', 6], 50),
  pitcher('mp5', 'Trey', 'Walsh', 'R', 'Middle', 26, ['4.15', '8.2', '8.3', '3.1', '1.27', 6], 50),
  pitcher('mp6', 'Kyle', 'Marsh', 'L', 'Middle', 30, ['3.86', '7.0', '7.7', '2.6', '1.29', 5], 50),
  pitcher('mp7', 'Pablo', 'Medina', 'R', 'Long', 28, ['4.50', '12.0', '6.8', '3.0', '1.42', 4], 45),
  pitcher('mp8', 'Sean', 'Nolan', 'R', 'Middle', 25, ['5.06', '5.1', '9.3', '5.1', '1.50', 5], 45),
];

export const home = {
  id: 'BAY', city: 'Bay City', name: 'Gulls', abbr: 'BAY', kitA: '#14305c', kitB: '#ffffff', acc: '#4f8fdc',
  record: '8-7', user: true,
  lineup: [
    batter('b1', 'Marcus', 'Bell', '2B', 'R', 26, ['.290', '.355', '.420', 1, 6, 63], '1-3', 55, { speed: 60, field: 55 }),
    batter('b2', 'Owen', 'Fitch', 'LF', 'L', 31, ['.268', '.360', '.452', 2, 8, 60], '1-2, BB', 55),
    batter('b3', 'Javier', 'Soria', 'RF', 'R', 27, ['.312', '.380', '.590', 6, 15, 64], '1-2, HR', 65, { arm: 65, contract: '6 yrs, $142m', vsL: '1.020', vsR: '.930' }),
    batter('b4', 'Danny', 'Kowal', '1B', 'L', 29, ['.244', '.331', '.470', 4, 12, 62], '0-2, K', 55),
    batter('b5', 'Theo', 'Lang', '3B', 'R', 25, ['.276', '.329', '.433', 2, 9, 59], '1-2', 55, { field: 60 }),
    batter('b6', 'Ricky', 'Navarro', 'DH', 'R', 34, ['.232', '.301', '.415', 3, 8, 55], '0-2', 50),
    batter('b7', 'Will', 'Archer', 'C', 'R', 28, ['.218', '.287', '.330', 1, 4, 48], '1-2, RBI', 45, { field: 65, arm: 60 }),
    batter('b8', 'Felix', 'Ortega', 'SS', 'R', 22, ['.247', '.299', '.345', 0, 3, 50], '1-2', 45, { field: 65, arm: 65, speed: 60 }),
    batter('b9', 'Nate', 'Cooper', 'CF', 'L', 24, ['.263', '.333', '.371', 0, 2, 53], '0-1, BB', 45, { speed: 70, field: 65 }),
  ],
  bench: [
    batter('b10', 'Chris', 'Yates', 'C', 'R', 32, ['.199', '.270', '.301', 0, 1, 21], null, 40, { field: 55 }),
    batter('b11', 'Paul', 'Dempsey', 'IF', 'L', 30, ['.255', '.320', '.380', 0, 2, 25], null, 45, { field: 60 }),
    batter('b12', 'Tyrell', 'Watts', 'OF', 'S', 26, ['.240', '.310', '.360', 0, 1, 19], null, 45, { speed: 70, field: 60 }),
    batter('b13', 'Hank', 'Mercer', '1B', 'L', 35, ['.231', '.330', '.462', 1, 4, 18], null, 50, { vsL: '.590', vsR: '.880' }),
  ],
  pitcher: pitcher('bp1', 'Alex', 'Morales', 'L', 'Starter', 27, ['3.90', '27.2', '8.2', '3.3', '1.27', 5], 55,
    { today: { ip: '5.1', h: 6, r: 3, er: 3, bb: 3, k: 4, pc: 92 } }),
  bullpen: [
    pitcher('bp2', 'Jesse', 'Teague', 'R', 'Closer', 30, ['1.80', '5.0', '12.6', '1.8', '0.80', 5], 65, { last3: 0, vsL: '.540', vsR: '.580', contract: '2 yrs, $14m' }),
    pitcher('bp3', 'Mario', 'Quiles', 'R', 'Setup', 28, ['2.45', '7.1', '10.8', '3.7', '1.09', 7], 60, { last3: 14, vsL: '.690', vsR: '.560' }),
    pitcher('bp4', 'Ben', 'Hargrove', 'L', 'Matchup', 31, ['3.00', '6.0', '9.0', '3.0', '1.17', 8], 55, { status: 'Tired', last3: 31, vsL: '.480', vsR: '.820' }),
    pitcher('bp5', 'Isaac', 'Pena', 'R', 'Middle', 25, ['4.50', '8.0', '7.9', '4.5', '1.50', 6], 50, { last3: 0 }),
    pitcher('bp6', 'Colin', 'Shaw', 'L', 'Long', 29, ['3.86', '11.2', '6.9', '2.3', '1.29', 4], 50, { last3: 0, vsL: '.650', vsR: '.720' }),
    pitcher('bp7', 'Drew', 'Larkin', 'R', 'Middle', 27, ['5.40', '6.2', '8.1', '5.4', '1.65', 6], 45, { status: 'Unavailable', last3: 52 }),
    pitcher('bp8', 'Victor', 'Salas', 'R', 'Middle', 26, ['3.60', '5.0', '9.0', '3.6', '1.20', 5], 50, { last3: 9 }),
  ],
};

export const venue = 'Harbor Park, Bay City';
export const day = 'Tuesday';
export const manager = 'J. Manager';
export const date = '14.4.27';
export const longDate = 'Tuesday 14th April 2027';

/** All players by id, each with a back-reference to its club, for the player card. */
export const playersById = new Map();
for (const t of [away, home]) {
  for (const p of [...t.lineup, ...t.bench, t.pitcher, ...t.bullpen]) {
    p.team = t;
    playersById.set(p.id, p);
  }
}

export const facts = { umpire: 'Dale Fenwick', attendance: '31,240', weather: 'Clear, 18\u00B0C', game: 'Regular season, game 16 of 162' };

/** Other games today: [away, runs, home, runs, status] */
export const otherGames = [
  ['Portland', 2, 'Boise', 5, 'Bot 7th'],
  ['Halifax', 0, 'Quebec', 0, 'Top 3rd'],
  ['Tulsa', 6, 'El Paso', 4, 'Final'],
  ['Savannah', 3, 'Raleigh', 3, 'Top 9th'],
  ['Fresno', 1, 'Spokane', 8, 'Final'],
];

/** East division: [club, W, L, Pct, GB, Last 10] */
export const standings = [
  ['Mesa', 9, 6, '.600', '-', '6-4'],
  ['Bay City', 8, 7, '.533', '1.0', '5-5'],
  ['Savannah', 7, 7, '.500', '1.5', '5-5'],
  ['Raleigh', 7, 8, '.467', '2.0', '4-6'],
  ['Halifax', 5, 9, '.357', '3.5', '3-7'],
];
