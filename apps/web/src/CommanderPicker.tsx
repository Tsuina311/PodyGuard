import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
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
  onChange: (commander: CommanderSelection | null) => void;
};

export function CommanderPicker({
  label,
  value,
  partnerFor,
  disabled,
  onChange,
}: Props) {
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
    if (trimmed.length < 2 || trimmed === value?.name) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError(null);
      void searchCommanders(trimmed, partnerFor?.cardId)
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
                : 'Could not search Scryfall.',
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
  }, [partnerFor?.cardId, query, value?.name]);

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
          : 'Could not load alternate artwork.',
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
            aria-label={`Remove ${value.name}`}
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
                ? `Commander that can pair with ${partnerFor.name}`
                : 'Search commander'
            }
            className="h-10 w-full rounded-lg border border-muted/20 bg-void/70 pr-3 pl-9 text-sm outline-none placeholder:text-muted/50 focus:border-neon/70"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}

      {!value && (searching || results.length > 0 || error) ? (
        <div className="border-muted/25 bg-void absolute top-full right-0 left-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border p-1 shadow-xl">
          {searching ? (
            <p className="text-muted px-3 py-2 text-xs">Searching…</p>
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
          {error ? <p className="text-danger px-3 py-2 text-xs">{error}</p> : null}
        </div>
      ) : null}

      {artCard
        ? createPortal(
            <div className="bg-void/95 fixed inset-0 z-[70] flex h-[100dvh] flex-col p-3 backdrop-blur-sm">
              <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display truncate text-lg font-bold">
                    Choose artwork
                  </h3>
                  <p className="text-muted truncate text-xs">{artCard.name}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setArtCard(null)}
                >
                  Cancel
                </Button>
              </header>
              {loadingArt ? (
                <p className="text-muted m-auto text-sm">Loading artwork…</p>
              ) : (
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto landscape:grid-cols-4">
                  {artwork.map((art) => (
                    <button
                      key={art.cardId}
                      type="button"
                      className="border-muted/20 hover:border-neon/70 relative min-h-36 overflow-hidden rounded-xl border"
                      onClick={() => chooseArt(artCard, art)}
                    >
                      <img
                        src={art.artCropUri}
                        alt={`${artCard.name}${art.setName ? ` — ${art.setName}` : ''}`}
                        className="h-full w-full object-[center_15%] object-cover"
                      />
                      {art.setName ? (
                        <span className="bg-void/80 absolute right-1 bottom-1 left-1 truncate rounded px-1.5 py-1 text-[0.65rem]">
                          {art.setName}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
