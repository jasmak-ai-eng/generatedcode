"use strict";

const cuid = require('cuid');

module.exports = {
  name: "tmf622.cancelProductOrder",
  version: 1,

  settings: {
    defaultPageSize: 20,
    maxPageSize: 100,
    baseUrl: process.env.API_BASE_URL || "http://localhost:3000"
  },

  dependencies: [],

  actions: {
    list: {
      scope: ["cancelProductOrder.list"],
      rest: {
        method: "GET",
        path: "/list"
      },
      cache: false,
      params: {
        fields: { type: "string", optional: true },
        offset: { type: "number", integer: true, min: 0, default: 0, optional: true, convert: true },
        limit: { type: "number", integer: true, min: 1, max: 100, default: 20, optional: true, convert: true },
        search: { type: "string", optional: true },
        searchFields: { type: "string", optional: true }
      },
      async handler(ctx) {
        const { fields, offset, limit, search, searchFields, ...filters } = ctx.params;
        const clientId = ctx.meta.clientId;

        if (search && !searchFields) {
          throw new Error("searchFields parameter is required when search parameter is provided", 400);
        }
        if (searchFields && !search) {
          throw new Error("search parameter is required when searchFields parameter is provided", 400);
        }

        const query = { clientId };
        Object.keys(filters).forEach(key => {
          if (filters[key] !== undefined) query[key] = filters[key];
        });

        if (search && searchFields) {
          const searchFieldList = searchFields.split(",").map(f => f.trim());
          const searchConditions = searchFieldList.map(field => ({
            [field]: { $regex: search, $options: "i" }
          }));
          query.$or = searchConditions;
        }

        const entities = await ctx.call("v1.db.cancel_product_order.find", {
          query,
          offset,
          limit,
          sort: "-createdAt"
        });

        const populated = await Promise.all(
          entities.map(entity => this.populateCancelProductOrder(ctx, entity))
        );

        const total = await ctx.call("v1.db.cancel_product_order.count", { query });

        let results = populated.map(entity => this.mapToSchema(entity));

        if (fields) {
          const fieldList = fields.split(",").map(f => f.trim());
          results = results.map(entity => this.filterFields(entity, fieldList));
        }

        return {
          data: results,
          meta: { total, offset, limit, hasMore: offset + limit < total }
        };
      }
    },

    create: {
      scope: ["cancelProductOrder.create"],
      rest: {
        method: "POST",
        path: "/create"
      },
      cache: false,
      params: {
        productOrder: { type: "object" },
        "@type": { type: "string", optional: true, default: "CancelProductOrder" },
        "@baseType": { type: "string", optional: true },
        "@schemaLocation": { type: "string", optional: true },
        cancellationReason: { type: "string", optional: true },
        requestedCancellationDate: { type: "string", optional: true },
        effectiveCancellationDate: { type: "string", optional: true },
        state: { type: "string", optional: true, default: "acknowledged" }
      },
      async handler(ctx) {
        this.validateRequiredFields(ctx.params);

        const entityData = { ...ctx.params };
        const clientId = ctx.meta.clientId;

        const id = cuid();
        entityData.id = id;
        entityData.clientId = clientId;
        entityData.creationDate = new Date().toISOString();

        if (!entityData["@type"]) entityData["@type"] = "CancelProductOrder";
        if (!entityData.state) entityData.state = "acknowledged";

        Object.keys(entityData).forEach(key => {
          if (entityData[key] === null) {
            entityData[key] = "null";
          }
        });

        const productOrderRef = entityData.productOrder;
        delete entityData.productOrder;

        const created = await ctx.call("v1.db.cancel_product_order.create", entityData);
        const entityId = created.id;

        created.href = `${this.settings.baseUrl}/api/v1/tmf622/cancelProductOrder/get/${entityId}`;
        await ctx.call("v1.db.cancel_product_order.update", {
          id: entityId,
          clientId,
          href: created.href
        });

        try {
          if (productOrderRef) {
            const productOrderRefId = cuid();
            await ctx.call("v1.db.product_order_ref.create", {
              id: productOrderRefId,
              clientId,
              parentId: entityId,
              ...productOrderRef,
              "@type": productOrderRef["@type"] || "ProductOrderRef"
            });
            created.productOrder = productOrderRefId;
            await ctx.call("v1.db.cancel_product_order.update", { 
              id: entityId, 
              clientId, 
              productOrder: productOrderRefId 
            });
          }

          const updatedEntity = await ctx.call("v1.db.cancel_product_order.get", { id: entityId, clientId });
          const populated = await this.populateCancelProductOrder(ctx, updatedEntity);
          const schemaFiltered = this.mapToSchema(populated);

          await ctx.call("v1.tmf622.event-publisher.publish", {
            eventType: "CancelProductOrderCreateEvent",
            event: {
              eventType: "CancelProductOrderCreateEvent",
              eventTime: new Date().toISOString(),
              event: { cancelProductOrder: schemaFiltered }
            }
          });

          return schemaFiltered;

        } catch (error) {
          await ctx.call("v1.db.cancel_product_order.remove", { id: entityId, clientId });
          throw error;
        }
      }
    },

    get: {
      scope: ["cancelProductOrder.get"],
      rest: {
        method: "GET",
        path: "/get/:id"
      },
      cache: false,
      params: {
        id: { type: "string" },
        fields: { type: "string", optional: true }
      },
      async handler(ctx) {
        const { id, fields } = ctx.params;
        const clientId = ctx.meta.clientId;

        if (!id || id.trim() === "") {
          throw new Error("ID is required", 400);
        }

        const entity = await ctx.call("v1.db.cancel_product_order.get", { id, clientId });
        if (!entity) {
          throw new Error(`CancelProductOrder with id ${id} not found`, 404);
        }

        const populated = await this.populateCancelProductOrder(ctx, entity);
        let result = this.mapToSchema(populated);

        if (fields) {
          const fieldList = fields.split(",").map(f => f.trim());
          result = this.filterFields(result, fieldList);
        }

        return result;
      }
    }
  },

  methods: {
    async populateCancelProductOrder(ctx, entity) {
      const populated = { ...entity };
      const clientId = ctx.meta.clientId;

      if (entity.productOrder) {
        const productOrderRef = await ctx.call("v1.db.product_order_ref.get", { 
          id: entity.productOrder, 
          clientId 
        }).catch(() => null);

        if (productOrderRef) {
          const refSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
          populated.productOrder = this.cleanEntity(productOrderRef, refSchema);
        }
      }

      return populated;
    },

    mapToSchema(data) {
      const schemaFields = [
        'id', 'href', 'cancellationReason', 'creationDate', 'requestedCancellationDate',
        'effectiveCancellationDate', 'state', 'productOrder', '@type', '@baseType', '@schemaLocation'
      ];
      const mapped = {};

      if (data.id !== undefined && data.id !== null && data.id !== "null" && data.id !== "") mapped.id = data.id;
      if (data.href !== undefined && data.href !== null && data.href !== "null" && data.href !== "") mapped.href = data.href;

      schemaFields.forEach(field => {
        if (field !== 'id' && field !== 'href') {
          const value = data[field];
          if (value !== undefined && value !== null && value !== "null" && value !== "" &&
              !(Array.isArray(value) && value.length === 0)) {
            mapped[field] = value;
          }
        }
      });

      return mapped;
    },

    cleanEntity(entity, schemaFields) {
      if (!entity) return null;

      const cleaned = {};

      if (entity.id !== undefined && entity.id !== null && entity.id !== "null" && entity.id !== "") cleaned.id = entity.id;
      if (entity.href !== undefined && entity.href !== null && entity.href !== "null" && entity.href !== "") cleaned.href = entity.href;

      schemaFields.forEach(field => {
        if (field !== 'id' && field !== 'href') {
          const value = entity[field];
          if (value !== undefined && value !== null && value !== "null" && value !== "" &&
              !(Array.isArray(value) && value.length === 0)) {
            cleaned[field] = value;
          }
        }
      });

      return cleaned;
    },

    validateRequiredFields(data) {
      const requiredFields = ['productOrder'];
      const missingFields = requiredFields.filter(field => !data[field]);

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(", ")}`, 400);
      }
    },

    filterFields(obj, fields) {
      const filtered = {};

      if (obj.id !== undefined && obj.id !== null) filtered.id = obj.id;
      if (obj.href !== undefined && obj.href !== null) filtered.href = obj.href;

      fields.forEach(field => {
        if (field !== 'id' && field !== 'href' && obj.hasOwnProperty(field) && obj[field] !== null && obj[field] !== "null") {
          filtered[field] = obj[field];
        }
      });

      if (obj["@type"] !== undefined && obj["@type"] !== null) filtered["@type"] = obj["@type"];

      return filtered;
    }
  },

  started() {
    this.logger.info("CancelProductOrder service started");
  }
};
