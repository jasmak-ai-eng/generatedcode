"use strict";

const axios = require('axios');

module.exports = {
  name: "tmf621.event-publisher",
  version: 1,

  settings: {
    webhookServiceUrl: process.env.WEBHOOK_SERVICE_URL || "http://localhost:4000/webhook"
  },

  dependencies: [],

  actions: {
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

        this.broker.emit(eventType, event);

        try {
          await axios.post(this.settings.webhookServiceUrl, {
            eventType,
            event,
            timestamp: new Date().toISOString()
          });
          this.logger.info(`Event published to webhook service: ${eventType}`);
        } catch (error) {
          this.logger.error(`Failed to publish event to webhook service: ${eventType}`, error.message);
        }

        return { success: true, eventType };
      }
    }
  },

  started() {
    this.logger.info("TMF621 Event Publisher service started");
  }
};
