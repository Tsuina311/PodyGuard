import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DISPLAY_MODES,
  type DisplayMode,
  type HostDisplaySession,
} from '@podyguard/shared';
import {
  ApiError,
  approveDisplay,
  cancelDisplayAnnouncement,
  createDisplayAnnouncement,
  listDisplays,
  revokeDisplay,
  updateDisplay,
} from '../api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Panel } from '../ui/Panel';

export function HostDisplaysPanel({
  joinCode,
  hostToken,
  refreshKey,
}: {
  joinCode: string;
  hostToken: string;
  /** Bump when a live snapshot arrives so the list stays fresh. */
  refreshKey: number;
}) {
  const { t } = useTranslation();
  const [displays, setDisplays] = useState<HostDisplaySession[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [label, setLabel] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [lastAnnouncementId, setLastAnnouncementId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listDisplays(joinCode, hostToken);
      setDisplays(result.displays);
    } catch {
      /* host may briefly lack access */
    }
  }, [joinCode, hostToken]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  async function onApprove(submit: FormEvent) {
    submit.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await approveDisplay(joinCode, hostToken, {
        pairingCode: pairingCode.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setPairingCode('');
      setLabel('');
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('host.displaysApproveFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onModeChange(displayId: string, mode: DisplayMode) {
    setError(null);
    try {
      await updateDisplay(joinCode, hostToken, displayId, { mode });
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('host.displaysUpdateFailed'),
      );
    }
  }

  async function onRevoke(displayId: string) {
    setBusy(true);
    setError(null);
    try {
      await revokeDisplay(joinCode, hostToken, displayId);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('host.displaysRevokeFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSendAnnouncement(submit: FormEvent) {
    submit.preventDefault();
    const message = announcement.trim();
    if (!message) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createDisplayAnnouncement(joinCode, hostToken, {
        message,
      });
      setLastAnnouncementId(result.announcement.id);
      setAnnouncement('');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('host.displaysAnnounceFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCancelAnnouncement() {
    if (!lastAnnouncementId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cancelDisplayAnnouncement(
        joinCode,
        hostToken,
        lastAnnouncementId,
      );
      setLastAnnouncementId(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('host.displaysCancelAnnounceFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={t('host.displaysTitle')} aside={t('host.displaysAside')}>
      <p className="text-muted mb-4 text-sm">{t('host.displaysHint')}</p>

      <form className="mb-6 space-y-3" onSubmit={(e) => void onApprove(e)}>
        <Field
          label={t('host.displaysPairingCode')}
          value={pairingCode}
          onChange={(change) => setPairingCode(change.target.value)}
          autoComplete="off"
          className="font-mono tracking-[0.2em] uppercase"
          placeholder="000-000"
          required
        />
        <Field
          label={t('host.displaysLabel')}
          value={label}
          onChange={(change) => setLabel(change.target.value)}
          placeholder={t('host.displaysLabelPlaceholder')}
        />
        <Button type="submit" variant="neon" disabled={busy || !pairingCode.trim()}>
          {busy ? t('common.working') : t('host.displaysApprove')}
        </Button>
      </form>

      {displays.length === 0 ? (
        <p className="text-muted mb-6 text-sm">{t('host.displaysEmpty')}</p>
      ) : (
        <ul className="mb-6 divide-y divide-white/5">
          {displays.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-display truncate font-semibold">{row.label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={row.connected ? 'live' : 'muted'}>
                    {row.connected
                      ? t('host.displaysConnected')
                      : t('host.displaysOffline')}
                  </Badge>
                  <Badge tone="idle">{row.status}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-muted flex items-center gap-2 text-xs">
                  <span className="uppercase tracking-widest">
                    {t('host.displaysMode')}
                  </span>
                  <select
                    className="border-muted/25 bg-void/70 h-9 rounded-lg border px-2 text-sm text-ink"
                    value={row.config.mode}
                    disabled={row.status !== 'ACTIVE'}
                    onChange={(change) =>
                      void onModeChange(
                        row.id,
                        change.target.value as DisplayMode,
                      )
                    }
                  >
                    {DISPLAY_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy || row.status === 'REVOKED'}
                  onClick={() => void onRevoke(row.id)}
                >
                  {t('host.displaysRevoke')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="space-y-3" onSubmit={(e) => void onSendAnnouncement(e)}>
        <Field
          label={t('host.displaysAnnouncement')}
          value={announcement}
          onChange={(change) => setAnnouncement(change.target.value)}
          placeholder={t('host.displaysAnnouncementPlaceholder')}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="outline"
            disabled={busy || !announcement.trim()}
          >
            {t('host.displaysSendAnnouncement')}
          </Button>
          {lastAnnouncementId ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void onCancelAnnouncement()}
            >
              {t('host.displaysCancelAnnouncement')}
            </Button>
          ) : null}
        </div>
      </form>

      {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
    </Panel>
  );
}
