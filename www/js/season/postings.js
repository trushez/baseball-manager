// Players from outside the game's leagues who reach the market each winter: Japanese and Korean professionals posted by
// their clubs when free agency opens, and now and then a Cuban defector. There is no data on the real leagues, so these
// players are invented (and said to be) with the quality of the major leaguers they are made from. Nobody sees much of
// them without a scout: they show about half their attributes until one has looked.
import { Rng } from '../core/rng.js';
import { game } from '../state.js';
import { isPitcher, mainPos, fullName } from '../data/world.js';
import { value, askingSalary, askingYears } from './value.js';
import { newPlayer } from './intake.js';
import { money } from '../data/world.js';
import { message } from './inbox.js';
import { logMove } from './roster.js';


const NAMES = {
  JPN: { first: ['Haruto', 'Ren', 'Sota', 'Kaito', 'Yuto', 'Daiki', 'Takumi', 'Ryota', 'Shun', 'Kenji', 'Naoki', 'Hiroki', 'Kazuki', 'Tatsuya', 'Masato', 'Itsuki'], last: ['Tanabe', 'Okada', 'Fujimoto', 'Kuroda', 'Sakamoto', 'Hayashi', 'Matsuda', 'Ishikawa', 'Nomura', 'Yamaguchi', 'Takeda', 'Shimizu', 'Kondo', 'Aoki', 'Ogawa', 'Hasegawa', 'Mori', 'Inoue'] },
  KOR: { first: ['Min-jun', 'Seo-jun', 'Ji-ho', 'Hyun-woo', 'Dong-hyun', 'Jae-won', 'Sung-min', 'Tae-yang', 'Joon-ho', 'Woo-jin'], last: ['Kim', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Shin', 'Song'] },
  CUB: { first: ['Yoel', 'Reynaldo', 'Lazaro', 'Yasiel', 'Alexei', 'Dariel', 'Osvaldo', 'Yunior', 'Raidel', 'Odalys'], last: ['Duarte', 'Pedroso', 'Caballero', 'Hernandez', 'Ibarra', 'Santiesteban', 'Maceo', 'Verdecia', 'Iglesias', 'Despaigne'] },
};
const LEAGUE = { JPN: 'Japan', KOR: 'Korea', CUB: 'Cuba' };

function pick(from, rng, n) {
  const pool = game.world.list.filter(from);
  const out = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

function make(src, code, age, year, i, rng, { level = 'AAA', defector = false } = {}) {
  const tpl = {
    kind: src.kind, role: src.role, pos: src.pos, age, bats: src.bats, throws: src.throws, height: src.height, weight: src.weight,
    r: { ...src.r }, grades: JSON.parse(JSON.stringify(src.grades)), pitchGrades: src.pitchGrades ? JSON.parse(JSON.stringify(src.pitchGrades)) : undefined,
    played: src.played ? { ...src.played } : undefined, pitchTypes: src.pitchTypes,
  };
  const p = newPlayer(tpl, { id: 'ABROAD' }, year, rng, { id: `${code.toLowerCase()}${year}-${i + 1}`, noBoost: true });
  const n = NAMES[code];
  p.first = rng.pick(n.first); p.last = rng.pick(n.last);
  p.country = code; p.foreign = LEAGUE[code]; p.defector = defector || undefined;
  p.team = null; p.club = null; p.orgId = null; p.level = level; delete p.wasMine; delete p.tr; p.hist = { bat: [], pit: [] }; p.fat = 0; p.plog = [];
  p.contract = { status: 'free agent', text: defector ? 'Defector' : `Posted from ${LEAGUE[code]}`, serviceTime: 0, options: 3, aav: 0, years: [] };
  logMove(p, 'posted', null, null, { note: defector ? 'a defector' : `posted from ${LEAGUE[code]}` });
  game.world.players.set(p.id, p);
  game.world.list.push(p);
  if (!game.freeAgents.includes(p.id)) game.freeAgents.push(p.id);
  return p;
}

/** When free agency opens: six to eight posted players, and sometimes a defector. */
export function postForeign(year = game.year) {
  const rng = new Rng(`posting-${year}-${game.manager}`);
  const mlb = (p) => p.level === 'MLB' && p.r && p.grades && !p.retired && p.age >= 25 && p.age <= 31 && value(p) >= 44 && value(p) <= 60;
  const n = rng.int(6, 8);
  const srcs = pick(mlb, rng, n + 1);
  const made = [];
  srcs.slice(0, n).forEach((src, i) => made.push(make(src, i < Math.ceil(n * 0.6) ? 'JPN' : 'KOR', rng.int(23, 32), year, i, rng)));
  const rows = made.sort((a, b) => value(b) - value(a));
  message({ cat: 'league', important: true, title: 'Posted from Japan and Korea',
    parts: [{ p: `${rows.length} professionals from the Japanese and Korean leagues have been posted and are open to every club. Nobody here has seen them play: you see about half of what they can do until a scout has watched them. Send one to Japan or South Korea from the Scouting screen.` },
      { head: ['Player', 'Age', 'Position', 'From', 'Asks'], rows: rows.map((p) => [{ pid: p.id, t: fullName(p) }, String(p.age), mainPos(p), p.foreign, `${money(askingSalary(p))} x ${askingYears(p)}`]) }] });
  if (rng.chance(0.35)) {
    const src = pick((p) => p.level !== 'MLB' && p.r && p.grades && !p.retired && p.age <= 26 && value(p) >= 42 && value(p) <= 54, rng, 1)[0];
    if (src) {
      const p = make(src, 'CUB', rng.int(20, 26), year, 0, rng, { level: 'AA', defector: true });
      message({ cat: 'league', title: `A defector from Cuba: ${fullName(p)}`, player: p.id, body: `${fullName(p)}, ${p.age}, a ${isPitcher(p) ? 'pitcher' : mainPos(p)} who has left Cuba, is a free agent and any club can sign him. He asks about ${money(askingSalary(p))} a year. No scout has seen him.` });
    }
  }
}
