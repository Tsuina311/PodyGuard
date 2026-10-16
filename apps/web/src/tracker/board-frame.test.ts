import { describe, expect, it } from 'vitest';
import {
  boardFrameClass,
  inBoardOverlayClass,
  trackerOverlayClass,
} from './board-frame';

describe('boardFrameClass', () => {
  it('fills the viewport and does not rotate it', () => {
    const frame = boardFrameClass();
    expect(frame).toContain('inset-x-0');
    expect(frame).toContain('h-[100dvh]');
    expect(frame).toContain('w-full');
    expect(frame).not.toContain('rotate');
    expect(frame).not.toContain('board-landscape');
  });
});

describe('trackerOverlayClass', () => {
  it('uses the same unrotated frame as the board', () => {
    const overlay = trackerOverlayClass('z-50', 'bg-void/95');
    expect(overlay).toContain('fixed');
    expect(overlay).toContain('h-[100dvh]');
    expect(overlay).toContain('z-50');
    expect(overlay).not.toContain('rotate');
    expect(overlay).not.toContain('board-landscape');
  });
});

describe('inBoardOverlayClass', () => {
  it('fills the board shell without rotating', () => {
    const overlay = inBoardOverlayClass('z-50', 'bg-void/95');
    expect(overlay).toContain('absolute');
    expect(overlay).toContain('inset-0');
    expect(overlay).toContain('z-50');
    expect(overlay).not.toContain('rotate');
    expect(overlay).not.toContain('fixed');
  });
});
