"use strict";

const cuid = require('cuid');

module.exports = {
  name: "tmf621.troubleTicket",
  version: 1,

  settings: {
    defaultPageSize: 20,
    maxPageSize: 100,
    baseUrl: process.env.API_BASE_URL || "http://localhost:3000"
  },

  dependencies: [],

  actions: {
    list: {
      scope: ["troubleTicket.list"],
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

        const entities = await ctx.call("v1.db.trouble_ticket.find", {
          query,
          offset,
          limit,
          sort: "-createdAt"
        });

        const populated = await Promise.all(
          entities.map(entity => this.populateTroubleTicket(ctx, entity))
        );

        const total = await ctx.call("v1.db.trouble_ticket.count", { query });

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
      scope: ["troubleTicket.create"],
      rest: {
        method: "POST",
        path: "/create"
      },
      cache: false,
      params: {
        description: { type: "string" },
        severity: { type: "string" },
        ticketType: { type: "string" },
        "@type": { type: "string", optional: true, default: "TroubleTicket" },
        "@baseType": { type: "string", optional: true },
        "@schemaLocation": { type: "string", optional: true },
        name: { type: "string", optional: true },
        priority: { type: "string", optional: true },
        requestedResolutionDate: { type: "string", optional: true },
        expectedResolutionDate: { type: "string", optional: true },
        resolutionDate: { type: "string", optional: true },
        status: { type: "string", optional: true, default: "acknowledged" },
        statusChangeReason: { type: "string", optional: true },
        attachment: { type: "array", optional: true },
        channel: { type: "object", optional: true },
        note: { type: "array", optional: true },
        relatedEntity: { type: "array", optional: true },
        relatedParty: { type: "array", optional: true },
        troubleTicketRelationship: { type: "array", optional: true },
        troubleTicketSpecification: { type: "object", optional: true },
        troubleTicketCharacteristic: { type: "array", optional: true },
        externalIdentifier: { type: "array", optional: true }
      },
      async handler(ctx) {
        this.validateRequiredFields(ctx.params);

        const entityData = { ...ctx.params };
        const clientId = ctx.meta.clientId;

        const id = cuid();
        entityData.id = id;
        entityData.clientId = clientId;
        entityData.creationDate = new Date().toISOString();
        entityData.lastUpdate = new Date().toISOString();
        entityData.statusChangeDate = new Date().toISOString();

        if (!entityData["@type"]) entityData["@type"] = "TroubleTicket";
        if (!entityData.status) entityData.status = "acknowledged";

        Object.keys(entityData).forEach(key => {
          if (entityData[key] === null) {
            entityData[key] = "null";
          }
        });

        const relatedEntities = {
          attachment: entityData.attachment,
          note: entityData.note,
          relatedEntity: entityData.relatedEntity,
          relatedParty: entityData.relatedParty,
          troubleTicketRelationship: entityData.troubleTicketRelationship,
          troubleTicketCharacteristic: entityData.troubleTicketCharacteristic,
          externalIdentifier: entityData.externalIdentifier,
          statusChangeHistory: entityData.statusChangeHistory
        };

        delete entityData.attachment;
        delete entityData.note;
        delete entityData.relatedEntity;
        delete entityData.relatedParty;
        delete entityData.troubleTicketRelationship;
        delete entityData.troubleTicketCharacteristic;
        delete entityData.externalIdentifier;
        delete entityData.statusChangeHistory;

        const created = await ctx.call("v1.db.trouble_ticket.create", entityData);
        const entityId = created.id;

        created.href = `${this.settings.baseUrl}/api/v1/tmf621/troubleTicket/get/${entityId}`;
        await ctx.call("v1.db.trouble_ticket.update", {
          id: entityId,
          clientId,
          href: created.href
        });

        try {
          if (relatedEntities.attachment && relatedEntities.attachment.length > 0) {
            const ids = await this.createAttachment(ctx, relatedEntities.attachment, entityId, clientId);
            created.attachment = ids;
            await ctx.call("v1.db.trouble_ticket.update", { id: entityId, clientId, attachment: ids });
          }

          if (relatedEntities.note && relatedEntities.note.length > 0) {
            const ids = await this.createNote(ctx, relatedEntities.note, entityId, clientId);
            created.note = ids;
            await ctx.call("v1.db.trouble_ticket.update", { id: entityId, clientId, note: ids });
          }

          if (relatedEntities.relatedEntity && relatedEntities.relatedEntity.length > 0) {
            const ids = await this.createRelatedEntity(ctx, relatedEntities.relatedEntity, entityId, clientId);
            created.relatedEntity = ids;
            await ctx.call("v1.db.trouble_ticket.update", { id: entityId, clientId, relatedEntity: ids });
          }

          if (relatedEntities.relatedParty && relatedEntities.relatedParty.length > 0) {
            const ids = await this.createRelatedParty(ctx, relatedEntities.relatedParty, entityId, clientId);
            created.relatedParty = ids;
            await ctx.call("v1.db.trouble_ticket.update", { id: entityId, clientId, relatedParty: ids });
          }

          if (relatedEntities.troubleTicketRelationship && relatedEntities.troubleTicketRelationship.length > 0) {
            const ids = await this.createTroubleTicketRelationship(ctx, relatedEntities.troubleTicketRelationship, entityId, clientId);
            created.troubleTicketRelationship = ids;
            await ctx.call("v1.db.trouble_ticket.update", { id: entityId, clientId, troubleTicketRelationship: ids });
          }

          if (relatedEntities.troubleTicketCharacteristic && relatedEntities.troubleTicketCharacteristic.length > 0) {
            const ids = await this.createTroubleTicketCharacteristic(ctx, relatedEntities.troubleTicketCharacteristic, entityId, clientId);
            created.troubleTicketCharacteristic = ids;
            await ctx.call("v1.db.trouble_ticket.update", { id: entityId, clientId, troubleTicketCharacteristic: ids });
          }

          if (relatedEntities.externalIdentifier && relatedEntities.externalIdentifier.length > 0) {
            const ids = await this.createExternalIdentifier(ctx, relatedEntities.externalIdentifier, entityId, clientId);
            created.externalIdentifier = ids;
            await ctx.call("v1.db.trouble_ticket.update", { id: entityId, clientId, externalIdentifier: ids });
          }

          // Create initial status change history
          const statusChangeHistoryIds = await this.createStatusChangeHistory(ctx, [{
            statusChangeDate: entityData.statusChangeDate,
            statusChangeReason: entityData.statusChangeReason || "Trouble ticket created",
            status: entityData.status,
            "@type": "StatusChange"
          }], entityId, clientId);
          await ctx.call("v1.db.trouble_ticket.update", { id: entityId, clientId, statusChangeHistory: statusChangeHistoryIds });

          const updatedEntity = await ctx.call("v1.db.trouble_ticket.get", { id: entityId, clientId });
          const populated = await this.populateTroubleTicket(ctx, updatedEntity);
          const schemaFiltered = this.mapToSchema(populated);

          await ctx.call("v1.tmf621.event-publisher.publish", {
            eventType: "TroubleTicketCreateEvent",
            event: {
              eventType: "TroubleTicketCreateEvent",
              eventTime: new Date().toISOString(),
              event: { troubleTicket: schemaFiltered }
            }
          });

          return schemaFiltered;

        } catch (error) {
          await ctx.call("v1.db.trouble_ticket.remove", { id: entityId, clientId });
          throw error;
        }
      }
    },

    get: {
      scope: ["troubleTicket.get"],
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

        const entity = await ctx.call("v1.db.trouble_ticket.get", { id, clientId });
        if (!entity) {
          throw new Error(`TroubleTicket with id ${id} not found`, 404);
        }

        const populated = await this.populateTroubleTicket(ctx, entity);
        let result = this.mapToSchema(populated);

        if (fields) {
          const fieldList = fields.split(",").map(f => f.trim());
          result = this.filterFields(result, fieldList);
        }

        return result;
      }
    },

    patch: {
      scope: ["troubleTicket.patch"],
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

        const existing = await ctx.call("v1.db.trouble_ticket.get", { id, clientId });
        if (!existing) {
          throw new Error(`TroubleTicket with id ${id} not found`, 404);
        }

        const populatedExisting = await this.populateTroubleTicket(ctx, existing);

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

        const finalEntity = await ctx.call("v1.db.trouble_ticket.get", { id, clientId });
        const populated = await this.populateTroubleTicket(ctx, finalEntity);
        const schemaFiltered = this.mapToSchema(populated);

        const statusChanged = updatedResource.status !== undefined && 
                              updatedResource.status !== existing.status;
        
        let eventType;
        if (statusChanged) {
          if (updatedResource.status === "resolved") {
            eventType = "TroubleTicketResolvedEvent";
          } else {
            eventType = "TroubleTicketStatusChangeEvent";
          }
        } else {
          eventType = "TroubleTicketAttributeValueChangeEvent";
        }

        await ctx.call("v1.tmf621.event-publisher.publish", {
          eventType,
          event: {
            eventType,
            eventTime: new Date().toISOString(),
            event: { troubleTicket: schemaFiltered, changedAttributes }
          }
        });

        return schemaFiltered;
      }
    },

    remove: {
      scope: ["troubleTicket.remove"],
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

        const entity = await ctx.call("v1.db.trouble_ticket.get", { id, clientId });
        if (!entity) {
          throw new Error(`TroubleTicket with id ${id} not found`, 404);
        }

        await this.deleteRelatedEntities(ctx, entity, clientId);
        await ctx.call("v1.db.trouble_ticket.remove", { id, clientId });

        await ctx.call("v1.tmf621.event-publisher.publish", {
          eventType: "TroubleTicketDeleteEvent",
          event: {
            eventType: "TroubleTicketDeleteEvent",
            eventTime: new Date().toISOString(),
            event: {
              troubleTicket: {
                id: entity.id,
                href: entity.href,
                name: entity.name,
                "@type": "TroubleTicket"
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
        'attachment', 'note', 'relatedEntity', 'relatedParty',
        'troubleTicketRelationship', 'troubleTicketCharacteristic',
        'externalIdentifier', 'statusChangeHistory'
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
          
          const existingIds = await ctx.call("v1.db.trouble_ticket.get", { id: entityId, clientId })
            .then(e => e[arrayName] || []);
          const allIds = [...existingIds, ...newIds];
          
          await ctx.call("v1.db.trouble_ticket.update", {
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
        
        const existingEntity = await ctx.call("v1.db.trouble_ticket.get", { id: entityId, clientId });
        const remainingIds = (existingEntity[arrayName] || []).filter(id => !idsToRemove.includes(id));
        
        await ctx.call("v1.db.trouble_ticket.update", {
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

      const updateData = {
        id: entityId,
        clientId,
        lastUpdate: new Date().toISOString()
      };

      switch (op) {
        case 'add':
        case 'replace':
          updateData[attributeName] = value;
          
          if (attributeName === 'status') {
            updateData.statusChangeDate = new Date().toISOString();
            
            const existing = await ctx.call("v1.db.trouble_ticket.get", { id: entityId, clientId });
            const newStatusChange = {
              statusChangeDate: updateData.statusChangeDate,
              statusChangeReason: entity.statusChangeReason || `Status changed to ${value}`,
              status: value,
              "@type": "StatusChange"
            };
            const newIds = await this.createStatusChangeHistory(ctx, [newStatusChange], entityId, clientId);
            const existingHistory = existing.statusChangeHistory || [];
            updateData.statusChangeHistory = [...existingHistory, ...newIds];
          }
          
          await ctx.call("v1.db.trouble_ticket.update", updateData);
          entity[attributeName] = value;
          break;
        
        case 'remove':
          updateData[attributeName] = null;
          await ctx.call("v1.db.trouble_ticket.update", updateData);
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
        'attachment', 'note', 'relatedEntity', 'relatedParty',
        'troubleTicketRelationship', 'troubleTicketCharacteristic',
        'externalIdentifier', 'statusChangeHistory'
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

      if (updates.status && updates.status !== existing.status) {
        updates.statusChangeDate = new Date().toISOString();
        
        const newStatusChange = {
          statusChangeDate: updates.statusChangeDate,
          statusChangeReason: updates.statusChangeReason || `Status changed to ${updates.status}`,
          status: updates.status,
          "@type": "StatusChange"
        };
        const newIds = await this.createStatusChangeHistory(ctx, [newStatusChange], entityId, clientId);
        const existingHistory = existing.statusChangeHistory || [];
        updates.statusChangeHistory = [...existingHistory, ...newIds];
      }

      await ctx.call("v1.db.trouble_ticket.update", {
        id: entityId,
        clientId,
        ...updates,
        lastUpdate: new Date().toISOString()
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
        attachment: 'attachment',
        note: 'note',
        relatedEntity: 'related_entity',
        relatedParty: 'related_party',
        troubleTicketRelationship: 'trouble_ticket_relationship',
        troubleTicketCharacteristic: 'trouble_ticket_characteristic',
        externalIdentifier: 'external_identifier',
        statusChangeHistory: 'status_change_history'
      };
      return dbNameMap[relationType] || relationType;
    },

    async populateTroubleTicket(ctx, entity) {
      const populated = { ...entity };
      const clientId = ctx.meta.clientId;

      if (entity.attachment && entity.attachment.length > 0) {
        const attachments = await Promise.all(
          entity.attachment.map(id =>
            ctx.call("v1.db.attachment.get", { id, clientId }).catch(() => null)
          )
        );
        const attachmentSchema = ['id', 'href', 'name', 'description', 'url', 'content', 'size', 'validFor', 'attachmentType', 'mimeType', '@type', '@baseType', '@schemaLocation'];
        populated.attachment = attachments.filter(a => a).map(a => this.cleanEntity(a, attachmentSchema));
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

      if (entity.relatedEntity && entity.relatedEntity.length > 0) {
        const entities = await Promise.all(
          entity.relatedEntity.map(id =>
            ctx.call("v1.db.related_entity.get", { id, clientId }).catch(() => null)
          )
        );
        const entitySchema = ['id', 'role', 'entity', '@type', '@baseType', '@schemaLocation'];
        populated.relatedEntity = entities.filter(e => e).map(e => this.cleanEntity(e, entitySchema));
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

      if (entity.troubleTicketRelationship && entity.troubleTicketRelationship.length > 0) {
        const relationships = await Promise.all(
          entity.troubleTicketRelationship.map(id =>
            ctx.call("v1.db.trouble_ticket_relationship.get", { id, clientId }).catch(() => null)
          )
        );
        const relSchema = ['id', 'href', 'name', 'relationshipType', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.troubleTicketRelationship = relationships.filter(r => r).map(r => this.cleanEntity(r, relSchema));
      }

      if (entity.troubleTicketCharacteristic && entity.troubleTicketCharacteristic.length > 0) {
        const characteristics = await Promise.all(
          entity.troubleTicketCharacteristic.map(id =>
            ctx.call("v1.db.trouble_ticket_characteristic.get", { id, clientId }).catch(() => null)
          )
        );
        const charSchema = ['id', 'name', 'valueType', 'value', 'characteristicRelationship', '@type', '@baseType', '@schemaLocation'];
        populated.troubleTicketCharacteristic = characteristics.filter(c => c).map(c => this.cleanEntity(c, charSchema));
      }

      if (entity.externalIdentifier && entity.externalIdentifier.length > 0) {
        const identifiers = await Promise.all(
          entity.externalIdentifier.map(id =>
            ctx.call("v1.db.external_identifier.get", { id, clientId }).catch(() => null)
          )
        );
        const identifierSchema = ['id', 'owner', 'externalIdentifierType', '@type', '@baseType', '@schemaLocation'];
        populated.externalIdentifier = identifiers.filter(i => i).map(i => this.cleanEntity(i, identifierSchema));
      }

      if (entity.statusChangeHistory && entity.statusChangeHistory.length > 0) {
        const history = await Promise.all(
          entity.statusChangeHistory.map(id =>
            ctx.call("v1.db.status_change_history.get", { id, clientId }).catch(() => null)
          )
        );
        const historySchema = ['statusChangeDate', 'statusChangeReason', 'status', '@type', '@baseType', '@schemaLocation'];
        populated.statusChangeHistory = history.filter(h => h).map(h => this.cleanEntity(h, historySchema));
      }

      return populated;
    },

    async createAttachment(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.attachment.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "Attachment"
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
          date: item.date || new Date().toISOString(),
          "@type": item["@type"] || "Note"
        });
        ids.push(id);
      }
      return ids;
    },

    async createRelatedEntity(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.related_entity.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "RelatedEntity"
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

    async createTroubleTicketRelationship(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.trouble_ticket_relationship.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "TroubleTicketRelationship"
        });
        ids.push(id);
      }
      return ids;
    },

    async createTroubleTicketCharacteristic(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.trouble_ticket_characteristic.create", {
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

    async createExternalIdentifier(ctx, items, parentId, clientId) {
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

    async createStatusChangeHistory(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.status_change_history.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "StatusChange"
        });
        ids.push(id);
      }
      return ids;
    },

    async deleteRelatedEntities(ctx, entity, clientId) {
      const relatedEntityTypes = [
        { field: 'attachment', db: 'attachment' },
        { field: 'note', db: 'note' },
        { field: 'relatedEntity', db: 'related_entity' },
        { field: 'relatedParty', db: 'related_party' },
        { field: 'troubleTicketRelationship', db: 'trouble_ticket_relationship' },
        { field: 'troubleTicketCharacteristic', db: 'trouble_ticket_characteristic' },
        { field: 'externalIdentifier', db: 'external_identifier' },
        { field: 'statusChangeHistory', db: 'status_change_history' }
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
        'id', 'href', 'name', 'description', 'severity', 'ticketType', 'priority',
        'status', 'statusChangeDate', 'statusChangeReason', 'creationDate', 'lastUpdate',
        'requestedResolutionDate', 'expectedResolutionDate', 'resolutionDate',
        'attachment', 'channel', 'note', 'relatedEntity', 'relatedParty',
        'troubleTicketRelationship', 'troubleTicketSpecification', 'troubleTicketCharacteristic',
        'externalIdentifier', 'statusChangeHistory',
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

    validateRequiredFields(data) {
      const requiredFields = ['description', 'severity', 'ticketType'];
      const missingFields = requiredFields.filter(field => !data[field] || (typeof data[field] === 'string' && data[field].trim() === ""));

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
    this.logger.info("TroubleTicket service started");
  }
};
