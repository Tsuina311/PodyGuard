import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultLimitedTablePlan, tableGameSizes, type LimitedTablePlan, type TableLayout, type TableShape } from '@podyguard/shared';
import { Button } from '../ui/Button';

export function TablePreview({ table, parts = [] }: { table: TableLayout; parts?: number[] }) {
  const { t } = useTranslation();
  const width = table.shape === 'rectangle' ? 132 : 92;
  return <svg viewBox="0 0 180 140" className="mx-auto h-28 w-full max-w-44" role="img"
    aria-label={t('tablePlan.preview', { shape: t(`tablePlan.${table.shape}`), seats: table.seats })}>
    {Array.from({ length: table.seats }, (_, index) => {
      const angle = 2 * Math.PI * index / table.seats - Math.PI / 2;
      return <circle key={index} cx={90 + (width / 2 + 13) * Math.cos(angle)} cy={70 + 57 * Math.sin(angle)}
        r="5" fill="currentColor" className="text-neon" />;
    })}
    <rect x={90 - width / 2} y="27" width={width} height="86" rx={table.shape === 'round' ? 43 : 10}
      fill="currentColor" fillOpacity=".07" stroke="currentColor" className="text-neon" />
    {parts.map((size, index) => <g key={index}>
      {index > 0 && <line x1={90 - width / 2 + width * index / parts.length} y1="34"
        x2={90 - width / 2 + width * index / parts.length} y2="106" stroke="currentColor" strokeOpacity=".3" strokeDasharray="3 3" />}
      <text x={90 - width / 2 + width * (index + .5) / parts.length} y="74" textAnchor="middle" fill="currentColor" fontSize="12">
        {parts.length > 1 ? String.fromCharCode(65 + index) : ''}{parts.length > 1 ? ' · ' : ''}{size}
      </text>
    </g>)}
    {!parts.length && <text x="90" y="74" textAnchor="middle" fill="currentColor" fontSize="16">{table.seats}</text>}
  </svg>;
}

export function TablePlanner({ title, value, onChange, allowedSizes, preferredSize, draft = false, minSeats = 2 }: {
  title: string; value: TableLayout[]; onChange: (tables: TableLayout[]) => void;
  allowedSizes: number[]; preferredSize: number; draft?: boolean; minSeats?: number;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => { setSelected(current => current.filter(index => index < value.length)); }, [value.length]);
  const [bulkShape, setBulkShape] = useState<TableShape>('square');
  const [bulkSeats, setBulkSeats] = useState(Math.max(minSeats, preferredSize));
  const patch = (indices: number[], update: Partial<TableLayout>) => onChange(value.map((table, index) => indices.includes(index) ? { ...table, ...update } : table));
  const selectClass = 'min-h-11 rounded-lg border border-muted/30 bg-surface px-2 text-sm text-ink';
  const shapeOptions = <>{(['square', 'rectangle', 'round'] as const).map(shape => <option key={shape} value={shape}>{t(`tablePlan.${shape}`)}</option>)}</>;
  const seatsOptions = <>{Array.from({ length: 17 - minSeats }, (_, index) => index + minSeats).map(seats => <option key={seats} value={seats}>{t('tablePlan.seats', { count: seats })}</option>)}</>;
  return <fieldset className="mb-5 rounded-2xl border border-muted/25 p-3">
    <legend className="px-2 font-semibold">{title}</legend>
    <p className="mb-3 text-sm text-muted">{t(draft ? 'tablePlan.draftHint' : 'tablePlan.playHint')}</p>
    <label className="mb-3 flex items-center gap-3 text-sm">{t('tablePlan.count')}
      <input aria-label={`${title} — ${t('tablePlan.count')}`} type="number" min={1} max={40} value={value.length}
        className={`${selectClass} w-20`} onChange={event => {
          const count = Math.min(40, Math.max(1, Number(event.target.value) || 1));
          setSelected([]);
          onChange(Array.from({ length: count }, (_, index) => value[index] ?? { ...value[value.length - 1]! }));
        }} />
    </label>
    <details className="mb-3 rounded-xl border border-muted/20 p-2">
      <summary className="cursor-pointer py-2 text-sm font-semibold">{t('tablePlan.editSeveral')}</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="glass" type="button" onClick={() => setSelected(value.map((_, index) => index))}>{t('tablePlan.selectAll')}</Button>
        <Button size="sm" variant="glass" type="button" onClick={() => setSelected([])}>{t('tablePlan.clearSelection')}</Button>
        <select aria-label={t('tablePlan.bulkShape')} value={bulkShape} onChange={event => setBulkShape(event.target.value as TableShape)} className={selectClass}>{shapeOptions}</select>
        <select aria-label={t('tablePlan.bulkSeats')} value={Math.max(minSeats, bulkSeats)} onChange={event => setBulkSeats(Number(event.target.value))} className={selectClass}>{seatsOptions}</select>
        <Button size="sm" type="button" disabled={!selected.length} onClick={() => patch(selected, { shape: bulkShape, seats: Math.max(minSeats, bulkSeats) })}>
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
          <TablePreview table={table} parts={parts} />
          <div className="grid grid-cols-2 gap-2">
            <select aria-label={t('tablePlan.shapeFor', { number: index + 1 })} className={`${selectClass} min-w-0`} value={table.shape} onChange={event => patch([index], { shape: event.target.value as TableShape })}>{shapeOptions}</select>
            <select aria-label={t('tablePlan.seatsFor', { number: index + 1 })} className={`${selectClass} min-w-0`} value={table.seats} onChange={event => patch([index], { seats: Number(event.target.value) })}>{seatsOptions}</select>
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

export function LimitedTablePlanner({ value, players, hasDraft, onChange }: {
  value?: LimitedTablePlan; players: number; hasDraft: boolean; onChange: (plan: LimitedTablePlan) => void;
}) {
  const { t } = useTranslation();
  const plan = value ?? defaultLimitedTablePlan(players, hasDraft);
  const spaces = plan.play.reduce((sum, table) => sum + Math.floor(table.seats / 2), 0);
  const neededSpaces = Math.floor(players / 2) * Math.max(1, hasDraft ? plan.draft.length : 1);
  return <>
    {hasDraft && <TablePlanner title={t('tablePlan.drafting')} value={plan.draft} onChange={draft => onChange({ ...plan, draft })}
      allowedSizes={[players]} preferredSize={players} minSeats={players} draft />}
    <TablePlanner title={t('tablePlan.playing')} value={plan.play} onChange={play => onChange({ ...plan, play })} allowedSizes={[2]} preferredSize={2} />
    {spaces < neededSpaces && <p role="alert" className="mb-3 text-sm text-danger">{t('tablePlan.needSpaces', { count: neededSpaces })}</p>}
  </>;
}
