import { ActorKind, type HostIdentity } from '@poderate/shared';

/**
 * Neon Auth → HostIdentity adapter.
 *
 * Import this module only from a future Neon Auth integration.
 * Authorization and domain code must depend on HostIdentity, never on
 * Neon Auth SDK types or this DTO.
 *
 * Participants are out of scope: they use event-scoped guest sessions.
 */
export type NeonAuthAccountDto = {
  neonUserId: string;
  email?: string | null;
};

/**
 * Binding stored by our app: our organiser account id + Neon subject.
 * Look up / create the organiser row, then call toHostIdentity.
 */
export type HostAccountBinding = {
  accountId: string;
  provider: 'neon-auth';
  providerSubject: string;
};

export function bindingFromNeonAuthAccount(
  account: NeonAuthAccountDto,
  accountId: string,
): HostAccountBinding {
  return {
    accountId,
    provider: 'neon-auth',
    providerSubject: account.neonUserId,
  };
}

export function toHostIdentity(binding: HostAccountBinding): HostIdentity {
  return {
    kind: ActorKind.Host,
    accountId: binding.accountId,
  };
}
