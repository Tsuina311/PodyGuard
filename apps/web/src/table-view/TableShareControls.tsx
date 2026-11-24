import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '../ui/Button';
import type { useTableShare } from './useTableShare';
export function TableShareControls({
  share,
}: {
  share: ReturnType<typeof useTableShare>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="mb-2 shrink-0 rounded-xl border border-muted/25 p-2"
      aria-label="Share live tracker"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="glass"
          disabled={share.busy}
          onClick={() => {
            setExpanded(true);
            if (!share.url) void share.start();
          }}
        >
          Share live tracker
        </Button>
        {share.url && !share.required ? (
          <Button
            variant="ghost"
            disabled={share.busy}
            onClick={() => void share.stop()}
          >
            Stop sharing
          </Button>
        ) : null}
        {expanded ? (
          <Button variant="ghost" onClick={() => setExpanded(false)}>
            Hide viewing link
          </Button>
        ) : null}
      </div>
      {expanded && share.url ? (
        <div className="mt-2 flex max-h-52 flex-wrap gap-3 overflow-auto">
          <QRCodeSVG
            value={share.url}
            size={120}
            bgColor="#ffffff"
            fgColor="#000000"
            marginSize={2}
            title="Scan to view this table"
          />
          <div className="min-w-0 flex-1 text-sm">
            <p>
              Only this device changes the game. Anyone with this private link
              can view public totals and commanders. Secret roles stay private.
            </p>
            <a
              className="break-all text-neon underline"
              href={share.url}
              target="_blank"
              rel="noreferrer"
            >
              Open read-only tracker
            </a>
            <p>
              Updates need this device open and online. Links expire after 24
              hours without updates{share.required ? '. Event links survive service restarts and transfers.' : ' and may need replacing after a service restart.'}
            </p>
          </div>
        </div>
      ) : null}
      {share.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {share.error}
        </p>
      ) : null}
    </section>
  );
}
