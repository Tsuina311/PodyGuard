import { Component, lazy, Suspense, type ReactNode } from 'react';

export const MagicRulesSheet = lazy(() =>
  import('./MagicRulesSheet').then((module) => ({
    default: module.MagicRulesSheet,
  })),
);

export function MagicRulesLoading({ label }: { label: string }) {
  return (
    <section className="border-muted/25 bg-hull text-muted flex min-h-40 w-full max-w-md items-center justify-center rounded-2xl border p-4 text-sm">
      {label}
    </section>
  );
}

export class RulesAssistantBoundary extends Component<
  {
    children: ReactNode;
    onClose: () => void;
    message: string;
    closeLabel: string;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <section className="border-muted/25 bg-hull flex w-full max-w-md flex-col gap-3 rounded-2xl border p-4">
        <p className="text-sm leading-relaxed">{this.props.message}</p>
        <button
          type="button"
          onClick={this.props.onClose}
          className="border-muted/25 hover:border-muted/50 h-11 rounded-xl border text-sm font-semibold"
        >
          {this.props.closeLabel}
        </button>
      </section>
    );
  }
}

export function MagicRulesPanel({
  onClose,
  loadingLabel,
  failedMessage,
  closeLabel,
}: {
  onClose: () => void;
  loadingLabel: string;
  failedMessage: string;
  closeLabel: string;
}) {
  return (
    <RulesAssistantBoundary
      onClose={onClose}
      message={failedMessage}
      closeLabel={closeLabel}
    >
      <Suspense fallback={<MagicRulesLoading label={loadingLabel} />}>
        <MagicRulesSheet onClose={onClose} />
      </Suspense>
    </RulesAssistantBoundary>
  );
}
