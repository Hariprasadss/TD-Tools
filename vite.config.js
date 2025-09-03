import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import netlify from '@netlify/vite-plugin';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react({
      // React Fast Refresh configuration
      fastRefresh: true,
      // Include .jsx files for Fast Refresh
      include: "**/*.jsx",
      // Babel configuration for better JSX handling
      babel: {
        plugins: [
          // Add any additional babel plugins here if needed
        ]
      }
    }),
    netlify({
      // Netlify Functions configuration
      functionsDir: 'netlify/functions',
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
      
      // External dependencies (if any)
      external: [],
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
    
    // Proxy configuration for API calls during development
    proxy: {
      '/api': {
        target: 'http://localhost:8888', // Netlify Dev server
        changeOrigin: true,
        secure: false,
      },
      '/.netlify/functions': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        secure: false,
      }
    },
    
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
    
    // CSS modules configuration
    modules: {
      generateScopedName: '[name]__[local]___[hash:base64:5]',
      hashPrefix: 'prefix',
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
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@styles': resolve(__dirname, 'src/styles'),
      '@assets': resolve(__dirname, 'src/assets'),
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

  // JSON configuration
  json: {
    namedExports: true,
    stringify: false,
  },

  // Worker configuration
  worker: {
    format: 'es',
    plugins: [],
  },

  // Base URL configuration (useful for subdirectory deployments)
  base: process.env.NODE_ENV === 'production' ? '/' : '/',

  // Public directory
  publicDir: 'public',

  // Clear screen during builds
  clearScreen: false,

  // Log level
  logLevel: 'info',

  // App type (SPA)
  appType: 'spa',
});
