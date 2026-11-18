// Sortable table in the CM style: click a heading to sort by it, click again to reverse.
import { h, fill } from './dom.js';

/**
 * @param {{
 *   cols: {key:string, label:string, get:(row:any)=>any, show?:(row:any)=>any, left?:boolean, title?:string, asc?:boolean}[],
 *   rows: any[], sort?: string, desc?: boolean, rowClass?: (row:any)=>string, onRow?: (row:any)=>void, empty?: string,
 *   limit?: number,
 * }} o
 */
const MEMORY = new Map(); // how each table was last sorted by the player, kept while the game is open
export function sortTable(o) {
  let sortKey = o.sort ?? null;
  let desc = o.desc ?? true;
  // a table with the same columns comes back sorted the way it was left
  const memKey = o.id || o.cols.map((c) => c.key).join(',');
  const kept = MEMORY.get(memKey);
  if (kept && o.cols.some((c) => c.key === kept.key)) { sortKey = kept.key; desc = kept.desc; }
  const wrap = h('div', { class: 'cm-tblwrap' });

  function sorted() {
    const col = o.cols.find((c) => c.key === sortKey);
    if (!col) return o.rows;
    const dir = desc ? -1 : 1;
    return o.rows.slice().sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      if (x == null || x === '') return 1;
      if (y == null || y === '') return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }

  function render() {
    const rows = sorted();
    const shown = o.limit ? rows.slice(0, o.limit) : rows;
    fill(wrap, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, o.cols.map((c) => h('th', {
        class: `${c.left ? 'l' : ''} sortable${c.key === sortKey ? ' sorted' : ''}`, title: c.title || 'Click to sort',
        onClick: () => {
          if (sortKey === c.key) desc = !desc;
          else { sortKey = c.key; desc = !(c.asc ?? c.left); }
          MEMORY.set(memKey, { key: sortKey, desc });
          render();
        },
      }, c.label, c.key === sortKey ? (desc ? ' ▼' : ' ▲') : '')))),
      h('tbody', {}, shown.length ? shown.map((r) => h('tr', {
        class: `${o.onRow ? 'pick' : ''} ${o.rowClass?.(r) || ''}`,
        onClick: o.onRow ? (e) => { if (!e.target.closest('button, select, input')) o.onRow(r); } : null,
      }, o.cols.map((c) => h('td', { class: `${c.left ? 'l' : ''} ${c.cls || ''}` }, c.show ? c.show(r) : c.get(r)))))
        : h('tr', {}, h('td', { class: 'l cm-s', colspan: o.cols.length }, o.empty || 'Nobody here.')))),
    o.limit && rows.length > o.limit ? h('p', { class: 'cm-s cm-pad' }, `Showing ${o.limit} of ${rows.length}. Narrow the search to see the rest.`) : null);
  }
  render();
  return { el: wrap, update(rows) { o.rows = rows; render(); } };
}
