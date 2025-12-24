"use strict";

/**
 * ============================================================================
 * TMF637 Event Publisher Service
 * ============================================================================
 *
 * This service handles publishing TMF637 Product Inventory events.
 * It follows the TMF Open API event notification patterns.
 *
 * SUPPORTED EVENT TYPES:
 * - ProductCreateEvent
 * - ProductAttributeValueChangeEvent
 * - ProductStateChangeEvent
 * - ProductDeleteEvent
 * - ProductBatchEvent
 *
 * INTEGRATION PATTERNS:
 * - Message broker (NATS/Kafka/RabbitMQ)
 * - Webhook delivery
 * - Event hub subscriptions
 */

const cuid = require("cuid");

module.exports = {
	name: "tmf637.event-publisher",
	version: 1,

	settings: {
		apiDomain: "ProductInventory",
		apiVersion: "v5.0.0",
		apiName: "TMF637",
		eventTopicPrefix: "tmf637.product",
		baseUrl: process.env.API_BASE_URL || "http://localhost:3000",
		hubEndpoint: "/api/v1/tmf637/hub"
	},

	dependencies: [],

	actions: {
		/**
		 * PUBLISH Action - Publish TMF event to message broker and webhooks
		 *
		 * @param {String} eventType - The type of event (ProductCreateEvent, etc.)
		 * @param {Object} event - The event payload
		 */
		publish: {
			params: {
				eventType: {
					type: "enum",
					values: [
						"ProductCreateEvent",
						"ProductAttributeValueChangeEvent",
						"ProductStateChangeEvent",
						"ProductDeleteEvent",
						"ProductBatchEvent"
					]
				},
				event: { type: "object" }
			},
			async handler(ctx) {
				const { eventType, event } = ctx.params;
				const clientId = ctx.meta.clientId;

				const enrichedEvent = this.enrichEvent(eventType, event, clientId);

				try {
					await this.publishToMessageBroker(ctx, eventType, enrichedEvent);
				} catch (error) {
					this.logger.error(`Failed to publish to message broker: ${error.message}`);
				}

				try {
					await this.deliverToWebhooks(ctx, eventType, enrichedEvent, clientId);
				} catch (error) {
					this.logger.error(`Failed to deliver to webhooks: ${error.message}`);
				}

				return {
					success: true,
					eventId: enrichedEvent.eventId,
					eventType: enrichedEvent.eventType,
					eventTime: enrichedEvent.eventTime
				};
			}
		},

		/**
		 * SUBSCRIBE Action - Register a webhook subscription (Hub)
		 *
		 * @param {String} callback - The webhook URL to receive events
		 * @param {String} query - Optional filter query for events
		 */
		subscribe: {
			rest: {
				method: "POST",
				path: "/hub"
			},
			params: {
				callback: { type: "url" },
				query: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { callback, query } = ctx.params;
				const clientId = ctx.meta.clientId;

				const existingSubscription = await ctx.call("v1.db.event_subscription.findOne", {
					query: { clientId, callback }
				});

				if (existingSubscription) {
					return {
						id: existingSubscription.id,
						callback: existingSubscription.callback,
						query: existingSubscription.query,
						"@type": "Hub"
					};
				}

				const subscriptionId = cuid();
				const subscription = await ctx.call("v1.db.event_subscription.create", {
					id: subscriptionId,
					clientId,
					callback,
					query: query || null,
					apiDomain: this.settings.apiDomain,
					createdAt: new Date().toISOString()
				});

				this.logger.info(`New event subscription created: ${subscriptionId} for callback: ${callback}`);

				return {
					id: subscription.id,
					callback: subscription.callback,
					query: subscription.query,
					"@type": "Hub"
				};
			}
		},

		/**
		 * UNSUBSCRIBE Action - Remove a webhook subscription
		 *
		 * @param {String} id - The subscription ID to remove
		 */
		unsubscribe: {
			rest: {
				method: "DELETE",
				path: "/hub/:id"
			},
			params: {
				id: { type: "string" }
			},
			async handler(ctx) {
				const { id } = ctx.params;
				const clientId = ctx.meta.clientId;

				const subscription = await ctx.call("v1.db.event_subscription.get", {
					id,
					clientId
				});

				if (!subscription) {
					const error = new Error(`Subscription with id ${id} not found`);
					error.code = 404;
					error.type = "NOT_FOUND";
					throw error;
				}

				await ctx.call("v1.db.event_subscription.remove", { id, clientId });

				this.logger.info(`Event subscription removed: ${id}`);

				return null;
			}
		},

		/**
		 * GET SUBSCRIPTION Action - Retrieve subscription details
		 *
		 * @param {String} id - The subscription ID
		 */
		getSubscription: {
			rest: {
				method: "GET",
				path: "/hub/:id"
			},
			params: {
				id: { type: "string" }
			},
			async handler(ctx) {
				const { id } = ctx.params;
				const clientId = ctx.meta.clientId;

				const subscription = await ctx.call("v1.db.event_subscription.get", {
					id,
					clientId
				});

				if (!subscription) {
					const error = new Error(`Subscription with id ${id} not found`);
					error.code = 404;
					error.type = "NOT_FOUND";
					throw error;
				}

				return {
					id: subscription.id,
					callback: subscription.callback,
					query: subscription.query,
					"@type": "Hub"
				};
			}
		},

		/**
		 * LIST SUBSCRIPTIONS Action - List all subscriptions for the client
		 */
		listSubscriptions: {
			rest: {
				method: "GET",
				path: "/hub"
			},
			params: {
				offset: { type: "number", integer: true, min: 0, default: 0, optional: true, convert: true },
				limit: { type: "number", integer: true, min: 1, max: 100, default: 20, optional: true, convert: true }
			},
			async handler(ctx) {
				const { offset, limit } = ctx.params;
				const clientId = ctx.meta.clientId;

				const subscriptions = await ctx.call("v1.db.event_subscription.find", {
					query: { clientId, apiDomain: this.settings.apiDomain },
					offset,
					limit,
					sort: "-createdAt"
				});

				const total = await ctx.call("v1.db.event_subscription.count", {
					query: { clientId, apiDomain: this.settings.apiDomain }
				});

				return {
					data: subscriptions.map((s) => ({
						id: s.id,
						callback: s.callback,
						query: s.query,
						"@type": "Hub"
					})),
					meta: { total, offset, limit, hasMore: offset + limit < total }
				};
			}
		}
	},

	methods: {
		/**
		 * Enrich event with standard TMF fields
		 */
		enrichEvent(eventType, event, clientId) {
			const now = new Date().toISOString();

			return {
				eventId: cuid(),
				eventTime: now,
				eventType,
				correlationId: event.correlationId || cuid(),
				domain: this.settings.apiDomain,
				title: eventType,
				description: `${eventType} notification`,
				priority: this.getEventPriority(eventType),
				timeOccurred: event.timeOccurred || now,
				"@type": eventType,
				"@baseType": "Event",
				"@schemaLocation": `${this.settings.baseUrl}/schema/${this.settings.apiName}/${eventType}.json`,
				source: {
					id: this.settings.apiName,
					name: `${this.settings.apiName} ${this.settings.apiDomain} API`,
					"@type": "EventSource"
				},
				reportingSystem: {
					id: "product-inventory-service",
					name: "TMF637 Product Inventory Service",
					"@type": "ReportingSystem"
				},
				...event
			};
		},

		/**
		 * Get event priority based on type
		 */
		getEventPriority(eventType) {
			const priorities = {
				ProductCreateEvent: "1",
				ProductStateChangeEvent: "1",
				ProductDeleteEvent: "2",
				ProductAttributeValueChangeEvent: "3",
				ProductBatchEvent: "2"
			};
			return priorities[eventType] || "3";
		},

		/**
		 * Publish event to message broker (NATS/Kafka/RabbitMQ)
		 */
		async publishToMessageBroker(ctx, eventType, event) {
			const topic = `${this.settings.eventTopicPrefix}.${this.eventTypeToTopic(eventType)}`;

			try {
				if (ctx.broker.transit) {
					await ctx.emit(topic, event);
					this.logger.debug(`Published event to topic: ${topic}`);
				}
			} catch (error) {
				this.logger.warn(`Message broker not available: ${error.message}`);
			}
		},

		/**
		 * Convert event type to topic name
		 */
		eventTypeToTopic(eventType) {
			const mapping = {
				ProductCreateEvent: "created",
				ProductAttributeValueChangeEvent: "attributeValueChanged",
				ProductStateChangeEvent: "stateChanged",
				ProductDeleteEvent: "deleted",
				ProductBatchEvent: "batch"
			};
			return mapping[eventType] || eventType.toLowerCase();
		},

		/**
		 * Deliver event to registered webhooks
		 */
		async deliverToWebhooks(ctx, eventType, event, clientId) {
			try {
				const subscriptions = await ctx.call("v1.db.event_subscription.find", {
					query: {
						clientId,
						apiDomain: this.settings.apiDomain
					}
				});

				const deliveryPromises = subscriptions
					.filter((sub) => this.matchesQuery(sub.query, eventType, event))
					.map((sub) => this.deliverToWebhook(ctx, sub, event));

				const results = await Promise.allSettled(deliveryPromises);

				const failures = results.filter((r) => r.status === "rejected");
				if (failures.length > 0) {
					this.logger.warn(`${failures.length} webhook deliveries failed`);
				}
			} catch (error) {
				this.logger.error(`Failed to deliver webhooks: ${error.message}`);
			}
		},

		/**
		 * Check if event matches subscription query
		 */
		matchesQuery(query, eventType, event) {
			if (!query) return true;

			try {
				if (query.includes("eventType=")) {
					const queryEventType = query.split("eventType=")[1].split("&")[0];
					if (queryEventType !== eventType) {
						return false;
					}
				}

				return true;
			} catch (error) {
				this.logger.warn(`Failed to parse query: ${query}`);
				return true;
			}
		},

		/**
		 * Deliver event to a single webhook
		 */
		async deliverToWebhook(ctx, subscription, event) {
			const maxRetries = 3;
			const retryDelay = 1000;

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					const response = await fetch(subscription.callback, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-Event-Type": event.eventType,
							"X-Event-Id": event.eventId,
							"X-Correlation-Id": event.correlationId
						},
						body: JSON.stringify(event),
						timeout: 10000
					});

					if (response.ok || response.status === 204) {
						this.logger.debug(`Webhook delivered successfully to: ${subscription.callback}`);
						return { success: true, subscriptionId: subscription.id };
					}

					if (response.status >= 400 && response.status < 500) {
						this.logger.warn(
							`Webhook delivery failed with client error ${response.status}: ${subscription.callback}`
						);
						return { success: false, subscriptionId: subscription.id, status: response.status };
					}

					throw new Error(`Server error: ${response.status}`);
				} catch (error) {
					if (attempt < maxRetries) {
						this.logger.debug(
							`Webhook delivery attempt ${attempt} failed, retrying in ${retryDelay}ms: ${error.message}`
						);
						await this.delay(retryDelay * attempt);
					} else {
						this.logger.error(
							`Webhook delivery failed after ${maxRetries} attempts: ${subscription.callback} - ${error.message}`
						);
						throw error;
					}
				}
			}
		},

		/**
		 * Delay helper for retry logic
		 */
		delay(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		}
	},

	events: {
		/**
		 * Listen for internal product events and forward them
		 */
		"product.created"(ctx) {
			this.actions.publish(ctx, {
				eventType: "ProductCreateEvent",
				event: ctx.params
			});
		},

		"product.updated"(ctx) {
			this.actions.publish(ctx, {
				eventType: "ProductAttributeValueChangeEvent",
				event: ctx.params
			});
		},

		"product.stateChanged"(ctx) {
			this.actions.publish(ctx, {
				eventType: "ProductStateChangeEvent",
				event: ctx.params
			});
		},

		"product.deleted"(ctx) {
			this.actions.publish(ctx, {
				eventType: "ProductDeleteEvent",
				event: ctx.params
			});
		}
	},

	started() {
		this.logger.info(
			`TMF637 Event Publisher started - Domain: ${this.settings.apiDomain}, Version: ${this.settings.apiVersion}`
		);
	}
};
