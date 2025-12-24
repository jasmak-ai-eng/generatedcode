"use strict";

const cuid = require('cuid');

module.exports = {
  name: "tmf622.productOrder",
  version: 1,

  settings: {
    defaultPageSize: 20,
    maxPageSize: 100,
    baseUrl: process.env.API_BASE_URL || "http://localhost:3000"
  },

  dependencies: [],

  actions: {
    list: {
      scope: ["productOrder.list"],
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

        const entities = await ctx.call("v1.db.product_order.find", {
          query,
          offset,
          limit,
          sort: "-createdAt"
        });

        const populated = await Promise.all(
          entities.map(entity => this.populateProductOrder(ctx, entity))
        );

        const total = await ctx.call("v1.db.product_order.count", { query });

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
      scope: ["productOrder.create"],
      rest: {
        method: "POST",
        path: "/create"
      },
      cache: false,
      params: {
        productOrderItem: { type: "array" },
        "@type": { type: "string", optional: true, default: "ProductOrder" },
        "@baseType": { type: "string", optional: true },
        "@schemaLocation": { type: "string", optional: true },
        category: { type: "string", optional: true },
        description: { type: "string", optional: true },
        externalId: { type: "array", optional: true },
        priority: { type: "string", optional: true },
        requestedCompletionDate: { type: "string", optional: true },
        requestedStartDate: { type: "string", optional: true },
        expectedCompletionDate: { type: "string", optional: true },
        completionDate: { type: "string", optional: true },
        cancellationDate: { type: "string", optional: true },
        cancellationReason: { type: "string", optional: true },
        notificationContact: { type: "string", optional: true },
        requestedInitialState: { type: "string", optional: true, default: "acknowledged" },
        state: { type: "string", optional: true, default: "acknowledged" },
        agreement: { type: "array", optional: true },
        billingAccount: { type: "object", optional: true },
        channel: { type: "array", optional: true },
        note: { type: "array", optional: true },
        orderTotalPrice: { type: "array", optional: true },
        payment: { type: "array", optional: true },
        orderRelationship: { type: "array", optional: true },
        productOfferingQualification: { type: "array", optional: true },
        quote: { type: "array", optional: true },
        productOrderErrorMessage: { type: "array", optional: true },
        productOrderJeopardyAlert: { type: "array", optional: true },
        productOrderMilestone: { type: "array", optional: true },
        relatedParty: { type: "array", optional: true }
      },
      async handler(ctx) {
        this.validateRequiredFields(ctx.params);

        const entityData = { ...ctx.params };
        const clientId = ctx.meta.clientId;

        const id = cuid();
        entityData.id = id;
        entityData.clientId = clientId;
        entityData.creationDate = new Date().toISOString();

        if (!entityData["@type"]) entityData["@type"] = "ProductOrder";
        if (!entityData.state) entityData.state = entityData.requestedInitialState || "acknowledged";

        Object.keys(entityData).forEach(key => {
          if (entityData[key] === null) {
            entityData[key] = "null";
          }
        });

        const relatedEntities = {
          productOrderItem: entityData.productOrderItem,
          note: entityData.note,
          channel: entityData.channel,
          relatedParty: entityData.relatedParty,
          agreement: entityData.agreement,
          payment: entityData.payment,
          orderRelationship: entityData.orderRelationship,
          productOfferingQualification: entityData.productOfferingQualification,
          quote: entityData.quote,
          orderTotalPrice: entityData.orderTotalPrice,
          externalId: entityData.externalId,
          productOrderErrorMessage: entityData.productOrderErrorMessage,
          productOrderJeopardyAlert: entityData.productOrderJeopardyAlert,
          productOrderMilestone: entityData.productOrderMilestone
        };

        delete entityData.productOrderItem;
        delete entityData.note;
        delete entityData.channel;
        delete entityData.relatedParty;
        delete entityData.agreement;
        delete entityData.payment;
        delete entityData.orderRelationship;
        delete entityData.productOfferingQualification;
        delete entityData.quote;
        delete entityData.orderTotalPrice;
        delete entityData.externalId;
        delete entityData.productOrderErrorMessage;
        delete entityData.productOrderJeopardyAlert;
        delete entityData.productOrderMilestone;

        const created = await ctx.call("v1.db.product_order.create", entityData);
        const entityId = created.id;

        created.href = `${this.settings.baseUrl}/api/v1/tmf622/productOrder/get/${entityId}`;
        await ctx.call("v1.db.product_order.update", {
          id: entityId,
          clientId,
          href: created.href
        });

        try {
          if (relatedEntities.productOrderItem && relatedEntities.productOrderItem.length > 0) {
            const ids = await this.createProductOrderItem(ctx, relatedEntities.productOrderItem, entityId, clientId);
            created.productOrderItem = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, productOrderItem: ids });
          }

          if (relatedEntities.note && relatedEntities.note.length > 0) {
            const ids = await this.createNote(ctx, relatedEntities.note, entityId, clientId);
            created.note = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, note: ids });
          }

          if (relatedEntities.channel && relatedEntities.channel.length > 0) {
            const ids = await this.createChannel(ctx, relatedEntities.channel, entityId, clientId);
            created.channel = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, channel: ids });
          }

          if (relatedEntities.relatedParty && relatedEntities.relatedParty.length > 0) {
            const ids = await this.createRelatedParty(ctx, relatedEntities.relatedParty, entityId, clientId);
            created.relatedParty = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, relatedParty: ids });
          }

          if (relatedEntities.agreement && relatedEntities.agreement.length > 0) {
            const ids = await this.createAgreement(ctx, relatedEntities.agreement, entityId, clientId);
            created.agreement = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, agreement: ids });
          }

          if (relatedEntities.payment && relatedEntities.payment.length > 0) {
            const ids = await this.createPayment(ctx, relatedEntities.payment, entityId, clientId);
            created.payment = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, payment: ids });
          }

          if (relatedEntities.orderRelationship && relatedEntities.orderRelationship.length > 0) {
            const ids = await this.createOrderRelationship(ctx, relatedEntities.orderRelationship, entityId, clientId);
            created.orderRelationship = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, orderRelationship: ids });
          }

          if (relatedEntities.productOfferingQualification && relatedEntities.productOfferingQualification.length > 0) {
            const ids = await this.createProductOfferingQualification(ctx, relatedEntities.productOfferingQualification, entityId, clientId);
            created.productOfferingQualification = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, productOfferingQualification: ids });
          }

          if (relatedEntities.quote && relatedEntities.quote.length > 0) {
            const ids = await this.createQuote(ctx, relatedEntities.quote, entityId, clientId);
            created.quote = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, quote: ids });
          }

          if (relatedEntities.orderTotalPrice && relatedEntities.orderTotalPrice.length > 0) {
            const ids = await this.createOrderTotalPrice(ctx, relatedEntities.orderTotalPrice, entityId, clientId);
            created.orderTotalPrice = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, orderTotalPrice: ids });
          }

          if (relatedEntities.externalId && relatedEntities.externalId.length > 0) {
            const ids = await this.createExternalId(ctx, relatedEntities.externalId, entityId, clientId);
            created.externalId = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, externalId: ids });
          }

          if (relatedEntities.productOrderErrorMessage && relatedEntities.productOrderErrorMessage.length > 0) {
            const ids = await this.createProductOrderErrorMessage(ctx, relatedEntities.productOrderErrorMessage, entityId, clientId);
            created.productOrderErrorMessage = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, productOrderErrorMessage: ids });
          }

          if (relatedEntities.productOrderJeopardyAlert && relatedEntities.productOrderJeopardyAlert.length > 0) {
            const ids = await this.createProductOrderJeopardyAlert(ctx, relatedEntities.productOrderJeopardyAlert, entityId, clientId);
            created.productOrderJeopardyAlert = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, productOrderJeopardyAlert: ids });
          }

          if (relatedEntities.productOrderMilestone && relatedEntities.productOrderMilestone.length > 0) {
            const ids = await this.createProductOrderMilestone(ctx, relatedEntities.productOrderMilestone, entityId, clientId);
            created.productOrderMilestone = ids;
            await ctx.call("v1.db.product_order.update", { id: entityId, clientId, productOrderMilestone: ids });
          }

          const updatedEntity = await ctx.call("v1.db.product_order.get", { id: entityId, clientId });
          const populated = await this.populateProductOrder(ctx, updatedEntity);
          const schemaFiltered = this.mapToSchema(populated);

          await ctx.call("v1.tmf622.event-publisher.publish", {
            eventType: "ProductOrderCreateEvent",
            event: {
              eventType: "ProductOrderCreateEvent",
              eventTime: new Date().toISOString(),
              event: { productOrder: schemaFiltered }
            }
          });

          return schemaFiltered;

        } catch (error) {
          await ctx.call("v1.db.product_order.remove", { id: entityId, clientId });
          throw error;
        }
      }
    },

    get: {
      scope: ["productOrder.get"],
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

        const entity = await ctx.call("v1.db.product_order.get", { id, clientId });
        if (!entity) {
          throw new Error(`ProductOrder with id ${id} not found`, 404);
        }

        const populated = await this.populateProductOrder(ctx, entity);
        let result = this.mapToSchema(populated);

        if (fields) {
          const fieldList = fields.split(",").map(f => f.trim());
          result = this.filterFields(result, fieldList);
        }

        return result;
      }
    },

    patch: {
      scope: ["productOrder.patch"],
      rest: {
        method: "PATCH",
        path: "/patch/:id"
      },
      cache: false,
      params: {
        id: { type: "string" }
      },
      async handler(ctx) {
        const { id } = ctx.params;
        const clientId = ctx.meta.clientId;

        if (!id || id.trim() === "") {
          throw new Error("ID is required", 400);
        }

        const existing = await ctx.call("v1.db.product_order.get", { id, clientId });
        if (!existing) {
          throw new Error(`ProductOrder with id ${id} not found`, 404);
        }

        const populatedExisting = await this.populateProductOrder(ctx, existing);

        const body = ctx.params;
        const patchOperations = body.operations || body.patchOperations;
        
        let changedAttributes = [];
        let updatedResource;

        if (Array.isArray(patchOperations)) {
          updatedResource = await this.applyJsonPatchQuery(ctx, populatedExisting, patchOperations, clientId);
          changedAttributes = this.extractChangedAttributesFromOperations(patchOperations);
        } else {
          const { id: _id, operations, patchOperations: _patchOps, ...updates } = body;
          
          if (Object.keys(updates).length === 0) {
            throw new Error("No update data provided. Use 'operations' array for JSON Patch Query or provide fields directly for merge patch.", 400);
          }
          
          updatedResource = await this.applyMergePatch(ctx, existing, updates, clientId);
          changedAttributes = Object.keys(updates);
        }

        const finalEntity = await ctx.call("v1.db.product_order.get", { id, clientId });
        const populated = await this.populateProductOrder(ctx, finalEntity);
        const schemaFiltered = this.mapToSchema(populated);

        const statusChanged = updatedResource.state !== undefined && 
                              updatedResource.state !== existing.state;
        const eventType = statusChanged
          ? "ProductOrderStateChangeEvent"
          : "ProductOrderAttributeValueChangeEvent";

        await ctx.call("v1.tmf622.event-publisher.publish", {
          eventType,
          event: {
            eventType,
            eventTime: new Date().toISOString(),
            event: { productOrder: schemaFiltered, changedAttributes }
          }
        });

        return schemaFiltered;
      }
    },

    remove: {
      scope: ["productOrder.remove"],
      rest: {
        method: "DELETE",
        path: "/remove/:id"
      },
      cache: false,
      params: {
        id: { type: "string" }
      },
      async handler(ctx) {
        const { id } = ctx.params;
        const clientId = ctx.meta.clientId;

        if (!id || id.trim() === "") {
          throw new Error("ID is required", 400);
        }

        const entity = await ctx.call("v1.db.product_order.get", { id, clientId });
        if (!entity) {
          throw new Error(`ProductOrder with id ${id} not found`, 404);
        }

        await this.deleteRelatedEntities(ctx, entity, clientId);
        await ctx.call("v1.db.product_order.remove", { id, clientId });

        await ctx.call("v1.tmf622.event-publisher.publish", {
          eventType: "ProductOrderDeleteEvent",
          event: {
            eventType: "ProductOrderDeleteEvent",
            eventTime: new Date().toISOString(),
            event: {
              productOrder: {
                id: entity.id,
                href: entity.href,
                "@type": "ProductOrder"
              }
            }
          }
        });

        return null;
      }
    }
  },

  methods: {
    async applyJsonPatchQuery(ctx, entity, operations, clientId) {
      const entityId = entity.id;
      let workingEntity = JSON.parse(JSON.stringify(entity));
      
      for (const operation of operations) {
        if (!operation.op) {
          throw new Error("Each operation must have an 'op' field", 400);
        }
        if (!['add', 'remove', 'replace'].includes(operation.op)) {
          throw new Error(`Unsupported operation: ${operation.op}. Supported: add, remove, replace`, 400);
        }
        if (!operation.path) {
          throw new Error("Each operation must have a 'path' field", 400);
        }
        if (operation.op !== 'remove' && operation.value === undefined) {
          throw new Error(`Operation '${operation.op}' requires a 'value' field`, 400);
        }
      }

      for (const operation of operations) {
        workingEntity = await this.applyPatchOperation(ctx, workingEntity, operation, clientId);
      }

      return workingEntity;
    },

    async applyPatchOperation(ctx, entity, operation, clientId) {
      const { op, path, value } = operation;
      const entityId = entity.id;

      const pathInfo = this.parseJsonPath(path);
      
      if (!pathInfo) {
        throw new Error(`Invalid path format: ${path}`, 400);
      }

      const { arrayName, filterCondition, targetAttribute, isArrayOperation } = pathInfo;

      if (!isArrayOperation) {
        return await this.applySimpleOperation(ctx, entity, op, pathInfo.attributeName, value, clientId);
      }

      const relatedEntityTypes = [
        'productOrderItem', 'note', 'channel', 'relatedParty', 'agreement',
        'payment', 'orderRelationship', 'productOfferingQualification', 'quote',
        'orderTotalPrice', 'externalId', 'productOrderErrorMessage',
        'productOrderJeopardyAlert', 'productOrderMilestone'
      ];

      if (!relatedEntityTypes.includes(arrayName)) {
        throw new Error(`Unknown array: ${arrayName}`, 400);
      }

      const arrayData = entity[arrayName] || [];
      const matchingIndices = this.findMatchingElements(arrayData, filterCondition);

      if (matchingIndices.length === 0 && op !== 'add') {
        throw new Error(`No elements match the filter condition: ${filterCondition}`, 404);
      }

      switch (op) {
        case 'add':
          return await this.handleAddOperation(ctx, entity, arrayName, filterCondition, targetAttribute, value, clientId);
        case 'remove':
          return await this.handleRemoveOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, clientId);
        case 'replace':
          return await this.handleReplaceOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, value, clientId);
        default:
          throw new Error(`Unsupported operation: ${op}`, 400);
      }
    },

    parseJsonPath(path) {
      const arrayIndexRegex = /^\$\.(\w+)\[(\d+)\](?:\.(.+))?$/;
      let match = path.match(arrayIndexRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { index: parseInt(match[2], 10) },
          targetAttribute: match[3] || null
        };
      }

      const jsonPathRegex = /^\$\.(\w+)\[\?\(@\.(\w+)==['"](.*)['"]\)\](?:\.(.+))?$/;
      match = path.match(jsonPathRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { field: match[2], value: match[3] },
          targetAttribute: match[4] || null
        };
      }

      const simpleAttrRegex = /^(?:\/|\$\.)(\w+)$/;
      match = path.match(simpleAttrRegex);
      
      if (match) {
        return {
          isArrayOperation: false,
          attributeName: match[1]
        };
      }

      return null;
    },

    findMatchingElements(array, filterCondition) {
      if (!Array.isArray(array)) return [];
      
      if (filterCondition && typeof filterCondition.index === 'number') {
        const index = filterCondition.index;
        if (index >= 0 && index < array.length) {
          return [index];
        }
        return [];
      }
      
      const conditions = Array.isArray(filterCondition) ? filterCondition : [filterCondition];
      
      return array.reduce((indices, element, index) => {
        const matches = conditions.every(condition => {
          const fieldValue = this.getNestedValue(element, condition.field);
          return String(fieldValue) === String(condition.value);
        });
        
        if (matches) indices.push(index);
        return indices;
      }, []);
    },

    getNestedValue(obj, path) {
      if (!obj || !path) return undefined;
      const parts = path.split('.');
      let current = obj;
      for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
      }
      return current;
    },

    setNestedValue(obj, path, value) {
      const parts = path.split('.');
      let current = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    },

    async handleAddOperation(ctx, entity, arrayName, filterCondition, targetAttribute, value, clientId) {
      const entityId = entity.id;
      const dbName = this.getDbName(arrayName);
      const arrayData = entity[arrayName] || [];

      if (targetAttribute) {
        const matchingIndices = this.findMatchingElements(arrayData, filterCondition);
        if (matchingIndices.length === 0) {
          throw new Error(`No elements match the filter condition to add attribute`, 404);
        }

        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            const updateData = { id: element.id, clientId };
            updateData[targetAttribute] = value;
            await ctx.call(`v1.db.${dbName}.update`, updateData);
            arrayData[index][targetAttribute] = value;
          }
        }
      } else {
        const createMethod = `create${arrayName.charAt(0).toUpperCase() + arrayName.slice(1)}`;
        if (typeof this[createMethod] === 'function') {
          const newItems = Array.isArray(value) ? value : [value];
          const newIds = await this[createMethod](ctx, newItems, entityId, clientId);
          
          const existingIds = await ctx.call("v1.db.product_order.get", { id: entityId, clientId })
            .then(e => e[arrayName] || []);
          const allIds = [...existingIds, ...newIds];
          
          await ctx.call("v1.db.product_order.update", {
            id: entityId,
            clientId,
            [arrayName]: allIds
          });
        }
      }

      entity[arrayName] = arrayData;
      return entity;
    },

    async handleRemoveOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, clientId) {
      const entityId = entity.id;
      const dbName = this.getDbName(arrayName);
      const arrayData = entity[arrayName] || [];

      if (targetAttribute) {
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            await ctx.call(`v1.db.${dbName}.update`, {
              id: element.id,
              clientId,
              [targetAttribute]: null
            });
            delete arrayData[index][targetAttribute];
          }
        }
      } else {
        const idsToRemove = matchingIndices.map(i => arrayData[i]?.id).filter(Boolean);
        
        for (const relId of idsToRemove) {
          await ctx.call(`v1.db.${dbName}.remove`, { id: relId, clientId }).catch(() => {});
        }
        
        const existingEntity = await ctx.call("v1.db.product_order.get", { id: entityId, clientId });
        const remainingIds = (existingEntity[arrayName] || []).filter(id => !idsToRemove.includes(id));
        
        await ctx.call("v1.db.product_order.update", {
          id: entityId,
          clientId,
          [arrayName]: remainingIds
        });
        
        entity[arrayName] = arrayData.filter((_, i) => !matchingIndices.includes(i));
      }

      return entity;
    },

    async handleReplaceOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, value, clientId) {
      const entityId = entity.id;
      const dbName = this.getDbName(arrayName);
      const arrayData = entity[arrayName] || [];

      if (targetAttribute) {
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            const updateData = { id: element.id, clientId };
            updateData[targetAttribute] = value;
            await ctx.call(`v1.db.${dbName}.update`, updateData);
            arrayData[index][targetAttribute] = value;
          }
        }
      } else {
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            await ctx.call(`v1.db.${dbName}.update`, {
              id: element.id,
              clientId,
              ...value
            });
            arrayData[index] = { ...value, id: element.id };
          }
        }
      }

      entity[arrayName] = arrayData;
      return entity;
    },

    async applySimpleOperation(ctx, entity, op, attributeName, value, clientId) {
      const entityId = entity.id;
      const nonPatchableFields = ["id", "href", "@type"];
      
      if (nonPatchableFields.includes(attributeName)) {
        throw new Error(`Cannot modify field: ${attributeName}`, 400);
      }

      switch (op) {
        case 'add':
        case 'replace':
          await ctx.call("v1.db.product_order.update", {
            id: entityId,
            clientId,
            [attributeName]: value
          });
          entity[attributeName] = value;
          break;
        
        case 'remove':
          await ctx.call("v1.db.product_order.update", {
            id: entityId,
            clientId,
            [attributeName]: null
          });
          delete entity[attributeName];
          break;
      }

      return entity;
    },

    async applyMergePatch(ctx, existing, updates, clientId) {
      const entityId = existing.id;
      
      this.validatePatchableFields(updates);

      Object.keys(updates).forEach(key => {
        if (updates[key] === null) {
          updates[key] = "null";
        }
      });

      const relatedEntityTypes = [
        'productOrderItem', 'note', 'channel', 'relatedParty', 'agreement',
        'payment', 'orderRelationship', 'productOfferingQualification', 'quote',
        'orderTotalPrice', 'externalId', 'productOrderErrorMessage',
        'productOrderJeopardyAlert', 'productOrderMilestone'
      ];

      for (const relationType of relatedEntityTypes) {
        if (updates[relationType] && Array.isArray(updates[relationType])) {
          const existingIds = existing[relationType] || [];
          const dbName = this.getDbName(relationType);
          
          await Promise.all(
            existingIds.map(relId =>
              ctx.call(`v1.db.${dbName}.remove`, { id: relId, clientId }).catch(() => {})
            )
          );

          const createMethod = `create${relationType.charAt(0).toUpperCase() + relationType.slice(1)}`;
          if (typeof this[createMethod] === 'function') {
            const newIds = await this[createMethod](ctx, updates[relationType], entityId, clientId);
            updates[relationType] = newIds;
          }
        }
      }

      await ctx.call("v1.db.product_order.update", {
        id: entityId,
        clientId,
        ...updates,
        updatedAt: new Date().toISOString()
      });

      return updates;
    },

    extractChangedAttributesFromOperations(operations) {
      const attributes = new Set();
      for (const op of operations) {
        const pathInfo = this.parseJsonPath(op.path);
        if (pathInfo) {
          if (pathInfo.isArrayOperation) {
            attributes.add(pathInfo.arrayName);
          } else {
            attributes.add(pathInfo.attributeName);
          }
        }
      }
      return Array.from(attributes);
    },

    getDbName(relationType) {
      const dbNameMap = {
        productOrderItem: 'product_order_item',
        note: 'note',
        channel: 'related_channel',
        relatedParty: 'related_party',
        agreement: 'agreement_ref',
        payment: 'payment_ref',
        orderRelationship: 'order_relationship',
        productOfferingQualification: 'product_offering_qualification_ref',
        quote: 'quote_ref',
        orderTotalPrice: 'order_price',
        externalId: 'external_identifier',
        productOrderErrorMessage: 'product_order_error_message',
        productOrderJeopardyAlert: 'product_order_jeopardy_alert',
        productOrderMilestone: 'product_order_milestone'
      };
      return dbNameMap[relationType] || relationType;
    },

    async populateProductOrder(ctx, entity) {
      const populated = { ...entity };
      const clientId = ctx.meta.clientId;

      if (entity.productOrderItem && entity.productOrderItem.length > 0) {
        const items = await Promise.all(
          entity.productOrderItem.map(id =>
            ctx.call("v1.db.product_order_item.get", { id, clientId }).catch(() => null)
          )
        );
        const itemSchema = ['id', 'quantity', 'action', 'state', 'product', 'productOffering', 'billingAccount', 'itemPrice', 'itemTerm', 'itemTotalPrice', 'note', 'payment', 'productOfferingQualificationItem', 'quoteItem', 'productOrderItem', 'productOrderItemRelationship', 'qualification', '@type', '@baseType', '@schemaLocation'];
        populated.productOrderItem = items.filter(i => i).map(i => this.cleanEntity(i, itemSchema));
      }

      if (entity.note && entity.note.length > 0) {
        const notes = await Promise.all(
          entity.note.map(id =>
            ctx.call("v1.db.note.get", { id, clientId }).catch(() => null)
          )
        );
        const noteSchema = ['id', 'author', 'date', 'text', '@type', '@baseType', '@schemaLocation'];
        populated.note = notes.filter(n => n).map(n => this.cleanEntity(n, noteSchema));
      }

      if (entity.channel && entity.channel.length > 0) {
        const channels = await Promise.all(
          entity.channel.map(id =>
            ctx.call("v1.db.related_channel.get", { id, clientId }).catch(() => null)
          )
        );
        const channelSchema = ['id', 'role', 'channel', '@type', '@baseType', '@schemaLocation'];
        populated.channel = channels.filter(c => c).map(c => this.cleanEntity(c, channelSchema));
      }

      if (entity.relatedParty && entity.relatedParty.length > 0) {
        const parties = await Promise.all(
          entity.relatedParty.map(id =>
            ctx.call("v1.db.related_party.get", { id, clientId }).catch(() => null)
          )
        );
        const partySchema = ['id', 'role', 'partyOrPartyRole', '@type', '@baseType', '@schemaLocation'];
        populated.relatedParty = parties.filter(p => p).map(p => this.cleanEntity(p, partySchema));
      }

      if (entity.agreement && entity.agreement.length > 0) {
        const agreements = await Promise.all(
          entity.agreement.map(id =>
            ctx.call("v1.db.agreement_ref.get", { id, clientId }).catch(() => null)
          )
        );
        const agreementSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.agreement = agreements.filter(a => a).map(a => this.cleanEntity(a, agreementSchema));
      }

      if (entity.payment && entity.payment.length > 0) {
        const payments = await Promise.all(
          entity.payment.map(id =>
            ctx.call("v1.db.payment_ref.get", { id, clientId }).catch(() => null)
          )
        );
        const paymentSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.payment = payments.filter(p => p).map(p => this.cleanEntity(p, paymentSchema));
      }

      if (entity.orderRelationship && entity.orderRelationship.length > 0) {
        const relationships = await Promise.all(
          entity.orderRelationship.map(id =>
            ctx.call("v1.db.order_relationship.get", { id, clientId }).catch(() => null)
          )
        );
        const relationshipSchema = ['id', 'relationshipType', 'productOrder', '@type', '@baseType', '@schemaLocation'];
        populated.orderRelationship = relationships.filter(r => r).map(r => this.cleanEntity(r, relationshipSchema));
      }

      if (entity.productOfferingQualification && entity.productOfferingQualification.length > 0) {
        const qualifications = await Promise.all(
          entity.productOfferingQualification.map(id =>
            ctx.call("v1.db.product_offering_qualification_ref.get", { id, clientId }).catch(() => null)
          )
        );
        const qualificationSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.productOfferingQualification = qualifications.filter(q => q).map(q => this.cleanEntity(q, qualificationSchema));
      }

      if (entity.quote && entity.quote.length > 0) {
        const quotes = await Promise.all(
          entity.quote.map(id =>
            ctx.call("v1.db.quote_ref.get", { id, clientId }).catch(() => null)
          )
        );
        const quoteSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.quote = quotes.filter(q => q).map(q => this.cleanEntity(q, quoteSchema));
      }

      if (entity.orderTotalPrice && entity.orderTotalPrice.length > 0) {
        const prices = await Promise.all(
          entity.orderTotalPrice.map(id =>
            ctx.call("v1.db.order_price.get", { id, clientId }).catch(() => null)
          )
        );
        const priceSchema = ['id', 'description', 'name', 'priceType', 'recurringChargePeriod', 'unitOfMeasure', 'price', 'priceAlteration', '@type', '@baseType', '@schemaLocation'];
        populated.orderTotalPrice = prices.filter(p => p).map(p => this.cleanEntity(p, priceSchema));
      }

      if (entity.externalId && entity.externalId.length > 0) {
        const externalIds = await Promise.all(
          entity.externalId.map(id =>
            ctx.call("v1.db.external_identifier.get", { id, clientId }).catch(() => null)
          )
        );
        const externalIdSchema = ['id', 'owner', 'externalIdentifierType', '@type', '@baseType', '@schemaLocation'];
        populated.externalId = externalIds.filter(e => e).map(e => this.cleanEntity(e, externalIdSchema));
      }

      if (entity.productOrderErrorMessage && entity.productOrderErrorMessage.length > 0) {
        const errorMessages = await Promise.all(
          entity.productOrderErrorMessage.map(id =>
            ctx.call("v1.db.product_order_error_message.get", { id, clientId }).catch(() => null)
          )
        );
        const errorMessageSchema = ['id', 'code', 'reason', 'message', 'timestamp', 'productOrderItem', '@type', '@baseType', '@schemaLocation'];
        populated.productOrderErrorMessage = errorMessages.filter(e => e).map(e => this.cleanEntity(e, errorMessageSchema));
      }

      if (entity.productOrderJeopardyAlert && entity.productOrderJeopardyAlert.length > 0) {
        const alerts = await Promise.all(
          entity.productOrderJeopardyAlert.map(id =>
            ctx.call("v1.db.product_order_jeopardy_alert.get", { id, clientId }).catch(() => null)
          )
        );
        const alertSchema = ['id', 'jeopardyType', 'message', 'alertDate', 'productOrderItem', '@type', '@baseType', '@schemaLocation'];
        populated.productOrderJeopardyAlert = alerts.filter(a => a).map(a => this.cleanEntity(a, alertSchema));
      }

      if (entity.productOrderMilestone && entity.productOrderMilestone.length > 0) {
        const milestones = await Promise.all(
          entity.productOrderMilestone.map(id =>
            ctx.call("v1.db.product_order_milestone.get", { id, clientId }).catch(() => null)
          )
        );
        const milestoneSchema = ['id', 'message', 'milestoneDate', 'status', 'productOrderItem', '@type', '@baseType', '@schemaLocation'];
        populated.productOrderMilestone = milestones.filter(m => m).map(m => this.cleanEntity(m, milestoneSchema));
      }

      return populated;
    },

    async createProductOrderItem(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.product_order_item.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ProductOrderItem"
        });
        ids.push(id);
      }
      return ids;
    },

    async createNote(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.note.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "Note"
        });
        ids.push(id);
      }
      return ids;
    },

    async createChannel(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.related_channel.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "RelatedChannel"
        });
        ids.push(id);
      }
      return ids;
    },

    async createRelatedParty(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.related_party.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "RelatedPartyRefOrPartyRoleRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createAgreement(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.agreement_ref.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "AgreementRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createPayment(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.payment_ref.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "PaymentRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createOrderRelationship(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.order_relationship.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "OrderRelationship"
        });
        ids.push(id);
      }
      return ids;
    },

    async createProductOfferingQualification(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.product_offering_qualification_ref.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ProductOfferingQualificationRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createQuote(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.quote_ref.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "QuoteRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createOrderTotalPrice(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.order_price.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "OrderPrice"
        });
        ids.push(id);
      }
      return ids;
    },

    async createExternalId(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.external_identifier.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ExternalIdentifier"
        });
        ids.push(id);
      }
      return ids;
    },

    async createProductOrderErrorMessage(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.product_order_error_message.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ProductOrderErrorMessage"
        });
        ids.push(id);
      }
      return ids;
    },

    async createProductOrderJeopardyAlert(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.product_order_jeopardy_alert.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ProductOrderJeopardyAlert"
        });
        ids.push(id);
      }
      return ids;
    },

    async createProductOrderMilestone(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.product_order_milestone.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ProductOrderMilestone"
        });
        ids.push(id);
      }
      return ids;
    },

    async deleteRelatedEntities(ctx, entity, clientId) {
      const relatedEntityTypes = [
        { field: 'productOrderItem', db: 'product_order_item' },
        { field: 'note', db: 'note' },
        { field: 'channel', db: 'related_channel' },
        { field: 'relatedParty', db: 'related_party' },
        { field: 'agreement', db: 'agreement_ref' },
        { field: 'payment', db: 'payment_ref' },
        { field: 'orderRelationship', db: 'order_relationship' },
        { field: 'productOfferingQualification', db: 'product_offering_qualification_ref' },
        { field: 'quote', db: 'quote_ref' },
        { field: 'orderTotalPrice', db: 'order_price' },
        { field: 'externalId', db: 'external_identifier' },
        { field: 'productOrderErrorMessage', db: 'product_order_error_message' },
        { field: 'productOrderJeopardyAlert', db: 'product_order_jeopardy_alert' },
        { field: 'productOrderMilestone', db: 'product_order_milestone' }
      ];

      for (const { field, db } of relatedEntityTypes) {
        if (entity[field] && entity[field].length > 0) {
          await Promise.all(
            entity[field].map(id =>
              ctx.call(`v1.db.${db}.remove`, { id, clientId }).catch(() => {})
            )
          );
        }
      }
    },

    mapToSchema(data) {
      const schemaFields = [
        'id', 'href', 'category', 'description', 'externalId', 'priority', 'state',
        'requestedCompletionDate', 'requestedStartDate', 'expectedCompletionDate',
        'completionDate', 'creationDate', 'cancellationDate', 'cancellationReason',
        'notificationContact', 'requestedInitialState', 'agreement', 'billingAccount',
        'channel', 'note', 'orderTotalPrice', 'payment', 'orderRelationship',
        'productOfferingQualification', 'quote', 'productOrderErrorMessage',
        'productOrderJeopardyAlert', 'productOrderMilestone', 'productOrderItem',
        'relatedParty', '@type', '@baseType', '@schemaLocation'
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
      const requiredFields = ['productOrderItem'];
      const missingFields = requiredFields.filter(field => !data[field] || (Array.isArray(data[field]) && data[field].length === 0));

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(", ")}`, 400);
      }
    },

    validatePatchableFields(updates) {
      const nonPatchableFields = ["id", "href", "@type", "creationDate"];
      const invalidFields = Object.keys(updates).filter(field => nonPatchableFields.includes(field));

      if (invalidFields.length > 0) {
        throw new Error(`Cannot update non-patchable fields: ${invalidFields.join(", ")}`, 400);
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
    this.logger.info("ProductOrder service started");
  }
};
