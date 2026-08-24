import type { HostIdentity } from '@podyguard/shared';
import type { AuthProvider, HostAuthCredentials } from './auth-provider.js';
import { HostAuthDeferredError } from './errors.js';

/**
 * Current-phase host auth. Neon Auth is not wired until persistent
 * organiser accounts exist. Event-local host PINs are not this provider.
 */
export class DeferredHostAuthProvider implements AuthProvider {
  authenticateHost(_credentials: HostAuthCredentials): Promise<HostIdentity> {
    return Promise.reject(new HostAuthDeferredError());
  }
}
