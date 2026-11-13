import { useEffect, useRef, useState } from 'react';
import { ApiError, getGoogleSignInConfiguration, signInWithGoogle } from './api';
import { Button } from './ui/Button';

type GoogleIdentity = {
  initialize(options: {
    client_id: string;
    nonce: string;
    auto_select: boolean;
    callback: (response: { credential: string }) => void;
  }): void;
  renderButton(parent: HTMLElement, options: {
    type: string; theme: string; size: string; text: string; width: number;
  }): void;
};

declare global {
  interface Window { google?: { accounts: { id: GoogleIdentity } } }
}

let library: Promise<GoogleIdentity> | undefined;
function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (library) return library;
  library = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error('Google sign-in could not load. Check your connection or browser blocking settings, then try again.'));
    };
    const timeout = window.setTimeout(fail, 15_000);
    script.onload = () => {
      clearTimeout(timeout);
      if (window.google?.accounts.id) resolve(window.google.accounts.id);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch(error => { library = undefined; throw error; });
  return library;
}

export function GoogleSignInButton({ onSignedIn }: {
  onSignedIn: (result: Awaited<ReturnType<typeof signInWithGoogle>>) => void | Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const onSuccess = useRef(onSignedIn);
  onSuccess.current = onSignedIn;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'busy' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let submitting = false;
    setStatus('loading');
    setError(null);
    const target = container.current;
    target?.replaceChildren();
    void (async () => {
      const config = await getGoogleSignInConfiguration();
      if (cancelled) return;
      if (!config.enabled) throw new Error('Google sign-in is not available yet. You can still join events without an account.');
      const google = await loadGoogleIdentity();
      if (cancelled || !target) return;
      google.initialize({
        client_id: config.clientId,
        nonce: config.nonce,
        auto_select: false,
        callback: response => {
          if (cancelled || submitting) return;
          submitting = true;
          setStatus('busy');
          void signInWithGoogle(response.credential, config.nonce).then(async result => {
            if (!cancelled) await onSuccess.current(result);
          }).catch(caught => {
            if (cancelled) return;
            target.replaceChildren();
            setStatus('error');
            setError(caught instanceof ApiError ? caught.message : 'Could not sign in. Please try again.');
          });
        },
      });
      google.renderButton(target, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: 280 });
      setStatus('ready');
    })().catch(caught => {
      if (cancelled) return;
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Could not load sign-in. Please try again.');
    });
    return () => { cancelled = true; target?.replaceChildren(); };
  }, [attempt]);

  return (
    <div className="space-y-3">
      <div ref={container} className={status === 'busy' ? 'pointer-events-none opacity-60' : ''} />
      {status === 'loading' ? <p role="status" className="text-muted text-sm">Loading Google sign-in...</p> : null}
      {status === 'busy' ? <p role="status" className="text-muted text-sm">Signing in...</p> : null}
      {error ? <p role="alert" className="text-danger text-sm">{error}</p> : null}
      {status === 'error' ? <Button type="button" variant="glass" onClick={() => setAttempt(value => value + 1)}>Try again</Button> : null}
    </div>
  );
}
