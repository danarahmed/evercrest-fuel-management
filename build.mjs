import * as esbuild from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'

const watch = process.argv.includes('--watch')
const outdir = 'dist'

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })
await cp('public', outdir, { recursive: true })

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/main.jsx'],
  bundle: true,
  outfile: `${outdir}/app.js`,
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
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('watching…')
} else {
  await esbuild.build(options)
}
