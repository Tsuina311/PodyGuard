import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  wrapperClassName?: string;
};

export function Field({
  label,
  hint,
  className,
  wrapperClassName,
  ...rest
}: FieldProps) {
  return (
    <label className={cx('mb-4 flex flex-col gap-1.5', wrapperClassName)}>
      <span className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
        {label}
      </span>
      <input
        className={cx(
          'h-11 rounded-xl border border-muted/20 bg-void/70 px-3.5 text-ink transition-colors duration-200 outline-none',
          'placeholder:text-muted/50 focus:border-neon/70 focus:ring-2 focus:ring-neon/25',
          className,
        )}
        {...rest}
      />
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
