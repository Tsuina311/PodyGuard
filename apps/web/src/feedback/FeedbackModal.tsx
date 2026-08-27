import { useEffect, useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, MessageSquare, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError, submitFeedback } from '../api';
import { Button } from '../ui/Button';
import type {
  FeedbackTechnicalContext,
  FeedbackType,
} from './types';

export function FeedbackModal({
  context,
  onClose,
}: {
  context: FeedbackTechnicalContext;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [type, setType] = useState<FeedbackType>('bug');
  const [description, setDescription] = useState('');
  const [expectedBehaviour, setExpectedBehaviour] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedback({
        type,
        description,
        ...(type === 'bug' && expectedBehaviour.trim()
          ? { expectedBehaviour }
          : {}),
        context,
      });
      setSubmitted(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('feedback.errors.submit'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="bg-void/80 fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <section className="border-muted/25 bg-hull flex max-h-[min(88dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-[0_18px_50px_-24px_var(--color-void)]">
        <header className="border-muted/15 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare size={17} aria-hidden className="text-neon" />
            <h2 id={titleId} className="font-display text-base font-bold">
              {t('feedback.title')}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            disabled={submitting}
            onClick={onClose}
            className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 items-center justify-center rounded-full border transition disabled:opacity-40"
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <CheckCircle2 size={40} className="text-neon" aria-hidden />
            <div>
              <h3 className="font-display mb-1 text-lg font-bold">
                {t('feedback.thanks')}
              </h3>
              <p className="text-muted text-sm">
                {t('feedback.received')}
              </p>
            </div>
            <Button variant="neon" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(event) => void onSubmit(event)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-muted text-xs font-medium tracking-[0.14em] uppercase">
                  {t('feedback.type')}
                </span>
                <select
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as FeedbackType)
                  }
                  className="border-muted/20 bg-void/70 text-ink h-11 rounded-xl border px-3.5 outline-none focus:border-neon/70 focus:ring-2 focus:ring-neon/25"
                >
                  <option value="bug">{t('feedback.types.bug')}</option>
                  <option value="confusing">
                    {t('feedback.types.confusing')}
                  </option>
                  <option value="idea">{t('feedback.types.idea')}</option>
                  <option value="other">{t('feedback.types.other')}</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-muted text-xs font-medium tracking-[0.14em] uppercase">
                  {t('feedback.description')}
                </span>
                <textarea
                  required
                  maxLength={4000}
                  rows={6}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('feedback.descriptionPlaceholder')}
                  className="border-muted/20 bg-void/70 text-ink placeholder:text-muted/50 min-h-32 resize-y rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-neon/70 focus:ring-2 focus:ring-neon/25"
                />
              </label>

              {type === 'bug' ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted text-xs font-medium tracking-[0.14em] uppercase">
                    {t('feedback.expected')}
                  </span>
                  <textarea
                    maxLength={2000}
                    rows={3}
                    value={expectedBehaviour}
                    onChange={(event) =>
                      setExpectedBehaviour(event.target.value)
                    }
                    placeholder={t('feedback.expectedPlaceholder')}
                    className="border-muted/20 bg-void/70 text-ink placeholder:text-muted/50 resize-y rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-neon/70 focus:ring-2 focus:ring-neon/25"
                  />
                </label>
              ) : null}

              <p className="text-muted text-xs leading-relaxed">
                {t('feedback.privacy')}
              </p>
              {error ? (
                <p role="alert" className="text-danger text-sm">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="border-muted/15 flex shrink-0 justify-end gap-2 border-t p-3">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="neon"
                disabled={submitting || !description.trim()}
              >
                {submitting
                  ? t('common.submitting')
                  : t('feedback.submit')}
              </Button>
            </footer>
          </form>
        )}
      </section>
    </div>,
    document.body,
  );
}
