// The How to Play tutorial: short lessons for a new player, in the order a first career meets them. Each lesson is
// a title, a line on what it teaches, sections of paragraphs and, for a game in progress, "Show me" buttons that
// open the screen it is talking about. The game's facts (the minimum salary, the dates, the roster sizes) are the
// ones the game itself uses.

const squad = (start) => async () => (await import('./squad-screen.js')).squadScreen((await import('../state.js')).game.orgId, start);
const tx = (tab) => async () => (await import('./transfers-screen.js')).transfersScreen(tab);
const fx = (tab) => async () => (await import('./fixtures-screen.js')).fixturesScreen(tab);
const offseason = async () => (await import('../state.js')).game.phase === 'offseason';

export const LESSONS = [
  {
    id: 'aim', title: 'The aim of the game',
    lead: 'What you are trying to do, and how the game judges you.',
    sections: [
      { h: 'You run the whole club', p: [
        'You are the general manager and the field manager of a major league club at once. The general manager builds the roster: he signs free agents, makes trades, drafts amateurs and decides who goes up and down between the majors and the five minor league levels. The manager picks the lineup and the pitching staff and makes the moves during a game. In this game you do both jobs, although your assistant will do any part of either that you hand him.',
        'The aim is to build a squad that wins, and to keep it winning year after year, inside the money the owner gives you. Anyone can win for one season by spending everything and trading every prospect for veterans. The hard part, and the real game, is having good players arriving from your farm system as the expensive ones get old.',
      ] },
      { h: 'How you are judged', p: [
        'Each winter the owner sets your budget and a short list of goals, such as making the postseason, finishing with a winning record or keeping the payroll inside the budget. His confidence in you rises and falls with results against those goals. If it falls far enough he sacks you, and you look for work with another club from the Jobs screen. A losing season is survivable when the owner asked you to rebuild; overspending the budget seldom is.',
      ] },
    ],
    show: [
      { label: 'The owner and the budget', open: async () => (await import('./finance-screen.js')).financeScreen() },
      { label: 'Your club', open: async () => (await import('./club-screen.js')).clubScreen((await import('../state.js')).game.orgId) },
    ],
  },
  {
    id: 'turn', title: 'Playing a turn',
    lead: 'What Continue does, and what to check each time it stops.',
    sections: [
      { h: 'Continue Game is the turn', p: [
        'There are no fixed turns. The game moves a day at a time when you press Continue Game at the top of the menu, and it keeps going until something needs you: one of your games, a message that wants an answer, a roster that breaks the rules, a deadline or an offer. Under Game Options, When Continue stops, you choose what else should stop it. Press any key to stop it yourself.',
        'So each turn is the same short routine. Continue until it stops, read why it stopped, deal with that, and press Continue again. The Space bar does the next useful thing at each step, so most of a season can be played with one key once you are used to it.',
      ] },
      { h: 'What to look at when it stops', p: [
        'Read the News first. Your assistant, the scouts, the owner, other general managers and the agents all write to you there, and a message usually has a button that opens the screen it is about or makes the move it suggests. Injuries matter most: if a player on the active roster is hurt, Continue will not go on until you have covered for him, either by putting him on the injured list and calling someone up, or by keeping him on purpose.',
        'On a match day the match day screen opens. Check the lineup and who is pitching, then watch the game or take the result. Once a week or so, look at the standings, the Squad screen sorted by form and the Finances screen. Little else needs you every day; most of a season is spent reacting to injuries, slumps and offers, and planning the next winter.',
      ] },
      { h: 'Letting the assistant help', p: [
        'Your assistant can pick lineups, handle waivers and the Rule 5 draft, and keep the roster legal (Game Options, Running the club). If you want to skip ahead, Go on holiday hands him the whole club, and when you come back he writes you a report of what happened. This is a good way to get through a long stretch while you learn, or to skip to the next winter.',
      ] },
    ],
    show: [
      { label: 'The News', open: async () => (await import('./inbox-screen.js')).inboxScreen() },
      { label: 'When Continue stops', open: async () => (await import('./options-screen.js')).optionsScreen('stops') },
    ],
  },
  {
    id: 'baseball', title: 'Baseball in brief',
    lead: 'The rules of the game on the field, for anyone who has not followed it.',
    sections: [
      { h: 'Innings, outs and runs', p: [
        'Two teams of nine take turns to bat and to field. A game has nine innings; in each, both teams bat until the fielding side gets three outs. The team with more runs after nine innings wins, and if the scores are level they play extra innings until one side is ahead at the end of an inning. The home team bats second, so it does not bat in the ninth if it is already winning.',
        'A run scores when a batter goes round all four bases: first, second, third and back to home plate. He can get there in one go with a home run, or in stages, reaching base and being moved round by the hitters after him.',
      ] },
      { h: 'Pitcher against batter', p: [
        'Every play starts with the pitcher throwing to the batter. A pitch in the strike zone that is not hit, or any pitch the batter swings at and misses, is a strike; three strikes and he is out. A pitch outside the zone that he leaves alone is a ball; four balls and he walks to first base. A ball hit into play is caught for an out, thrown to a base ahead of the runner for an out, or falls safely for a hit: a single, double or triple by how many bases he reaches, or a home run if it leaves the park.',
      ] },
      { h: 'The positions', p: [
        'The fielders are the pitcher, the catcher behind the plate, four infielders (first base, second base, shortstop and third base) and three outfielders (left, centre and right field). Shortstop, catcher and centre field are the hardest positions to play, so a good fielder there is worth far more than at first base or in left field. One more player, the designated hitter, bats in the pitcher\'s place and does not field.',
      ] },
      { h: 'Pitchers and their roles', p: [
        'Pitchers tire, so a club needs many of them. Five starters take turns to begin games, each pitching every fifth day or so and lasting five or six innings if he is any good. The relievers in the bullpen finish the games: middle relievers and a long man for the early and middle innings, setup men for the seventh and eighth, and the closer for the ninth when the lead is close. A reliever who pitches several days running gets tired and pitches worse, which is why the bullpen has eight arms.',
      ] },
      { h: 'The long season', p: [
        'Each club plays 162 games from late March to the end of September, nearly every day. The best clubs win about 95 to 100 and the worst lose about as many, so even a champion loses a third of its games and a bad week means little. Twelve clubs go to the postseason in October: the three division winners in each league and three wild cards, playing knockout series that end in the final.',
      ] },
    ],
  },
  {
    id: 'numbers', title: 'Reading the numbers',
    lead: 'The ratings and statistics you will use to judge a player.',
    sections: [
      { h: 'The 20 to 80 scale', p: [
        'Every rating in the game is on the scouts\' 20 to 80 scale. A 50 is an average major leaguer, a 60 a good regular, a 70 a star and an 80 the best in the game. Most minor leaguers are in the 30s and 40s. A player\'s value puts everything about him into one figure on the same scale, so you can compare a shortstop with a relief pitcher. Potential is never a number: your scouts describe it in words, and a poor scout can be wrong.',
      ] },
      { h: 'Hitters', p: [
        'The batting average (AVG) is hits divided by at bats; .300 is very good and .220 is poor. The on-base percentage (OBP) counts walks as well and matters more, since a walk is nearly as good as a single; .340 is good. Slugging (SLG) weighs each hit by its bases, so it measures power, and OPS adds OBP and SLG together, with .800 good and .650 poor. Home runs (HR) and runs batted in (RBI) are the counting numbers people talk about. The game\'s own TBO9+ puts a hitter\'s output against the league, where 100 is average and 120 is 20 per cent better.',
      ] },
      { h: 'Pitchers', p: [
        'The earned run average (ERA) is the runs a pitcher allows per nine innings, not counting those caused by fielding errors; under 3.50 is very good and over 5.00 is poor. WHIP is walks and hits per inning, where 1.10 is very good. Strikeouts (K) and walks (BB) per nine innings say most about how he will do next year, because they depend least on luck and his fielders. TBA9- is the game\'s measure of the bases he allows against the league; for pitchers a lower figure is better, and 80 is 20 per cent better than average.',
      ] },
      { h: 'Small samples lie', p: [
        'A hitter who bats .400 for two weeks or a pitcher with a 1.50 ERA in April has usually been lucky. Judge players on a full season or more, and on the ratings your scouts give them, before you pay or trade for a hot streak.',
      ] },
    ],
    show: [
      { label: 'The Squad screen', open: squad({}) },
      { label: 'League leaders', open: fx('leaders') },
    ],
  },
  {
    id: 'roster', title: 'The roster rules',
    lead: 'The 26-man and 40-man rosters, options and the injured list.',
    sections: [
      { h: 'Two rosters', p: [
        'Twenty-six players are active in the majors at any time, with no more than thirteen pitchers; on 1 September it grows to twenty-eight. Every active player must also be on the 40-man roster, which holds everyone on a major league contract. The rest of your organisation, perhaps a hundred and fifty players, is spread over the five minor league levels on cheap minor league contracts.',
        'A typical active roster is thirteen position players (eight regulars, a designated hitter, a backup catcher and three bench players) and thirteen pitchers (five starters and eight relievers).',
      ] },
      { h: 'Moving players up and down', p: [
        'A player on the 40-man roster can be sent to the minors while he has option years left. Once he is out of options, sending him down means designating him for assignment, and another club can claim him on waivers. Before you add a young player to the 40-man roster, remember that each place is precious, but in the winter you must protect your best prospects there or another club can take them in the Rule 5 draft.',
      ] },
      { h: 'Injuries', p: [
        'A hurt player goes on the 10-day injured list (15 days for pitchers), which frees his active place so you can call up a replacement. The 60-day list frees his 40-man place too, but he must stay out sixty days. The Injury Centre, opened from an injury message or the Injuries screen, makes all of this one decision.',
      ] },
    ],
    show: [
      { label: 'The active roster', open: squad({ level: 'active' }) },
      { label: 'The 40-man roster', open: squad({ level: 'forty' }) },
      { label: 'Injuries', open: async () => (await import('./injuries-screen.js')).injuriesScreen() },
    ],
  },
  {
    id: 'contracts', title: 'How contracts work',
    lead: 'Why a young player is cheap and a veteran is not.',
    sections: [
      { h: 'The first six years', p: [
        'Baseball contracts are not like football transfers. A player who reaches the majors belongs to his club for his first six years of major league service, and for the first three of them he is paid close to the league minimum of $780,000, whatever his ability. A rookie who hits like a star costs you less than a backup catcher. Nobody can buy him from you; you can only trade him.',
        'After about three years he goes to salary arbitration each winter. His pay is then set from what a free agent of his ability would get: roughly a fifth of it in his first arbitration year, rising to about half by the last. The best young players with a little over two years\' service (Super Two) reach arbitration a year early. You can offer any of them a longer contract at any time to fix their pay in advance, and a young star will often take less guaranteed money in return for security.',
      ] },
      { h: 'Free agency', p: [
        'After six years of service, when his contract ends, a player becomes a free agent and any club can sign him. That is where the money is: an average regular asks about $12 million a year, a very good one $25 to 30 million, and a star up to $45 million, for five years or more. Free agents are usually at least 29 or 30, so a long deal pays for his decline years as well as his best ones.',
        'The market opens on 7 November. Until then you can re-sign your own departing players. The best free agents sign around the Winter Meetings in December, and the ones still unsigned in February lower their prices day by day.',
      ] },
      { h: 'Money that does not go away', p: [
        'A contract is guaranteed. If you release a player, you still pay him every dollar he is owed, and it stays on your payroll until the deal ends. A bad six-year contract can sit on your budget long after the player has gone, so think hardest about the last years of any long deal.',
      ] },
    ],
    show: [
      { label: 'Your contracts', open: squad({ level: 'forty', view: 'contracts' }) },
      { label: 'The free agents', open: tx('fa') },
    ],
  },
  {
    id: 'squad', title: 'Building the squad',
    lead: 'A young, cheap core with a few stars paid for out of what it saves.',
    sections: [
      { h: 'The shape of a good club', p: [
        'Because players under club control are so cheap, the best value in the game is a good young player in his first six years. A club full of them can afford to pay two or three stars on top. A club full of free agents in their thirties costs twice as much and gets worse every year. So aim for a mix: most of the roster made up of players you drafted, signed young or traded for before they got expensive, with a few stars bought in free agency or by trade where they make the biggest difference.',
        'Spend the big money where talent is scarce. A great shortstop, catcher, centre fielder or front-of-rotation starter is hard to find; a decent first baseman, corner outfielder or middle reliever is easy and cheap. Relievers in particular change from year to year, so long deals for them are seldom worth it.',
      ] },
      { h: 'The farm system', p: [
        'Your minor league clubs are where the cheap players come from. Look at the Prospects screen and your scouts\' reports, give your best young players a level where they play every day, and bring them up when they are ready rather than when they are hot. A prospect does not have to become a star to be useful: an average regular earning the minimum for three years is worth a great deal to your budget.',
      ] },
      { h: 'When to buy and when to sell', p: [
        'Be honest about where the club is. A contender should trade prospects for the one or two players who push it over the line, before the trade deadline on 31 July. A club that is not going to win should do the opposite: trade its older players with a year or two left on their contracts to contenders for young players, and wait for its own to come through. Halfway clubs that do neither tend to stay halfway.',
        'Watch the age of your stars. Most players peak in their late twenties and decline in their thirties, so a long contract for a 32-year-old is usually a contract for his decline.',
      ] },
    ],
    show: [
      { label: 'Prospects', open: async () => (await import('./prospects-screen.js')).prospectsScreen() },
      { label: 'Squad by age and contract', open: squad({ level: 'forty', view: 'contracts' }) },
      { label: 'Your shortlist', open: tx('short') },
    ],
  },
  {
    id: 'money', title: 'Money and the owner',
    lead: 'The budget, the payroll and the luxury tax.',
    sections: [
      { h: 'The budget', p: [
        'The owner sets a payroll budget each winter from the size of the club\'s market, how the team did and his own style; some owners are generous and some are not. The Finances screen shows the budget against what you have committed, including what arbitration and club options are likely to add. Before you sign anyone, look at the table under the contract terms: it shows what the deal does to every future year.',
        'You can ask the owner for more money from the Finances screen. He is more likely to agree when the team is winning and he trusts you, and asking too often costs you a little with him.',
      ] },
      { h: 'The luxury tax', p: [
        'A club whose payroll goes over the competitive balance tax threshold, $244 million in 2026 and rising about 2 per cent a year, pays a tax on the amount over it, at a higher rate each year it stays over. Most owners will not let you near it.',
      ] },
      { h: 'The rest of the money', p: [
        'Scouting, analytics and coaching come out of their own budgets. Better scouts see prospects more truly and better coaches help players develop. They are small sums next to the payroll, and worth spending. Facilities are the owner\'s: you can ask him to improve the stadium or the training complexes, which bring in money or help players develop, but he seldom agrees unless the club is doing well.',
      ] },
    ],
    show: [
      { label: 'Finances', open: async () => (await import('./finance-screen.js')).financeScreen() },
      { label: 'Salaries', open: async () => (await import('./finance-screen.js')).financeScreen('salaries') },
    ],
  },
  {
    id: 'deals', title: 'Trades, the draft and scouting',
    lead: 'The other ways to get players.',
    sections: [
      { h: 'Trades', p: [
        'Open any player of another club and choose to trade for him, then build an offer on the trade screen. The other general manager answers by message a day or two later, accepting, refusing or asking for something else. Each one values players his own way: a rebuilding club wants young players and prospects, and a contender wants help now. You can add cash, draft picks and a player to be named later, and run separate deals with the same club at the same time.',
      ] },
      { h: 'The draft and international signings', p: [
        'The amateur draft is at the All-Star break in July. The players drafted are years away, but cost little and are the cheapest source of future stars. International amateurs, teenagers from Latin America, are bid for each December and January out of a separate pool of bonus money and sign on 15 January. Neither pays off quickly, and both pay off for a long time.',
      ] },
      { h: 'Scouts', p: [
        'With fog of war on you know nothing about another club\'s minor leaguers until a scout has seen them. Hire the best scouts you can afford, send them to the clubs and regions you care about from the Scouts screen, and put the players they recommend on your shortlist. A scout\'s report on potential is a judgement, and the poorer scouts are wrong more often.',
      ] },
    ],
    show: [
      { label: 'Scouts', open: async () => (await import('./scouting-screen.js')).scoutingScreen() },
      { label: 'The draft', open: tx('draft') },
      { label: 'Trade offers', open: tx('offers') },
    ],
  },
  {
    id: 'year', title: 'The year at a glance',
    lead: 'What happens when, and what you should be doing.',
    sections: [
      { h: 'The winter (November to February)', p: [
        'The game starts on 2 November. Re-sign any of your own free agents you want to keep before the market opens on 7 November, and make qualifying offers to the good ones you will lose. By 1 December decide which arbitration players to keep (the tender deadline) and add the prospects you must protect to the 40-man roster before the Rule 5 draft. The Winter Meetings in the second week of December are the busiest time for signings and trades. Arbitration figures are swapped on 15 January and any case not settled goes to a hearing on 1 February.',
      ] },
      { h: 'Spring Training (late February and March)', p: [
        'Camp opens on 20 February. Use it to settle the last places on the active roster, set the batting lineups against right-handed and left-handed pitchers, the five-man rotation and the bullpen roles. Opening Day is the first Thursday on or after 24 March, and the active roster must be down to twenty-six by then.',
      ] },
      { h: 'The season (April to September)', p: [
        'Most of the season is the daily routine of games, injuries and call-ups. The draft is at the All-Star break in mid-July, and the trade deadline on 31 July is the last chance to buy or sell. On 1 September the active roster grows to twenty-eight, so you can call up a couple of young players for a look.',
      ] },
      { h: 'October', p: [
        'Twelve clubs play in the postseason. Then the season ends, the awards are given out, and on 2 November the next winter begins.',
      ] },
    ],
    show: [
      { label: 'The winter', when: offseason, open: async () => (await import('./winter-screen.js')).winterScreen() },
      { label: 'Fixtures', open: fx('fixtures') },
      { label: 'Standings', open: fx('standings') },
    ],
  },
  {
    id: 'matchday', title: 'Match day',
    lead: 'Setting the team and making moves during a game.',
    sections: [
      { h: 'Before the game', p: [
        'When a game of yours comes round, Continue stops at the match day screen. You set two lineups, one against right-handed starters and one against left-handers, so a hitter who struggles against left-handers can sit on those days. The Tactics screen sets the rotation, the bullpen roles, the depth chart and four team instructions: how aggressive to be on the bases, when to bunt, how quickly to take the starter out and when to walk a batter on purpose.',
      ] },
      { h: 'During the game', p: [
        'Watch the Game tells it pitch by pitch, with the score, the count and the runners on the board and a win chance that moves with each play. Use Tactics in the menu to change pitchers, send up a pinch hitter or runner, or move fielders; the game waits while you decide. Highlights skips the routine at bats. Result Only plays the game at once if you would rather not watch. Your bullpen will thank you for not using the same relievers every day.',
      ] },
    ],
    show: [
      { label: 'Tactics', open: async () => (await import('./club-tactics.js')).clubTactics() },
      { label: 'Pitching staff', open: async () => (await import('./club-tactics.js')).clubTactics('pitching') },
    ],
  },
];
