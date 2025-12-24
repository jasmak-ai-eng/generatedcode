rules.md file

Reference codes
individual.services.js
"""
"use strict";

const cuid = require('cuid');

module.exports = {
  name: "tmf632.individual",
  version: 1,

  settings: {
    defaultPageSize: 20,
    maxPageSize: 100,
    baseUrl: process.env.API_BASE_URL || "http://localhost:3000"
  },

  dependencies: [],

  actions: {
    list: {
      scope: ["individual.list"],
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

        const entities = await ctx.call("v1.db.individual.find", {
          query,
          offset,
          limit,
          sort: "-createdAt"
        });

        const populated = await Promise.all(
          entities.map(entity => this.populateIndividual(ctx, entity))
        );

        const total = await ctx.call("v1.db.individual.count", { query });

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
      scope: ["individual.create"],
      rest: {
        method: "POST",
        path: "/create"
      },
      cache: false,
      params: {
        givenName: { type: "string" },
        familyName: { type: "string" },
        "@type": { type: "string", optional: true, default: "Individual" },
        "@baseType": { type: "string", optional: true },
        "@schemaLocation": { type: "string", optional: true },
        gender: { type: "string", optional: true },
        placeOfBirth: { type: "string", optional: true },
        countryOfBirth: { type: "string", optional: true },
        nationality: { type: "string", optional: true },
        maritalStatus: { type: "string", optional: true },
        birthDate: { type: "string", optional: true },
        deathDate: { type: "string", optional: true },
        title: { type: "string", optional: true },
        aristocraticTitle: { type: "string", optional: true },
        generation: { type: "string", optional: true },
        preferredGivenName: { type: "string", optional: true },
        familyNamePrefix: { type: "string", optional: true },
        legalName: { type: "string", optional: true },
        middleName: { type: "string", optional: true },
        name: { type: "string", optional: true },
        formattedName: { type: "string", optional: true },
        location: { type: "string", optional: true },
        status: { type: "string", optional: true, default: "initialized" },
        externalReference: { type: "array", optional: true },
        partyCharacteristic: { type: "array", optional: true },
        taxExemptionCertificate: { type: "array", optional: true },
        creditRating: { type: "array", optional: true },
        relatedParty: { type: "array", optional: true },
        contactMedium: { type: "array", optional: true },
        otherName: { type: "array", optional: true },
        individualIdentification: { type: "array", optional: true },
        disability: { type: "array", optional: true },
        languageAbility: { type: "array", optional: true },
        skill: { type: "array", optional: true }
      },
      async handler(ctx) {
        this.validateRequiredFields(ctx.params);

        const entityData = { ...ctx.params };
        const clientId = ctx.meta.clientId;

        const id = cuid();
        entityData.id = id;
        entityData.clientId = clientId;

        if (!entityData["@type"]) entityData["@type"] = "Individual";

        Object.keys(entityData).forEach(key => {
          if (entityData[key] === null) {
            entityData[key] = "null";
          }
        });

        const relatedEntities = {
          contactMedium: entityData.contactMedium,
          partyCharacteristic: entityData.partyCharacteristic,
          externalReference: entityData.externalReference,
          relatedParty: entityData.relatedParty,
          taxExemptionCertificate: entityData.taxExemptionCertificate,
          creditRating: entityData.creditRating,
          otherName: entityData.otherName,
          individualIdentification: entityData.individualIdentification,
          disability: entityData.disability,
          languageAbility: entityData.languageAbility,
          skill: entityData.skill
        };

        delete entityData.contactMedium;
        delete entityData.partyCharacteristic;
        delete entityData.externalReference;
        delete entityData.relatedParty;
        delete entityData.taxExemptionCertificate;
        delete entityData.creditRating;
        delete entityData.otherName;
        delete entityData.individualIdentification;
        delete entityData.disability;
        delete entityData.languageAbility;
        delete entityData.skill;

        const created = await ctx.call("v1.db.individual.create", entityData);
        const entityId = created.id;

        created.href = `${this.settings.baseUrl}/api/v1/tmf632/individual/get/${entityId}`;
        await ctx.call("v1.db.individual.update", {
          id: entityId,
          clientId,
          href: created.href
        });

        try {
          if (relatedEntities.contactMedium && relatedEntities.contactMedium.length > 0) {
            const ids = await this.createContactMedium(ctx, relatedEntities.contactMedium, entityId, clientId);
            created.contactMedium = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, contactMedium: ids });
          }

          if (relatedEntities.partyCharacteristic && relatedEntities.partyCharacteristic.length > 0) {
            const ids = await this.createPartyCharacteristic(ctx, relatedEntities.partyCharacteristic, entityId, clientId);
            created.partyCharacteristic = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, partyCharacteristic: ids });
          }

          if (relatedEntities.externalReference && relatedEntities.externalReference.length > 0) {
            const ids = await this.createExternalReference(ctx, relatedEntities.externalReference, entityId, clientId);
            created.externalReference = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, externalReference: ids });
          }

          if (relatedEntities.relatedParty && relatedEntities.relatedParty.length > 0) {
            const ids = await this.createRelatedParty(ctx, relatedEntities.relatedParty, entityId, clientId);
            created.relatedParty = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, relatedParty: ids });
          }

          if (relatedEntities.taxExemptionCertificate && relatedEntities.taxExemptionCertificate.length > 0) {
            const ids = await this.createTaxExemptionCertificate(ctx, relatedEntities.taxExemptionCertificate, entityId, clientId);
            created.taxExemptionCertificate = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, taxExemptionCertificate: ids });
          }

          if (relatedEntities.creditRating && relatedEntities.creditRating.length > 0) {
            const ids = await this.createCreditRating(ctx, relatedEntities.creditRating, entityId, clientId);
            created.creditRating = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, creditRating: ids });
          }

          if (relatedEntities.otherName && relatedEntities.otherName.length > 0) {
            const ids = await this.createOtherName(ctx, relatedEntities.otherName, entityId, clientId);
            created.otherName = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, otherName: ids });
          }

          if (relatedEntities.individualIdentification && relatedEntities.individualIdentification.length > 0) {
            const ids = await this.createIndividualIdentification(ctx, relatedEntities.individualIdentification, entityId, clientId);
            created.individualIdentification = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, individualIdentification: ids });
          }

          if (relatedEntities.disability && relatedEntities.disability.length > 0) {
            const ids = await this.createDisability(ctx, relatedEntities.disability, entityId, clientId);
            created.disability = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, disability: ids });
          }

          if (relatedEntities.languageAbility && relatedEntities.languageAbility.length > 0) {
            const ids = await this.createLanguageAbility(ctx, relatedEntities.languageAbility, entityId, clientId);
            created.languageAbility = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, languageAbility: ids });
          }

          if (relatedEntities.skill && relatedEntities.skill.length > 0) {
            const ids = await this.createSkill(ctx, relatedEntities.skill, entityId, clientId);
            created.skill = ids;
            await ctx.call("v1.db.individual.update", { id: entityId, clientId, skill: ids });
          }

          const updatedEntity = await ctx.call("v1.db.individual.get", { id: entityId, clientId });
          const populated = await this.populateIndividual(ctx, updatedEntity);
          const schemaFiltered = this.mapToSchema(populated);

          await ctx.call("v1.tmf632.event-publisher.publish", {
            eventType: "IndividualCreateEvent",
            event: {
              eventType: "IndividualCreateEvent",
              eventTime: new Date().toISOString(),
              event: { individual: schemaFiltered }
            }
          });

          return schemaFiltered;

        } catch (error) {
          await ctx.call("v1.db.individual.remove", { id: entityId, clientId });
          throw error;
        }
      }
    },

    get: {
      scope: ["individual.get"],
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

        const entity = await ctx.call("v1.db.individual.get", { id, clientId });
        if (!entity) {
          throw new Error(`Individual with id ${id} not found`, 404);
        }

        const populated = await this.populateIndividual(ctx, entity);
        let result = this.mapToSchema(populated);

        if (fields) {
          const fieldList = fields.split(",").map(f => f.trim());
          result = this.filterFields(result, fieldList);
        }

        return result;
      }
    },

    /**
     * Unified PATCH operation following TMF630 Part 5 - JSON Patch Query
     * 
     * Supports two formats:
     * 1. JSON Patch Query format (application/json-patch-query+json):
     *    Array of operations with op, path, and value
     *    [
     *      { "op": "add", "path": "$.contactMedium[?(@.id=='abc')].preferred", "value": true },
     *      { "op": "replace", "path": "$.note[?(@.author=='John')].text", "value": "Updated" },
     *      { "op": "remove", "path": "$.skill[?(@.skillCode=='JS')]" }
     *    ]
     * 
     * 2. Simple merge patch format (backward compatible):
     *    { "givenName": "John", "familyName": "Doe" }
     * 
     * JSON Path expressions supported:
     * - $.arrayName[?(@.field=='value')].attribute - JSON Path filter
     * - /arrayName/attribute?arrayName.field=value - dot notation query
     */
    patch: {
      scope: ["individual.patch"],
      rest: {
        method: "PATCH",
        path: "/patch/:id"
      },
      cache: false,
      params: {
        id: { type: "string" }
        // Body can be either JSON Patch Query array or simple object - validated in handler
      },
      async handler(ctx) {
        const { id } = ctx.params;
        const clientId = ctx.meta.clientId;

        if (!id || id.trim() === "") {
          throw new Error("ID is required", 400);
        }

        // Get existing entity
        const existing = await ctx.call("v1.db.individual.get", { id, clientId });
        if (!existing) {
          throw new Error(`Individual with id ${id} not found`, 404);
        }

        // Populate existing entity to get full data including array contents
        const populatedExisting = await this.populateIndividual(ctx, existing);

        // Determine if this is JSON Patch Query format or simple merge patch
        const body = ctx.params;
        const patchOperations = body.operations || body.patchOperations;
        
        let changedAttributes = [];
        let updatedResource;

        if (Array.isArray(patchOperations)) {
          // JSON Patch Query format - TMF630 Part 5 compliant
          updatedResource = await this.applyJsonPatchQuery(ctx, populatedExisting, patchOperations, clientId);
          changedAttributes = this.extractChangedAttributesFromOperations(patchOperations);
        } else {
          // Simple merge patch format (backward compatible)
          const { id: _id, operations, patchOperations: _patchOps, ...updates } = body;
          
          if (Object.keys(updates).length === 0) {
            throw new Error("No update data provided. Use 'operations' array for JSON Patch Query or provide fields directly for merge patch.", 400);
          }
          
          updatedResource = await this.applyMergePatch(ctx, existing, updates, clientId);
          changedAttributes = Object.keys(updates);
        }

        // Get final populated result
        const finalEntity = await ctx.call("v1.db.individual.get", { id, clientId });
        const populated = await this.populateIndividual(ctx, finalEntity);
        const schemaFiltered = this.mapToSchema(populated);

        // Determine event type
        const statusChanged = updatedResource.status !== undefined && 
                              updatedResource.status !== existing.status;
        const eventType = statusChanged
          ? "IndividualStateChangeEvent"
          : "IndividualAttributeValueChangeEvent";

        await ctx.call("v1.tmf632.event-publisher.publish", {
          eventType,
          event: {
            eventType,
            eventTime: new Date().toISOString(),
            event: { individual: schemaFiltered, changedAttributes }
          }
        });

        return schemaFiltered;
      }
    },

    remove: {
      scope: ["individual.remove"],
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

        const entity = await ctx.call("v1.db.individual.get", { id, clientId });
        if (!entity) {
          throw new Error(`Individual with id ${id} not found`, 404);
        }

        await this.deleteRelatedEntities(ctx, entity, clientId);
        await ctx.call("v1.db.individual.remove", { id, clientId });

        await ctx.call("v1.tmf632.event-publisher.publish", {
          eventType: "IndividualDeleteEvent",
          event: {
            eventType: "IndividualDeleteEvent",
            eventTime: new Date().toISOString(),
            event: {
              individual: {
                id: entity.id,
                href: entity.href,
                name: entity.name || `${entity.givenName} ${entity.familyName}`,
                "@type": "Individual"
              }
            }
          }
        });

        return null;
      }
    }
  },

  methods: {
    /**
     * Apply JSON Patch Query operations following TMF630 Part 5 guidelines
     * Supports: add, remove, replace operations with JSON Path expressions
     */
    async applyJsonPatchQuery(ctx, entity, operations, clientId) {
      const entityId = entity.id;
      let workingEntity = JSON.parse(JSON.stringify(entity));
      
      // Validate all operations first
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

      // Apply each operation in sequence
      for (const operation of operations) {
        workingEntity = await this.applyPatchOperation(ctx, workingEntity, operation, clientId);
      }

      return workingEntity;
    },

    /**
     * Apply a single JSON Patch operation
     */
    async applyPatchOperation(ctx, entity, operation, clientId) {
      const { op, path, value } = operation;
      const entityId = entity.id;

      // Parse the path to extract array name, filter condition, and target attribute
      const pathInfo = this.parseJsonPath(path);
      
      if (!pathInfo) {
        throw new Error(`Invalid path format: ${path}`, 400);
      }

      const { arrayName, filterCondition, targetAttribute, isArrayOperation } = pathInfo;

      // Handle simple attribute updates (non-array)
      if (!isArrayOperation) {
        return await this.applySimpleOperation(ctx, entity, op, pathInfo.attributeName, value, clientId);
      }

      // Handle array operations
      const relatedEntityTypes = [
        'contactMedium', 'partyCharacteristic', 'externalReference', 'relatedParty',
        'taxExemptionCertificate', 'creditRating', 'otherName', 'individualIdentification',
        'disability', 'languageAbility', 'skill'
      ];

      if (!relatedEntityTypes.includes(arrayName)) {
        throw new Error(`Unknown array: ${arrayName}`, 400);
      }

      const arrayData = entity[arrayName] || [];
      
      // Find matching elements using the filter condition
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

    /**
     * Parse JSON Path expression to extract components
     * Supports:
     * - $.arrayName[0].nested.property (array index with nested property)
     * - $.arrayName[0] (array index only)
     * - $.arrayName[?(@.field=='value')].attribute (JSON Path filter)
     * - $.arrayName[?(@.field=='value')] (JSON Path - whole element)
     * - /arrayName/attribute?arrayName.field=value (dot notation)
     * - /arrayName?arrayName.field=value (dot notation - whole element)
     * - $.fieldName (simple field)
     * - $.nested.property (nested property without array)
     */
    parseJsonPath(path) {
      // Array index format: $.arrayName[0].nested.property or $.arrayName[0]
      // This handles paths like $.relatedParty[0].partyOrPartyRole.name
      const arrayIndexRegex = /^\$\.(\w+)\[(\d+)\](?:\.(.+))?$/;
      let match = path.match(arrayIndexRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { index: parseInt(match[2], 10) },
          targetAttribute: match[3] || null // Can be nested like "partyOrPartyRole.name"
        };
      }

      // JSON Path format: $.arrayName[?(@.field=='value')].attribute
      const jsonPathRegex = /^\$\.(\w+)\[\?\(@\.(\w+)==['"](.*)['"]\)\](?:\.(.+))?$/;
      match = path.match(jsonPathRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { field: match[2], value: match[3] },
          targetAttribute: match[4] || null // null means operate on whole element
        };
      }

      // JSON Path with complex filter: $.arrayName[?(@.nested.field=='value')].attribute
      const complexJsonPathRegex = /^\$\.(\w+)\[\?\(@\.([^=]+)==['"](.*)['"]\)\](?:\.(.+))?$/;
      match = path.match(complexJsonPathRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { field: match[2], value: match[3] },
          targetAttribute: match[4] || null
        };
      }

      // JSON Path with multiple conditions: $.arrayName[?(@.field1=='value1' && @.field2=='value2')]
      const multiConditionRegex = /^\$\.(\w+)\[\?\((.+)\)\](?:\.(.+))?$/;
      match = path.match(multiConditionRegex);
      
      if (match) {
        const conditions = this.parseMultipleConditions(match[2]);
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: conditions,
          targetAttribute: match[3] || null
        };
      }

      // Dot notation format: /arrayName/attribute?arrayName.field=value
      const dotNotationRegex = /^\/(\w+)(?:\/(\w+))?\?(.+)$/;
      match = path.match(dotNotationRegex);
      
      if (match) {
        const conditions = this.parseDotNotationConditions(match[3]);
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: conditions,
          targetAttribute: match[2] || null
        };
      }

      // Filter selector format: ?filter=arrayName[?(@.field=='value')].attribute
      const filterSelectorRegex = /^\?filter=(\w+)\[\?\(@\.(\w+)==['"](.*)['"]\)\](?:\.(.+))?$/;
      match = path.match(filterSelectorRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { field: match[2], value: match[3] },
          targetAttribute: match[4] || null
        };
      }

      // Nested attribute path: $.nested.property.path (no array)
      const nestedAttrRegex = /^\$\.(\w+(?:\.\w+)+)$/;
      match = path.match(nestedAttrRegex);
      
      if (match) {
        return {
          isArrayOperation: false,
          attributeName: match[1],
          isNested: true
        };
      }

      // Simple attribute path: /attributeName or $.attributeName
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

    /**
     * Parse multiple conditions from JSON Path expression
     * e.g., "@.field1=='value1' && @.field2=='value2'"
     */
    parseMultipleConditions(conditionString) {
      const conditions = [];
      const parts = conditionString.split(/\s*&&\s*/);
      
      for (const part of parts) {
        const match = part.match(/@\.([^=]+)==['"](.*)['"]$/);
        if (match) {
          conditions.push({ field: match[1].trim(), value: match[2] });
        }
      }
      
      return conditions.length === 1 ? conditions[0] : conditions;
    },

    /**
     * Parse dot notation conditions
     * e.g., "arrayName.field=value" or "arrayName.field1=value1&arrayName.field2=value2"
     */
    parseDotNotationConditions(conditionString) {
      const conditions = [];
      const parts = conditionString.split('&');
      
      for (const part of parts) {
        const [fieldPath, value] = part.split('=');
        // Remove array name prefix if present
        const field = fieldPath.includes('.') 
          ? fieldPath.split('.').slice(1).join('.')
          : fieldPath;
        conditions.push({ field, value });
      }
      
      return conditions.length === 1 ? conditions[0] : conditions;
    },

    /**
     * Find elements in array that match the filter condition
     * Supports:
     * - Index-based: { index: 0 } - returns [0] if element exists
     * - Field-based: { field: 'name', value: 'test' } - returns matching indices
     * - Multiple conditions: [{ field: 'a', value: '1' }, { field: 'b', value: '2' }]
     */
    findMatchingElements(array, filterCondition) {
      if (!Array.isArray(array)) return [];
      
      // Handle index-based filter condition (e.g., { index: 0 })
      if (filterCondition && typeof filterCondition.index === 'number') {
        const index = filterCondition.index;
        // Return the index if it exists in the array
        if (index >= 0 && index < array.length) {
          return [index];
        }
        return [];
      }
      
      // Handle field-based filter conditions
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

    /**
     * Get nested value from object using dot notation
     */
    getNestedValue(obj, path) {
      if (!obj || !path) return undefined;
      
      const parts = path.split('.');
      let current = obj;
      
      for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        // Handle @type, @baseType, etc.
        current = current[part];
      }
      
      return current;
    },

    /**
     * Set nested value in object using dot notation
     */
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

    /**
     * Delete nested value from object using dot notation
     */
    deleteNestedValue(obj, path) {
      const parts = path.split('.');
      let current = obj;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
          return; // Path doesn't exist, nothing to delete
        }
        current = current[parts[i]];
      }
      
      delete current[parts[parts.length - 1]];
    },

    /**
     * Handle ADD operation for arrays
     * Supports nested target attributes like "partyOrPartyRole.name"
     */
    async handleAddOperation(ctx, entity, arrayName, filterCondition, targetAttribute, value, clientId) {
      const entityId = entity.id;
      const dbName = this.getDbName(arrayName);
      const arrayData = entity[arrayName] || [];

      if (targetAttribute) {
        // Add attribute to matching elements
        const matchingIndices = this.findMatchingElements(arrayData, filterCondition);
        
        if (matchingIndices.length === 0) {
          throw new Error(`No elements match the filter condition to add attribute`, 404);
        }

        // Update each matching element in the database
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            // Get the existing DB record
            const existingRecord = await ctx.call(`v1.db.${dbName}.get`, { 
              id: element.id, 
              clientId 
            }).catch(() => null);

            if (existingRecord) {
              const updateData = { id: element.id, clientId };
              
              // Handle nested attribute (e.g., "partyOrPartyRole.name")
              if (targetAttribute.includes('.')) {
                const parts = targetAttribute.split('.');
                const topLevelKey = parts[0];
                const existingTopLevel = element[topLevelKey] || {};
                
                // Build nested update
                let nestedObj = JSON.parse(JSON.stringify(existingTopLevel));
                this.setNestedValue({ [topLevelKey]: nestedObj }, targetAttribute, value);
                
                updateData[topLevelKey] = nestedObj;
                
                // Update in database
                await ctx.call(`v1.db.${dbName}.update`, updateData);
                
                // Update working entity
                if (!arrayData[index][topLevelKey]) {
                  arrayData[index][topLevelKey] = {};
                }
                this.setNestedValue(arrayData[index], targetAttribute, value);
              } else if (typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(updateData, value);
                await ctx.call(`v1.db.${dbName}.update`, updateData);
                arrayData[index][targetAttribute] = { ...arrayData[index][targetAttribute], ...value };
              } else {
                updateData[targetAttribute] = value;
                await ctx.call(`v1.db.${dbName}.update`, updateData);
                arrayData[index][targetAttribute] = value;
              }
            }
          }
        }
      } else {
        // Add new element to array
        const createMethod = `create${arrayName.charAt(0).toUpperCase() + arrayName.slice(1)}`;
        
        if (typeof this[createMethod] === 'function') {
          const newItems = Array.isArray(value) ? value : [value];
          const newIds = await this[createMethod](ctx, newItems, entityId, clientId);
          
          // Update parent entity with new IDs
          const existingIds = await ctx.call("v1.db.individual.get", { id: entityId, clientId })
            .then(e => e[arrayName] || []);
          const allIds = [...existingIds, ...newIds];
          
          await ctx.call("v1.db.individual.update", {
            id: entityId,
            clientId,
            [arrayName]: allIds
          });
        }
      }

      entity[arrayName] = arrayData;
      return entity;
    },

    /**
     * Handle REMOVE operation for arrays
     * Supports nested target attributes like "partyOrPartyRole.name"
     */
    async handleRemoveOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, clientId) {
      const entityId = entity.id;
      const dbName = this.getDbName(arrayName);
      const arrayData = entity[arrayName] || [];

      if (targetAttribute) {
        // Remove attribute from matching elements
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            const existingRecord = await ctx.call(`v1.db.${dbName}.get`, { 
              id: element.id, 
              clientId 
            }).catch(() => null);

            if (existingRecord) {
              // Handle nested attribute (e.g., "partyOrPartyRole.name")
              if (targetAttribute.includes('.')) {
                const parts = targetAttribute.split('.');
                const topLevelKey = parts[0];
                const existingTopLevel = element[topLevelKey] || {};
                
                // Clone and remove nested key
                let nestedObj = JSON.parse(JSON.stringify(existingTopLevel));
                this.deleteNestedValue(nestedObj, parts.slice(1).join('.'));
                
                await ctx.call(`v1.db.${dbName}.update`, {
                  id: element.id,
                  clientId,
                  [topLevelKey]: nestedObj
                });
                
                // Update working entity
                this.deleteNestedValue(arrayData[index], targetAttribute);
              } else {
                // Remove the attribute by setting to null or using $unset
                await ctx.call(`v1.db.${dbName}.update`, {
                  id: element.id,
                  clientId,
                  [targetAttribute]: null
                });
                
                delete arrayData[index][targetAttribute];
              }
            }
          }
        }
      } else {
        // Remove entire elements from array
        const idsToRemove = matchingIndices.map(i => arrayData[i]?.id).filter(Boolean);
        
        // Remove from database
        for (const relId of idsToRemove) {
          await ctx.call(`v1.db.${dbName}.remove`, { id: relId, clientId }).catch(() => {});
        }
        
        // Update parent entity to remove the IDs
        const existingEntity = await ctx.call("v1.db.individual.get", { id: entityId, clientId });
        const remainingIds = (existingEntity[arrayName] || []).filter(id => !idsToRemove.includes(id));
        
        await ctx.call("v1.db.individual.update", {
          id: entityId,
          clientId,
          [arrayName]: remainingIds
        });
        
        // Update working entity
        entity[arrayName] = arrayData.filter((_, i) => !matchingIndices.includes(i));
      }

      return entity;
    },

    /**
     * Handle REPLACE operation for arrays
     * Supports nested target attributes like "partyOrPartyRole.name"
     */
    async handleReplaceOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, value, clientId) {
      const entityId = entity.id;
      const dbName = this.getDbName(arrayName);
      const arrayData = entity[arrayName] || [];

      if (targetAttribute) {
        // Replace attribute value in matching elements
        // targetAttribute can be nested like "partyOrPartyRole.name"
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            // Build the update data for nested attributes
            const updateData = {
              id: element.id,
              clientId
            };
            
            // Handle nested attribute (e.g., "partyOrPartyRole.name")
            if (targetAttribute.includes('.')) {
              // For nested updates, we need to get the existing object and merge
              const parts = targetAttribute.split('.');
              const topLevelKey = parts[0];
              const existingTopLevel = element[topLevelKey] || {};
              
              // Build nested update
              let nestedObj = JSON.parse(JSON.stringify(existingTopLevel));
              this.setNestedValue({ [topLevelKey]: nestedObj }, targetAttribute, value);
              
              updateData[topLevelKey] = nestedObj;
              
              // Update in database
              await ctx.call(`v1.db.${dbName}.update`, updateData);
              
              // Update working entity using setNestedValue
              this.setNestedValue(arrayData[index], targetAttribute, value);
            } else {
              // Simple (non-nested) attribute
              updateData[targetAttribute] = value;
              await ctx.call(`v1.db.${dbName}.update`, updateData);
              arrayData[index][targetAttribute] = value;
            }
          }
        }
      } else {
        // Replace entire elements
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            // Update the database record with new values
            await ctx.call(`v1.db.${dbName}.update`, {
              id: element.id,
              clientId,
              ...value
            });
            
            // Preserve ID and update other fields
            arrayData[index] = { ...value, id: element.id };
          }
        }
      }

      entity[arrayName] = arrayData;
      return entity;
    },

    /**
     * Apply simple (non-array) attribute operation
     */
    async applySimpleOperation(ctx, entity, op, attributeName, value, clientId) {
      const entityId = entity.id;
      const nonPatchableFields = ["id", "href", "@type"];
      
      if (nonPatchableFields.includes(attributeName)) {
        throw new Error(`Cannot modify field: ${attributeName}`, 400);
      }

      switch (op) {
        case 'add':
        case 'replace':
          await ctx.call("v1.db.individual.update", {
            id: entityId,
            clientId,
            [attributeName]: value
          });
          entity[attributeName] = value;
          break;
        
        case 'remove':
          await ctx.call("v1.db.individual.update", {
            id: entityId,
            clientId,
            [attributeName]: null
          });
          delete entity[attributeName];
          break;
      }

      return entity;
    },

    /**
     * Apply simple merge patch (backward compatible)
     */
    async applyMergePatch(ctx, existing, updates, clientId) {
      const entityId = existing.id;
      
      this.validatePatchableFields(updates);

      Object.keys(updates).forEach(key => {
        if (updates[key] === null) {
          updates[key] = "null";
        }
      });

      const relatedEntityTypes = [
        'contactMedium', 'partyCharacteristic', 'externalReference', 'relatedParty',
        'taxExemptionCertificate', 'creditRating', 'otherName', 'individualIdentification',
        'disability', 'languageAbility', 'skill'
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

      await ctx.call("v1.db.individual.update", {
        id: entityId,
        clientId,
        ...updates,
        updatedAt: new Date().toISOString()
      });

      return updates;
    },

    /**
     * Extract changed attributes from patch operations
     */
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
        contactMedium: 'contact_medium',
        partyCharacteristic: 'party_characteristic',
        externalReference: 'external_reference',
        relatedParty: 'related_party',
        taxExemptionCertificate: 'tax_exemption_certificate',
        creditRating: 'credit_rating',
        otherName: 'other_name_individual',
        individualIdentification: 'individual_identification',
        disability: 'disability',
        languageAbility: 'language_ability',
        skill: 'skill'
      };
      return dbNameMap[relationType] || relationType;
    },

    async populateIndividual(ctx, entity) {
      const populated = { ...entity };
      const clientId = ctx.meta.clientId;

      if (entity.contactMedium && entity.contactMedium.length > 0) {
        const contacts = await Promise.all(
          entity.contactMedium.map(id =>
            ctx.call("v1.db.contact_medium.get", { id, clientId }).catch(() => null)
          )
        );
        const contactSchema = ['id', 'preferred', 'contactType', 'validFor', 'emailAddress', 'phoneNumber', 'faxNumber', 'socialNetworkId', 'city', 'country', 'postCode', 'stateOrProvince', 'street1', 'street2', 'geographicAddress', '@type', '@baseType', '@schemaLocation'];
        populated.contactMedium = contacts.filter(c => c).map(c => this.cleanEntity(c, contactSchema));
      }

      if (entity.partyCharacteristic && entity.partyCharacteristic.length > 0) {
        const chars = await Promise.all(
          entity.partyCharacteristic.map(id =>
            ctx.call("v1.db.party_characteristic.get", { id, clientId }).catch(() => null)
          )
        );
        const charSchema = ['id', 'name', 'valueType', 'value', 'characteristicRelationship', '@type', '@baseType', '@schemaLocation'];
        populated.partyCharacteristic = chars.filter(c => c).map(c => this.cleanEntity(c, charSchema));
      }

      if (entity.externalReference && entity.externalReference.length > 0) {
        const refs = await Promise.all(
          entity.externalReference.map(id =>
            ctx.call("v1.db.external_reference.get", { id, clientId }).catch(() => null)
          )
        );
        const refSchema = ['id', 'owner', 'externalIdentifierType', '@type', '@baseType', '@schemaLocation'];
        populated.externalReference = refs.filter(r => r).map(r => this.cleanEntity(r, refSchema));
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

      if (entity.taxExemptionCertificate && entity.taxExemptionCertificate.length > 0) {
        const certs = await Promise.all(
          entity.taxExemptionCertificate.map(id =>
            ctx.call("v1.db.tax_exemption_certificate.get", { id, clientId }).catch(() => null)
          )
        );
        const certSchema = ['id', 'taxDefinition', 'validFor', 'certificateNumber', 'issuingJurisdiction', 'reason', 'attachment', '@type', '@baseType', '@schemaLocation'];
        populated.taxExemptionCertificate = certs.filter(c => c).map(c => this.cleanEntity(c, certSchema));
      }

      if (entity.creditRating && entity.creditRating.length > 0) {
        const ratings = await Promise.all(
          entity.creditRating.map(id =>
            ctx.call("v1.db.credit_rating.get", { id, clientId }).catch(() => null)
          )
        );
        const ratingSchema = ['id', 'href', 'creditAgencyName', 'creditAgencyType', 'ratingReference', 'ratingScore', 'validFor', '@type', '@baseType', '@schemaLocation'];
        populated.creditRating = ratings.filter(r => r).map(r => this.cleanEntity(r, ratingSchema));
      }

      if (entity.otherName && entity.otherName.length > 0) {
        const names = await Promise.all(
          entity.otherName.map(id =>
            ctx.call("v1.db.other_name_individual.get", { id, clientId }).catch(() => null)
          )
        );
        const nameSchema = ['title', 'aristocraticTitle', 'generation', 'givenName', 'preferredGivenName', 'familyNamePrefix', 'familyName', 'legalName', 'middleName', 'fullName', 'formattedName', 'validFor', '@type'];
        populated.otherName = names.filter(n => n).map(n => this.cleanEntity(n, nameSchema));
      }

      if (entity.individualIdentification && entity.individualIdentification.length > 0) {
        const ids = await Promise.all(
          entity.individualIdentification.map(id =>
            ctx.call("v1.db.individual_identification.get", { id, clientId }).catch(() => null)
          )
        );
        const idSchema = ['identificationId', 'issuingAuthority', 'issuingDate', 'identificationType', 'validFor', 'attachment', '@type', '@baseType', '@schemaLocation'];
        populated.individualIdentification = ids.filter(i => i).map(i => this.cleanEntity(i, idSchema));
      }

      if (entity.disability && entity.disability.length > 0) {
        const disabilities = await Promise.all(
          entity.disability.map(id =>
            ctx.call("v1.db.disability.get", { id, clientId }).catch(() => null)
          )
        );
        const disSchema = ['disabilityCode', 'disabilityName', 'validFor'];
        populated.disability = disabilities.filter(d => d).map(d => this.cleanEntity(d, disSchema));
      }

      if (entity.languageAbility && entity.languageAbility.length > 0) {
        const langs = await Promise.all(
          entity.languageAbility.map(id =>
            ctx.call("v1.db.language_ability.get", { id, clientId }).catch(() => null)
          )
        );
        const langSchema = ['languageCode', 'languageName', 'isFavouriteLanguage', 'writingProficiency', 'readingProficiency', 'speakingProficiency', 'listeningProficiency', 'validFor'];
        populated.languageAbility = langs.filter(l => l).map(l => this.cleanEntity(l, langSchema));
      }

      if (entity.skill && entity.skill.length > 0) {
        const skills = await Promise.all(
          entity.skill.map(id =>
            ctx.call("v1.db.skill.get", { id, clientId }).catch(() => null)
          )
        );
        const skillSchema = ['skillCode', 'skillName', 'evaluatedLevel', 'comment', 'validFor'];
        populated.skill = skills.filter(s => s).map(s => this.cleanEntity(s, skillSchema));
      }

      return populated;
    },

    async createContactMedium(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.contact_medium.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ContactMedium"
        });
        ids.push(id);
      }
      return ids;
    },

    async createPartyCharacteristic(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.party_characteristic.create", {
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

    async createExternalReference(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.external_reference.create", {
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

    async createTaxExemptionCertificate(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.tax_exemption_certificate.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "TaxExemptionCertificate"
        });
        ids.push(id);
      }
      return ids;
    },

    async createCreditRating(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.credit_rating.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "PartyCreditProfile"
        });
        ids.push(id);
      }
      return ids;
    },

    async createOtherName(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.other_name_individual.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "OtherNameIndividual"
        });
        ids.push(id);
      }
      return ids;
    },

    async createIndividualIdentification(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.individual_identification.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "IndividualIdentification"
        });
        ids.push(id);
      }
      return ids;
    },

    async createDisability(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.disability.create", {
          id,
          clientId,
          parentId,
          ...item
        });
        ids.push(id);
      }
      return ids;
    },

    async createLanguageAbility(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.language_ability.create", {
          id,
          clientId,
          parentId,
          ...item
        });
        ids.push(id);
      }
      return ids;
    },

    async createSkill(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.skill.create", {
          id,
          clientId,
          parentId,
          ...item
        });
        ids.push(id);
      }
      return ids;
    },

    async deleteRelatedEntities(ctx, entity, clientId) {
      const relatedEntityTypes = [
        { field: 'contactMedium', db: 'contact_medium' },
        { field: 'partyCharacteristic', db: 'party_characteristic' },
        { field: 'externalReference', db: 'external_reference' },
        { field: 'relatedParty', db: 'related_party' },
        { field: 'taxExemptionCertificate', db: 'tax_exemption_certificate' },
        { field: 'creditRating', db: 'credit_rating' },
        { field: 'otherName', db: 'other_name_individual' },
        { field: 'individualIdentification', db: 'individual_identification' },
        { field: 'disability', db: 'disability' },
        { field: 'languageAbility', db: 'language_ability' },
        { field: 'skill', db: 'skill' }
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
        'id', 'href', 'gender', 'placeOfBirth', 'countryOfBirth', 'nationality', 'maritalStatus',
        'birthDate', 'deathDate', 'title', 'aristocraticTitle', 'generation', 'preferredGivenName',
        'familyNamePrefix', 'legalName', 'middleName', 'name', 'formattedName', 'location', 'status',
        'givenName', 'familyName', 'externalReference', 'partyCharacteristic', 'taxExemptionCertificate',
        'creditRating', 'relatedParty', 'contactMedium', 'otherName', 'individualIdentification',
        'disability', 'languageAbility', 'skill', '@type', '@baseType', '@schemaLocation'
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
      const requiredFields = ['givenName', 'familyName'];
      const missingFields = requiredFields.filter(field => !data[field] || (typeof data[field] === 'string' && data[field].trim() === ""));

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(", ")}`, 400);
      }
    },

    validatePatchableFields(updates) {
      const nonPatchableFields = ["id", "href", "@type"];
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
    this.logger.info("Individual service started");
  }
};

"""

tmf632-event-publisher.service.js
"""
"use strict";

const axios = require('axios');

module.exports = {
  name: "tmf632.event-publisher",
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
    this.logger.info("TMF632 Event Publisher service started");
  }
};

"""


Path for new code:


output path:"services/tmf{number}/
yaml_path:"TMF637-Customer_Management-v5.0.1.oas.yaml"
configuration:
{repo url:"."
}

