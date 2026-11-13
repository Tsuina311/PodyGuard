import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardText } from '@podyguard/shared';
import { lookupCardText } from '../../card-text-cache';
import { Button } from '../../ui/Button';

export function CardTextSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<CardText[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  async function search() {
    const id = ++request.current;
    setLoading(true);
    setError(false);
    setCards(null);
    try {
      const result = await lookupCardText(query);
      if (id === request.current) setCards(result);
    } catch {
      if (id === request.current) setError(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
    <p className="text-muted mb-3 text-sm">{t('tracker.magicRules.cardsHelp')}</p>
    <form className="flex gap-2" onSubmit={event => { event.preventDefault(); if (query.trim()) void search(); }}>
      <label className="sr-only" htmlFor="magic-card-name">{t('tracker.magicRules.cardName')}</label>
      <input id="magic-card-name" type="search" maxLength={200} value={query}
        autoCapitalize="none" autoCorrect="off" enterKeyHint="search"
        onChange={event => setQuery(event.target.value)}
        placeholder={t('tracker.magicRules.cardName')}
        className="border-muted/25 bg-black/20 text-ink h-12 min-w-0 flex-1 rounded-xl border px-3 text-base" />
      <Button type="submit" variant="neon" disabled={!query.trim()}>{t('tracker.magicRules.search')}</Button>
    </form>
    <div aria-live="polite" aria-busy={loading} className="mt-3 space-y-3">
      {loading && <p>{t('tracker.magicRules.cardsLoading')}</p>}
      {error && <p role="alert">{t('tracker.magicRules.cardsError')}</p>}
      {cards?.length === 0 && <p>{t('tracker.magicRules.cardsNone')}</p>}
      {cards?.length === 20 && <p>{t('tracker.magicRules.cardsRefine')}</p>}
      {cards?.map(card => <article key={card.oracleId} lang="en" className="border-muted/20 rounded-2xl border bg-black/20 p-3">
        <h5 className="font-display text-base font-bold">{card.name}</h5>
        {card.faces.map((face, index) => <div key={index} className="mt-2 space-y-2">
          {card.faces.length > 1 && <h6 className="font-bold">{face.name}</h6>}
          {face.manaCost && <p className="font-mono">{face.manaCost}</p>}
          <p className="text-muted text-sm">{face.typeLine}</p>
          <p className="whitespace-pre-line text-base leading-relaxed">{face.oracleText || t('tracker.magicRules.cardsNoAbilities')}</p>
          {face.power && face.toughness && <p>{face.power}/{face.toughness}</p>}
          {face.loyalty && <p>Loyalty: {face.loyalty}</p>}
          {face.defense && <p>Defense: {face.defense}</p>}
        </div>)}
      </article>)}
    </div>
  </div>;
}
