// The order of a Debugging level's files in the editor's tabs: the page first, then its entry module, the other modules
// by name, the stylesheets last (the way you would read the app).
const rank = (path: string) => {
  if (path === 'index.html') return 0
  if (path === 'app.js') return 1
  if (/\.m?js$/.test(path)) return 2
  if (path.endsWith('.css')) return 4
  return 3
}

export function fileOrder(paths: readonly string[]): string[] {
  return [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}
