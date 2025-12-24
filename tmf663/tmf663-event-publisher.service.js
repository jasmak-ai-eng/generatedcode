"use strict";

/**
 * ============================================================================
 * TMF663 Event Publisher Service
 * ============================================================================
 *
 * This service handles publishing TMF663 Shopping Cart events.
 * It follows the TMF Open API event notification patterns.
 *
 * SUPPORTED EVENT TYPES:
 * - ShoppingCartCreateEvent
 * - ShoppingCartAttributeValueChangeEvent
 * - ShoppingCartDeleteEvent
 *
 * INTEGRATION PATTERNS:
 * - Internal Moleculer event bus (broker.emit)
 * - External webhook service (HTTP POST)
 */

const axios = require("axios");

module.exports = {
	name: "tmf663.event-publisher",
	version: 1,

	settings: {
		webhookServiceUrl: process.env.WEBHOOK_SERVICE_URL || "http://localhost:4000/webhook"
	},

	dependencies: [],

	actions: {
		/**
		 * PUBLISH Action - Publish TMF events to internal and external channels
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

				// Publish to internal Moleculer event bus
				this.broker.emit(eventType, event);

				// Publish to external webhook service
				try {
					await axios.post(this.settings.webhookServiceUrl, {
						eventType,
						event,
						timestamp: new Date().toISOString()
					});
					this.logger.info(`Event published to webhook service: ${eventType}`);
				} catch (error) {
					this.logger.error(`Failed to publish event to webhook service: ${eventType}`, error);
				}

				return { success: true, eventType };
			}
		}
	},

	started() {
		this.logger.info("TMF663 Event Publisher service started");
	}
};
