// A team in the shape the match engine plays: each player with flat engine ratings (r). Players from the database
// carry their ratings already; the made-up players of the demo screens (ui/mock-data.js) are given them here from
// their present grades. Lives with the club code so the season simulation does not reach into the interface.

const g = (p, k) => p.grades?.[k]?.[0] ?? 50;

/** Give every player an engine ratings object `r` built from present grades. Mutates and returns the team. */
export function toEngineTeam(team) {
  for (const p of [...team.lineup, ...team.bench]) {
    if (p.r) continue; // players from the database carry their engine ratings already
    p.r = {
      contact: g(p, 'Contact'), power: g(p, 'Power'), eye: g(p, 'Eye'), avoidK: g(p, 'Avoid K'),
      gb: 50, pull: 50, speed: g(p, 'Speed'), instincts: g(p, 'Instincts'), steal: g(p, 'Speed') - 5, bunt: 45,
      range: g(p, 'Fielding'), hands: g(p, 'Fielding'), arm: g(p, 'Arm'), framing: p.pos === 'C' ? g(p, 'Fielding') : 50,
    };
  }
  for (const p of [team.pitcher, ...team.bullpen]) {
    if (!p.r) p.r = {
      stuff: g(p, 'Stuff'), movement: g(p, 'Movement'), control: g(p, 'Control'), stamina: g(p, 'Stamina'),
      hold: g(p, 'Hold runners'), velocity: g(p, 'Velocity'), pgb: 50, range: 45, hands: 50, arm: 50,
    };
    if (p.pitches && !p.pitchGrades) {
      p.pitchGrades = p.pitches;
      p.pitches = Object.fromEntries(Object.entries(p.pitchGrades).map(([k, v]) => [k, v[0]]));
    }
  }
  return {
    id: team.id, city: team.city, full: team.full, name: team.name, abbr: team.abbr,
    lineup: team.lineup.map((p) => ({ player: p, pos: p.pos })),
    bench: team.bench, starter: team.pitcher, bullpen: team.bullpen, instr: team.instr, sx: team.sx, post: !!team.post,
  };
}
