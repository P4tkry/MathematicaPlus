const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Check if watch mode is enabled
const isWatch = process.argv.includes('--watch');

// Clean dist folder
if (fs.existsSync('dist')) {
  try {
    fs.rmSync('dist', { recursive: true, force: true, maxRetries: 3 });
  } catch (err) {
    console.warn('Could not remove dist folder, attempting alternative method:', err.message);
    // Try removing files one by one
    const removeDir = (dir) => {
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(file => {
          const curPath = path.join(dir, file);
          if (fs.lstatSync(curPath).isDirectory()) {
            removeDir(curPath);
          } else {
            try { fs.unlinkSync(curPath); } catch (e) { }
          }
        });
        try { fs.rmdirSync(dir); } catch (e) { }
      }
    };
    removeDir('dist');
  }
}
fs.mkdirSync('dist', { recursive: true });

const buildConfig = [
  {
    entryPoints: ['src/background.ts'],
    bundle: true,
    outfile: 'dist/background.js',
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
  },
  {
    entryPoints: ['src/content.ts'],
    bundle: true,
    outfile: 'dist/content.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
    loader: { '.css': 'text' },
  },
  {
    entryPoints: ['src/popup.ts'],
    bundle: true,
    outfile: 'dist/popup.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
  },
];

async function build() {
  if (isWatch) {
    console.log('🔍 Watch mode enabled...');
    const contexts = await Promise.all(
      buildConfig.map(config => esbuild.context(config))
    );
    await Promise.all(contexts.map(ctx => ctx.watch()));
    console.log('👀 Watching for changes...');
  } else {
    buildConfig.forEach(config => {
      esbuild.buildSync(config);
    });
    console.log('✅ Build completed successfully!');
  }

  // Copy HTML files from src
  fs.copyFileSync('src/popup.html', 'dist/popup.html');
  fs.copyFileSync('src/how-to-use.html', 'dist/how-to-use.html');
  
  // Copy logo from src
  if (fs.existsSync('src/logo.png')) {
    fs.copyFileSync('src/logo.png', 'dist/logo.png');
  }

  // Copy manifest and rules
  fs.copyFileSync('manifest.json', 'dist/manifest.json');
  fs.copyFileSync('rules.json', 'dist/rules.json');

  // Copy KaTeX fonts from src
  const katexFontsSrc = path.join('src', 'fonts');
  const katexFontsDest = path.join('dist', 'fonts');
  if (fs.existsSync(katexFontsSrc)) {
    fs.cpSync(katexFontsSrc, katexFontsDest, { recursive: true });
    console.log('📦 KaTeX fonts copied');
  }
}

build().catch(() => process.exit(1));
