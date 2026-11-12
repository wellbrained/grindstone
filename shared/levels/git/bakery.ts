// The Corner Bakery website (Maya's bakery; Jonas builds the site with you): the files the Branching chapter starts
// from, so its levels share one project.
import { repo } from '../../git'

export const text = (...lines: string[]) => `${lines.join('\n')}\n`

export const INDEX = text(
  '<!doctype html>',
  '<title>Corner Bakery</title>',
  '<link rel="stylesheet" href="style.css">',
  '<h1>Corner Bakery</h1>',
  '<p>Fresh bread every morning from 7:00. <a href="menu.html">See the menu</a></p>'
)

export const STYLE = text(
  '/* Colours from the shop sign: flour white and crust brown. (Maya) */',
  'body {',
  '  background: #fdf8f0;',
  '  color: #5b3a1e;',
  '}'
)

export const MENU = text(
  '<!-- Menu page. Prices change on Mondays; Maya sends them by email. -->',
  '<h2>Menu</h2>',
  '<ul>',
  '  <li>Sourdough loaf, 4.80</li>',
  '  <li>Croissant, 1.90</li>',
  '  <li>Cinnamon roll, 2.50</li>',
  '</ul>'
)

/** Your unfinished contact form (2.2 Started on the wrong branch and its practice task). */
export const CONTACT_FORM = text(
  '<!-- Contact form. Maya wants name, email and a message.',
  '     Sending is wired up later (Jonas, see TODO below). -->',
  '<form id="contact">',
  '  <label>Name <input name="name" required></label>',
  '  <label>Email <input name="email" type="email" required></label>',
  '  <label>Message <textarea name="message"></textarea></label>',
  '  <!-- TODO (Jonas): post to /api/contact -->',
  '</form>'
)

/** A repository with Maya's first commit of the website, on main. */
export const bakerySite = () => repo()
  .file('index.html', INDEX)
  .file('style.css', STYLE)
  .file('menu.html', MENU)
  .commit('Start the bakery website', { author: 'Maya' })
