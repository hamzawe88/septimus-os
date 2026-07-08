'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, ChevronDown } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional: component name shown in the error card */
  name?: string;
  /** Optional: custom fallback UI */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

/**
 * ErrorBoundary — Catches unhandled React render errors and displays a graceful fallback.
 *
 * Usage:
 *   <ErrorBoundary name="KanbanBoard">
 *     <KanbanBoard />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.name ?? 'Component'} crashed:`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-100 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-black text-base">
                {this.props.name ? `Error in ${this.props.name}` : 'Unexpected Error'}
              </h2>
              <p className="text-red-100 text-xs font-medium">
                This section failed to load due to a code error.
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <p className="text-slate-600 text-sm leading-relaxed">
              An unexpected error occurred. You can try again or reload the page.
            </p>

            {/* Error details toggle */}
            {this.state.error && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                  className="w-full px-4 py-2 flex items-center justify-between text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  Error Details (for developers)
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${this.state.showDetails ? 'rotate-180' : ''}`}
                  />
                </button>
                {this.state.showDetails && (
                  <pre className="px-4 py-3 text-xs text-red-700 bg-red-50 font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack?.split('\n').slice(0, 5).join('\n')}
                  </pre>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all"
              >
                <RefreshCcw className="w-4 h-4" />
                Retry
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
