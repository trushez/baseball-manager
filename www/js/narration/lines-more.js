// More ways to say the same things, so a long game does not repeat itself. These are added to LINES in lines.js.
// Every line uses only the placeholders the event already supplies, and claims nothing the event does not know.
// House style: terse radio voice, no em dashes, no stock phrases.

export const MORE = {
  PITCH_SETUP: [
    { w: 2, g: 'Signs from the catcher, and {pit} nods.' }, { w: 2, g: '{pit} rocks back and fires.' }, { w: 2, g: '{pit} takes a breath and steps on the rubber.' },
    { w: 2, g: '{bat} digs in at the plate.' }, { w: 1, g: '{pit} shakes off the first sign. Now he nods.' }, { w: 1, g: 'Quiet in the park as {pit} comes set.' },
    { w: 1, g: '{bat} taps the plate with his bat, and {pit} starts his motion.' }, { w: 1, g: '{pit} wipes his brow and gets the sign.' },
  ],
  PITCH_SETUP_TWO_STRIKES: [
    { w: 2, g: '{bat} is down to his last strike.' }, { w: 2, g: '{pit} can put him away here.' }, { w: 1, g: 'Two strikes, and {bat} has to protect the plate.' }, { w: 1, g: '{pit} is one strike away.' },
  ],
  PITCH_SETUP_THREE_BALLS: [
    { w: 2, g: 'Three balls, and {pit} has no room.' }, { w: 1, g: 'Three balls, and the batter is looking for a walk.' }, { w: 1, g: 'The count is against {pit}. Three balls.' },
  ],
  PITCH_SETUP_FULL_RUNNERS: [{ w: 1, g: 'Full count, and everyone on the bases is ready to run.' }, { w: 1, g: 'Three and two, and nobody on base is standing still.' }],
  PITCH_SETUP_RUNNER: [{ w: 1, g: '{pit} spins and checks {base}.' }, { w: 1, g: '{pit} steps off and looks at {base}.' }, { w: 1, g: 'The runner at {base} takes his lead, and {pit} keeps an eye on him.' }],
  PITCH_SETUP_AFTER_MISS: [{ w: 1, g: '{bat} backs out and adjusts his gloves.' }, { w: 1, g: 'That one fooled {bat}.' }, { w: 1, g: '{bat} steps out and takes a breath.' }],
  PITCH_SETUP_AFTER_FOUL: [{ w: 1, g: 'Foul ball, and {bat} is still in this at-bat.' }, { w: 1, g: '{bat} just gets a piece of it. {pit} goes back to work.' }, { w: 1, g: 'Back it goes into the stands, and {pit} gets another ball.' }],
  PITCH_SETUP_AHEAD: [{ w: 1, g: '{pit} is in command of this at-bat.' }, { w: 1, g: '{pit} holds the edge now.' }, { w: 1, g: '{bat} is on the defensive.' }],
  PITCH_SETUP_BEHIND: [{ w: 1, g: 'The hitter is in control of this count.' }, { w: 1, g: '{pit} can\'t afford to give in here.' }, { w: 1, g: '{pit} has to find the zone.' }],
  PITCH_SETUP_LONG: [{ w: 1, g: 'Pitch {n}. Neither man is giving an inch.' }, { w: 1, g: '{n} pitches already in this at-bat.' }, { w: 1, g: '{bat} is making {pit} work for this one.' }],
  PITCH_SETUP_TENSE: [{ w: 1, g: 'The ballpark is holding its breath.' }, { w: 1, g: 'The noise rises with every pitch.' }, { w: 1, g: 'No one is talking in the booth.' }],

  K_LOOKING: [
    { w: 1, g: '{bat} watches strike three go by.' },
    { w: 1, g: 'Called out on strikes! {bat} can\'t believe it.' },
    { w: 1, g: 'The corner is painted and {bat} is rung up.' },
  ],
  K_SWINGING: [
    { w: 1, g: 'Strike three! {bat} swings through it.' },
    { w: 1, g: '{bat} is fooled completely, and he\'s out.' },
    { w: 1, g: '{pit} gets {bat} to wave at a nasty one.' },
  ],
  WALK: [
    { w: 2, g: 'Four balls, and {bat} walks.' }, { w: 1, g: '{bat} lays off the last one and takes first base.' },
    { w: 2, g: 'Ball four, {loc}, and {bat} jogs to first.' },
  ],
  BASES_LOADED_WALK: [
    { w: 1, g: 'Ball four with the bases loaded! The run walks in.' },
    
  ],

  HR_CALL: [
    { w: 2, g: 'Crushed! That ball is headed for {field}, and it won\'t come down in the park!' },
    { w: 1, g: 'Back, back... {fielder} is at the wall... and it\'s over!' },
    { w: 2, g: '{bat} turns on it and sends it into {field}!' },
    { w: 2, g: '{bat} connects, and it\'s gone to {field}!' },
    { w: 1, g: 'High, deep, and gone to {field}.' },
  ],
  HR_SOLO: [
    { w: 1, g: 'Gone! A solo homer for {bat}.' },
    { w: 1, g: '{bat} circles the bases with a solo shot.' },
  ],
  HR_MULTI: [
    { w: 1, g: 'A {runsWord}-run blast for {bat}!' },
    { w: 1, g: 'That ball takes {runsWord} runs with it.' },
  ],
  HR_SLAM: [{ w: 1, g: 'Four runs score on the grand slam by {bat}!' }],

  TRIPLE_HIT: [{ w: 1, g: '{bat} hits one into the gap in {field}, and it will roll!' }, { w: 1, g: '{bat} laces one to {field}!' }],
  DOUBLE_LINER: [{ w: 1, g: '{bat} laces one into {field}!' }, { w: 1, g: '{bat} rips a drive to {field}!' }, { w: 1, g: '{bat} hits one hard to {field}!' }],
  GROUNDER_HIT: [{ w: 1, g: '{bat} bounces one {toward}.' }, { w: 1, g: '{bat} chops a ground ball {toward}.' }, { w: 1, g: '{bat} rolls a ground ball {toward}.' }],
  LINER_HIT: [{ w: 1, g: '{bat} drives a liner towards {to}.' }, { w: 1, g: '{bat} flares one towards {to}.' }, { w: 1, g: '{bat} hits a sharp line drive towards {to}.' }],
  RUNS_FOR_FIRST: [{ w: 1, g: '{bat} digs for first!' }, { w: 1, g: '{bat} is out of the box in a hurry!' }, { w: 1, g: '{bat} races down the line!' }],
  GETS_PAST: [{ w: 1, g: 'It is through! {fielder} cannot cut it off.' }, { w: 1, g: 'Past {fielder}!' }, { w: 1, g: 'That one skips by {fielder}!' }],
  OF_PICKS_UP: [{ w: 1, g: '{fielder} runs it down in {field}.' }, { w: 1, g: '{fielder} cuts it off in {field}.' }, { w: 1, g: '{fielder} gathers it in {field}.' }],

  GROUNDER_OUT: [{ w: 1, g: '{bat} rolls one to {to}.' }, { w: 1, g: '{bat} taps a ground ball to {to}.' }, { w: 1, g: '{bat} bounces one to {to}.' }],
  FLY_CAUGHT: [
    { w: 1, g: '{fielder} settles under it and makes the catch.' }, { w: 1, g: '{fielder} camps under it, and that\'s an out.' },
    { w: 1, g: '{fielder} makes the catch.' }, { w: 1, g: '{fielder} pulls it in for another out.' },
  ],
  LINE_OUT: [{ w: 1, g: '{bat} rips one towards {to}, and {fielder} makes the catch.' }, { w: 1, g: '{fielder} snares a line drive from {bat}.' }, { w: 1, g: '{bat} hits it hard, but right at {fielder}. Out.' }],
  DOUBLE_PLAY: [
    { w: 1, g: '{fielder} to {pivot} to first... Two for the price of one!' },
    { w: 1, g: '{fielder} flips to {pivot}, and on to first for the double play!' },
  ],
  ERROR_DROP: [{ w: 1, g: '{fielder} can\'t make the play, and {bat} is safe on the error.' }, { w: 1, g: 'An error on {fielder}, and {bat} reaches.' }],

  RUNNER_SCORES: [{ w: 1, g: '{run} crosses the plate!' }, { w: 1, g: 'Home comes {run}, and he is in!' }, { w: 1, g: '{run} comes home.' }],
  RUNNER_ADVANCES: [{ w: 1, g: '{run} moves up to {base}.' }, { w: 1, g: '{run} takes {base}.' }, { w: 1, g: '{run} gets over to {base}.' }],

  WALK_OFF: [{ w: 1, g: 'The home crowd erupts! {city} win it in the {inn}!' }],
  QUIET_INNING: [{ w: 1, g: 'Down in order.' }, { w: 1, g: 'One, two, three.' }, { w: 1, g: 'No trouble at all.' }, { w: 1, g: 'Over in a flash.' }, { w: 1, g: 'A clean inning.' }],

  STEAL: [{ w: 1, g: '{run} takes off for {base}!' }, { w: 1, g: '{run} breaks for {base}!' }],
  STEAL_SAFE: [{ w: 1, g: '{run} is in safely.' }, { w: 1, g: 'The tag is late, and {run} is safe.' }],
  STEAL_OUT: [
    { w: 1, g: '{run} is thrown out!' },
    { w: 1, g: 'Out! {catcher} gunned him down.' },
  ],
  VISIT: [{ w: 1, g: 'A mound visit for {pit}. He nods and gets back to work.' }, { w: 1, g: 'The infield gathers around {pit} for a moment.' }, { w: 1, g: 'Time is called, and {pit} gets a word on the mound.' }],

  DEBUT: [{ w: 1, g: 'A first major league at-bat for {Bat}. Nobody in that dugout has forgotten theirs.' }],
  FIRST_HIT: [{ w: 1, g: '{bat} has his first major league hit, and the dugout lets him know it.' }],
  FIRST_HR: [{ w: 1, g: 'A first major league home run for {bat}. That ball will end up on a shelf somewhere.' }],
  HR_MILESTONE: [{ w: 1, g: 'Number {n} for {bat} this season.' }],
  TWO_HR_GAME: [{ w: 1, g: 'A second homer for {bat} tonight!' }],
  THREE_HR_GAME: [{ w: 1, g: 'A third home run for {bat}. This is one for the books.' }],
  CYCLE_WATCH: [{ w: 1, g: '{bat} is a {need} away from the cycle.' }],
  NO_HITTER_WATCH: [{ w: 1, g: 'Still no hits for {opp}, and the {city} dugout has gone quiet.' }, { w: 1, g: 'Nothing yet in the hits column for {opp}.' }],
  NO_HITTER_BROKEN: [{ w: 1, g: '{bat} breaks it up. No more no-hitter.' }],
  PERFECT_WATCH: [{ w: 1, g: 'No {opp} hitter has reached base yet.' }],
  STRIKEOUT_TALLY: [{ w: 1, g: '{pit} strikes out another, and now has {n}.' }],
  LATE_LEAD_CHANGE: [{ w: 1, g: '{city} take the lead in the {inn}!' }],
  LATE_TIE: [{ w: 1, g: 'All square again in the {inn}!' }],
  COMEBACK: [{ w: 1, g: '{city} were {nWord} runs down, and now they are in front!' }],
  STREAK_ON_LINE: [{ w: 1, g: '{city} have won {nWord} straight, and they are protecting that run now.' }],
  LOSING_STREAK: [{ w: 1, g: '{nWord} defeats in a row for {city}. They need something here.' }],

  CONTROL_TROUBLE: [{ w: 1, g: '{pit} has walked {nWord} now, and he is running into trouble.' }],
  WILD_STREAK: [{ w: 1, g: '{pit} has missed the zone with {nWord} of his last {m}.' }],
  LOSING_VELOCITY: [{ w: 1, g: '{pit} is down to {mph} now, from {early} early on.' }],
  SQUARED_UP: [{ w: 1, g: '{pit} is getting hit hard. {nWord} hits already this inning.' }],
  HAS_HIS_NUMBER: [{ w: 1, g: '{bat} keeps finding the barrel against {pit}. That\'s {nWord} hits.' }],
  SLOPPY_DEFENCE: [{ w: 1, g: '{city} have made {n} errors tonight.' }],
  TIRED_ARM: [{ w: 1, g: '{pit} is up to {n} pitches.' }],
};
