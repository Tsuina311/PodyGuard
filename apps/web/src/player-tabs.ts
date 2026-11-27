import type { MouseEvent } from 'react';
import { playerPath, playerStorageCode } from './player-sessions';

export function playerTabName(joinCode: string, scope = ''): string {
  return `podyguard-player-${playerStorageCode(joinCode, scope)}`;
}

/** Reuse without navigating an ongoing game; retain normal link behavior if blocked. */
export function continueInPlayerTab(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.currentTarget;
  const tab = window.open('', link.target);
  if (!tab) return;
  event.preventDefault();
  if (tab.location.href === 'about:blank') tab.location.replace(link.href);
  tab.focus();
}

export function playerTabLink(joinCode: string, scope = '') {
  return {
    href: `#${playerPath(joinCode, scope)}`,
    target: playerTabName(joinCode, scope),
    onClick: continueInPlayerTab,
  };
}
