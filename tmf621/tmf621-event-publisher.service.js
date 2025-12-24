"use strict";

/**
 * ============================================================================
 * TMF621 Event Publisher Service - AI Generated Implementation
 * ============================================================================
 *
 * This file implements event publishing for the TMF621 Trouble Ticket API.
 * Generated based on TMF632 event-publisher service reference patterns.
 *
 * KEY ARCHITECTURE PATTERNS:
 *
 * 1. DUAL EVENT PUBLISHING STRATEGY:
 *    - Internal: Publishes events to Moleculer event bus using broker.emit()
 *    - External: Posts events to external webhook service via HTTP
 *
 * 2. EVENT TYPES (TMF Standard):
 *    - TroubleTicketCreateEvent: Trouble ticket created
 *    - TroubleTicketAttributeValueChangeEvent: Trouble ticket fields updated
 *    - TroubleTicketStatusChangeEvent: Trouble ticket status changed
 *    - TroubleTicketDeleteEvent: Trouble ticket deleted
 *    - TroubleTicketResolvedEvent: Trouble ticket resolved
 *    - TroubleTicketInformationRequiredEvent: Additional information required
 *
 * 3. GRACEFUL ERROR HANDLING:
 *    - Internal event publishing (broker.emit) always succeeds
 *    - External webhook posting errors are logged but don't fail the operation
 */

const axios = require("axios");

module.exports = {
	name: "tmf621.event-publisher",
	version: 1,

	settings: {
		/**
		 * Webhook service URL for external event notifications
		 */
		webhookServiceUrl: process.env.WEBHOOK_SERVICE_URL || "http://localhost:4000/webhook"
	},

	dependencies: [],

	actions: {
		/**
		 * PUBLISH Action - Publish TMF events to internal and external channels
		 *
		 * Parameters:
		 * - eventType: TMF event type name (e.g., "TroubleTicketCreateEvent")
		 * - event: Complete event payload with eventType, eventTime, and event data
		 *
		 * Returns:
		 * - { success: true, eventType: "..." }
		 */
		publish: {
			scope: ["event-publisher.publish"],
			rest: {
				method: "POST",
				path: "/publish"
			},
			cache: false,
			params: {
				eventType: { type: "string" },
				event: { type: "object" }
			},
			async handler(ctx) {
				const { eventType, event } = ctx.params;

				// STEP 1: Publish to internal Moleculer event bus
				this.broker.emit(eventType, event);

				// STEP 2: Publish to external webhook service
				try {
					await axios.post(this.settings.webhookServiceUrl, {
						eventType,
						event,
						timestamp: new Date().toISOString()
					});
					this.logger.info(`Event published to webhook service: ${eventType}`);
				} catch (error) {
					// Graceful degradation: Log error but don't fail
					this.logger.error(`Failed to publish event to webhook service: ${eventType}`, error);
				}

				return { success: true, eventType };
			}
		}
	},

	started() {
		this.logger.info("TMF621 Event Publisher service started");
	}
};
