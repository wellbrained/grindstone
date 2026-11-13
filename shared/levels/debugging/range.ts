// Corner Bakery's whole range (chapter 6, Performance): the bigger apps need more than the three products of the order
// page, because a slow page only shows with enough to do. Written into a level's files as plain JavaScript data.

/** id, name, price in euros. The first 24 are the shop's pastries and breads, the rest cakes and the lunch counter. */
export const RANGE: readonly (readonly [id: string, name: string, price: number])[] = [
  ['croissant', 'Butter croissant', 2.4],
  ['pain-au-chocolat', 'Pain au chocolat', 2.8],
  ['almond-croissant', 'Almond croissant', 3.1],
  ['cinnamon-bun', 'Cinnamon bun', 3.2],
  ['cardamom-knot', 'Cardamom knot', 3.3],
  ['apple-turnover', 'Apple turnover', 2.9],
  ['raisin-swirl', 'Raisin swirl', 2.7],
  ['custard-tart', 'Custard tart', 3.4],
  ['lemon-tart', 'Lemon tart', 3.6],
  ['fruit-danish', 'Fruit danish', 3.1],
  ['brioche-bun', 'Brioche bun', 1.9],
  ['morning-bun', 'Morning bun', 2.6],
  ['sourdough', 'Sourdough loaf', 6.5],
  ['rye', 'Rye with seeds', 4.9],
  ['spelt-loaf', 'Spelt loaf', 5.8],
  ['country-loaf', 'Country loaf', 6.2],
  ['wholemeal-tin', 'Wholemeal tin', 4.4],
  ['olive-bread', 'Olive bread', 5.6],
  ['walnut-loaf', 'Walnut loaf', 6.1],
  ['baguette', 'Baguette', 2.2],
  ['ciabatta', 'Ciabatta', 3.3],
  ['focaccia', 'Focaccia', 4.8],
  ['bagel', 'Bagel', 1.6],
  ['pretzel', 'Pretzel', 1.8],
  ['plum-cake', 'Plum cake', 3.9],
  ['carrot-cake', 'Carrot cake', 4.2],
  ['cheesecake', 'Cheesecake', 4.6],
  ['chocolate-cake', 'Chocolate cake', 4.5],
  ['lemon-drizzle', 'Lemon drizzle', 3.8],
  ['banana-bread', 'Banana bread', 3.4],
  ['brownie', 'Brownie', 2.9],
  ['blondie', 'Blondie', 2.9],
  ['flapjack', 'Flapjack', 2.5],
  ['oat-cookie', 'Oat cookie', 1.7],
  ['chocolate-cookie', 'Chocolate cookie', 1.9],
  ['shortbread', 'Shortbread', 2.1],
  ['croque-monsieur', 'Croque monsieur', 4.8],
  ['cheese-scone', 'Cheese scone', 2.6],
  ['spinach-roll', 'Spinach roll', 3.7],
  ['sausage-roll', 'Sausage roll', 3.5],
  ['quiche-slice', 'Quiche slice', 4.4],
  ['pizza-slice', 'Pizza slice', 3.9],
  ['tomato-tart', 'Tomato tart', 4.1],
  ['egg-sandwich', 'Egg sandwich', 4.3],
  ['ham-baguette', 'Ham baguette', 5.2],
  ['hummus-wrap', 'Hummus wrap', 5.1],
  ['soup', 'Soup of the day', 4.9],
  ['wedding-loaf', 'Wedding loaf', 18.5]
]

/** `products.js` with the first `count` products of the range ({ id, name, price } in euros). */
export function productsFile(count: number, comment = '// Today\'s products. Maya updates this list every evening; prices are in euros.'): string {
  const rows = RANGE.slice(0, count).map(([id, name, price]) => `  { id: '${id}', name: '${name}', price: ${price} }`)
  return `${comment}\nexport const products = [\n${rows.join(',\n')}\n]\n`
}
