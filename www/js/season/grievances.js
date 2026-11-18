// Unhappy players and the dressing room. A player whose mood stays low asks you privately for a trade. If nothing
// is done in three weeks the request goes public, which sours the clubhouse and cuts what other clubs will pay. You
// can talk him round with a promise (more playing time, a new contract, a move), and the game keeps the promise
// against a date: kept, it is worth a good deal; broken, it is worse than the original grievance.
import { game, orgState } from '../state.js';
import { fullName, isPitcher } from '../data/world.js';
import { dayNo } from './calendar.js';
import { message, about } from './inbox.js';
import { headline } from './headlines.js';
import { value } from './value.js';
import { hidden } from './hidden.js';
import { gamesMLB } from './moods.js';

const today = () => dayNo(game.date);
const mood = (p) => p.mood ?? 60;
const mine = () => game.world.orgs.get(game.orgId);
const rosterOf = (o) => o.players.filter((p) => ['MLB', 'AAA'].includes(orgState(o.id).level.get(p.id)));

export const PROMISES = {
  time: { label: 'Promise him more playing time', days: 30, lift: 12, text: 'He will hold you to it: he expects to play most days for the next month.' },
  extension: { label: 'Promise to talk about a new contract', days: 60, lift: 10, text: 'He expects you to open talks within two months.' },
  trade: { label: 'Promise to move him', days: 45, lift: 14, text: 'He expects to be traded or on the transfer list within six weeks.' },
};

/** A senior player the others look to: older, with service, serious about the job and good enough to matter. */
export function isLeader(p) {
  return (p.age ?? 0) >= 29 && (p.contract?.serviceTime ?? 0) >= 4 && hidden(p).professionalism >= 55 && value(p) >= 47;
}

/** Open promises you have made to a player. */
export const promisesTo = (p) => (game.promises || []).filter((x) => x.pid === p.id && !x.state && PROMISES[x.kind]);

/** The words for his request, for the player screen. */
export function requestWords(p) {
  if (!p.req) return null;
  return p.req.stage === 'public'
    ? 'He has gone public with his wish to leave. Other clubs know you have to move him and will pay less.'
    : 'He has asked you privately for a trade.';
}

/** Make a promise to a player who is unhappy. */
export function promise(p, kind) {
  const K = PROMISES[kind];
  const S = game.season, rec = S?.records?.get(game.orgId);
  (game.promises ||= []).push({
    pid: p.id, kind, date: game.date.getTime(), orgId: game.orgId, due: today() + K.days,
    g0: gamesMLB(p, game.year), t0: rec ? rec.w + rec.l : 0, level: orgState(game.orgId).level.get(p.id),
  });
  p.mood = Math.min(100, mood(p) + K.lift);
  if (p.req) { p.req.since = today(); p.req.stage = 'private'; }
  message({ cat: 'club', player: p.id, title: `${fullName(p)} accepts your word`, body: `You have promised ${fullName(p)}: "${K.label.replace('Promise him ', '').replace('Promise to ', 'to ')}". ${K.text}` });
}

/** Tell him he stays. He takes it badly, and the request does not go away. */
export function refuse(p) {
  p.mood = Math.max(0, mood(p) - 6);
  p.req = { stage: 'private', since: today() - 7, refused: true };
  message({ cat: 'club', player: p.id, title: `${fullName(p)} is told he is staying`, body: `${fullName(p)} did not like hearing it. If nothing changes, he will say so in public.` });
}

function kept(pr, p) {
  const S = game.season, rec = S?.records?.get(game.orgId);
  if (pr.kind === 'trade') return !p || p.orgId !== game.orgId || !!p.listed?.mine;
  if (pr.kind === 'extension') return !!p && (p.contract?.years || []).some((y) => y.season > game.year) && p.contract?.status === 'signed';
  // playing time: about two games in three of the club's games since the promise
  const team = (rec ? rec.w + rec.l : 0) - pr.t0, played = gamesMLB(p, game.year) - pr.g0;
  if (isPitcher(p)) return orgState(game.orgId).active.has(p.id) && played >= Math.min(team * 0.25, 8);
  return played >= team * 0.6;
}

function settle(pr, p) {
  const ok = kept(pr, p);
  pr.state = ok ? 'kept' : 'broken';
  if (!p) return;
  if (ok) {
    p.mood = Math.min(100, mood(p) + 8);
    message({ cat: 'club', player: p.id, title: `${fullName(p)}: you kept your word`, body: `${fullName(p)} says you did what you promised, and it has not gone unnoticed in the dressing room.` });
  } else {
    p.mood = Math.max(0, mood(p) - 22);
    p.broken = (p.broken || 0) + 1;
    for (const x of rosterOf(mine())) if (x !== p) x.mood = Math.max(0, mood(x) - 1);
    message({ cat: 'club', player: p.id, important: true, title: `${fullName(p)}: promise broken`, body: `${fullName(p)} says you did not do what you promised. He is angrier than before, and the others have heard about it.` });
  }
}

/** Once a week, after the moods have moved. */
export function weeklyGrievances() {
  if (game.phase !== 'regular') return;
  const o = mine(), d = today();
  for (const pr of game.promises || []) {
    if (pr.state || pr.orgId !== game.orgId || !pr.kind || !PROMISES[pr.kind]) continue;
    const p = game.world.players.get(pr.pid);
    if (pr.due <= d || (pr.kind === 'trade' && p && p.orgId !== game.orgId)) settle(pr, p);
  }
  for (const p of rosterOf(o)) {
    if (!p.req) {
      if (mood(p) < 28 && !promisesTo(p).length && (p.age ?? 0) >= 23) {
        p.req = { stage: 'private', since: d };
        message({ cat: 'club', player: p.id, important: true, stop: game.settings?.stops?.important, title: `${fullName(p)} asks for a trade`,
          body: `${fullName(p)}'s agent has told you his client wants out. You can promise him something to keep him, put him on the transfer list, or tell him he stays. If nothing is done he will go public.\n${about(p)}` });
      }
      continue;
    }
    if (mood(p) >= 50 && !p.req.refused) { delete p.req; message({ cat: 'club', player: p.id, title: `${fullName(p)} drops his request`, body: `${fullName(p)} is settled again and no longer wants to leave.` }); continue; }
    if (p.req.stage === 'private' && !promisesTo(p).length && d - p.req.since >= 21) {
      p.req.stage = 'public';
      p.mood = Math.max(0, mood(p) - 5);
      for (const x of rosterOf(o)) if (x !== p) x.mood = Math.max(0, mood(x) - 1);
      headline(`${p.last.toUpperCase()} GOES PUBLIC: "I WANT OUT"`, true);
      message({ cat: 'club', player: p.id, important: true, title: `${fullName(p)} goes public with his request`, body: `${fullName(p)} has told the press he wants to leave. The dressing room is unsettled and clubs know you have to move him, so they will pay less for him now.` });
    }
  }
  // the dressing room: leaders who are unhappy drag the others down, content ones steady them
  const lead = rosterOf(o).filter(isLeader);
  if (lead.length >= 2) {
    const avg = lead.reduce((a, p) => a + mood(p), 0) / lead.length;
    if (avg < 45) { for (const x of rosterOf(o)) if (!lead.includes(x)) x.mood = Math.max(0, mood(x) - 1); }
    else if (avg >= 70) { for (const x of rosterOf(o)) if (mood(x) < 55) x.mood = Math.min(100, mood(x) + 1); }
  }
}

/** A player of yours has been traded away. A popular veteran leaves a hole in the dressing room. */
export function leaving(p) {
  const o = mine();
  if (p.req) delete p.req;
  if (!isLeader(p) && !(mood(p) >= 75 && (p.age ?? 0) >= 29)) return;
  let n = 0;
  for (const x of rosterOf(o)) if (x !== p) { x.mood = Math.max(0, mood(x) - 4); n++; }
  if (n) message({ cat: 'club', title: `The dressing room is upset to lose ${fullName(p)}`, body: `${fullName(p)} was one of the senior men in the clubhouse. The players are taking his departure hard.` });
}
