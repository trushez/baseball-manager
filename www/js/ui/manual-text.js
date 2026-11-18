// The manual shown in the game (Game Options > Manual). One list of chapters, each a title and sections of
// paragraphs. Written in the game's own voice: plain sentences, the rules as the game applies them.

export const MANUAL = [
  {
    id: 'start', title: 'Getting started',
    sections: [
      { h: 'What the game is', p: [
        'You are the general manager and the manager of a major league club at the same time. You build the roster, sign and trade players, set the lineups and the pitching staff, and decide how much of each game you want to run yourself. The owner judges you on results against the goals he sets each winter, and he can let you go.',
        'Everything you see is worked out from the players\' ratings and what happens on the field. Nothing is scripted, and the computer clubs play by the same rules you do.',
        'If you are new to the game or to baseball, start with How to Play, on the title screen and under Game Options. Its short lessons cover what to do each time Continue stops, the rules on the field, the roster rules, contracts and the money, and how to build a squad; during a career it opens with a page on what your own club needs at that point of the year.',
      ] },
      { h: 'A new game', p: [
        'Choose New Game on the title screen, give your name and a playing background (it sets how much reputation you start with), pick a club and the data you want to play with. The game comes with a world of invented players; a data pack in the Data packs folder can hold another, such as real players and clubs. The game starts on 2 November, at the beginning of the winter, so the first thing you do is shape the roster for the season ahead.',
        'Fog of war is on by default. You see exact figures for your own organisation and for every major leaguer, and nothing about other clubs\' minor leaguers until one of your scouts has looked at them. It can be switched off under Game Options, Running the club.',
      ] },
      { h: 'The screen', p: [
        'The menu on the left is the same on every screen. Continue Game moves the calendar on. Your name opens the News. The club button opens your club\'s screens: Overview, Squad, Tactics, Fixtures, Finances and Staff. MLB holds the standings, leaderboards, league stats, history and jobs. Transfers holds free agents, waivers, the Rule 5 draft, the amateur draft, international signings, the transfer list, offers made to you and the history of moves. Scouting holds your shortlist, prospects, scouts and analytics. Find searches every player in the game, and Clubs lists every club.',
        'Any player\'s name and any club\'s name can be clicked to open its page. The arrows under the date go back and forward through the screens you have visited, and Back at the foot of the screen does the same.',
      ] },
    ],
  },
  {
    id: 'time', title: 'Time, Continue and the News',
    sections: [
      { h: 'Continue', p: [
        'Continue Game plays the days. A bar shows the date as it moves, your results as they come in and the biggest stories around the league. It stops by itself when something needs you: a game of yours, a roster that breaks the rules, a deadline, an offer, or whatever you have chosen under Game Options, When Continue stops. Press Stop or any key to stop it yourself.',
        'If news has arrived that you have not been shown, the first press of Continue opens the News instead, and the next one carries on.',
      ] },
      { h: 'The News', p: [
        'Every message the game sends you is in the News, newest first, under five tabs: All, Club, Injuries, Games and League. The open message is shown underneath the list, with buttons for whatever it is about: answering an offer, opening the talks, making a roster move or going to the right screen. What you do from a message is written into it, so you can see later what you decided.',
        'Routine items are filed already read and are kept out of the All tab: the result and box score of each of your games and each series preview (in Games), and the daily scores of your minor league clubs. Other clubs\' games are not sent to you; their big moments appear in the weekly recap and the standings. Under Game Options, News, you can switch each kind of message off.',
      ] },
      { h: 'The Space bar', p: [
        'The Space bar does the next useful thing, so a season can be played with one key. It reads the next unread message; with none left it continues; on a match day it starts the game; during a game it pauses and resumes; and once the game is over it continues.',
      ] },
      { h: 'Holiday', p: [
        'Go on holiday, under Game Options, Running the club, hands the club to your assistant. He picks the lineups, handles injuries, call-ups and the draft and keeps the roster legal, but he re-signs nobody. Continue then runs without stopping until you press a key or Come back. When you return, a letter fills you in: the record while you were away and where the club stands now, who is hitting and pitching well and who is not, who went to the injured list from the active roster and when they are due back, who else came and went, and what is waiting for an answer. The holiday stops at the end of each season unless you switch that off.',
        'You can also let the assistant run the club all the time with Let the assistant run the club. Continue then plays your games for you.',
      ] },
    ],
  },
  {
    id: 'roster', title: 'The roster rules',
    sections: [
      { h: 'The active roster and the 40-man roster', p: [
        'Twenty-six players are active in the majors, with no more than thirteen pitchers. From 1 September the active roster grows to twenty-eight, with up to fourteen pitchers. Every active player must be on the 40-man roster, which holds the players under major league contracts, active or not.',
        'Below the majors your organisation has five levels: Triple-A, Double-A, High-A, Single-A and the Rookie complex. Players there who are not on the 40-man roster are on minor league contracts and cost almost nothing.',
      ] },
      { h: 'Options', p: [
        'A player on the 40-man roster can be sent to the minors and called up again freely while he has options left. He has three option years; the first time he goes down in a season one is used, and further moves that season are free. A player out of options must be designated for assignment to send him down, and another club can then claim him.',
      ] },
      { h: 'The injured list', p: [
        'Hurt hitters go on the 10-day list and hurt pitchers on the 15-day list. Either way they stay on the 40-man roster and free an active place. The 60-day list takes a player off the 40-man count as well, which makes room for someone else, but he must stay out sixty days from when he first went on. From 1 August the 60-day list would end his season, so it cannot be used.',
        'A player who recovers usually goes to a farm club on a rehab assignment to play himself back. He can be activated once his minimum stay is served, but until he has played a few games he is rusty. The Injury Centre, opened from the injury message, does the whole job in one place: who goes on which list, who comes up, and what changes in the lineup and the rotation.',
      ] },
      { h: 'Designation, waivers and release', p: [
        'Designating a player for assignment takes him off the 40-man roster at once. A week later he goes on waivers: the club with the worst record that has room and a use for him claims him; if nobody does he stays in your organisation off the 40-man roster. Releasing a player ends his contract but not the money you owe him, which stays on your payroll.',
        'Your assistant can handle waiver claims and the Rule 5 draft for you (Game Options, Running the club). Every move you make can be undone until you press Continue.',
      ] },
    ],
  },
  {
    id: 'tactics', title: 'Lineups, the pitching staff and tactics',
    sections: [
      { h: 'Lineups', p: [
        'You set two batting lineups, one against right-handed starters and one against left-handers, with a position for each player and a designated hitter. The Team view on the Squad screen shows both and lets you move a player to any position with one click; Tactics has the same lineups in full with every player\'s ratings against that hand. The Assistant\'s lineup button fills one in for you.',
        'A lock beside a lineup stops the assistant changing it. Without the lock he repairs a lineup that has become impossible, for instance when a player is hurt, and tells you what he changed.',
      ] },
      { h: 'The depth chart', p: [
        'The depth chart says who comes in at each position when the starter rests or is replaced late in a game, and who the bench options are for pinch hitting and running.',
      ] },
      { h: 'The pitching staff', p: [
        'The rotation is five starters in order. The bullpen has roles: closer, setup man, matchup arm, middle relief and long relief. The game picks the reliever for each situation from these roles and from how tired each arm is. Pitchers who have thrown a lot in recent days are marked tired or exhausted and pitch worse.',
      ] },
      { h: 'Team instructions', p: [
        'Four instructions set how the club plays: baserunning (conservative, normal or aggressive), sacrifice bunts (never, late and close, or often), the starter\'s hook (quick, normal or long) and intentional walks (never, rarely or freely).',
      ] },
    ],
  },
  {
    id: 'match', title: 'Match day and the live game',
    sections: [
      { h: 'Match day', p: [
        'On the day of a game Continue stops at the match day screen: the two clubs, the probable starters, the weather and the park. From there you can change the lineup, the pitching staff or the depth chart, then Watch the Game or take the Result Only. Result Only plays the game at once and opens the box score.',
      ] },
      { h: 'Watching', p: [
        'The game is told in commentary, a line at a time, with the count, the bases and the score kept on the board. The tabs show the match overview, the match stats, the box score and the play by play. The menu on the left pauses and resumes the game, opens your tactics and the other club\'s lineup, changes the commentary speed, switches Highlights on or off, and skips half an inning or to the end.',
        'Highlights shows only the moments that matter: runs, big hits, double plays, chances with men on, and late close spots, each opened with the inning, the score, the outs and the runners. Your own decisions are never skipped.',
      ] },
      { h: 'Changes during the game', p: [
        'Tactics during a game has four tabs: a pitching change, pinch hitters and runners, defensive changes and instructions. The game pauses while you are there, and whatever you confirm happens before the next pitch. The Pitching Change tab lists both clubs\' pitchers used so far with their lines.',
      ] },
    ],
  },
  {
    id: 'players', title: 'Reading a player',
    sections: [
      { h: 'Ratings', p: [
        'Players are rated on the scouts\' 20 to 80 scale, where 50 is an average major leaguer, 60 is a good regular, 70 is a star and 80 is the best in the game. Hitters have contact, power, gap power, eye, avoiding strikeouts and how they handle fastballs and breaking balls, along with speed, baserunning and fielding at each position. Pitchers have stuff, movement, control, velocity, stamina and a grade for each pitch they throw.',
        'Potential is never shown as a number. Your scouts describe it in words, and their reports can be wrong, the more so the weaker the scout. Players develop with age, playing time, coaching and their own make-up; most peak in their late twenties and decline in their thirties.',
      ] },
      { h: 'TBO9+ and TBA9-', p: [
        'Each player\'s headline figure is a measure of the bases he produces or allows. TBO9 is the bases a hitter produces in a game (singles, doubles, triples and home runs by their bases, plus walks and steals). TBA9 is the bases a pitcher allows per nine innings. TBO9+ and TBA9- set each against the league that season, so 100 is average; a TBO9+ of 120 is 20 per cent better than average, and for pitchers a lower TBA9- is better.',
      ] },
      { h: 'Value and form', p: [
        'A player\'s value puts everything about him on one 20 to 80 scale, so a shortstop can be compared with a reliever. Clubs use it for trades, contracts and waiver claims. Form is how he has played over the last couple of weeks, shown on his page and mentioned by your assistant when it is worth knowing.',
      ] },
    ],
  },
  {
    id: 'contracts', title: 'Contracts and free agency',
    sections: [
      { h: 'Where a player stands', p: [
        'A young player is club controlled until he has six years of major league service. For his first years he is paid close to the minimum; then he goes to salary arbitration each winter. The top fifth or so of players with two to three years of service (Super Two) reach arbitration a year early and have four arbitration years. After six years he becomes a free agent when his contract ends. Players signed from the leagues of Japan and Korea are free agents when their contracts end, whatever their service.',
      ] },
      { h: 'Arbitration', p: [
        'On the tender deadline, 1 December, each club decides which arbitration cases to keep. On 15 January the two sides file salary figures, and you can settle each case from the winter screen. Cases still open on 1 February go to a hearing.',
      ] },
      { h: 'Free agency', p: [
        'Your own free agents can be re-signed until 7 November; then the market opens and any club can talk to any free agent. Each day some players sign, more of them around the Winter Meetings in the second week of December. When another club is close to a deal you are told, and you have a day or two to make your offer. From February the players nobody wants take minor league deals, and the asking prices of the better ones still unsigned fall day by day into the season.',
        'Before the market opens a club can make a departing free agent a qualifying offer: one year at the average of the 125 highest salaries in the game. If he refuses and signs elsewhere, his old club receives a compensation pick after the first round of the draft and the signing club loses its second-round pick.',
      ] },
      { h: 'Negotiating', p: [
        'A contract has the years, the salary, a signing bonus, deferred pay (a share of each salary paid in five instalments after the deal ends), an option year (club, player or mutual), an opt-out and a no-trade clause. You can also make a case to the player: promise him an everyday role, point to the club\'s chances, the city or your own record. A promise you break costs you with him later.',
        'Every offer goes to the agent, who answers after a day or two, accepting, turning it down or coming back with terms of his own. Each agent has his own way of talking and his own patience. The table under the terms shows what the deal does to your payroll each year against the owner\'s budget. Nothing is signed until you confirm the deal on the summary that follows.',
      ] },
    ],
  },
  {
    id: 'trades', title: 'Trades',
    sections: [
      { h: 'How clubs value players', p: [
        'Every club values a player by what he is expected to give over his contract, less what he is paid, seen through that club\'s own scouting, so the computer general managers misjudge players just as you can. Clubs that are selling want young players and picks; contenders want help now. A pile of ordinary players does not buy a star: each extra piece counts for less and costs the other club a roster place.',
      ] },
      { h: 'Making a trade', p: [
        'On the trade screen choose a club and the players you want and are willing to give. Draft picks (the next three drafts) and cash can be added, and a player to be named later can be owed by either side. Ask what it would take and the other general manager tells you; make the offer and he answers after a short while, agreeing, turning it down or countering. An agreed trade is only done when you confirm it on the summary that follows.',
        'A player with a full no-trade clause cannot be traded without his consent, and a player with ten years in the majors and five with his present club has the same right.',
      ] },
      { h: 'Offers and the deadline', p: [
        'Other clubs make offers for your players. They arrive in the News and under Transfers, Offers, and stay open for a few days. The trade deadline is 31 July. Continue stops on the morning of deadline day, where the clock runs from nine to four while your assistant talks through the club and other clubs make their deals and ring you. After the deadline no trades are possible until the World Series is over.',
      ] },
    ],
  },
  {
    id: 'amateurs', title: 'The draft, international players and the Rule 5 draft',
    sections: [
      { h: 'The amateur draft', p: [
        'The draft runs by itself at the All-Star break: 20 rounds, the worst record picking first, with a lottery among the worst clubs for the first six picks. You set the strategy (what kind of player and how much to pay over the slot) and your scouts\' board decides the picks. High school players are younger, further away and have the higher ceilings; college players are nearer the finished article. Signed picks join Single-A.',
      ] },
      { h: 'International amateurs', p: [
        'Each December a class of teenage prospects becomes available. From 1 December to 14 January you bid a signing bonus for the ones you want, from your international pool. On 15 January each signs with the best offer and joins the Rookie level.',
      ] },
      { h: 'The Rule 5 draft', p: [
        'A minor leaguer who has been in professional baseball long enough and is not on his club\'s 40-man roster can be taken by another club in the Rule 5 draft in December. Clubs protect their best eligible players by adding them to the 40-man roster by 1 December. A club that takes a player must keep him on its active roster all season or offer him back.',
      ] },
    ],
  },
  {
    id: 'scouting', title: 'Scouting and analytics',
    sections: [
      { h: 'Scouts', p: [
        'You can employ up to eight scouts, each on a contract of one to three years. Each has a hidden ability for judging present attributes and another for judging potential, and files reports that are wrong by a random amount, less wrong the better the scout. Reports go out of date as players develop. A top scout will not join a small club, and releasing one early leaves the rest of his wages on your books.',
        'From the Scouts screen you can send a scout to look at one player (his report comes within days), on a month-long search for a kind of player, or to cover a country for a year. The Hub tab shows what needs your attention: idle scouts, contracts ending, finds you are about to lose and the latest reports.',
      ] },
      { h: 'Analytics', p: [
        'The analytics department is set on the Analytics screen with its own budget. It narrows every scout\'s error by up to a fifth, speeds the growth of players still improving by up to 7 per cent and slows decline by up to 5 per cent. Returns flatten after the third level while the cost does not. A large department can annoy a careful owner and some veterans, and a rival can hire away its head.',
      ] },
    ],
  },
  {
    id: 'staff', title: 'Staff and coaching',
    sections: [
      { h: 'Your staff', p: [
        'Your staff is a hitting coach, a pitching coach, a fitness coach, a defence coach, a mental coach, a development director and a head physician, together with a development level for the minors and up to six players on a training focus. All of it comes out of the staff budget.',
        'The hitting and pitching coaches help their players improve and tilt the improvement towards their specialty. The fitness coach keeps players healthier and slows the decline of older ones. The defence coach improves fielding at every age. The mental coach lifts the clubhouse a little and helps a pitcher who has lost his control find it again. The development director sets how fast players below the majors develop. The head physician shortens injuries and makes the medical reports more reliable.',
      ] },
      { h: 'What the figures mean', p: [
        'Each coach has an overall rating, a Young figure (how well he works with players of 24 and under), a Vets figure (31 and over) and a Motiv figure (how much he lifts the clubhouse). Styles matter too: an old-school coach keeps the clubhouse steady but dislikes a big analytics department, a modern one gets more from good analytics, and a players\' coach keeps the dressing room happier.',
        'A training focus moves where a player\'s improvement goes, not how much of it there is.',
      ] },
    ],
  },
  {
    id: 'money', title: 'Money and the owner',
    sections: [
      { h: 'The budget', p: [
        'Each winter the owner sets the payroll budget for the coming season. It starts from last year\'s, rises with winning and with postseason runs, falls with losing, and is pulled towards what the club\'s market can carry; it moves by no more than about a tenth either way in a year. The budget covers player contracts and money still owed to players who have gone. Separate lines pay for scouting, analytics and training.',
        'The owner is a big spender, balanced or careful with money, and that colours everything: how far past the luxury tax line he will go, how he reacts to losing and how much he gives when you ask for more. On the Finances screen you can ask him for more money in any line, or move unspent money from one line to another for the season.',
      ] },
      { h: 'His goals and his confidence', p: [
        'With the budget come the season\'s goals, such as reaching the postseason or keeping the payroll inside the budget. His confidence in you moves with results set against those goals, with notable series, long losing runs and the way you handle the money. If it falls far enough he grumbles, then gives you a public vote of confidence, then sets you a date to turn things round, and then lets you go. If the payroll runs well over the budget he either lets it stand and thinks less of you, or sets a date to get back under it.',
        'Out of work, the days still pass. Vacancies appear under MLB, Jobs, and clubs may approach you. Unsackable, under Game Options, stops the owner dismissing you.',
      ] },
    ],
  },
  {
    id: 'calendar', title: 'The calendar',
    sections: [
      { h: 'The season', p: [
        'Spring Training opens on 20 February, one day per Continue, with its games played. Opening Day is the first Thursday on or after 24 March. The All-Star break comes in mid July with the draft. The trade deadline is 31 July. From 1 September rosters grow to twenty-eight. The postseason starts in October: wild card series, division series, league championship series and the World Series.',
      ] },
      { h: 'The winter', p: [
        'The winter opens on 2 November, when options and opt-outs are settled and you have a few days alone with your own free agents. Free agency opens on 7 November. The tender deadline and the Rule 5 protection deadline are 1 December, the Winter Meetings in the second week of December with the Rule 5 draft at their end, arbitration figures are filed on 15 January and hearings are held on 1 February. The winter screen gathers what needs doing. Spring Training opens again on 20 February.',
      ] },
    ],
  },
  {
    id: 'history', title: 'History and records',
    sections: [
      { h: 'The season in review', p: [
        'When your season ends the season in review opens by itself. Its first tab is the Season Story, a written account of your club\'s year from the winter moves to the last game, kept for every season you play. The other tabs hold the overview, the standings, the postseason, the leaders and awards, and every one of your players\' season lines.',
      ] },
      { h: 'History', p: [
        'History, under MLB, opens on your legacy: your seasons, record, titles and awards, your best and worst seasons, your draft picks still playing and your best and worst trades. It also holds every season\'s champions, the record books and each club\'s history, with careers counted in full from the real players\' debuts.',
      ] },
    ],
  },
  {
    id: 'options', title: 'Saving, options and keys',
    sections: [
      { h: 'Saving', p: [
        'Save from Game Options, Save and load, under any name. The game also autosaves whenever Continue stops and after each game you play, into two slots for each career: the newest and the one before. In the desktop game saves are files in Documents/Baseball Manager/Saves, and Export makes a copy you can back up or move. If something goes wrong a box offers a report to copy, and autosave pauses until you save or load so a bad state never replaces a good save.',
      ] },
      { h: 'Options', p: [
        'General sets the pace of Continue and how sharp the computer general managers are. When Continue stops chooses what it stops for. Running the club holds the assistant, fog of war, unsackable and holiday. News switches each kind of message on or off. Photographs chooses the pictures behind the screens.',
      ] },
      { h: 'Keys', p: [
        'Space does the next useful thing (see Time, Continue and the News). Escape closes a box or a list. In the desktop game F11 switches full screen on and off.',
      ] },
    ],
  },
];
