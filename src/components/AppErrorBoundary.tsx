import React from 'react';

interface State {
  hasError: boolean;
  message: string;
  recoverKey: number;
}

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  private domRecoveryAttempts = 0;

  state: State = {
    hasError: false,
    message: '',
    recoverKey: 0,
  };

  componentDidCatch(error: Error) {
    if (!isRecoverableDomMutationError(error)) {
      this.setState({
        hasError: true,
        message: error?.message || 'Unexpected application error',
        recoverKey: this.state.recoverKey,
      });
      return;
    }

    if (this.domRecoveryAttempts >= 2) {
      this.setState({
        hasError: true,
        message: error?.message || 'Unexpected application error',
        recoverKey: this.state.recoverKey,
      });
      return;
    }

    this.domRecoveryAttempts += 1;
    this.setState(current => ({
      hasError: false,
      message: '',
      recoverKey: current.recoverKey + 1,
    }));
  }

  render() {
    if (!this.state.hasError) {
      return <React.Fragment key={this.state.recoverKey}>{this.props.children}</React.Fragment>;
    }

    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h1 className="text-xl font-semibold mb-3">Ошибка при запуске</h1>
          <p className="text-sm text-slate-300 mb-3">{this.state.message}</p>
          <p className="text-xs text-slate-400">
            Обновите страницу. Если ошибка повторится, отправьте скриншот координатору.
          </p>
        </div>
      </div>
    );
  }
}

function isRecoverableDomMutationError(error: Error): boolean {
  const name = String(error?.name || '');
  const message = String(error?.message || '');

  return (
    name === 'NotFoundError' ||
    /insertBefore/i.test(message) ||
    /node before which the new node is to be inserted/i.test(message) ||
    /not a child of this node/i.test(message)
  );
}
