import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error',
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h1 className="text-xl font-semibold mb-3">Startup Error</h1>
          <p className="text-sm text-slate-300 mb-3">{this.state.message}</p>
          <p className="text-xs text-slate-400">
            Check your <code>.env</code> file and restart <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }
}
