import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import type { WakeStatus } from './wake-lock';

export function TabletControls({
  wake,
}: {
  wake: { status: WakeStatus; retry(): void };
}) {
  const [fullscreen, setFullscreen] = useState(
    Boolean(document.fullscreenElement),
  );
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const change = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  return (
    <section
      aria-label="Screen settings"
      className="mb-2 shrink-0 rounded-xl border border-muted/25 p-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="glass"
          onClick={async () => {
            wake.retry();
            try {
              if (document.fullscreenElement) await document.exitFullscreen();
              else if (document.documentElement.requestFullscreen)
                await document.documentElement.requestFullscreen();
              else setHelp(true);
            } catch {
              setHelp(true);
            }
          }}
        >
          {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            wake.retry();
            setHelp(true);
          }}
        >
          Keep screen awake
        </Button>
        <span className="text-xs text-muted" role="status">
          {wake.status === 'active'
            ? 'Screen stay-awake is active'
            : wake.status === 'requesting'
              ? 'Requesting screen stay-awake…'
              : 'Screen stay-awake needs attention'}
        </span>
      </div>
      {help ? (
        <div className="mt-2 text-sm text-ink">
          <p>
            On iPad, use Safari’s Share menu → Add to Home Screen, then open
            PodyGuard from that icon for an app-sized screen. Fullscreen
            availability depends on iPadOS.
          </p>
          <p>
            If the screen still dims, check Low Power Mode and Settings →
            Display &amp; Brightness → Auto-Lock. Return here and tap Keep
            screen awake after interruptions.
          </p>
          <Button variant="ghost" onClick={() => setHelp(false)}>
            Close screen help
          </Button>
        </div>
      ) : null}
    </section>
  );
}
