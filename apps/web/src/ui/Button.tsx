import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * Button variants follow the IndoUI Tailwind recipes (primary, neon glow,
 * outline, glass, ghost) retuned to the PodyGuard blue palette.
 */
export type ButtonVariant = 'primary' | 'neon' | 'outline' | 'glass' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'group relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-wide whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-neon/70 focus-visible:ring-offset-2 focus-visible:ring-offset-void active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-beam to-neon text-void shadow-[0_0_24px_-6px_var(--color-neon)] hover:brightness-110 hover:shadow-[0_0_32px_-4px_var(--color-neon)]',
  neon: 'border border-neon/50 bg-neon/10 text-neon shadow-[0_0_18px_-6px_var(--color-neon)] hover:bg-neon/20 hover:shadow-[0_0_28px_-4px_var(--color-neon)]',
  outline:
    'border border-beam/40 text-ink hover:border-beam/80 hover:bg-beam/10',
  glass:
    'border border-muted/20 bg-ink/5 text-ink backdrop-blur-md hover:border-muted/35 hover:bg-ink/10',
  ghost: 'text-muted hover:bg-ink/5 hover:text-ink',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-7 text-base',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        base,
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
