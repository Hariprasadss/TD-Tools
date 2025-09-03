import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const ApolloEnrichmentStudio = React.lazy(() => import('./ApolloEnrichmentStudio.jsx'));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Apollo Enrichment Studio Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-4">
              Apollo Enrichment Studio encountered an unexpected error.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition-colors"
            >
              Reload Application
            </button>
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-gray-400 hover:text-white">
                Error Details
              </summary>
              <pre className="mt-2 p-4 bg-slate-800 rounded text-xs overflow-auto">
                {this.state.error?.toString()}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const LoadingFallback = () => (
  <div className="min-h-screen bg-slate-900 flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-white">Loading Apollo Enrichment Studio...</p>
    </div>
  </div>
);

const App = () => {
  return (
    <ErrorBoundary>
      <React.Suspense fallback={<LoadingFallback />}>
        <ApolloEnrichmentStudio />
      </React.Suspense>
    </ErrorBoundary>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    const navigation = performance.getEntriesByType('navigation')[0];
    console.log('🚀 Apollo Enrichment Studio loaded in', Math.round(navigation.loadEventEnd), 'ms');
  });

  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }
}
