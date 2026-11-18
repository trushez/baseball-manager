// Hand-made players, added to every data set (the real players and the fictional ones alike) when the world is built.
// Each record has the shape of a player in players.json, plus `fixedPa`: a potential that is set, not worked out.
// Add more to the list; an id already in the data is left alone.

export const SPECIAL = [
  {
    // The greatest baseball player there will ever be, playing ball with his friends at a school in Belarus. He belongs to
    // no club and no computer club will ever find him: only a scout of yours, sent to Belarus, can turn him up, and in
    // most saves nobody does and he never reaches the majors. `hidden` keeps him out of every roster and class.
    id: 'sp-tsigalko', first: 'Max', last: 'Tsigalko', bats: 'L', throws: 'R', pos: 'RF', born: '2010-03-14', age: 17, country: 'Belarus',
    height: '6\' 3"', weight: 195, level: 'R', on_40: false, kind: 'bat', sample: 0, fixedPa: 198, team: null, hidden: true, ask: 600000,
    grades: {
      Contact: [58, 80], Power: [62, 80], Eye: [54, 80], 'Avoid K': [52, 78], Groundball: [50, 50], Speed: [55, 62], Stealing: [50, 56],
      Instincts: [54, 75], Fielding: [50, 62], Arm: [62, 72],
    },
    r: { contact: 58, power: 62, eye: 54, avoidK: 52, gb: 50, pull: 55, speed: 55, instincts: 54, steal: 50, bunt: 45, range: 50, hands: 52, arm: 62, framing: 50 },
    stats: {}, hist: { bat: [], pit: [] }, contract: { status: 'minor league' }, played: {},
  },
];

/** The records to add to a list of players, as copies. */
export const specialPlayers = (have) => SPECIAL.filter((s) => !s.hidden && !have.some((p) => p.id === s.id)).map((s) => JSON.parse(JSON.stringify(s)));

/** The hand-made players who belong to no club until a scout of yours finds them. */
export const hiddenPlayers = () => SPECIAL.filter((s) => s.hidden).map((s) => JSON.parse(JSON.stringify(s)));
