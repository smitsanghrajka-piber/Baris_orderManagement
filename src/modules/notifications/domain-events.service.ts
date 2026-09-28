import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * The one way services announce something happened. Every DomainEvent is
 * delivered to NotificationDispatcher under the single emitter channel
 * `domain.event`, which keeps the event name inside the payload (Nest's
 * @OnEvent wrappers do not expose EventEmitter2's wildcard `this.event`).
 */
export interface DomainEvent {
  /** e.g. artwork.approved, spec.approved, customer_user.created */
  type: string;
  customerId?: string | null;
  entityType: string;
  entityId: string;
  title: string;
  body?: string;
  /** SPA route, e.g. /customers/<id> or /portal/artworks/<id> (portal links are rewritten per audience) */
  link?: string;
  portalLink?: string;
  /** For ACTOR_TARGET rules. */
  targetUserId?: string;
  targetCustomerUserId?: string;
  meta?: Record<string, unknown>;
}

export const DOMAIN_EVENT = 'domain.event';

@Injectable()
export class DomainEventsService {
  constructor(private readonly emitter: EventEmitter2) {}

  emit(event: DomainEvent) {
    // Fire-and-forget: notification failures never fail the business write.
    setImmediate(() => this.emitter.emit(DOMAIN_EVENT, event));
  }
}
