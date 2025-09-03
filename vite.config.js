import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react({
      // React Fast Refresh configuration
      fastRefresh: true,
      // Include .jsx files for Fast Refresh
      include: "**/*.jsx"
    })
  ],
  
  // Build configuration
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: process.env.NODE_ENV === 'development',
    minify: 'terser',
    target: 'esnext',
    cssCodeSplit: true,
    
    // Terser options for better minification
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false,
      },
    },
    
    // Rollup options for advanced bundling
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // Vendor chunk for React and React DOM
          vendor: ['react', 'react-dom'],
          // UI components chunk
          ui: ['lucide-react'],
        },
        
        // Asset naming for better caching
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          let extType = info[info.length - 1];
          
          if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/i.test(assetInfo.name)) {
            extType = 'media';
          } else if (/\.(png|jpe?g|gif|svg|webp|avif)(\?.*)?$/i.test(assetInfo.name)) {
            extType = 'images';
          } else if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(assetInfo.name)) {
            extType = 'fonts';
          }
          
          return `${extType}/[name]-[hash][extname]`;
        },
        
        // Chunk naming for better caching
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
    
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000,
    
    // Asset inlining threshold
    assetsInlineLimit: 4096,
  },

  // Development server configuration
  server: {
    port: 3000,
    open: true,
    host: true, // Listen on all addresses
    cors: true,
    
    // HMR configuration
    hmr: {
      overlay: true,
      clientPort: 3000,
    },
    
    // Watch options
    watch: {
      usePolling: false,
      interval: 100,
    },
  },

  // Preview server configuration (for production builds)
  preview: {
    port: 3001,
    open: true,
    host: true,
    cors: true,
  },

  // CSS configuration
  css: {
    devSourcemap: true,
    
    // PostCSS configuration
    postcss: {
      plugins: [],
    },
  },

  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'lucide-react',
    ],
    exclude: [],
    
    // ESBuild options for dependency optimization
    esbuildOptions: {
      target: 'esnext',
      jsx: 'automatic',
    },
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src'),
      '@components': resolve(process.cwd(), 'src/components'),
      '@utils': resolve(process.cwd(), 'src/utils'),
      '@styles': resolve(process.cwd(), 'src/styles'),
      '@assets': resolve(process.cwd(), 'src/assets'),
    },
    
    // File extensions to resolve
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json'],
  },

  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __DEV__: process.env.NODE_ENV === 'development',
    __PROD__: process.env.NODE_ENV === 'production',
  },

  // Environment variables configuration
  envPrefix: 'VITE_',

  // Base URL configuration
  base: '/',

  // Public directory
  publicDir: 'public',

  // Clear screen during builds
  clearScreen: false,

  // Log level
  logLevel: 'info',
});
