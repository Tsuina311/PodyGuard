import { Component, type ErrorInfo, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

export function JoinQr({
  value,
  size = 168,
  title,
  level = 'M',
}: {
  value: string;
  size?: number;
  title?: string;
  level?: 'L' | 'M' | 'Q' | 'H';
}) {
  const { t } = useTranslation();
  return (
    <QrBoundary fallback={t('common.qrTooLarge')}>
      <div className="inline-flex rounded-2xl bg-white p-3 shadow-[0_0_32px_-8px_rgba(34,211,238,0.45)]">
        <QRCodeSVG
          value={value}
          size={size}
          bgColor="#ffffff"
          fgColor="#03060e"
          level={level}
          title={title ?? t('common.scanToJoin')}
        />
      </div>
    </QrBoundary>
  );
}

type BoundaryProps = {
  children: ReactNode;
  fallback: string;
};

type BoundaryState = {
  failed: boolean;
};

/** qrcode.react throws synchronously when the payload exceeds QR capacity. */
class QrBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[podyguard-qr]', error, info.componentStack);
  }

  componentDidUpdate(prevProps: BoundaryProps): void {
    if (prevProps.children !== this.props.children && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <p className="text-warning max-w-xs text-xs">{this.props.fallback}</p>
      );
    }
    return this.props.children;
  }
}
