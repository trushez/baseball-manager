// "Stats by Sports4Cast": the credit shown wherever the game shows statistics. The logo is game/img/sports4cast.png
// (drop the file in); until it is there, or if it fails to load, the name is shown as text.
import { h } from './dom.js';

const URL_ = 'https://sports4cast.com';

/** A small credit line with the Sports4Cast logo and a link to the site. */
export function dataCredit(text = 'Statistics and models by') {
  const word = h('span', { class: 'credit-word' }, 'Sports4Cast');
  const logo = h('img', { class: 'credit-logo', src: 'img/sports4cast.png', alt: 'Sports4Cast' });
  logo.addEventListener('error', () => logo.replaceWith(word));
  return h('div', { class: 'data-credit' }, h('span', { class: 'cm-s' }, `${text} `),
    h('a', { href: URL_, target: '_blank', rel: 'noopener', title: 'sports4cast.com' }, logo));
}
