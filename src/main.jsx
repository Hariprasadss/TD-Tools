import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Lazy load the main component for better performance
const ApolloEnrichmentStudio = React.lazy(() => 
  import('./ApolloEnrichmentStudio.jsx').catch(error => {
    console.error('Failed to load ApolloEnrichmentStudio component:', error);
    // Return a fallback component in case of import failure
    return {
      default: () => (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">Module Loading Failed</h1>
            <p className="text-gray-400 mb-4">
              Failed to load the main application component.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      )
    };
  })
);

// Enhanced Error Boundary with better error reporting
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error) {
    // Generate a unique error ID for tracking
    const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    return { 
      hasError: true, 
      error,
      errorId
    };
  }

  componentDidCatch(error, errorInfo) {
    // Enhanced error logging
    const errorDetails = {
      error: error.toString(),
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      errorId: this.state.errorId
    };

    console.group('🚨 Apollo Enrichment Studio Error');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Full Details:', errorDetails);
    console.groupEnd();

    this.setState({ errorInfo });

    // In production, you might want to send this to an error reporting service
    // reportError(errorDetails);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    });
  };

  render() {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center text-white p-6">
          <div className="max-w-2xl w-full">
            {/* Error Icon */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <span className="text-4xl">⚠️</span>
              </div>
              <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-red-400 to-pink-400 bg-clip-text text-transparent">
                Something went wrong
              </h1>
              <p className="text-gray-400 text-lg">
                Apollo Enrichment Studio encountered an unexpected error
              </p>
            </div>

            {/* Error Actions */}
            <div className="bg-slate-800/70 backdrop-blur-sm border border-slate-600/50 rounded-2xl p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={this.handleReload}
                  className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors font-medium"
                >
                  <span>🔄</span>
                  <span>Reload Application</span>
                </button>
                <button
                  onClick={this.handleReset}
                  className="flex items-center justify-center space-x-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors font-medium"
                >
                  <span>↩️</span>
                  <span>Reset Component</span>
                </button>
              </div>
            </div>

            {/* Error Details (Development) */}
            {isDevelopment && this.state.error && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-red-400 mb-3 flex items-center">
                  <span className="mr-2">🐛</span>
                  Development Error Details
                </h3>
                <div className="space-y-3 text-sm font-mono">
                  <div>
                    <span className="text-red-400 font-semibold">Error:</span>
                    <div className="bg-slate-900/50 p-3 rounded-lg mt-1 text-red-300">
                      {this.state.error.toString()}
                    </div>
                  </div>
                  {this.state.error.stack && (
                    <div>
                      <span className="text-red-400 font-semibold">Stack Trace:</span>
                      <div className="bg-slate-900/50 p-3 rounded-lg mt-1 text-red-300 overflow-auto max-h-48">
                        <pre className="text-xs whitespace-pre-wrap">
                          {this.state.error.stack}
                        </pre>
                      </div>
                    </div>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <span className="text-red-400 font-semibold">Component Stack:</span>
                      <div className="bg-slate-900/50 p-3 rounded-lg mt-1 text-red-300 overflow-auto max-h-48">
                        <pre className="text-xs whitespace-pre-wrap">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error ID (Production) */}
            {!isDevelopment && this.state.errorId && (
              <div className="text-center">
                <p className="text-gray-500 text-sm">
                  Error ID: <code className="bg-slate-800 px-2 py-1 rounded">{this.state.errorId}</code>
                </p>
                <p className="text-gray-600 text-xs mt-2">
                  Please include this ID when reporting the issue
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Enhanced Loading Fallback Component
const LoadingFallback = () => (
  <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
    <div className="text-center">
      {/* Animated Logo */}
      <div className="w-16 h-16 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center mx-auto mb-6 animate-pulse">
        <svg 
          className="w-8 h-8 text-white" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      
      {/* Loading Spinner */}
      <div className="loading-spinner mx-auto mb-4"></div>
      
      {/* Loading Text */}
      <h2 className="text-xl font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
        Loading Apollo Enrichment Studio
      </h2>
      <p className="text-gray-400 text-sm animate-pulse">
        Preparing your contact enrichment platform...
      </p>
      
      {/* Loading Progress Animation */}
      <div className="mt-6 w-64 mx-auto">
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse" style={{width: '60%'}}></div>
        </div>
      </div>
    </div>
  </div>
);

// Performance monitoring
const logPerformance = () => {
  if ('performance' in window && 'getEntriesByType' in performance) {
    setTimeout(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      
      if (navigation) {
        console.group('📊 Performance Metrics');
        console.log('🚀 Total Load Time:', Math.round(navigation.loadEventEnd - navigation.fetchStart) + 'ms');
        console.log('⚡ DOM Ready:', Math.round(navigation.domContentLoadedEventEnd - navigation.fetchStart) + 'ms');
        console.log('🎨 First Paint:', paint[0] ? Math.round(paint[0].startTime) + 'ms' : 'Not available');
        console.log('🖼️ First Contentful Paint:', paint[1] ? Math.round(paint[1].startTime) + 'ms' : 'Not available');
        console.groupEnd();
      }
    }, 0);
  }
};

// Initialize the application
const initApp = () => {
  try {
    const container = document.getElementById('root');
    
    if (!container) {
      throw new Error('Root container not found');
    }

    const root = ReactDOM.createRoot(container);
    
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <ApolloEnrichmentStudio />
          </Suspense>
        </ErrorBoundary>
      </React.StrictMode>
    );

    // Log performance metrics
    window.addEventListener('load', logPerformance);

    // Global error handler for unhandled promises
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled Promise Rejection:', event.reason);
      // Prevent the default browser error dialog
      event.preventDefault();
    });

    console.log('✅ Apollo Enrichment Studio initialized successfully');

  } catch (error) {
    console.error('Failed to initialize Apollo Enrichment Studio:', error);
    
    // Fallback: inject error HTML directly
    const container = document.getElementById('root');
    if (container) {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #0f172a, #1e293b, #0f172a); color: white; text-align: center; padding: 2rem;">
          <div style="max-width: 400px;">
            <div style="width: 60px; height: 60px; background: rgba(239, 68, 68, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
              <span style="font-size: 2rem;">⚠️</span>
            </div>
            <h1 style="color: #ef4444; margin-bottom: 1rem; font-size: 1.5rem;">Initialization Failed</h1>
            <p style="color: #94a3b8; margin-bottom: 2rem; line-height: 1.6;">
              Apollo Enrichment Studio failed to initialize. This might be due to a JavaScript error or browser compatibility issue.
            </p>
            <button 
              onclick="window.location.reload()" 
              style="background: #8b5cf6; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.9rem; transition: background-color 0.2s;"
              onmouseover="this.style.background='#7c3aed'"
              onmouseout="this.style.background='#8b5cf6'"
            >
              Reload Application
            </button>
            <div style="margin-top: 1rem; font-size: 0.75rem; color: #64748b;">
              Error: ${error.message}
            </div>
          </div>
        </div>
      `;
    }
  }
};

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
