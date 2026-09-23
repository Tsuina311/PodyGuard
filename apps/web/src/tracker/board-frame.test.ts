import { describe, expect, it } from 'vitest';
import {
  forceRotateFrameClass,
  inBoardOverlayClass,
  seatFacingContentClass,
  trackerOverlayClass,
} from './board-frame';

describe('forceRotateFrameClass', () => {
  it('fills the natural viewport when the phone is already landscape', () => {
    const frame = forceRotateFrameClass(false);
    expect(frame).toContain('inset-x-0');
    expect(frame).toContain('h-[100dvh]');
    expect(frame).not.toContain('rotate-90');
    expect(frame).not.toContain('board-landscape');
  });

  it('matches the CSS-rotated board shell on a portrait phone', () => {
    const frame = forceRotateFrameClass(true);
    expect(frame).toContain('board-landscape');
    expect(frame).toContain('rotate-90');
    expect(frame).toContain('h-[100dvw]');
    expect(frame).toContain('w-[100dvh]');
    expect(frame).toContain('top-1/2');
    expect(frame).toContain('left-1/2');
  });
});

describe('trackerOverlayClass', () => {
  it('always uses the board frame so sheets stay horizontal with the tracker', () => {
    const overlay = trackerOverlayClass(true, 'z-50', 'bg-void/95');
    expect(overlay).toContain('fixed');
    expect(overlay).toContain('rotate-90');
    expect(overlay).toContain('board-landscape');
    expect(overlay).toContain('z-50');
    expect(overlay).not.toContain('h-[100dvh]');
  });

  it('keeps a full-height frame when the OS is already landscape', () => {
    const overlay = trackerOverlayClass(false, 'z-50');
    expect(overlay).toContain('h-[100dvh]');
    expect(overlay).not.toContain('rotate-90');
  });
});

describe('inBoardOverlayClass', () => {
  it('fills the board shell without a second rotate-90', () => {
    const overlay = inBoardOverlayClass('z-50', 'bg-void/95');
    expect(overlay).toContain('absolute');
    expect(overlay).toContain('inset-0');
    expect(overlay).toContain('z-50');
    expect(overlay).not.toContain('rotate-90');
    expect(overlay).not.toContain('fixed');
  });
});

describe('seatFacingContentClass', () => {
  it('flips far-side content without owning the shell rotate', () => {
    expect(seatFacingContentClass(true)).toBe('landscape:rotate-180');
    expect(seatFacingContentClass(false)).toBe('');
  });
});
