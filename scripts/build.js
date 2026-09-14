import esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

await esbuild.build({
  entryPoints: ['terminal/app.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'terminal/dist/app.mjs',
  external: [
    // Don't bundle node builtins
    'fs', 'path', 'os', 'http', 'https', 'net', 'readline', 'child_process', 'module', 'events',
  ],
  // Keep node_modules external — they're installed via npm
  packages: 'external',
  // Inline the package version so the bundle doesn't need to reach ../package.json
  define: {
    '__PKG_VERSION__': JSON.stringify(pkg.version),
  },
});

console.log('Built terminal/dist/app.mjs');
