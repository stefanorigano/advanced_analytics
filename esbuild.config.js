const esbuild = require('esbuild');

// Check if --watch flag is present
const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  loader: {
    '.jsx': 'jsx'
  },
  external: [],
  minify: false,
  sourcemap: false,
  banner: {
    js: '// Advanced Analytics v0.9.1 - Built with esbuild'
  },
  footer: {
    js: '\nif (window.SubwayBuilderAPI) { AdvancedAnalytics.init(); }'
  }
};

async function build() {
  try {
    if (isWatch) {
      // Watch mode - create context for incremental builds
      const ctx = await esbuild.context({
        ...buildOptions,
      });
      
      await ctx.watch();
      
      console.log('[AA] 👀 Watching for changes...');
      console.log('[AA] Press Ctrl+C to stop');
      
      // Keep process alive
      process.on('SIGINT', async () => {
        console.log('\n[AA] Stopping watch mode...');
        await ctx.dispose();
        process.exit(0);
      });
      
    } else {
      // Single build
      await esbuild.build(buildOptions);
      console.log('[AA] ✓ Build complete!');
    }
  } catch (error) {
    console.error('[AA] ❌ Build failed:', error);
    process.exit(1);
  }
}

build();