import { describe, expect, it } from 'vitest';
import {
  createDiagnosticId,
  listJoinBreadcrumbs,
  recordJoinBreadcrumb,
  resetJoinDiagnosticsForTests,
} from './join-diagnostics';

describe('join-diagnostics', () => {
  it('creates opaque PG- references without secrets', () => {
    resetJoinDiagnosticsForTests();
    const id = createDiagnosticId();
    expect(id).toMatch(/^PG-[0-9A-F]{4}$/);
    expect(id).not.toMatch(/ps1\.|hs1\.|Bearer/i);
  });

  it('records privacy-safe breadcrumbs', () => {
    resetJoinDiagnosticsForTests();
    recordJoinBreadcrumb('PAGE_BOOT');
    recordJoinBreadcrumb('JOIN_FAILED', 'EVENT_NOT_JOINABLE');
    const entries = listJoinBreadcrumbs();
    expect(entries.map((row) => row.stage)).toEqual([
      'PAGE_BOOT',
      'JOIN_FAILED',
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/token|authorization|ps1\./i);
  });
});
