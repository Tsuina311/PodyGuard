import type {
  CommercialEntitlements,
  HostIdentity,
  OrganiserRole,
} from '@podyguard/shared';
import { ungatedEntitlements } from '@podyguard/shared';

/**
 * Application authorization. Inputs are HostIdentity (our type), never Neon Auth SDK types.
 *
 * The backend owns:
 * - event ownership
 * - organiser roles
 * - subscription tier
 * - participant capacity
 * - premium game modes
 * - Challenge Pack permissions
 */
export interface AuthorizationService {
  getOrganiserRole(
    host: HostIdentity,
    eventId: string,
  ): Promise<OrganiserRole | null>;
  assertCanManageEvent(host: HostIdentity, eventId: string): Promise<void>;
  resolveEntitlements(host: HostIdentity): Promise<CommercialEntitlements>;
}

export class EventManagementForbiddenError extends Error {
  readonly code = 'EVENT_MANAGEMENT_FORBIDDEN';

  constructor() {
    super('Host is not permitted to manage this event.');
    this.name = 'EventManagementForbiddenError';
  }
}

/**
 * Phase 0 stub: persistent host accounts do not exist yet, so no organiser
 * is bound to events. Entitlements stay commercially ungated until billing.
 */
export class BackendAuthorizationService implements AuthorizationService {
  getOrganiserRole(
    _host: HostIdentity,
    _eventId: string,
  ): Promise<OrganiserRole | null> {
    return Promise.resolve(null);
  }

  async assertCanManageEvent(
    host: HostIdentity,
    eventId: string,
  ): Promise<void> {
    const role = await this.getOrganiserRole(host, eventId);
    if (role === null) {
      throw new EventManagementForbiddenError();
    }
  }

  resolveEntitlements(_host: HostIdentity): Promise<CommercialEntitlements> {
    return Promise.resolve(ungatedEntitlements);
  }
}
