import { QRCodeSVG } from 'qrcode.react';

export function JoinQr({ value }: { value: string }) {
  return (
    <div className="inline-flex rounded-2xl bg-white p-3 shadow-[0_0_32px_-8px_rgba(34,211,238,0.45)]">
      <QRCodeSVG
        value={value}
        size={168}
        bgColor="#ffffff"
        fgColor="#03060e"
        level="M"
        title="Scan to join this event"
      />
    </div>
  );
}
