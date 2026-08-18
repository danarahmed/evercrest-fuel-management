import * as esbuild from 'esbuild'
import { cp, mkdir, rm, readFile, writeFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const watch = process.argv.includes('--watch')
const outdir = 'dist'

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })
await cp('public', outdir, { recursive: true })

const shared = {
  entryPoints: ['src/main.jsx'],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  logLevel: 'info',
}

if (watch) {
  // Dev: stable names so the copied index.html (which points at /app.js and
  // /styles.css) keeps working, and rebuilds are instant.
  const ctx = await esbuild.context({ ...shared, outfile: `${outdir}/app.js` })
  await ctx.watch()
  console.log('watching…')
} else {
  // Production: content-hash every asset so a changed bundle gets a new URL.
  // The browser can never serve a stale app.js after a deploy — the filename
  // itself changed, so it is forced to fetch the new one. index.html carries
  // no hash and is always revalidated, and it points at the hashed files.
  await esbuild.build({ ...shared, outfile: `${outdir}/app.js` })

  const jsName = await hashRename(`${outdir}/app.js`, 'app', 'js')
  const cssName = await hashRename(`${outdir}/styles.css`, 'styles', 'css')

  const htmlPath = `${outdir}/index.html`
  let html = await readFile(htmlPath, 'utf8')
  html = html.replace('/app.js', `/${jsName}`).replace('/styles.css', `/${cssName}`)
  await writeFile(htmlPath, html)

  console.log(`  → ${jsName}, ${cssName}`)
}

/** Rename a built file to name-<hash8>.ext and return the new basename. */
async function hashRename(path, name, ext) {
  const bytes = await readFile(path)
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8)
  const out = `${name}-${hash}.${ext}`
  await rename(path, `${outdir}/${out}`)
  return out
}
