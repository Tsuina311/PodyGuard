import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultLimitedTablePlan, limitedPlayingSeatBudget, tableGameSizes, type LimitedTablePlan, type TableLayout, type TableShape } from '@podyguard/shared';
import { Button } from '../ui/Button';

export function TablePreview({ table, parts }: { table: TableLayout; parts?: number[] }) {
  const { t } = useTranslation();
  const clipId = useId();
  const width = table.shape === 'rectangle' ? 264 : 160;
  const height = table.shape === 'rectangle' ? 128 : 160;
  const left = (320 - width) / 2;
  const top = (220 - height) / 2;
  const radius = table.shape === 'round' ? height / 2 : 14;
  const unused = table.seats - (parts?.reduce((sum, seats) => sum + seats, 0) ?? 0);
  const sections = parts ? [...parts, ...(unused > 0 ? [unused] : [])] : [];
  const columns = sections.reduce((sum, seats) => sum + Math.ceil(seats / 2), 0);
  let nextColumn = 0;

  return <svg viewBox="0 0 320 220" className="mx-auto h-36 w-full max-w-64" role="img"
    aria-label={t('tablePlan.preview', { shape: t(`tablePlan.${table.shape}`), seats: table.seats })}>
    <defs><clipPath id={clipId}><rect x={left} y={top} width={width} height={height} rx={radius} /></clipPath></defs>
    <rect x={left} y={top} width={width} height={height} rx={radius}
      fill="currentColor" fillOpacity=".07" stroke="currentColor" className="text-neon" />
    {parts ? sections.map((seats, index) => {
      const span = Math.ceil(seats / 2);
      const cell = width / columns;
      const x = left + cell * nextColumn;
      nextColumn += span;
      const assigned = index < parts.length;
      const north = Math.ceil(seats / 2);
      const label = parts.length > 1 ? `${String.fromCharCode(65 + index)} · ${seats}` : seats;
      return <g key={index} data-area={assigned ? String.fromCharCode(65 + index) : 'unused'}>
        {index > 0 && <line x1={x} y1={top} x2={x} y2={top + height}
          clipPath={`url(#${clipId})`} stroke="currentColor" strokeOpacity=".35" strokeDasharray="4 4" />}
        {Array.from({ length: seats }, (_, mat) => {
          const above = mat < north;
          const column = above ? mat : mat - north;
          const matWidth = Math.min(34, cell - 5);
          return <rect key={mat} data-playmat="" x={x + cell * (column + .5) - matWidth / 2}
            y={above ? top - 24 : top + height + 5} width={matWidth} height="19" rx="3"
            fill="currentColor" fillOpacity=".2" stroke="currentColor"
            className={!assigned ? 'text-muted' : index % 2 ? 'text-beam' : 'text-neon'} />;
        })}
        {assigned && <text x={x + cell * span / 2} y="110" dominantBaseline="middle" textAnchor="middle"
          fill="currentColor" fontSize={sections.length > 4 ? '12' : '18'}>{label}</text>}
      </g>;
    }) : <>
      {Array.from({ length: table.seats }, (_, index) => {
        const angle = 2 * Math.PI * index / table.seats - Math.PI / 2;
        return <circle key={index} cx={160 + (width / 2 + 15) * Math.cos(angle)}
          cy={110 + (height / 2 + 15) * Math.sin(angle)} r="7" fill="currentColor" className="text-neon" />;
      })}
      <text x="160" y="110" dominantBaseline="middle" textAnchor="middle" fill="currentColor" fontSize="24">{table.seats}</text>
    </>}
  </svg>;
}

export function TablePlanner({ title, value, onChange, allowedSizes, preferredSize, draft = false, minSeats = 2, maxTables = 40, maxTotalSeats }: {
  title: string; value: TableLayout[]; onChange: (tables: TableLayout[]) => void;
  allowedSizes: number[]; preferredSize: number; draft?: boolean; minSeats?: number;
  maxTables?: number; maxTotalSeats?: number;
}) {
  const { t } = useTranslation();
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => { setSelected(current => current.filter(index => index < value.length)); }, [value.length]);
  const [bulkShape, setBulkShape] = useState<TableShape>('square');
  const [bulkSeats, setBulkSeats] = useState(preferredSize);
  const totalSeats = value.reduce((sum, table) => sum + table.seats, 0);
  const seatsAvailable = maxTotalSeats === undefined ? Infinity : Math.max(0, maxTotalSeats - totalSeats);
  const tableLimit = Math.min(maxTables, value.length + Math.floor(seatsAvailable / minSeats));
  const seatChoices = Array.from({ length: 17 - minSeats }, (_, index) => index + minSeats);
  const canSetSeats = (indices: number[], seats: number) => {
    const oldSeats = indices.reduce((sum, index) => sum + (value[index]?.seats ?? 0), 0);
    return seats * indices.length - oldSeats <= seatsAvailable;
  };
  const patch = (indices: number[], update: Partial<TableLayout>) => {
    if (update.seats !== undefined && !canSetSeats(indices, update.seats)) return;
    onChange(value.map((table, index) => indices.includes(index) ? { ...table, ...update } : table));
  };
  const selectClass = 'min-h-11 rounded-lg border border-muted/30 bg-surface px-2 text-sm text-ink';
  const shapeOptions = <>{(['square', 'rectangle', 'round'] as const).map(shape => <option key={shape} value={shape}>{t(`tablePlan.${shape}`)}</option>)}</>;
  const seatsOptions = (indices: number[]) => seatChoices.map(seats => (
    <option key={seats} value={seats} disabled={!canSetSeats(indices, seats)}>{t('tablePlan.seats', { count: seats })}</option>
  ));
  return <fieldset className="mb-5 rounded-2xl border border-muted/25 p-3">
    <legend className="px-2 font-semibold">{title}</legend>
    <p className="mb-3 text-sm text-muted">{t(draft ? 'tablePlan.draftHint' : 'tablePlan.playHint')}</p>
    {maxTotalSeats !== undefined && <p className="mb-2 text-sm">{t('tablePlan.seatBudget', { used: totalSeats, total: maxTotalSeats })}</p>}
    {maxTables > 1 && <label className="mb-3 flex items-center gap-3 text-sm">{t('tablePlan.count')}
      <input aria-label={`${title} — ${t('tablePlan.count')}`} type="number" inputMode="numeric" min={1} max={tableLimit}
        value={countDraft ?? value.length} className={`${selectClass} w-20`}
        onBlur={() => setCountDraft(null)} onChange={event => {
          const raw = event.target.value;
          setCountDraft(raw);
          const count = Number(raw);
          if (!Number.isInteger(count) || count < 1 || count > tableLimit || count === value.length) return;
          setSelected([]);
          const last = value.at(-1) ?? { shape: 'square', seats: preferredSize };
          onChange(Array.from({ length: count }, (_, index) => value[index] ?? { ...last, seats: maxTotalSeats === undefined ? last.seats : minSeats }));
        }} />
    </label>}
    <details className="mb-3 rounded-xl border border-muted/20 p-2">
      <summary className="cursor-pointer py-2 text-sm font-semibold">{t('tablePlan.editSeveral')}</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="glass" type="button" onClick={() => setSelected(value.map((_, index) => index))}>{t('tablePlan.selectAll')}</Button>
        <Button size="sm" variant="glass" type="button" onClick={() => setSelected([])}>{t('tablePlan.clearSelection')}</Button>
        <select aria-label={t('tablePlan.bulkShape')} value={bulkShape} onChange={event => setBulkShape(event.target.value as TableShape)} className={selectClass}>{shapeOptions}</select>
        <select aria-label={t('tablePlan.bulkSeats')} value={bulkSeats} onChange={event => setBulkSeats(Number(event.target.value))} className={selectClass}>{seatsOptions(selected)}</select>
        <Button size="sm" type="button" disabled={!selected.length || !canSetSeats(selected, bulkSeats)} onClick={() => patch(selected, { shape: bulkShape, seats: bulkSeats })}>
          {t('tablePlan.applySelected', { count: selected.length })}
        </Button>
      </div>
    </details>
    <div className="grid max-h-[32rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
      {value.map((table, index) => {
        const parts = draft ? [] : tableGameSizes(table.seats, allowedSizes, preferredSize);
        return <div key={index} className={`rounded-xl border p-3 ${selected.includes(index) ? 'border-neon bg-neon/5' : 'border-muted/20'}`}>
          <label className="flex min-h-9 items-center gap-2 font-semibold text-sm">
            <input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index])} />
            {t('tablePlan.table', { number: index + 1 })}
          </label>
          <TablePreview table={table} parts={draft ? undefined : parts} />
          <div className="grid grid-cols-2 gap-2">
            <select aria-label={t('tablePlan.shapeFor', { number: index + 1 })} className={`${selectClass} min-w-0`} value={table.shape} onChange={event => patch([index], { shape: event.target.value as TableShape })}>{shapeOptions}</select>
            <select aria-label={t('tablePlan.seatsFor', { number: index + 1 })} className={`${selectClass} min-w-0`} value={table.seats} onChange={event => patch([index], { seats: Number(event.target.value) })}>{seatsOptions([index])}</select>
          </div>
          {!draft && <p className={`mt-2 text-xs ${parts.length ? 'text-muted' : 'text-danger'}`}>
            {parts.length ? parts.map((seats, part) => `${parts.length > 1 ? t('tablePlan.part', { part: String.fromCharCode(65 + part) }) + ': ' : ''}${t('tablePlan.players', { count: seats })}`).join(' · ') : t('tablePlan.noGame')}
            {parts.length && table.seats > parts.reduce((a, b) => a + b, 0) ? ` · ${t('tablePlan.unused', { count: table.seats - parts.reduce((a, b) => a + b, 0) })}` : ''}
          </p>}
        </div>;
      })}
    </div>
  </fieldset>;
}

export function LimitedTablePlanner({ value, players, hasDraft, singlePod = false, onChange }: {
  value?: LimitedTablePlan; players: number; hasDraft: boolean; singlePod?: boolean;
  onChange: (plan: LimitedTablePlan) => void;
}) {
  const { t } = useTranslation();
  const saved = value ?? defaultLimitedTablePlan(players, hasDraft);
  const plan = singlePod ? { ...saved, draft: saved.draft.slice(0, 1) } : saved;
  const pods = Math.max(1, hasDraft ? plan.draft.length : 1);
  const maxSeats = limitedPlayingSeatBudget(players, hasDraft ? plan.draft.length : 0);
  const playingSeats = plan.play.reduce((sum, table) => sum + table.seats, 0);
  const spaces = plan.play.reduce((sum, table) => sum + Math.floor(table.seats / 2), 0);
  const neededSpaces = Math.floor(players / 2) * pods;
  return <>
    {hasDraft && <TablePlanner title={t('tablePlan.drafting')} value={plan.draft} onChange={draft => onChange({ ...plan, draft })}
      allowedSizes={[players]} preferredSize={players} minSeats={players} maxTables={singlePod ? 1 : 40} draft />}
    <TablePlanner title={t('tablePlan.playing')} value={plan.play} onChange={play => onChange({ ...plan, play })}
      allowedSizes={[2]} preferredSize={2} maxTotalSeats={maxSeats} />
    {playingSeats > maxSeats && <p role="alert" className="mb-3 text-sm text-danger">{t('tablePlan.tooManySeats', { count: maxSeats })}</p>}
    {spaces < neededSpaces && <p role="alert" className="mb-3 text-sm text-danger">{t('tablePlan.needSpaces', { count: neededSpaces })}</p>}
  </>;
}
