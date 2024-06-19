import { defineConfig, type UserConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteSingleFile } from 'vite-plugin-singlefile';

const plugins = [
  nodePolyfills({
    // needed for bitcoinjs-lib
    include: ['buffer'],
    globals: {
      Buffer: true,
    },
  }),
];

// "normal" configuration - building for coldcard.com/pushtx
// - creates a one JS and one CSS file
const websiteConfig: UserConfig = {
  plugins,
  build: {
    outDir: 'build',
    rollupOptions: {
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name !== 'index') {
            throw new Error(
              `Build failed. Expected a single JS chunk "index". Saw: "${chunkInfo.name}".`
            );
          }
          return 'pushtx.js';
        },
        assetFileNames: (chunkInfo) => {
          if (chunkInfo.name !== 'index.css') {
            throw new Error(
              `Build failed. Expected a single CSS chunk "index.css". Saw: "${chunkInfo.name}".`
            );
          }
          return 'pushtx.css';
        },
        chunkFileNames: (chunkInfo) => {
          throw new Error(`Build failed. Not expecting any chunk files. Saw: "${chunkInfo.name}".`);
        },
      },
    },
  },
};

// single file config - builds a single HTML file with everything inlined
// can be downloaded from coldcard.com/pushtx to self-host
const singleFileConfig: UserConfig = {
  plugins: [...plugins, viteSingleFile()],
  build: {
    outDir: 'build-single-file',
  },
};

const finalConfig = process.env.PUSHTX_SINGLE_FILE ? singleFileConfig : websiteConfig;

export default defineConfig(finalConfig);
