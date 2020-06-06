import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy'
import del from 'del'
import replace from '@rollup/plugin-replace';
import { injectManifest } from 'rollup-plugin-workbox'

const staticDir = 'static'
const distDir = 'dist'
const buildDir = `${distDir}/build`
const production = !process.env.ROLLUP_WATCH;
const useDynamicImports = process.env.BUNDLING || production
const shouldPrerender = (typeof process.env.PRERENDER !== 'undefined') ? process.env.PRERENDER : !!production

del.sync(distDir + '/**')

function createConfig({ output, inlineDynamicImports, plugins = [] }) {
  const transform = inlineDynamicImports ? bundledTransform : dynamicTransform

  return {
    inlineDynamicImports,
    input: `src/main.js`,
    output: {
      name: 'app',
      sourcemap: true,
      ...output
    },
    plugins: [
      copy({
        targets: [
          { src: [staticDir + "/*", "!*/(__index.html)"], dest: distDir },
          { src: `${staticDir}/__index.html`, dest: distDir, rename: '__app.html', transform },
        ],
        copyOnce: true,
        flatten: false
      }),
      svelte({
        // enable run-time checks when not in production
        dev: !production,
        hydratable: true,
        // we'll extract any component CSS out into
        // a separate file — better for performance
        css: css => {
          css.write(`${buildDir}/bundle.css`);
        }
      }),

      // If you have external dependencies installed from
      // npm, you'll most likely need these plugins. In
      // some cases you'll need additional configuration —
      // consult the documentation for details:
      // https://github.com/rollup/rollup-plugin-commonjs
      resolve({
        browser: true,
        dedupe: importee => importee === 'svelte' || importee.startsWith('svelte/')
      }),
      commonjs(),


      // If we're building for production (npm run build
      // instead of npm run dev), minify
      production && terser(),

      ...plugins
    ],
    watch: {
      clearScreen: false,
      buildDelay: 100,
    }
  }
}


const bundledConfig = {
  inlineDynamicImports: true,
  output: {
    format: 'iife',
    file: `${buildDir}/bundle.js`
  },
  plugins: [
    !production && serve(),
    !production && livereload(distDir),
    prerender()
  ]
}

const dynamicConfig = {
  inlineDynamicImports: false,
  output: {
    format: 'esm',
    dir: buildDir
  },
  plugins: [
    !production && livereload(distDir),
  ]
}

const serviceWorkerConfig = {
  input: `src/sw.js`,
  output: {
    name: 'service_worker',
    sourcemap: true,
    format: 'iife',
    file: `${distDir}/sw.js`
  },
  plugins: [
    {
      name: 'watch-app',
      buildStart() { this.addWatchFile("dist/build") }
    },
    commonjs(),
    resolve({ browser: true }),
    injectManifest({
      swSrc: `${distDir}/sw.js`,
      swDest: `${distDir}/sw.js`,
      globDirectory: distDir,
      globPatterns: ['**/*.{js,css,svg}', '__app.html'],
      maximumFileSizeToCacheInBytes: 10000000, // 10 MB
    }),
    replace({ 'process.env.NODE_ENV': JSON.stringify('production'), }),
    production && terser(),
  ]
}



const configs = [
  createConfig(bundledConfig),
  useDynamicImports ? createConfig(dynamicConfig) : null,
  serviceWorkerConfig
].filter(Boolean)

export default configs


function serve() {
  let started = false;
  return {
    writeBundle() {
      if (!started) {
        started = true;
        require('child_process').spawn('npm', ['run', 'serve'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          shell: true
        });
      }
    }
  };
}

function prerender() {
  return {
    writeBundle() {
      if (shouldPrerender) {
        require('child_process').spawn('npm', ['run', 'export'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          shell: true
        });
      }
    }
  }
}

function bundledTransform(contents) {
  return contents.toString().replace('__SCRIPT__', `
	<script defer src="/build/bundle.js" ></script>
	`)
}

function dynamicTransform(contents) {
  return contents.toString().replace('__SCRIPT__', `
  <script type="module" defer src="/build/main.js"></script>	
	`)
}
