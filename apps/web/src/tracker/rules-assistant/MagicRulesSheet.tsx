import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Square, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import {
  HEADING_COUNT,
  INDEXED_RULE_COUNT,
  RULES_EFFECTIVE_DATE,
} from './catalog';
import { CURATED_BY_ID, CURATED_RULES, POPULAR_RULE_IDS } from './curated';
import { searchRules } from './search';
import { speechLanguageOptions, speechLanguageTag } from './speech-languages';
import type { RulesSearchHit } from './types';
import {
  useSpeechRecognition,
  type SpeechErrorCode,
} from './use-speech-recognition';

export function MagicRulesSheet({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const uiLocale = (i18n.resolvedLanguage ?? i18n.language).slice(0, 2);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [speechLocale, setSpeechLocale] = useState(uiLocale);
  const result = useMemo(
    () => (submitted.trim() ? searchRules(submitted, uiLocale) : null),
    [submitted, uiLocale],
  );

  function runSearch(value: string) {
    setQuery(value);
    setSubmitted(value);
  }

  const speech = useSpeechRecognition({
    lang: speechLanguageTag(speechLocale),
    onFinal: (transcript) => {
      runSearch(transcript);
    },
  });

  const speechError = speech.error
    ? t(speechErrorKey(speech.error))
    : null;

  return (
    <section className="border-muted/25 bg-hull flex max-h-[min(88dvh,42rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-[0_18px_50px_-24px_var(--color-void)]">
      <header className="border-muted/15 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <h4 className="font-display truncate text-sm leading-tight font-bold">
          {t('tracker.magicRules.title')}
        </h4>
        <button
          type="button"
          aria-label={t('tracker.magicRules.close')}
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-11 shrink-0 items-center justify-center rounded-full border transition"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <form
        className="shrink-0 px-4 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(query);
        }}
      >
        <div className="flex items-center gap-2">
          <label htmlFor="magic-rules-query" className="sr-only">
            {t('tracker.magicRules.askLabel')}
          </label>
          <input
            id="magic-rules-query"
            type="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            value={query}
            placeholder={t('tracker.magicRules.askPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            className="border-muted/25 bg-black/20 text-ink placeholder:text-muted focus-visible:ring-neon/70 h-12 min-w-0 flex-1 rounded-xl border px-3 text-base outline-none focus-visible:ring-2"
          />
          <button
            type="button"
            aria-label={
              speech.listening
                ? t('tracker.magicRules.stopListening')
                : t('tracker.magicRules.listen')
            }
            aria-pressed={speech.listening}
            disabled={!speech.supported}
            onClick={() => {
              if (speech.listening) {
                speech.stop();
                return;
              }
              speech.start();
            }}
            className={cx(
              'flex size-14 shrink-0 items-center justify-center rounded-2xl border transition disabled:opacity-45',
              speech.listening
                ? 'border-neon bg-neon/15 text-neon'
                : 'border-muted/25 text-ink hover:border-neon/50',
            )}
          >
            {speech.listening ? (
              <Square size={18} aria-hidden />
            ) : (
              <Mic size={22} aria-hidden />
            )}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <label
            htmlFor="magic-rules-speech-language"
            className="text-muted shrink-0 text-xs"
          >
            {t('tracker.magicRules.speechLanguage')}
          </label>
          <select
            id="magic-rules-speech-language"
            value={speechLocale}
            onChange={(event) => setSpeechLocale(event.target.value)}
            className="border-muted/25 bg-hull text-ink h-9 max-w-[14rem] rounded-lg border px-2 text-sm"
          >
            {speechLanguageOptions().map((option) => (
              <option key={option.locale} value={option.locale}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </form>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
        aria-live="polite"
      >
        <p className="text-muted mb-3 text-xs leading-relaxed">
          {speech.listening
            ? t('tracker.magicRules.listening')
            : speechError ??
              (!speech.supported
                ? t('tracker.magicRules.speechUnsupported')
                : t('tracker.magicRules.speechPrivacy'))}
        </p>

        <p className="text-muted mb-2 font-mono text-[0.68rem] tracking-wide uppercase">
          {t('tracker.magicRules.popular')}
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {POPULAR_RULE_IDS.map((id) => {
            const entry = CURATED_BY_ID.get(id);
            const label = entry
              ? uiLocale === 'fr'
                ? entry.labelFr
                : entry.title
              : id;
            return (
              <Button
                key={id}
                size="sm"
                variant="glass"
                className="h-10"
                onClick={() => runSearch(label)}
              >
                {label}
              </Button>
            );
          })}
        </div>

        {result?.status === 'none' ? (
          <p className="text-sm leading-relaxed">{t('tracker.magicRules.noResult')}</p>
        ) : null}

        {result?.status === 'ambiguous' ? (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed">
              {t('tracker.magicRules.ambiguous')}
            </p>
            <div className="flex flex-wrap gap-2">
              {result.alternatives.map((hit) => (
                <Button
                  key={hit.id}
                  size="sm"
                  variant="glass"
                  className="h-10"
                  onClick={() => runSearch(hit.title)}
                >
                  {hit.title}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {result?.status === 'match' && result.unverifiedCombination ? (
          <p className="text-muted mb-3 text-sm leading-relaxed">
            {t('tracker.magicRules.noCombined')}
          </p>
        ) : null}

        {result?.status === 'match' && result.primary ? (
          <div className="space-y-3">
            <RuleCard hit={result.primary} onOpen={runSearch} related={result.related} />
            {result.companions.map((hit) => (
              <RuleCard key={hit.id} hit={hit} onOpen={runSearch} related={[]} />
            ))}
          </div>
        ) : null}
      </div>

      <footer className="border-muted/15 text-muted shrink-0 space-y-1 border-t px-4 py-3 text-[0.7rem] leading-relaxed">
        <p>
          {t('tracker.magicRules.stats', {
            rules: INDEXED_RULE_COUNT,
            headings: HEADING_COUNT,
            explanations: CURATED_RULES.length,
          })}
        </p>
        <p>{t('tracker.magicRules.coverage', { date: RULES_EFFECTIVE_DATE })}</p>
      </footer>
    </section>
  );
}

function speechErrorKey(code: SpeechErrorCode): string {
  switch (code) {
    case 'denied':
      return 'tracker.magicRules.speechDenied';
    case 'no-speech':
      return 'tracker.magicRules.speechNoSpeech';
    case 'audio-capture':
      return 'tracker.magicRules.speechAudioCapture';
    case 'network':
      return 'tracker.magicRules.speechNetwork';
    case 'timeout':
      return 'tracker.magicRules.speechTimeout';
    case 'aborted':
      return 'tracker.magicRules.speechAborted';
    case 'unsupported':
      return 'tracker.magicRules.speechUnsupported';
    default:
      return 'tracker.magicRules.speechFailed';
  }
}

function RuleCard({
  hit,
  related,
  onOpen,
}: {
  hit: RulesSearchHit;
  related: RulesSearchHit[];
  onOpen: (query: string) => void;
}) {
  const { t } = useTranslation();
  const ruleLabel =
    hit.citations.length > 1
      ? t('tracker.magicRules.rules', { numbers: hit.citations.join(', ') })
      : t('tracker.magicRules.rule', { number: hit.officialRuleNumber });
  return (
    <article className="border-muted/20 bg-black/20 rounded-2xl border p-3">
      <h5 className="font-display text-base font-bold">{hit.title}</h5>
      <p className="text-muted mt-1 font-mono text-[0.68rem] tracking-wide uppercase">
        {ruleLabel}
      </p>
      <a
        href={hit.officialSourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-neon mt-1 inline-block text-sm underline-offset-2 hover:underline"
      >
        {t('tracker.magicRules.officialSource')}
      </a>
      {hit.explanationFallback ? (
        <p className="text-warning mt-2 text-xs">
          {t('tracker.magicRules.shownInEnglish')}
        </p>
      ) : null}
      {hit.explanation ? (
        <>
          <h6 className="mt-3 mb-1 font-mono text-[0.68rem] tracking-wide uppercase">
            {t('tracker.magicRules.explanation')}
          </h6>
          <p className="text-sm leading-relaxed">{hit.explanation}</p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed">
          {t('tracker.magicRules.noCurated')}
        </p>
      )}
      {hit.example ? (
        <>
          <h6 className="mt-3 mb-1 font-mono text-[0.68rem] tracking-wide uppercase">
            {t('tracker.magicRules.example')}
          </h6>
          <p className="text-sm leading-relaxed">{hit.example}</p>
        </>
      ) : null}
      {related.length > 0 ? (
        <>
          <h6 className="mt-3 mb-2 font-mono text-[0.68rem] tracking-wide uppercase">
            {t('tracker.magicRules.related')}
          </h6>
          <div className="flex flex-wrap gap-2">
            {related.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant="glass"
                className="h-10"
                onClick={() => onOpen(item.title)}
              >
                {item.title}
              </Button>
            ))}
          </div>
        </>
      ) : null}
    </article>
  );
}
