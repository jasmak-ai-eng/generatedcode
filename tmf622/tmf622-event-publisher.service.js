"use strict";

/**
 * ============================================================================
 * TMF622 Event Publisher Service - AI Generated Implementation
 * ============================================================================
 *
 * This file implements the TMF622 Event Publisher following the reference
 * patterns from TMF632 Event Publisher Service.
 *
 * KEY ARCHITECTURE PATTERNS:
 *
 * 1. DUAL EVENT PUBLISHING STRATEGY:
 *    - Internal: Publishes events to Moleculer event bus using broker.emit()
 *    - External: Posts events to external webhook service via HTTP
 *
 * 2. EVENT TYPES (TMF Standard):
 *    - ProductOrderCreateEvent: Order created
 *    - ProductOrderAttributeValueChangeEvent: Order fields updated
 *    - ProductOrderStateChangeEvent: Order state changed
 *    - ProductOrderDeleteEvent: Order deleted
 *    - CancelProductOrderCreateEvent: Cancel request created
 *    - CancelProductOrderStateChangeEvent: Cancel request state changed
 *
 * 3. GRACEFUL ERROR HANDLING:
 *    - Internal event publishing always succeeds
 *    - External webhook posting errors are logged but don't fail the operation
 */

const axios = require("axios");

module.exports = {
	name: "tmf622.event-publisher",
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
		 * PATTERN: Dual-channel event publishing with graceful degradation
		 *
		 * Publishing Flow:
		 * 1. Emit event to internal Moleculer event bus (broker.emit)
		 * 2. Post event to external webhook service (HTTP POST)
		 *
		 * Parameters:
		 * - eventType: TMF event type name (e.g., "ProductOrderCreateEvent")
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
		this.logger.info("TMF622 Event Publisher service started");
	}
};
