import type { HostIdentity } from '@podyguard/shared';

/**
 * Authenticates persistent organisers only.
 * Casual event participants must not go through this interface.
 */
export type HostAuthCredentials = {
  accessToken: string;
};

export interface AuthProvider {
  authenticateHost(credentials: HostAuthCredentials): Promise<HostIdentity>;
}
