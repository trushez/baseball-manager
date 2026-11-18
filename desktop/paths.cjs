// Where the desktop game keeps the player's things, outside the install folder (which Steam replaces on every
// update and which ordinary users cannot write to on Windows):
//   Documents/Baseball Manager/Saves        one .bmsave file per saved game
//   Documents/Baseball Manager/Data packs   extra player data (a real-player pack, an edited copy of the data)
//   Documents/Baseball Manager/Logs         game.log, for error reports
const path = require('node:path');
const fs = require('node:fs');

function userPaths(app) {
  const root = path.join(app.getPath('documents'), 'Baseball Manager');
  const p = { root, saves: path.join(root, 'Saves'), packs: path.join(root, 'Data packs'), logs: path.join(root, 'Logs') };
  for (const d of Object.values(p)) fs.mkdirSync(d, { recursive: true });
  const readme = path.join(p.packs, 'README.txt');
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, `Data packs

Put a data pack (.json) in this folder and it appears under Player data on the New Game screen. A pack holds
every player and every club, so picking one replaces the built-in data for that career.

To edit the game's data, copy a pack (or the built-in default.json from the game's install folder) into this
folder under a new name, change any name, stat, grade or contract, and start a new game with it.

A game you have already started always uses the pack it was started with, so keep that file here.
`);
  return p;
}

/** A file name inside a folder, refusing anything that would step outside it. */
function inside(dir, name) {
  const base = path.basename(String(name || ''));
  if (!base || base !== name || base.startsWith('.')) throw new Error(`Not a file name: ${name}`);
  return path.join(dir, base);
}

module.exports = { userPaths, inside };
