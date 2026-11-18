// Game Options: when Continue stops for you, and saving and loading.
import { h, fill, toast, cmTabs } from './dom.js';
import { setNarrow, toggleWebFullscreen } from './layout.js';
import { nav } from './nav.js';
import { clubMenu } from './menu.js';
import { game, orgState } from '../state.js';
import { refreshStaff } from '../season/roster.js';
import { withProgress } from './progress.js';
import { saveGame, loadGame, listSaves, deleteSave } from '../save.js';
import { downloadSave, importButton } from './save-files.js';

export function optionsScreen(startTab = 'general') {
  const saves = h('div');
  const stops = [
    ['injuries', 'Stop when one of your major league players is hurt', 'Off: you still get the message, and Continue keeps going for a minor injury. A player out for five days or more stops it all the same, until you have placed him on the injured list or chosen to keep him in the Injury Centre.'],
    ['important', 'Stop for important messages', 'Month reviews, roster deadlines, the owner and unhappy players, the end of the season.'],
    ['replies', 'Stop when a club or an agent replies to you', 'A counter proposal, an acceptance or a refusal to a trade offer or contract terms you sent. Off: the reply waits in your inbox and Continue keeps going, so an offer can lapse unseen.'],
    ['winterDays', 'Go a few days at a time in the winter', 'Continue pauses in the off-season whenever something arrives for you, and at least every third day, so you can work the free agent and trade markets. Off: it runs on until an important message.'],
    ['postseason', 'Stop after each postseason series', 'A result and the next matchups, so you can follow October. Your own playoff games stop if you stop for your games.'],
  ];
  const name = h('input', { class: 'cm-input', type: 'text', maxlength: 40, value: game.saveName || `${game.manager} ${game.world.orgs.get(game.orgId).club.name}` });

  async function renderSaves() {
    let list = [];
    try { list = await listSaves(); } catch (e) { fill(saves, h('p', { class: 'cm-r cm-pad' }, `Saves are not available in this browser (${e.message}).`)); return; }
    fill(saves, h('table', { class: 'cm-tbl' }, h('tbody', {}, list.length ? list.map((s) => h('tr', {},
      h('td', { class: 'l y' }, s.name), h('td', { class: 'l' }, s.label), h('td', { class: 'l cm-s' }, new Date(s.savedAt).toLocaleString('en-GB')),
      h('td', {}, h('button', { class: 'cm-btn', onClick: () => load(s.name) }, 'Load'), ' ',
        h('button', { class: 'cm-btn', onClick: () => downloadSave(s.name) }, 'Export'), ' ',
        h('button', { class: 'cm-btn', onClick: async () => { await deleteSave(s.name); toast(`Deleted ${s.name}.`); renderSaves(); } }, 'Delete'))))
      : h('tr', {}, h('td', { class: 'l cm-s' }, 'No saved games yet.')))));
  }

  async function save() {
    const n = name.value.trim();
    if (!n) { toast('Give the save a name.'); return; }
    try {
      await withProgress(`Saving "${n}"`, () => saveGame(n));
      const { inboxScreen } = await import('./inbox-screen.js');
      nav.reset(inboxScreen());
      toast(`Saved as "${n}".`);
    } catch (e) { toast(`Could not save: ${e.message}`); }
  }

  async function load(n) {
    try {
      await withProgress(`Loading "${n}"`, () => loadGame(n));
      const { inboxScreen } = await import('./inbox-screen.js');
      nav.reset(inboxScreen());
      toast(`Loaded "${n}".`);
    } catch (e) { toast(`Could not load: ${e.message}`); }
  }

  const paceRow = h('span', { class: 'btnrow' });
  const drawPace = () => fill(paceRow, [['fast', 'Fast'], ['normal', 'Normal'], ['slow', 'Slow']].map(([k, l]) => h('button', {
    class: `cm-btn${(game.settings.pace || 'normal') === k ? ' go' : ''}`, onClick: () => { game.settings.pace = k; drawPace(); },
  }, l)));
  drawPace();
  const autoRow = h('span', { class: 'btnrow' });
  const drawAuto = () => fill(autoRow, [['stop', 'Every stop'], ['weekly', 'Weekly'], ['off', 'Off']].map(([k, l]) => h('button', {
    class: `cm-btn${(game.settings.autosave ?? 'stop') === k ? ' go' : ''}`, onClick: () => { game.settings.autosave = k; drawAuto(); },
  }, l)));
  drawAuto();
  const diffRow = h('span', { class: 'btnrow' });
  const drawDiff = () => fill(diffRow, [['easy', 'Easier'], ['realistic', 'Realistic'], ['hard', 'Harder']].map(([k, l]) => h('button', {
    class: `cm-btn${(game.settings.difficulty || 'realistic') === k ? ' go' : ''}`, onClick: () => { game.settings.difficulty = k; drawDiff(); },
  }, l)));
  drawDiff();

  renderSaves();

  // ---- the layout: tabs, and on each tab one row per setting with its switch at the right ----
  /** Fill the window or a centred column: a choice for this computer, not the career, so it is kept in the browser's storage. */
  const widthRow = () => {
    const box = h('div', { class: 'btnrow' });
    const draw = () => {
      const narrow = document.documentElement.classList.contains('narrow');
      box.replaceChildren(...[['Fill the window', false], ['Centred column', true]].map(([l, n]) => h('button', { class: `cm-btn${narrow === n ? ' go' : ''}`, onClick: () => { setNarrow(n); draw(); } }, l)));
    };
    draw();
    return box;
  };
  const row = (label, desc, control) => h('div', { class: 'op-row' }, h('div', { class: 'op-text' }, h('div', { class: 'op-label' }, label), desc ? h('div', { class: 'op-desc' }, desc) : null), h('div', { class: 'op-ctl' }, control));
  /** An On / Off switch for a setting. */
  const toggle = (get, set, after) => {
    const b = h('button', { class: 'op-switch', role: 'switch' }, '');
    const draw = () => { const on = !!get(); b.textContent = on ? 'On' : 'Off'; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); };
    b.addEventListener('click', () => { set(!get()); draw(); after?.(); });
    draw();
    return b;
  };
  const stopRows = stops.map(([k, label, desc]) => row(label, desc, toggle(() => game.settings.stops[k], (v) => { game.settings.stops[k] = v; })));
  const club = [
    ['assistantWire', 'Assistant handles waivers and the Rule 5 draft', 'He claims players who would help, protects your best exposed prospects, makes your draft list and clears 40-man places by letting go of clearly weaker players, then tells you by email. Off: you do all of it yourself.'],
    ['followUps', 'Show what to do next after injuries and call-ups', 'After an injured-list move or a call-up, a window says what changed in the lineup and rotation and offers a button to the lineup, the pitching staff or the 40-man screen.'],
    ['explainMoves', 'Explain roster moves before making them', 'Each call-up, demotion, injured list move or designation shows what it will do under the rules, and you confirm it. Off: moves happen at once (you can still undo them until you continue).'],
    ['fog', 'Fog of war', "You see exact attributes for your own players and every major leaguer, and nothing about other clubs' minor leaguers until a scout has looked at them. Off: every present attribute is shown. Potential is never shown either way."],
    ['unsackable', 'Unsackable', 'The owner cannot dismiss you, whatever the results. His confidence in you still moves, but he never gets as far as a warning or the sack.'],
    ['autoPlay', 'Let the assistant run the club', 'The assistant picks the lineups, handles injuries and keeps the roster legal, and Continue does not stop for your games or roster problems. Players you lock on their profile are left alone.'],
  ].map(([k, label, desc]) => row(label, desc, toggle(() => game.settings[k], (v) => { game.settings[k] = v; }, () => {
    if (k === 'autoPlay') { if (game.settings.autoPlay && game.season) refreshStaff(game.world.orgs.get(game.orgId), orgState()); toast(game.settings.autoPlay ? 'Your assistant is running the club.' : 'You are back in charge.'); }
  })));
  const news = [
    ['recaps', 'Game reports and box scores', 'A written report and the full box score after each of your games, filed in the Games tab already read (the Continue bar and the match screen have shown the score).'],
    ['previews', 'Series previews', 'Before each series: the opposition, their form, probable starters and players to watch. Filed in the Games tab.'],
    ['weekly', 'The week in the majors', 'Every Monday: team of the week, the leaders and the division races.'],
    ['scores', 'Scores from your clubs', 'Every day: the result, line score and best players of each of your clubs, from the majors to Single-A.'],
    ['stories', 'Big stories', "A message when one of your players or your club has a big night: a walk-off, a shutout, a big game at the plate."],
    ['form', 'Form and assistant reports', 'A note every few days when a player is hot or cold or a minor leaguer is worth a look, and a fortnightly report from your assistant manager.'],
    ['farm', 'Monthly farm report', 'How your minor league clubs are doing and who is playing well at each level.'],
  ].map(([k, label, desc]) => row(label, desc, toggle(() => game.settings.news?.[k] !== false, (v) => { (game.settings.news ||= {})[k] = v; })));
  const general = [
    row('Continue pace', 'How fast the days go by while you continue. You can stop at any time with the Stop button or any key.', paceRow),
    row('Computer general managers', 'Easier: they make bigger mistakes (overrating their own players, overpaying for a name) and ask a smaller margin. Harder: they are sharper and ask more.', diffRow),
    row('Screen width', 'Fill the window: the screens use the whole width beside the menu. Centred column: they keep to a column in the middle, as before. Kept for this computer, whatever career you play.', widthRow()),
    globalThis.bmDesktop ? row('Full screen', 'F11 does the same.', h('button', { class: 'cm-btn', onClick: () => globalThis.bmDesktop.toggleFullscreen() }, 'Full screen on or off'))
      : document.fullscreenEnabled && !globalThis.Capacitor ? row('Full screen', 'Hides the browser around the game. Swipe from the edge of the screen, or press here again, to get it back.', h('button', { class: 'cm-btn', onClick: () => toggleWebFullscreen() }, 'Full screen on or off')) : null,
  ].filter(Boolean);
  const savePane = [
    row('Save this game', 'Give the save a name. Export keeps a save as a file you can back up or move to another computer.', h('div', { class: 'btnrow' }, name, h('button', { class: 'cm-btn go', onClick: save }, 'Save'), importButton(() => renderSaves()))),
    row('Autosave', 'Two slots for this career, the newest and the one before. Every stop: whenever Continue stops and after each game you play.', autoRow),
    globalThis.bmDesktop ? row('Folders', 'Your saves, data packs and the game log are ordinary files in Documents/Baseball Manager.', h('div', { class: 'btnrow' },
      h('button', { class: 'cm-btn', onClick: () => globalThis.bmDesktop.openSavesFolder() }, 'Saves'),
      h('button', { class: 'cm-btn', onClick: () => globalThis.bmDesktop.openDataFolder() }, 'Data packs'),
      h('button', { class: 'cm-btn', onClick: () => globalThis.bmDesktop.openLogFolder() }, 'Log'))) : null,
    h('div', { class: 'cm-h' }, 'Saved games'), saves,
  ].filter(Boolean);
  const panes = {
    general: () => [h('div', { class: 'cm-h' }, 'Pace and difficulty'), ...general],
    stops: () => [h('div', { class: 'cm-h' }, 'When Continue stops'), h('p', { class: 'op-note' }, 'Continue always stops for your games while you run the club yourself. Switch the assistant on under Running the club if you want them played for you.'), ...stopRows],
    club: () => [h('div', { class: 'cm-h' }, 'Running the club'), ...club,
      row('Go on holiday', 'The assistant runs the club and Continue does not stop for anything until you press a key or click Come back. When you return, a letter says what happened and what is waiting for you.',
        h('button', { class: 'cm-btn', onClick: async () => (await import('./continue.js')).doHoliday() }, 'Go on holiday')),
      row('Holiday stops at the end of each season', 'The holiday ends when the last game is played, so you can read the season in review, and Continue then starts the winter. Off: it carries straight on into the winter and the next season.',
        toggle(() => game.settings.holidayStops !== false, (v) => { game.settings.holidayStops = v; }, () => {}))],
    news: () => [h('div', { class: 'cm-h' }, 'News'), ...news],
    saves: () => [h('div', { class: 'cm-h' }, 'Save and load'), ...savePane],
    photos: () => [photosPanel()],
  };
  const body = h('div', { class: 'cm-panel grow op-pane' });
  let tab = panes[startTab] ? startTab : 'general';
  const draw = () => fill(body, panes[tab]());
  const tabs = cmTabs([{ id: 'general', label: 'General' }, { id: 'stops', label: 'When Continue stops' }, { id: 'club', label: 'Running the club' }, { id: 'news', label: 'News' }, { id: 'saves', label: 'Save and load' }, { id: 'photos', label: 'Photographs' }],
    tab, (id) => { tab = id; draw(); });
  tabs.select(tab);
  draw();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Game Options'), tabs.el, body),
    side: () => clubMenu('options'),
  };
}

/** The photographs behind the screens: where they come from, and how to add your own. */
function photosPanel() {
  const list = h('div', { class: 'cm-pad photo-credits' }, h('p', { class: 'cm-s' }, 'Loading...'));
  fetch('img/photos.json').then((r) => r.json()).then(async ({ photos }) => {
    const have = await Promise.all(photos.map((p) => new Promise((res) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = `img/bg/${p.id}.jpg`; })));
    const n = have.filter(Boolean).length;
    fill(list,
      h('p', {}, n ? `${n} of ${photos.length} historical photographs are installed.` : 'The historical photographs are not installed yet. In Terminal, in the game folder, run:', n < photos.length ? h('code', { class: 'cmd' }, 'node tools/fetch-photos.js') : null),
      h('p', { class: 'cm-s' }, 'All are public domain: published before 1929 and held by the Library of Congress with no known restrictions. Your own team packs go in game/img/packs (see the README there): one folder per club, one picture per screen.'),
      h('table', { class: 'cm-tbl' }, h('tbody', {}, photos.map((p, i) => h('tr', {},
        h('td', { class: 'l' }, have[i] ? p.title : h('span', { class: 'cm-s' }, p.title)), h('td', {}, p.year),
        h('td', { class: 'l cm-s' }, h('a', { href: p.source, target: '_blank', rel: 'noopener' }, 'Library of Congress')))))));
  }).catch(() => fill(list, h('p', { class: 'cm-s' }, 'The list of photographs could not be read.')));
  return h('div', {}, h('div', { class: 'cm-h' }, 'Photographs'), list);
}
