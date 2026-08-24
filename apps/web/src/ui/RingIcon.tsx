import ringMask from './assets/one-ring.png';
import { cx } from './cx';

/**
 * The One Ring, drawn as a mask rather than an image so the line art takes
 * currentColor the way a lucide glyph does. The source is black on
 * transparency, so its alpha channel is the shape and the colour comes from
 * the button, which keeps it legible in both themes and when a seat is active.
 */
export function RingIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx('inline-block shrink-0 bg-current', className)}
      style={{
        width: size,
        height: size,
        maskImage: `url(${ringMask})`,
        WebkitMaskImage: `url(${ringMask})`,
        // The trace is cropped flush to its edges, and lucide glyphs carry a
        // little padding, so it is inset to sit at the same weight beside them.
        maskSize: '88%',
        WebkitMaskSize: '88%',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  );
}
