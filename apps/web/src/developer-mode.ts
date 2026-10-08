import { useEffect, useState } from 'react';

const STORAGE_KEY = 'podyguard.developer-mode';
const CHANGE_EVENT = 'podyguard-developer-mode';

export function readDeveloperMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeDeveloperMode(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode can refuse storage; the toggle still updates this tab */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDeveloperMode(): readonly [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readDeveloperMode);
  useEffect(() => {
    const sync = () => setOn(readDeveloperMode());
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);
  return [
    on,
    (next: boolean) => {
      writeDeveloperMode(next);
      setOn(next);
    },
  ];
}
