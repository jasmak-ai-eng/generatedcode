"use strict";

const cuid = require('cuid');

module.exports = {
  name: "tmf637.product",
  version: 1,

  settings: {
    defaultPageSize: 20,
    maxPageSize: 100,
    baseUrl: process.env.API_BASE_URL || "http://localhost:3000"
  },

  dependencies: [],

  actions: {
    list: {
      scope: ["product.list"],
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

        const entities = await ctx.call("v1.db.product.find", {
          query,
          offset,
          limit,
          sort: "-createdAt"
        });

        const populated = await Promise.all(
          entities.map(entity => this.populateProduct(ctx, entity))
        );

        const total = await ctx.call("v1.db.product.count", { query });

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
      scope: ["product.create"],
      rest: {
        method: "POST",
        path: "/create"
      },
      cache: false,
      params: {
        name: { type: "string", optional: true },
        "@type": { type: "string", optional: true, default: "Product" },
        "@baseType": { type: "string", optional: true },
        "@schemaLocation": { type: "string", optional: true },
        description: { type: "string", optional: true },
        isBundle: { type: "boolean", optional: true },
        isCustomerVisible: { type: "boolean", optional: true },
        orderDate: { type: "string", optional: true },
        productSerialNumber: { type: "string", optional: true },
        startDate: { type: "string", optional: true },
        terminationDate: { type: "string", optional: true },
        status: { type: "string", optional: true, default: "created" },
        productOffering: { type: "object", optional: true },
        productSpecification: { type: "object", optional: true },
        billingAccount: { type: "object", optional: true },
        agreementItem: { type: "array", optional: true },
        productCharacteristic: { type: "array", optional: true },
        productOrderItem: { type: "array", optional: true },
        product: { type: "array", optional: true },
        productPrice: { type: "array", optional: true },
        productRelationship: { type: "array", optional: true },
        productTerm: { type: "array", optional: true },
        realizingResource: { type: "array", optional: true },
        realizingService: { type: "array", optional: true },
        relatedParty: { type: "array", optional: true },
        place: { type: "array", optional: true },
        intent: { type: "object", optional: true }
      },
      async handler(ctx) {
        const entityData = { ...ctx.params };
        const clientId = ctx.meta.clientId;

        const id = cuid();
        entityData.id = id;
        entityData.clientId = clientId;
        entityData.creationDate = new Date().toISOString();

        if (!entityData["@type"]) entityData["@type"] = "Product";

        Object.keys(entityData).forEach(key => {
          if (entityData[key] === null) {
            entityData[key] = "null";
          }
        });

        const relatedEntities = {
          productCharacteristic: entityData.productCharacteristic,
          productPrice: entityData.productPrice,
          productRelationship: entityData.productRelationship,
          productTerm: entityData.productTerm,
          productOrderItem: entityData.productOrderItem,
          relatedParty: entityData.relatedParty,
          place: entityData.place,
          agreementItem: entityData.agreementItem,
          realizingResource: entityData.realizingResource,
          realizingService: entityData.realizingService
        };

        delete entityData.productCharacteristic;
        delete entityData.productPrice;
        delete entityData.productRelationship;
        delete entityData.productTerm;
        delete entityData.productOrderItem;
        delete entityData.relatedParty;
        delete entityData.place;
        delete entityData.agreementItem;
        delete entityData.realizingResource;
        delete entityData.realizingService;

        const created = await ctx.call("v1.db.product.create", entityData);
        const entityId = created.id;

        created.href = `${this.settings.baseUrl}/api/v1/tmf637/product/get/${entityId}`;
        await ctx.call("v1.db.product.update", {
          id: entityId,
          clientId,
          href: created.href
        });

        try {
          if (relatedEntities.productCharacteristic && relatedEntities.productCharacteristic.length > 0) {
            const ids = await this.createProductCharacteristic(ctx, relatedEntities.productCharacteristic, entityId, clientId);
            created.productCharacteristic = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, productCharacteristic: ids });
          }

          if (relatedEntities.productPrice && relatedEntities.productPrice.length > 0) {
            const ids = await this.createProductPrice(ctx, relatedEntities.productPrice, entityId, clientId);
            created.productPrice = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, productPrice: ids });
          }

          if (relatedEntities.productRelationship && relatedEntities.productRelationship.length > 0) {
            const ids = await this.createProductRelationship(ctx, relatedEntities.productRelationship, entityId, clientId);
            created.productRelationship = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, productRelationship: ids });
          }

          if (relatedEntities.productTerm && relatedEntities.productTerm.length > 0) {
            const ids = await this.createProductTerm(ctx, relatedEntities.productTerm, entityId, clientId);
            created.productTerm = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, productTerm: ids });
          }

          if (relatedEntities.productOrderItem && relatedEntities.productOrderItem.length > 0) {
            const ids = await this.createProductOrderItem(ctx, relatedEntities.productOrderItem, entityId, clientId);
            created.productOrderItem = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, productOrderItem: ids });
          }

          if (relatedEntities.relatedParty && relatedEntities.relatedParty.length > 0) {
            const ids = await this.createRelatedParty(ctx, relatedEntities.relatedParty, entityId, clientId);
            created.relatedParty = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, relatedParty: ids });
          }

          if (relatedEntities.place && relatedEntities.place.length > 0) {
            const ids = await this.createPlace(ctx, relatedEntities.place, entityId, clientId);
            created.place = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, place: ids });
          }

          if (relatedEntities.agreementItem && relatedEntities.agreementItem.length > 0) {
            const ids = await this.createAgreementItem(ctx, relatedEntities.agreementItem, entityId, clientId);
            created.agreementItem = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, agreementItem: ids });
          }

          if (relatedEntities.realizingResource && relatedEntities.realizingResource.length > 0) {
            const ids = await this.createRealizingResource(ctx, relatedEntities.realizingResource, entityId, clientId);
            created.realizingResource = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, realizingResource: ids });
          }

          if (relatedEntities.realizingService && relatedEntities.realizingService.length > 0) {
            const ids = await this.createRealizingService(ctx, relatedEntities.realizingService, entityId, clientId);
            created.realizingService = ids;
            await ctx.call("v1.db.product.update", { id: entityId, clientId, realizingService: ids });
          }

          const updatedEntity = await ctx.call("v1.db.product.get", { id: entityId, clientId });
          const populated = await this.populateProduct(ctx, updatedEntity);
          const schemaFiltered = this.mapToSchema(populated);

          await ctx.call("v1.tmf637.event-publisher.publish", {
            eventType: "ProductCreateEvent",
            event: {
              eventType: "ProductCreateEvent",
              eventTime: new Date().toISOString(),
              event: { product: schemaFiltered }
            }
          });

          return schemaFiltered;

        } catch (error) {
          await ctx.call("v1.db.product.remove", { id: entityId, clientId });
          throw error;
        }
      }
    },

    get: {
      scope: ["product.get"],
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

        const entity = await ctx.call("v1.db.product.get", { id, clientId });
        if (!entity) {
          throw new Error(`Product with id ${id} not found`, 404);
        }

        const populated = await this.populateProduct(ctx, entity);
        let result = this.mapToSchema(populated);

        if (fields) {
          const fieldList = fields.split(",").map(f => f.trim());
          result = this.filterFields(result, fieldList);
        }

        return result;
      }
    },

    patch: {
      scope: ["product.patch"],
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

        const existing = await ctx.call("v1.db.product.get", { id, clientId });
        if (!existing) {
          throw new Error(`Product with id ${id} not found`, 404);
        }

        const populatedExisting = await this.populateProduct(ctx, existing);

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

        const finalEntity = await ctx.call("v1.db.product.get", { id, clientId });
        const populated = await this.populateProduct(ctx, finalEntity);
        const schemaFiltered = this.mapToSchema(populated);

        const statusChanged = updatedResource.status !== undefined && 
                              updatedResource.status !== existing.status;
        const eventType = statusChanged
          ? "ProductStateChangeEvent"
          : "ProductAttributeValueChangeEvent";

        await ctx.call("v1.tmf637.event-publisher.publish", {
          eventType,
          event: {
            eventType,
            eventTime: new Date().toISOString(),
            event: { product: schemaFiltered, changedAttributes }
          }
        });

        return schemaFiltered;
      }
    },

    remove: {
      scope: ["product.remove"],
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

        const entity = await ctx.call("v1.db.product.get", { id, clientId });
        if (!entity) {
          throw new Error(`Product with id ${id} not found`, 404);
        }

        await this.deleteRelatedEntities(ctx, entity, clientId);
        await ctx.call("v1.db.product.remove", { id, clientId });

        await ctx.call("v1.tmf637.event-publisher.publish", {
          eventType: "ProductDeleteEvent",
          event: {
            eventType: "ProductDeleteEvent",
            eventTime: new Date().toISOString(),
            event: {
              product: {
                id: entity.id,
                href: entity.href,
                name: entity.name,
                "@type": "Product"
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
        'productCharacteristic', 'productPrice', 'productRelationship', 'productTerm',
        'productOrderItem', 'relatedParty', 'place', 'agreementItem',
        'realizingResource', 'realizingService'
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
          
          const existingIds = await ctx.call("v1.db.product.get", { id: entityId, clientId })
            .then(e => e[arrayName] || []);
          const allIds = [...existingIds, ...newIds];
          
          await ctx.call("v1.db.product.update", {
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
        
        const existingEntity = await ctx.call("v1.db.product.get", { id: entityId, clientId });
        const remainingIds = (existingEntity[arrayName] || []).filter(id => !idsToRemove.includes(id));
        
        await ctx.call("v1.db.product.update", {
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
      const nonPatchableFields = ["id", "href", "@type", "creationDate"];
      
      if (nonPatchableFields.includes(attributeName)) {
        throw new Error(`Cannot modify field: ${attributeName}`, 400);
      }

      switch (op) {
        case 'add':
        case 'replace':
          await ctx.call("v1.db.product.update", {
            id: entityId,
            clientId,
            [attributeName]: value
          });
          entity[attributeName] = value;
          break;
        case 'remove':
          await ctx.call("v1.db.product.update", {
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
        'productCharacteristic', 'productPrice', 'productRelationship', 'productTerm',
        'productOrderItem', 'relatedParty', 'place', 'agreementItem',
        'realizingResource', 'realizingService'
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

      await ctx.call("v1.db.product.update", {
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
        productCharacteristic: 'product_characteristic',
        productPrice: 'product_price',
        productRelationship: 'product_relationship',
        productTerm: 'product_term',
        productOrderItem: 'product_order_item',
        relatedParty: 'related_party',
        place: 'related_place',
        agreementItem: 'agreement_item',
        realizingResource: 'realizing_resource',
        realizingService: 'realizing_service'
      };
      return dbNameMap[relationType] || relationType;
    },

    async populateProduct(ctx, entity) {
      const populated = { ...entity };
      const clientId = ctx.meta.clientId;

      if (entity.productCharacteristic && entity.productCharacteristic.length > 0) {
        const chars = await Promise.all(
          entity.productCharacteristic.map(id =>
            ctx.call("v1.db.product_characteristic.get", { id, clientId }).catch(() => null)
          )
        );
        const charSchema = ['id', 'name', 'valueType', 'value', 'characteristicRelationship', '@type', '@baseType', '@schemaLocation'];
        populated.productCharacteristic = chars.filter(c => c).map(c => this.cleanEntity(c, charSchema));
      }

      if (entity.productPrice && entity.productPrice.length > 0) {
        const prices = await Promise.all(
          entity.productPrice.map(id =>
            ctx.call("v1.db.product_price.get", { id, clientId }).catch(() => null)
          )
        );
        const priceSchema = ['id', 'name', 'description', 'priceType', 'recurringChargePeriod', 'unitOfMeasure', 'price', 'productOfferingPrice', 'priceAlteration', '@type', '@baseType', '@schemaLocation'];
        populated.productPrice = prices.filter(p => p).map(p => this.cleanEntity(p, priceSchema));
      }

      if (entity.productRelationship && entity.productRelationship.length > 0) {
        const rels = await Promise.all(
          entity.productRelationship.map(id =>
            ctx.call("v1.db.product_relationship.get", { id, clientId }).catch(() => null)
          )
        );
        const relSchema = ['id', 'href', 'relationshipType', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.productRelationship = rels.filter(r => r).map(r => this.cleanEntity(r, relSchema));
      }

      if (entity.productTerm && entity.productTerm.length > 0) {
        const terms = await Promise.all(
          entity.productTerm.map(id =>
            ctx.call("v1.db.product_term.get", { id, clientId }).catch(() => null)
          )
        );
        const termSchema = ['name', 'description', 'duration', 'validFor', '@type', '@baseType', '@schemaLocation'];
        populated.productTerm = terms.filter(t => t).map(t => this.cleanEntity(t, termSchema));
      }

      if (entity.productOrderItem && entity.productOrderItem.length > 0) {
        const items = await Promise.all(
          entity.productOrderItem.map(id =>
            ctx.call("v1.db.product_order_item.get", { id, clientId }).catch(() => null)
          )
        );
        const itemSchema = ['orderId', 'orderItemId', 'orderHref', 'orderItemAction', 'role', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.productOrderItem = items.filter(i => i).map(i => this.cleanEntity(i, itemSchema));
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

      if (entity.place && entity.place.length > 0) {
        const places = await Promise.all(
          entity.place.map(id =>
            ctx.call("v1.db.related_place.get", { id, clientId }).catch(() => null)
          )
        );
        const placeSchema = ['role', 'place', '@type', '@baseType', '@schemaLocation'];
        populated.place = places.filter(p => p).map(p => this.cleanEntity(p, placeSchema));
      }

      if (entity.agreementItem && entity.agreementItem.length > 0) {
        const items = await Promise.all(
          entity.agreementItem.map(id =>
            ctx.call("v1.db.agreement_item.get", { id, clientId }).catch(() => null)
          )
        );
        const itemSchema = ['agreementId', 'agreementItemId', 'agreementName', 'agreementHref', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.agreementItem = items.filter(i => i).map(i => this.cleanEntity(i, itemSchema));
      }

      if (entity.realizingResource && entity.realizingResource.length > 0) {
        const resources = await Promise.all(
          entity.realizingResource.map(id =>
            ctx.call("v1.db.realizing_resource.get", { id, clientId }).catch(() => null)
          )
        );
        const resSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.realizingResource = resources.filter(r => r).map(r => this.cleanEntity(r, resSchema));
      }

      if (entity.realizingService && entity.realizingService.length > 0) {
        const services = await Promise.all(
          entity.realizingService.map(id =>
            ctx.call("v1.db.realizing_service.get", { id, clientId }).catch(() => null)
          )
        );
        const svcSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.realizingService = services.filter(s => s).map(s => this.cleanEntity(s, svcSchema));
      }

      return populated;
    },

    async createProductCharacteristic(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.product_characteristic.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "Characteristic"
        });
        ids.push(id);
      }
      return ids;
    },

    async createProductPrice(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.product_price.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ProductPrice"
        });
        ids.push(id);
      }
      return ids;
    },

    async createProductRelationship(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.product_relationship.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ProductRelationship"
        });
        ids.push(id);
      }
      return ids;
    },

    async createProductTerm(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.product_term.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ProductTerm"
        });
        ids.push(id);
      }
      return ids;
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
          "@type": item["@type"] || "RelatedOrderItem"
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
          "@type": item["@type"] || "RelatedPartyOrPartyRole"
        });
        ids.push(id);
      }
      return ids;
    },

    async createPlace(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.related_place.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "RelatedPlaceRefOrValue"
        });
        ids.push(id);
      }
      return ids;
    },

    async createAgreementItem(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.agreement_item.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "AgreementItemRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createRealizingResource(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.realizing_resource.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ResourceRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createRealizingService(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.realizing_service.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ServiceRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async deleteRelatedEntities(ctx, entity, clientId) {
      const relatedEntityTypes = [
        { field: 'productCharacteristic', db: 'product_characteristic' },
        { field: 'productPrice', db: 'product_price' },
        { field: 'productRelationship', db: 'product_relationship' },
        { field: 'productTerm', db: 'product_term' },
        { field: 'productOrderItem', db: 'product_order_item' },
        { field: 'relatedParty', db: 'related_party' },
        { field: 'place', db: 'related_place' },
        { field: 'agreementItem', db: 'agreement_item' },
        { field: 'realizingResource', db: 'realizing_resource' },
        { field: 'realizingService', db: 'realizing_service' }
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
        'id', 'href', 'name', 'description', 'isBundle', 'isCustomerVisible',
        'orderDate', 'productSerialNumber', 'startDate', 'terminationDate', 'status',
        'creationDate', 'productOffering', 'productSpecification', 'billingAccount',
        'productCharacteristic', 'productPrice', 'productRelationship', 'productTerm',
        'productOrderItem', 'product', 'relatedParty', 'place', 'agreementItem',
        'realizingResource', 'realizingService', 'intent',
        '@type', '@baseType', '@schemaLocation'
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
    this.logger.info("Product service started");
  }
};
