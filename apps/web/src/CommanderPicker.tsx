import { useEffect, useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CommanderSearchProfile } from '@podyguard/shared';
import { ApiError, listCommanderArtwork, searchCommanders } from './api';
import type {
  CommanderArtwork,
  CommanderCandidate,
  CommanderSelection,
} from './scryfall';
import { Button } from './ui/Button';

type Props = {
  label: string;
  value: CommanderSelection | null;
  partnerFor?: CommanderSelection;
  disabled?: boolean;
  searchProfile?: CommanderSearchProfile;
  onChange: (commander: CommanderSelection | null) => void;
};

export function CommanderPicker({
  label,
  value,
  partnerFor,
  disabled,
  searchProfile = 'commander',
  onChange,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState(value?.name ?? '');
  const [results, setResults] = useState<CommanderCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artCard, setArtCard] = useState<CommanderCandidate | null>(null);
  const [artwork, setArtwork] = useState<CommanderArtwork[]>([]);
  const [loadingArt, setLoadingArt] = useState(false);

  useEffect(() => {
    setQuery(value?.name ?? '');
  }, [value?.name]);

  useEffect(() => {
    const trimmed = query.trim();
    /*
      Choosing a card writes its name into the box, so without the artwork guard
      the box would search for the card whose printings are already on screen and
      reopen the list over them.
    */
    if (
      trimmed.length < 2 ||
      trimmed === value?.name ||
      trimmed === artCard?.name
    ) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError(null);
      void searchCommanders(trimmed, partnerFor?.cardId, searchProfile)
        .then(({ commanders }) => {
          if (!cancelled) {
            setResults(commanders);
          }
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setResults([]);
            setError(
              caught instanceof ApiError
                ? caught.message
                : t('common.errors.searchScryfall'),
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 550);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [artCard?.name, partnerFor?.cardId, query, searchProfile, t, value?.name]);

  async function chooseCard(card: CommanderCandidate) {
    setResults([]);
    setQuery(card.name);
    setArtCard(card);
    setArtwork([]);
    setLoadingArt(true);
    setError(null);
    try {
      const response = await listCommanderArtwork(card.oracleId, card.name);
      setArtwork(
        response.artwork.length > 0
          ? response.artwork
          : [{ cardId: card.cardId, artCropUri: card.artCropUri }],
      );
    } catch (caught) {
      setArtwork([{ cardId: card.cardId, artCropUri: card.artCropUri }]);
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.loadArtwork'),
      );
    } finally {
      setLoadingArt(false);
    }
  }

  function chooseArt(card: CommanderCandidate, art: CommanderArtwork) {
    onChange({
      oracleId: card.oracleId,
      cardId: art.cardId,
      name: card.name,
      artCropUri: art.artCropUri,
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      keywords: card.keywords,
    });
    setQuery(card.name);
    setArtCard(null);
  }

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="text-muted mb-1 block text-xs font-medium tracking-wide"
      >
        {label}
      </label>
      {value ? (
        <div className="border-muted/20 bg-void/70 flex items-center gap-2 rounded-xl border p-2">
          <img
            src={value.artCropUri}
            alt=""
            className="h-12 w-16 shrink-0 rounded-lg object-[center_15%] object-cover"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {value.name}
          </span>
          <button
            type="button"
            aria-label={t('commanderPicker.removeCommander', { name: value.name })}
            disabled={disabled}
            onClick={() => onChange(null)}
            className="text-muted hover:text-ink flex size-8 shrink-0 items-center justify-center disabled:opacity-40"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            size={16}
            aria-hidden
            className="text-muted pointer-events-none absolute top-3 left-3"
          />
          <input
            id={id}
            value={query}
            disabled={disabled}
            autoComplete="off"
            placeholder={
              partnerFor
                ? t('commanderPicker.searchPartner', { name: partnerFor.name })
                : t('commanderPicker.searchCommander')
            }
            className="h-10 w-full rounded-lg border border-muted/20 bg-void/70 pr-3 pl-9 text-sm outline-none placeholder:text-muted/50 focus:border-neon/70"
            onChange={(event) => setQuery(event.target.value)}
          />
          {/*
            The list hangs off the box it is filtering rather than off the whole
            picker, so the artwork grid opening below can never push the results
            down past the bottom of the screen.
          */}
          {searching || results.length > 0 || error ? (
            <div className="border-muted/25 bg-void absolute top-full right-0 left-0 z-30 mt-1 max-h-[min(21rem,55dvh)] overflow-y-auto overscroll-contain rounded-xl border p-1 shadow-xl">
              {searching ? (
                <p className="text-muted px-3 py-2 text-xs">
                  {t('common.searching')}
                </p>
              ) : null}
              {results.map((card) => (
                <button
                  key={card.cardId}
                  type="button"
                  className="hover:bg-ink/5 flex w-full items-center gap-2 rounded-lg p-2 text-left"
                  onClick={() => void chooseCard(card)}
                >
                  <img
                    src={card.artCropUri}
                    alt=""
                    className="h-10 w-14 shrink-0 rounded object-[center_15%] object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{card.name}</span>
                    <span className="text-muted block truncate text-xs">
                      {card.typeLine}
                    </span>
                  </span>
                </button>
              ))}
              {error ? (
                <p className="text-danger px-3 py-2 text-xs">{error}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/*
        Picking art is one step of filling in a deck, not a place of its own, so
        it stays in the column the form already occupies. It used to take the
        whole viewport, which hid the event and the other decks behind it. The
        grid scrolls inside its own box so a card with a dozen printings cannot
        push the rest of the form off the screen.
      */}
      {artCard ? (
        <div className="border-muted/20 bg-void/70 mt-2 rounded-xl border p-2">
          <header className="mb-2 flex items-center justify-between gap-2">
            <p className="text-muted min-w-0 truncate text-xs">
              {t('commanderPicker.artworkFor')}{' '}
              <span className="text-ink font-medium">{artCard.name}</span>
            </p>
            <Button size="sm" variant="ghost" onClick={() => setArtCard(null)}>
              {t('common.cancel')}
            </Button>
          </header>
          {loadingArt ? (
            <p className="text-muted px-1 py-6 text-center text-xs">
              {t('commanderPicker.loadingArtwork')}
            </p>
          ) : (
            <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {artwork.map((art) => (
                <button
                  key={art.cardId}
                  type="button"
                  className="border-muted/20 hover:border-neon/70 relative aspect-[626/457] overflow-hidden rounded-lg border"
                  onClick={() => chooseArt(artCard, art)}
                >
                  <img
                    src={art.artCropUri}
                    alt={`${artCard.name}${art.setName ? ` — ${art.setName}` : ''}`}
                    className="size-full object-[center_15%] object-cover"
                  />
                  {art.setName ? (
                    <span className="bg-void/80 absolute right-1 bottom-1 left-1 truncate rounded px-1.5 py-0.5 text-[0.6rem]">
                      {art.setName}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
