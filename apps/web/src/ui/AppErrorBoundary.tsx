import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createDiagnosticId } from '../join-diagnostics';

type Props = {
  children: ReactNode;
};

type State = {
  failed: boolean;
  diagnosticId: string;
};

/**
 * Last-resort boot surface. Must not touch localStorage — storage failures are
 * one of the reasons we might land here.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    failed: false,
    diagnosticId: '',
  };

  static getDerivedStateFromError(): Partial<State> {
    return {
      failed: true,
      diagnosticId: createDiagnosticId(),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[podyguard-boot]', this.state.diagnosticId, error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    const code = this.state.diagnosticId || 'PG-BOOT';
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily:
            '"Space Grotesk", system-ui, -apple-system, sans-serif',
          background: '#03060e',
          color: '#e8eef7',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          PodyGuard couldn&apos;t start correctly.
        </p>
        <p style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          Reload the page. If it keeps failing, share the diagnostic code with
          the organiser.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            border: '1px solid rgba(34, 211, 238, 0.5)',
            background: 'rgba(34, 211, 238, 0.12)',
            color: '#67e8f9',
            borderRadius: '999px',
            padding: '0.65rem 1.25rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
        <p
          style={{
            marginTop: '1.5rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.8rem',
            opacity: 0.65,
          }}
        >
          Diagnostic code: {code}
        </p>
      </div>
    );
  }
}
