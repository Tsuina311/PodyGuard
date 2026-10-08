/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { readDeveloperMode, writeDeveloperMode } from './developer-mode';

afterEach(() => {
  localStorage.clear();
});

describe('developer mode', () => {
  it('stays off until toggled, and survives a reload of this browser', () => {
    expect(readDeveloperMode()).toBe(false);
    writeDeveloperMode(true);
    expect(readDeveloperMode()).toBe(true);
    writeDeveloperMode(false);
    expect(readDeveloperMode()).toBe(false);
  });
});
