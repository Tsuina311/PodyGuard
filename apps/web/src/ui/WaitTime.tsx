import { useEffect, useState } from 'react';

export function WaitTime({ since }: { since?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);

  if (!since) {
    return null;
  }
  const elapsed = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  return (
    <span className="text-muted font-mono text-xs">
      {minutes}:{seconds}
    </span>
  );
}
