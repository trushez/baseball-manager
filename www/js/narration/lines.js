// The words of the game, kept apart from the code that chooses them (the way CM 01/02 kept its
// commentary in events_eng.cfg). Each event has a priority and a list of lines. A line has a weight (w,
// how often it is picked against the others), live text (g, present tense, for the radio call) and
// report text (r, past tense, for the written game report). Either may be missing.
//
// Priority sets how long a line stays up: 0 routine, 1 important, 2 crucial.
// Placeholders in braces are filled in by the narrator or the reporter:
//   {bat} {pit} {run} batter, pitcher and runner (surname once introduced)
//   {Bat} {Pit}         the same, full name
//   {city} {opp}        the club the event belongs to, and the other club
//   {field} {to} {fielder} {catcher} {inn} {n} {nWord} {runs} {runsWord} {count} {score} {base}
//
// Keep to the house style: no em dashes, no stock phrases, sentences of different lengths.

import { MORE } from './lines-more.js';

export const PRI_HOLD = [0.65, 1.05, 1.6];
export const SETUP_HOLD = 0.42;

export const LINES = {
  // ---------- setting up each pitch (one short line before every pitch, for the tension) ----------
  PITCH_SETUP: { pri: 0, lines: [
    { w: 3, g: '{pit} gets the sign.' }, { w: 3, g: '{pit} comes set.' }, { w: 2, g: 'Here\'s the pitch.' },
    { w: 2, g: '{pit} into the windup.' }, { w: 2, g: '{pit} looks in, and delivers.' }, { w: 1, g: '{bat} steps back in. {pit} ready.' },
  ] },
  PITCH_SETUP_TWO_STRIKES: { pri: 0, lines: [
    { w: 2, g: '{pit} needs one more strike.' }, { w: 2, g: 'Two strikes on {bat}. Here it comes.' }, { w: 1, g: '{bat} chokes up with two strikes.' },
  ] },
  PITCH_SETUP_THREE_BALLS: { pri: 0, lines: [
    { w: 2, g: '{pit} can\'t afford another ball.' }, { w: 2, g: 'Three balls. {pit} has to come to him.' },
  ] },
  PITCH_SETUP_FULL_RUNNERS: { pri: 0, lines: [{ w: 1, g: 'Full count, and the runners will be going with the pitch.' }, { w: 1, g: 'Three and two, runners moving. Here it is.' }] },
  PITCH_SETUP_RUNNER: { pri: 0, lines: [{ w: 2, g: '{pit} checks the runner at {base}.' }, { w: 1, g: 'A look over to {base}... and the pitch.' }, { w: 1, g: '{pit} holds the ball, a long look at {base}.' }] },
  PITCH_SETUP_AFTER_MISS: { pri: 0, lines: [{ w: 2, g: '{bat} shakes his head and steps back in.' }, { w: 1, g: '{bat} was way out in front of that one.' }, { w: 1, g: '{bat} takes a practice swing. {pit} gets the sign.' }] },
  PITCH_SETUP_AFTER_FOUL: { pri: 0, lines: [{ w: 2, g: '{bat} stays alive. {pit} looks in again.' }, { w: 1, g: 'New ball for {pit}. He rubs it up.' }, { w: 1, g: '{bat} fights them off. Here we go again.' }] },
  PITCH_SETUP_AHEAD: { pri: 0, lines: [{ w: 2, g: '{pit} has him where he wants him.' }, { w: 1, g: '{pit} can afford to waste one here.' }, { w: 1, g: '{bat} is in a hole now.' }] },
  PITCH_SETUP_BEHIND: { pri: 0, lines: [{ w: 2, g: '{pit} needs a strike.' }, { w: 1, g: '{pit} is working from behind.' }] },
  PITCH_SETUP_LONG: { pri: 0, lines: [{ w: 2, g: 'Pitch number {n} of this at-bat.' }, { w: 1, g: '{bat} keeps battling. {pit} keeps coming.' }, { w: 1, g: 'What a battle this is. Pitch {n}.' }] },
  PITCH_SETUP_TENSE: { pri: 0, lines: [{ w: 1, g: 'The crowd is on its feet.' }, { w: 1, g: 'You can feel it all around the ballpark.' }, { w: 1, g: 'Nobody is sitting down now.' }, { w: 1, g: 'This is what it\'s all about.' }] },

  // ---------- strikeouts and walks ----------
  K_LOOKING: { pri: 1, lines: [
    { w: 2, g: '{bat} strikes out looking.', r: '{Pit} caught {Bat} looking' },
    { w: 2, g: 'A called strike {loc}. {bat} is out looking.', r: '{Pit} froze {Bat} with a called third strike' },
    { w: 1, g: 'Strike three called! {bat} never took the bat off his shoulder.', r: '{Pit} struck out {Bat} looking' },
  ] },
  K_SWINGING: { pri: 1, lines: [
    { w: 2, g: 'Swing and a miss. {pit} strikes out {bat}.', r: '{Pit} struck out {Bat}' },
    { w: 2, g: 'Swing and a miss. {bat} goes down swinging.', r: '{Pit} got {Bat} swinging' },
    { w: 1, g: '{bat} chases and misses. Strike three.', r: '{Pit} got {Bat} to chase strike three' },
  ] },
  WALK: { pri: 0, lines: [
    { w: 3, g: 'Ball four is {loc}. {bat} takes his base.' },
    { w: 1, g: 'Ball four. {bat} trots down to first.' },
  ] },
  BASES_LOADED_WALK: { pri: 1, lines: [
    { w: 1, g: 'Ball four! {bat} walks in a run.', r: '{Pit} walked in a run' },
    { w: 1, g: 'Ball four, and that forces in a run.', r: '{Bat} drew a bases-loaded walk' },
  ] },

  // ---------- the long ball ----------
  HR_CALL: { pri: 2, lines: [
    { w: 2, g: 'A towering drive to {field}! It\'s going, going, gone!' },
    { w: 2, g: 'A high fly ball to {field}! It\'s up, it\'s up, it\'s gone!' },
    { w: 2, g: '{bat} hits it a mile! Sailing into {field}, and gone!' },
    { w: 1, g: 'There\'s a long drive to {field}... back goes {fielder}, to the wall... it\'s gone!' },
    { w: 1, g: '{bat} gets all of it! Into the seats in {field}!' },
  ] },
  HR_SOLO: { pri: 2, lines: [
    { w: 2, g: 'A home run for {bat}!', r: '{Bat} hit a solo home run to {field} in the {inn}' },
    { w: 1, g: 'That\'s a solo shot for {bat}.', r: '{Bat} homered to {field} in the {inn}' },
  ] },
  HR_MULTI: { pri: 2, lines: [
    { w: 2, g: 'It\'s {runsWord} runs for {bat}!', r: '{Bat} hit a {runsWord}-run home run in the {inn}' },
    { w: 1, g: 'A {runsWord}-run homer for {bat}!', r: '{Bat}\'s {runsWord}-run homer to {field} in the {inn}' },
  ] },
  HR_SLAM: { pri: 2, lines: [
    { w: 1, g: 'A grand slam for {bat}!', r: '{Bat} hit a grand slam in the {inn}' },
    { w: 1, g: 'Grand slam! {bat} has cleared the bases!', r: '{Bat} cleared the bases with a grand slam in the {inn}' },
  ] },

  // ---------- hits ----------
  TRIPLE_HIT: { pri: 0, lines: [{ w: 1, g: '{bat} smashes one into the gap in {field}!' }, { w: 1, g: '{bat} drives one into the gap in {field}!' }] },
  DOUBLE_LINER: { pri: 0, lines: [
    { w: 1, g: '{bat} sends a line drive into the gap in {field}!' }, { w: 1, g: '{bat} drives one into the gap in {field}!' }, { w: 1, g: '{bat} lines one in {field}!' },
  ] },
  GROUNDER_HIT: { pri: 0, lines: [{ w: 1, g: '{bat} hits a ground ball {toward}.' }, { w: 1, g: '{bat} smashes a ground ball {toward}.' }, { w: 1, g: '{bat} sends a ground ball {toward}.' }] },
  LINER_HIT: { pri: 0, lines: [{ w: 1, g: '{bat} lines one towards {to}.' }, { w: 1, g: '{bat} sends a line drive towards {to}.' }, { w: 1, g: '{bat} loops one towards {to}.' }] },
  RUNS_FOR_FIRST: { pri: 0, lines: [{ w: 1, g: '{bat} hustles for first!' }, { w: 1, g: '{bat} runs for first!' }, { w: 1, g: '{bat} sprints for first!' }] },
  GETS_PAST: { pri: 0, lines: [{ w: 1, g: 'A well struck ball races by {fielder}!' }, { w: 1, g: 'A well struck ball eludes {fielder}!' }, { w: 1, g: 'A well struck ball gets past {fielder}!' }] },
  OF_PICKS_UP: { pri: 0, lines: [{ w: 1, g: '{fielder} scoops up the ball in {field}.' }, { w: 1, g: '{fielder} picks it up in {field}.' }, { w: 1, g: '{fielder} stops the ball in {field}.' }] },

  // ---------- outs ----------
  GROUNDER_OUT: { pri: 0, lines: [{ w: 1, g: '{bat} hits a grounder to {to}.' }, { w: 1, g: '{bat} sends a grounder to {to}.' }, { w: 1, g: '{bat} wallops a grounder to {to}.' }] },
  FLY_CAUGHT: { pri: 0, lines: [
    { w: 1, g: '{fielder} gets under it, and it settles into the glove for the out.' },
    { w: 1, g: '{fielder} catches it on the warning track for the out.' },
    { w: 1, g: '{fielder} squeezes it for the out.' },
  ] },
  LINE_OUT: { pri: 0, lines: [{ w: 1, g: '{bat} smashes a line drive towards {to}. {fielder} catches it for the out.' }, { w: 1, g: '{bat} hits a line drive towards {to}. {fielder} catches it for the out.' }, { w: 1, g: '{bat} lines one towards {to}. {fielder} catches it for the out.' }] },
  DOUBLE_PLAY: { pri: 1, lines: [
    { w: 1, g: '{fielder} to {pivot}, on to first... Double play!', r: '{Pit} got out of the {inn} on a {bat} double play' },
  ] },
  ERROR_DROP: { pri: 1, lines: [{ w: 1, g: '{fielder} drops it! {bat} is safe on the error.' }, { w: 1, g: '{fielder} loses it in the lights! {bat} is safe on the error.' }, { w: 1, g: '{fielder} can\'t hold on! {bat} is safe on the error.' }] },

  // ---------- runners ----------
  RUNNER_SCORES: { pri: 1, lines: [{ w: 1, g: '{run} scores!' }, { w: 1, g: '{run} comes in to score!' }, { w: 1, g: '{run} trots home.' }] },
  RUNNER_ADVANCES: { pri: 0, lines: [{ w: 1, g: '{run} goes to {base}.' }, { w: 1, g: '{run} races round to {base}!' }, { w: 1, g: '{run} hustles to {base}.' }] },

  // ---------- the score ----------
  WALK_OFF: { pri: 2, lines: [
    { w: 1, g: 'That\'s the ball game! {city} walk it off!', r: '{Bat} won it for {city} with a walk-off {what} in the {inn}' },
    { w: 1, g: 'And that will do it! {city} win it in the {inn}!', r: '{Bat}\'s {what} in the {inn} sent the home crowd away happy' },
  ] },
  // report text for runs driven in by anything other than a homer; {what} is the hit or play
  RBI: { pri: 1, lines: [
    { w: 2, r: '{Bat}\'s {what} in the {inn} drove in {runsWord}' },
    { w: 1, r: '{Bat} drove in {runsWord} with a {what} in the {inn}' },
  ] },
  GO_AHEAD: { pri: 1, lines: [
    { w: 2, r: '{Bat}\'s {what} in the {inn} put {city} ahead for good' },
    { w: 1, r: '{city} went in front to stay on {Bat}\'s {what} in the {inn}' },
  ] },

  // ---------- innings ----------
  QUIET_INNING: { pri: 1, lines: [{ w: 1, g: 'Three up, three down.' }, { w: 1, g: 'Nothing doing.' }, { w: 1, g: 'A quick inning.' }, { w: 1, g: 'In order.' }] },

  // ---------- other plays ----------
  STEAL: { pri: 1, lines: [{ w: 1, g: '{run} is stealing {base}!' }, { w: 1, g: 'There goes {run}! He\'s off for {base}!' }] },
  STEAL_SAFE: { pri: 1, lines: [{ w: 1, g: '{catcher} makes the throw... Safe!' }, { w: 1, g: 'The throw from {catcher}... not in time!' }] },
  STEAL_OUT: { pri: 1, lines: [{ w: 1, g: '{catcher} makes the throw... Out! He gets him!', r: '{catcher} threw out {run} trying to steal in the {inn}' }, { w: 1, g: 'A strong throw from {catcher}, and he\'s out!', r: '{run} was caught stealing in the {inn}' }] },
  VISIT: { pri: 0, lines: [{ w: 1, g: 'Time is called. The manager walks out to talk with {pit}.' }, { w: 1, g: 'The pitching coach jogs out for a word with {pit}.' }] },

  // ---------- storylines ----------
  DEBUT: { pri: 1, lines: [
    { w: 1, g: 'This is the first major league at-bat for {Bat}. His family is somewhere in the stands tonight.', r: '{Bat} made his major league debut' },
    { w: 1, g: '{Bat} is making his major league debut. Remember the name.', r: '{Bat} played his first major league game' },
  ] },
  FIRST_HIT: { pri: 2, lines: [
    { w: 1, g: 'And that is the first major league hit for {bat}! They\'ll save that ball for him.', r: '{Bat} collected his first major league hit' },
    { w: 1, g: 'His first hit in the big leagues! {bat} will remember this one.', r: 'it was a night to remember for {Bat}, who got his first major league hit' },
  ] },
  FIRST_HR: { pri: 2, lines: [
    { w: 1, g: 'That\'s the first major league home run of his career!', r: '{Bat} hit the first home run of his major league career' },
  ] },
  HR_MILESTONE: { pri: 2, lines: [
    { w: 1, g: 'That is number {n} on the season for {bat}.', r: 'it was {Bat}\'s {nth} home run of the season' },
    { w: 1, g: 'Home run number {n} this year for {bat}.', r: '{Bat} reached {n} home runs for the season' },
  ] },
  TWO_HR_GAME: { pri: 2, lines: [
    { w: 1, g: 'His second home run of the night!', r: '{Bat} homered twice' },
    { w: 1, g: 'That\'s two for {bat} tonight!', r: '{Bat} hit two home runs' },
  ] },
  THREE_HR_GAME: { pri: 2, lines: [{ w: 1, g: 'Three home runs! What a night for {bat}!', r: '{Bat} hit three home runs' }] },
  CYCLE_WATCH: { pri: 1, lines: [
    { w: 1, g: '{bat} needs a {need} for the cycle.' },
    { w: 1, g: 'A {need} would give {bat} the cycle. The crowd knows it.' },
  ] },
  CYCLE: { pri: 2, lines: [{ w: 1, g: 'He has hit for the cycle! {bat} has done it!', r: '{Bat} hit for the cycle' }] },
  NO_HITTER_WATCH: { pri: 1, lines: [
    { w: 1, g: 'We won\'t say it out loud, but take a look at the hits column for {opp}.' },
    { w: 1, g: '{opp} still have nothing in the hits column. Nobody in the {city} dugout is sitting next to {pit}.' },
    { w: 1, g: 'Into the {inn}, and {opp} are still looking for their first hit.' },
  ] },
  NO_HITTER_BROKEN: { pri: 2, lines: [
    { w: 1, g: 'And there goes the no-hitter. {bat} breaks it up.', r: '{Bat} broke up the no-hit bid in the {inn}' },
    { w: 1, g: 'That\'s the first hit of the night for {city}, and the no-hit bid is over.', r: '{Pit} took a no-hitter into the {inn} before {Bat} singled it away' },
  ] },
  NO_HITTER: { pri: 2, lines: [{ w: 1, g: 'He\'s done it! A no-hitter for {city}!', r: '{city} did not allow a hit' }] },
  PERFECT_WATCH: { pri: 1, lines: [{ w: 1, g: 'Not a single {opp} hitter has reached base tonight.' }, { w: 1, g: '{opp} have sent up {n} hitters, and all {n} have gone back to the dugout.' }] },
  STRIKEOUT_TALLY: { pri: 1, lines: [
    { w: 1, g: 'That is strikeout number {n} for {pit}.', r: '{Pit} struck out {n}' },
    { w: 1, g: '{pit} has {n} strikeouts tonight.', r: '{Pit} piled up {n} strikeouts' },
  ] },
  LATE_LEAD_CHANGE: { pri: 2, lines: [
    { w: 1, g: 'And {city} have the lead in the {inn}!', r: '{city} took the lead late, in the {inn}' },
    { w: 1, g: 'Look at that! {city} are in front, this late in the game!', r: '{city} went ahead in the {inn}' },
  ] },
  LATE_TIE: { pri: 2, lines: [
    { w: 1, g: 'This game is tied again in the {inn}!', r: '{city} tied it in the {inn}' },
    { w: 1, g: 'They\'ve pulled it level! A whole new ball game in the {inn}.', r: '{city} drew level in the {inn}' },
  ] },
  COMEBACK: { pri: 2, lines: [
    { w: 1, g: '{city} were down by {nWord}, and now they lead!', r: '{city} came back from {nWord} runs down' },
    { w: 1, g: 'What a comeback! {city} trailed by {nWord} and they are in front!', r: '{city} overturned a {nWord}-run deficit' },
  ] },
  STREAK_ON_LINE: { pri: 1, lines: [
    { w: 1, g: '{city} have won {nWord} in a row, and that streak is in danger.' },
    { w: 1, g: 'Their {nWord}-game winning streak is on the line now.' },
  ] },
  LOSING_STREAK: { pri: 1, lines: [
    { w: 1, g: '{city} have lost {nWord} straight coming in. They could use a big hit here.' },
    { w: 1, g: 'It has been a tough stretch for {city}: {nWord} losses in a row.' },
  ] },
  BIG_GAME: { pri: 1, lines: [
    { w: 1, g: 'There is a real buzz here tonight. {note}' },
    { w: 1, g: 'A big one tonight. {note}' },
  ] },

  // ---------- what is going wrong ----------
  CONTROL_TROUBLE: { pri: 1, lines: [
    { w: 1, g: '{pit} can\'t find the plate. That\'s {nWord} walks.', r: '{Pit} walked {n}' },
    { w: 1, g: 'He\'s missing high and wide. {pit} has walked {nWord} now.', r: '{Pit} struggled with his control, walking {n}' },
  ] },
  WILD_STREAK: { pri: 1, lines: [{ w: 1, g: 'That\'s {nWord} of his last {m} pitches out of the zone.' }, { w: 1, g: '{pit} has lost the strike zone for the moment.' }] },
  LOSING_VELOCITY: { pri: 1, lines: [
    { w: 1, g: 'That fastball was {mph}. He was throwing {early} in the first.' },
    { w: 1, g: '{pit} has lost a couple of ticks on the fastball. {mph} on that one.' },
  ] },
  SQUARED_UP: { pri: 1, lines: [
    { w: 1, g: '{opp} are squaring {pit} up, {nWord} hits this inning. There should be some movement in the bullpen.', r: '{Pit} was hit hard in the {inn}' },
    { w: 1, g: 'They are all over {pit} in this inning, with {nWord} hits already.', r: '{opp} chased {Pit} with a rally in the {inn}' },
  ] },
  HAS_HIS_NUMBER: { pri: 1, lines: [
    { w: 1, g: '{bat} has his number tonight. That\'s {nWord} hits off {pit}.' },
    { w: 1, g: '{pit} just cannot get {bat} out today.' },
  ] },
  SLOPPY_DEFENCE: { pri: 1, lines: [
    { w: 1, g: 'That\'s error number {n} for {city} tonight. Sloppy baseball.', r: '{city} made {nWord} errors' },
    { w: 1, g: 'Another error. {city} are not helping their pitcher.', r: 'sloppy defence cost {city}, with {nWord} errors' },
  ] },
  TIRED_ARM: { pri: 1, lines: [{ w: 1, g: '{pit} is past {n} pitches and starting to labour.' }, { w: 1, g: 'He\'s running out of gas. That\'s {n} pitches for {pit}.' }] },
};

for (const [id, extra] of Object.entries(MORE)) LINES[id].lines.push(...extra);
