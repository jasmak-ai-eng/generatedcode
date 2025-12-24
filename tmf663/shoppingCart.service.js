"use strict";

/**
 * ============================================================================
 * TMF663 Shopping Cart API Service - Generated Implementation
 * ============================================================================
 *
 * This file implements the TMF663 Shopping Cart Management API
 * Generated following the reference patterns from TMF632 Individual service.
 *
 * KEY ARCHITECTURE PATTERNS:
 *
 * 1. DUAL PATCH STRATEGY (TMF630 Compliant):
 *    - JSON Patch Query (TMF630): Array of operations with op/path/value
 *    - Legacy Merge: Object-based merge (backward compatible)
 *
 * 2. RELATED ENTITY MANAGEMENT:
 *    - Main entity stores arrays of IDs for related entities
 *    - Related entities are stored in separate database tables
 *    - Related entities are populated on GET/LIST operations
 *
 * 3. MULTI-TENANCY:
 *    - All entities are scoped by clientId
 *
 * 4. NULL VALUE HANDLING:
 *    - Database stores "null" string instead of null
 *    - All null values are cleaned recursively before returning responses
 *
 * 5. OPTIMISTIC LOCKING:
 *    - Uses ETag header with updatedAt/createdAt timestamp
 *
 * 6. EVENT PUBLISHING:
 *    - All state changes publish TMF events
 */

const cuid = require("cuid");
const JsonPatchQueryHelper = require("../../helpers/jsonPatchQuery");

module.exports = {
	name: "tmf663.shoppingCart",
	version: 1,

	settings: {
		defaultPageSize: 20,
		maxPageSize: 100,
		baseUrl: process.env.API_BASE_URL || "http://localhost:3000"
	},

	dependencies: [],

	actions: {
		/**
		 * LIST Action - Retrieve paginated list of shopping carts with search and filtering
		 */
		list: {
			scope: ["shoppingCart.list"],
			rest: {
				method: "GET",
				path: "/list"
			},
			cache: false,
			params: {
				search: { type: "string", optional: true },
				fields: { type: "string", optional: true },
				offset: { type: "number", integer: true, min: 0, default: 0, optional: true, convert: true },
				limit: { type: "number", integer: true, min: 1, max: 100, default: 20, optional: true, convert: true },
				sort: { type: "string", optional: true, default: "-createdAt" }
			},
			async handler(ctx) {
				try {
					const { fields, offset, limit, sort, search, ...filters } = ctx.params;
					const clientId = ctx.meta.clientId;

					let query = { clientId };

					if (search && search.trim() !== "") {
						const searchConditions = await this.buildSearchConditions(ctx, search, clientId);
						if (searchConditions.length > 0) {
							query.$or = searchConditions;
						}
					}

					Object.keys(filters).forEach((key) => {
						if (filters[key] !== undefined) query[key] = filters[key];
					});

					const entities = await ctx.call("v1.db.shopping_cart.find", {
						query,
						offset,
						limit,
						sort
					});

					const populated = await Promise.all(entities.map((entity) => this.populateShoppingCart(ctx, entity)));

					const total = await ctx.call("v1.db.shopping_cart.count", { query });

					let results = populated.map((entity) => this.mapToSchema(entity));

					if (fields) {
						const fieldList = fields.split(",").map((f) => f.trim());
						results = results.map((entity) => this.filterFields(entity, fieldList));
					}

					const cleanedResults = results.map((result) => this.applyFinalCleanup(result)).filter((r) => r !== undefined);

					return {
						data: cleanedResults,
						meta: { total, offset, limit, hasMore: offset + limit < total }
					};
				} catch (error) {
					throw error;
				}
			}
		},

		/**
		 * CREATE Action - Create new shopping cart with related entities
		 */
		create: {
			scope: ["shoppingCart.create"],
			rest: {
				method: "POST",
				path: "/create"
			},
			cache: false,
			params: {
				validFor: { type: "object", optional: true },
				contactMedium: { type: "array", optional: true },
				cartItem: { type: "array", optional: true },
				cartTotalPrice: { type: "array", optional: true },
				relatedParty: { type: "array", optional: true },
				"@type": { type: "string", optional: true, default: "ShoppingCart" }
			},
			async handler(ctx) {
				const entityData = { ...ctx.params };
				const clientId = ctx.meta.clientId;

				const id = cuid();
				entityData.id = id;
				entityData.clientId = clientId;
				entityData.creationDate = new Date().toISOString();
				entityData.lastUpdate = new Date().toISOString();

				if (!entityData["@type"]) entityData["@type"] = "ShoppingCart";

				Object.keys(entityData).forEach((key) => {
					if (entityData[key] === null) {
						entityData[key] = "null";
					}
				});

				const relatedEntities = {
					contactMedium: entityData.contactMedium,
					cartItem: entityData.cartItem,
					cartTotalPrice: entityData.cartTotalPrice,
					relatedParty: entityData.relatedParty
				};

				delete entityData.contactMedium;
				delete entityData.cartItem;
				delete entityData.cartTotalPrice;
				delete entityData.relatedParty;

				let created, entityId;

				try {
					created = await ctx.call("v1.db.shopping_cart.create", entityData);
					entityId = created.id;

					created.href = `${this.settings.baseUrl}/api/v1/tmf663/shoppingCart/get/${entityId}`;
					await ctx.call("v1.db.shopping_cart.update", {
						id: entityId,
						clientId,
						href: created.href
					});
				} catch (error) {
					if (
						error.message &&
						(error.message.includes("Unique constraint") ||
							error.message.includes("SequelizeUniqueConstraintError") ||
							error.name === "SequelizeUniqueConstraintError")
					) {
						const duplicateError = new Error(`ShoppingCart with these details already exists`);
						duplicateError.code = 409;
						duplicateError.type = "DUPLICATE_ENTITY_ERROR";
						throw duplicateError;
					}
					throw error;
				}

				try {
					for (const [relationType, relatedData] of Object.entries(relatedEntities)) {
						if (relatedData && relatedData.length > 0) {
							const ids = await this[`create${this.capitalize(relationType)}`](ctx, relatedData, entityId, clientId);
							created[relationType] = ids;
							await ctx.call("v1.db.shopping_cart.update", {
								id: entityId,
								clientId,
								[relationType]: ids
							});
						}
					}

					const populated = await this.populateShoppingCart(ctx, created);
					const schemaFiltered = this.mapToSchema(populated);
					const cleanedResponse = this.applyFinalCleanup(schemaFiltered);

					await ctx.call("v1.tmf663.event-publisher.publish", {
						eventType: "ShoppingCartCreateEvent",
						event: {
							eventType: "ShoppingCartCreateEvent",
							eventTime: new Date().toISOString(),
							event: { shoppingCart: cleanedResponse }
						}
					});

					return cleanedResponse;
				} catch (error) {
					await ctx.call("v1.db.shopping_cart.remove", { id: entityId, clientId });
					throw error;
				}
			}
		},

		/**
		 * GET Action - Retrieve single shopping cart by ID
		 */
		get: {
			scope: ["shoppingCart.get"],
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

				const entity = await ctx.call("v1.db.shopping_cart.get", { id, clientId });
				if (!entity) {
					throw new Error(`ShoppingCart with id ${id} not found`, 404);
				}

				const populated = await this.populateShoppingCart(ctx, entity);

				let result = this.mapToSchema(populated);

				if (fields) {
					const fieldList = fields.split(",").map((f) => f.trim());
					result = this.filterFields(result, fieldList);
				}

				const version = entity.updatedAt || entity.createdAt;
				if (version) {
					ctx.meta.$responseHeaders = {
						ETag: `"${version}"`,
						"Cache-Control": "no-cache"
					};
				}

				const cleanResult = this.applyFinalCleanup(result);

				return cleanResult;
			}
		},

		/**
		 * PATCH Action - Partial update with dual strategy support
		 */
		patch: {
			scope: ["shoppingCart.patch"],
			rest: {
				method: "PATCH",
				path: "/patch/:id"
			},
			cache: false,
			params: {
				id: { type: "string" },
				validFor: { type: "object", optional: true },
				contactMedium: { type: "array", optional: true },
				cartItem: { type: "array", optional: true },
				cartTotalPrice: { type: "array", optional: true },
				relatedParty: { type: "array", optional: true },
				$$strict: "remove"
			},
			async handler(ctx) {
				const id = ctx.params.id;
				const clientId = ctx.meta.clientId;

				if (!id || id.trim() === "") {
					throw new Error("ID is required", 400);
				}

				const bodyIsArray = Array.isArray(ctx.meta.$requestBody) || Array.isArray(ctx.meta.$params);
				const requestBody = ctx.meta.$requestBody || ctx.meta.$params || ctx.params;

				let isJsonPatchQuery = false;
				if (bodyIsArray) {
					isJsonPatchQuery = true;
				} else {
					const { id: paramId, ...payload } = requestBody;
					isJsonPatchQuery = payload.op !== undefined;
				}

				if (isJsonPatchQuery) {
					const originalParams = ctx.params;
					ctx.params = bodyIsArray ? requestBody : [requestBody];
					try {
						return await this.applyJsonPatchQuery(ctx, id, clientId);
					} finally {
						ctx.params = originalParams;
					}
				} else {
					return await this.applyMergeStrategy(ctx, id, clientId);
				}
			}
		},

		/**
		 * REMOVE Action - Delete shopping cart and all related entities
		 */
		remove: {
			scope: ["shoppingCart.remove"],
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

				const entity = await ctx.call("v1.db.shopping_cart.get", { id, clientId });
				if (!entity) {
					throw new Error(`ShoppingCart with id ${id} not found`, 404);
				}

				await this.deleteRelatedEntities(ctx, entity, clientId);
				await ctx.call("v1.db.shopping_cart.remove", { id, clientId });

				await ctx.call("v1.tmf663.event-publisher.publish", {
					eventType: "ShoppingCartDeleteEvent",
					event: {
						eventType: "ShoppingCartDeleteEvent",
						eventTime: new Date().toISOString(),
						event: {
							shoppingCart: {
								id: entity.id,
								href: entity.href,
								"@type": "ShoppingCart"
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
		 * Build search conditions for text search across multiple fields
		 */
		async buildSearchConditions(ctx, searchTerm, clientId) {
			if (!searchTerm || searchTerm.trim() === "") {
				return [];
			}

			const search = searchTerm.trim();
			const searchConditions = [];

			try {
				const matchingContacts = await ctx.call("v1.db.contact_medium.find", {
					query: {
						clientId,
						$or: [{ emailAddress: { $iLike: `%${search}%` } }, { phoneNumber: { $iLike: `%${search}%` } }]
					},
					fields: ["id"]
				});

				if (matchingContacts && matchingContacts.length > 0) {
					matchingContacts.forEach((contact) => {
						searchConditions.push({ contactMedium: { $contains: [contact.id] } });
					});
				}
			} catch (error) {
				this.logger.warn("Contact medium search error:", error);
			}

			return searchConditions;
		},

		/**
		 * Populate related entities by fetching them from their respective database tables
		 */
		async populateShoppingCart(ctx, entity) {
			const populated = { ...entity };

			const relatedArrayFields = ["contactMedium", "cartItem", "cartTotalPrice", "relatedParty"];

			for (const field of relatedArrayFields) {
				if (populated[field] && Array.isArray(populated[field])) {
					const dbField = field.replace(/([A-Z])/g, "_$1").toLowerCase();
					const results = await Promise.all(
						populated[field].map((id) => ctx.call(`v1.db.${dbField}.get`, { id, clientId: ctx.meta.clientId }).catch(() => null))
					);
					populated[field] = results.filter((r) => r !== null).map((item) => this.removeNullFields(item));
				}
			}

			return populated;
		},

		/**
		 * Recursively remove null, undefined, "null" string values, and database internal fields
		 */
		removeNullFields(obj) {
			const internalFields = ["clientId", "createdAt", "updatedAt", "deletedAt", "deletedBy", "createdBy", "updatedBy"];

			if (obj === null || obj === undefined || obj === "null") {
				return undefined;
			}

			if (Array.isArray(obj)) {
				const cleaned = obj.map((item) => this.removeNullFields(item)).filter((item) => item !== undefined && item !== null);
				return cleaned.length > 0 ? cleaned : undefined;
			}

			if (typeof obj === "object") {
				const cleaned = {};
				for (const key in obj) {
					if (obj.hasOwnProperty(key)) {
						if (internalFields.includes(key)) {
							continue;
						}

						const value = obj[key];

						if (value === null || value === undefined || value === "null") {
							continue;
						}

						const cleanedValue = this.removeNullFields(value);

						if (cleanedValue !== undefined) {
							cleaned[key] = cleanedValue;
						}
					}
				}

				return Object.keys(cleaned).length > 0 ? cleaned : undefined;
			}

			return obj;
		},

		/**
		 * Apply final cleanup to response
		 */
		applyFinalCleanup(response) {
			return this.removeNullFields(response);
		},

		/**
		 * Related Entity Creation Methods
		 */
		async createContactMedium(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.contact_medium.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "ContactMedium"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createCartItem(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.cart_item.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "CartItem"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createCartTotalPrice(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.cart_total_price.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "CartPrice"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createRelatedParty(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.related_party.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "RelatedPartyOrPartyRole"
				});
				ids.push(created.id);
			}
			return ids;
		},

		/**
		 * Merge related entities during PATCH operations
		 */
		async mergeRelatedEntities(ctx, relationType, existingIds, updatePayload, parentId, clientId) {
			const dbField = relationType.replace(/([A-Z])/g, "_$1").toLowerCase();

			const existingEntities = await Promise.all(existingIds.map((id) => ctx.call(`v1.db.${dbField}.get`, { id, clientId }).catch(() => null)));
			const validExisting = existingEntities.filter((e) => e !== null);

			const updatedIds = [];
			const processedIds = new Set();

			for (const item of updatePayload) {
				if (item.id && existingIds.includes(item.id)) {
					await ctx.call(`v1.db.${dbField}.update`, {
						id: item.id,
						clientId,
						...item
					});
					updatedIds.push(item.id);
					processedIds.add(item.id);
				} else {
					const newId = cuid();
					const created = await this[`create${this.capitalize(relationType)}`](ctx, [{ ...item, id: newId }], parentId, clientId);
					updatedIds.push(...created);
					processedIds.add(newId);
				}
			}

			for (const existingEntity of validExisting) {
				if (!processedIds.has(existingEntity.id)) {
					updatedIds.push(existingEntity.id);
				}
			}

			return updatedIds;
		},

		/**
		 * Delete all related entities during entity deletion
		 */
		async deleteRelatedEntities(ctx, entity, clientId) {
			const relatedEntityTypes = ["contactMedium", "cartItem", "cartTotalPrice", "relatedParty"];

			for (const relationType of relatedEntityTypes) {
				if (entity[relationType] && Array.isArray(entity[relationType])) {
					const dbField = relationType.replace(/([A-Z])/g, "_$1").toLowerCase();
					await Promise.all(entity[relationType].map((id) => ctx.call(`v1.db.${dbField}.remove`, { id, clientId }).catch(() => {})));
				}
			}
		},

		/**
		 * Map database entity to TMF API schema
		 */
		mapToSchema(data) {
			const schemaFields = [
				"id",
				"href",
				"validFor",
				"contactMedium",
				"cartItem",
				"cartTotalPrice",
				"relatedParty",
				"creationDate",
				"lastUpdate",
				"@type",
				"@baseType",
				"@schemaLocation"
			];

			const mapped = {};

			if (data.id !== undefined && data.id !== null && data.id !== "null") mapped.id = data.id;
			if (data.href !== undefined && data.href !== null && data.href !== "null") mapped.href = data.href;

			schemaFields.forEach((field) => {
				if (field !== "id" && field !== "href" && data[field] !== undefined && data[field] !== null && data[field] !== "null") {
					const cleanedValue = this.removeNullFields(data[field]);
					if (cleanedValue !== undefined) {
						mapped[field] = cleanedValue;
					}
				}
			});

			return mapped;
		},

		/**
		 * Validate that fields are patchable (not read-only)
		 */
		validatePatchableFields(updates) {
			const nonPatchableFields = ["id", "href", "@type", "creationDate"];
			const invalidFields = Object.keys(updates).filter((field) => nonPatchableFields.includes(field));

			if (invalidFields.length > 0) {
				throw new Error(`Cannot update non-patchable fields: ${invalidFields.join(", ")}`, 400);
			}
		},

		/**
		 * Filter response to only requested fields
		 */
		filterFields(obj, fields) {
			const filtered = {};

			if (obj.id !== undefined && obj.id !== null) filtered.id = obj.id;
			if (obj.href !== undefined && obj.href !== null) filtered.href = obj.href;

			fields.forEach((field) => {
				if (field !== "id" && field !== "href" && obj.hasOwnProperty(field) && obj[field] !== null && obj[field] !== "null") {
					filtered[field] = obj[field];
				}
			});

			if (obj["@type"] !== undefined && obj["@type"] !== null) filtered["@type"] = obj["@type"];

			return filtered;
		},

		capitalize(str) {
			return str.charAt(0).toUpperCase() + str.slice(1);
		},

		/**
		 * Apply JSON Patch Query operations (TMF630)
		 */
		async applyJsonPatchQuery(ctx, id, clientId) {
			const operations = ctx.params;

			if (!Array.isArray(operations)) {
				throw new Error("JSON Patch Query request body must be an array of operations", 400);
			}

			JsonPatchQueryHelper.validateOperations(operations);

			const existing = await ctx.call("v1.db.shopping_cart.get", { id, clientId });
			if (!existing) {
				throw new Error(`ShoppingCart with id ${id} not found`, 404);
			}

			await this.checkOptimisticLocking(ctx, existing);

			const changedAttributes = new Set();

			for (const operation of operations) {
				const result = await this.applyPatchOperation(ctx, id, clientId, existing, operation);
				if (result.changedAttribute) {
					changedAttributes.add(result.changedAttribute);
				}
			}

			await ctx.call("v1.db.shopping_cart.update", {
				id,
				clientId,
				lastUpdate: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});

			const updated = await ctx.call("v1.db.shopping_cart.get", { id, clientId });
			const populated = await this.populateShoppingCart(ctx, updated);
			const schemaFiltered = this.mapToSchema(populated);
			const cleanedResponse = this.applyFinalCleanup(schemaFiltered);

			await ctx.call("v1.tmf663.event-publisher.publish", {
				eventType: "ShoppingCartAttributeValueChangeEvent",
				event: {
					eventType: "ShoppingCartAttributeValueChangeEvent",
					eventTime: new Date().toISOString(),
					event: {
						shoppingCart: cleanedResponse,
						changedAttributes: Array.from(changedAttributes)
					}
				}
			});

			return cleanedResponse;
		},

		/**
		 * Apply legacy merge strategy (backward compatible)
		 */
		async applyMergeStrategy(ctx, id, clientId) {
			const { id: paramId, ...updates } = ctx.params;

			this.validatePatchableFields(updates);

			const existing = await ctx.call("v1.db.shopping_cart.get", { id, clientId });
			if (!existing) {
				throw new Error(`ShoppingCart with id ${id} not found`, 404);
			}

			await this.checkOptimisticLocking(ctx, existing);

			Object.keys(updates).forEach((key) => {
				if (updates[key] === null) {
					updates[key] = "null";
				}
			});

			const changedAttributes = [];
			const relatedEntityTypes = ["contactMedium", "cartItem", "cartTotalPrice", "relatedParty"];

			for (const relationType of relatedEntityTypes) {
				if (updates[relationType] && Array.isArray(updates[relationType])) {
					const mergedIds = await this.mergeRelatedEntities(
						ctx,
						relationType,
						existing[relationType] || [],
						updates[relationType],
						id,
						clientId
					);

					updates[relationType] = mergedIds;
					changedAttributes.push(relationType);
				}
			}

			const updated = await ctx.call("v1.db.shopping_cart.update", {
				id,
				clientId,
				...updates,
				lastUpdate: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});

			const populated = await this.populateShoppingCart(ctx, updated);
			const schemaFiltered = this.mapToSchema(populated);
			const cleanedResponse = this.applyFinalCleanup(schemaFiltered);

			await ctx.call("v1.tmf663.event-publisher.publish", {
				eventType: "ShoppingCartAttributeValueChangeEvent",
				event: {
					eventType: "ShoppingCartAttributeValueChangeEvent",
					eventTime: new Date().toISOString(),
					event: { shoppingCart: cleanedResponse, changedAttributes }
				}
			});

			return cleanedResponse;
		},

		/**
		 * Check optimistic locking with If-Match header
		 */
		async checkOptimisticLocking(ctx, existing) {
			const ifMatch = ctx.meta.headers && (ctx.meta.headers["if-match"] || ctx.meta.headers["If-Match"]);
			if (ifMatch) {
				const currentVersion = existing.updatedAt || existing.createdAt;
				const requestedVersion = ifMatch.replace(/^["']|["']$/g, "");

				if (currentVersion !== requestedVersion) {
					const error = new Error("Precondition Failed: Resource has been modified by another request");
					error.code = 412;
					error.type = "PRECONDITION_FAILED";
					error.data = {
						current: currentVersion,
						requested: requestedVersion,
						message: "The resource has been modified since you last retrieved it. Please fetch the latest version and retry."
					};
					throw error;
				}
			}
		},

		/**
		 * Apply a single JSON Patch operation
		 */
		async applyPatchOperation(ctx, entityId, clientId, existing, operation) {
			const { op, path, value } = operation;
			const pathInfo = JsonPatchQueryHelper.parsePath(path);

			if (pathInfo.isSimpleField) {
				return await this.applySimpleFieldOperation(ctx, entityId, clientId, operation);
			}

			const { arrayName, filter, attribute, isIndexBased, index } = pathInfo;
			const relatedEntityTypes = ["contactMedium", "cartItem", "cartTotalPrice", "relatedParty"];

			if (!relatedEntityTypes.includes(arrayName)) {
				throw new Error(
					`Invalid array field '${arrayName}'. Field does not exist in ShoppingCart schema. Valid array fields are: ${relatedEntityTypes.join(", ")}`,
					400
				);
			}

			switch (op) {
				case "add":
					return await this.applyAddOperation(ctx, entityId, clientId, existing, arrayName, filter, attribute, value, isIndexBased ? index : null);
				case "remove":
					return await this.applyRemoveOperation(ctx, entityId, clientId, existing, arrayName, filter, attribute, isIndexBased ? index : null);
				case "replace":
					return await this.applyReplaceOperation(ctx, entityId, clientId, existing, arrayName, filter, attribute, value, isIndexBased ? index : null);
				default:
					throw new Error(`Unsupported operation: ${op}`, 501);
			}
		},

		/**
		 * Apply operation on simple field (non-array)
		 */
		async applySimpleFieldOperation(ctx, entityId, clientId, operation) {
			const { op, path, value } = operation;
			const fieldName = path.replace(/^\$\./, "").replace(/^\//, "");

			const validSimpleFields = ["validFor"];

			if (!validSimpleFields.includes(fieldName)) {
				throw new Error(
					`Invalid field '${fieldName}'. Field does not exist in ShoppingCart schema or is read-only. Valid patchable fields are: ${validSimpleFields.join(", ")}`,
					400
				);
			}

			const updates = {};

			if (op === "replace" || op === "add") {
				updates[fieldName] = value;
			} else if (op === "remove") {
				updates[fieldName] = null;
			}

			await ctx.call("v1.db.shopping_cart.update", {
				id: entityId,
				clientId,
				...updates
			});

			return { changedAttribute: fieldName };
		},

		/**
		 * Apply ADD operation on array
		 */
		async applyAddOperation(ctx, entityId, clientId, existing, arrayName, filter, attribute, value, targetIndex = null) {
			const dbField = JsonPatchQueryHelper.toSnakeCase(arrayName);
			const currentIds = existing[arrayName] || [];

			if (!filter) {
				const newId = cuid();
				const entityData = typeof value === "object" ? value : { [attribute]: value };
				await this[`create${this.capitalize(arrayName)}`](ctx, [{ ...entityData, id: newId }], entityId, clientId);

				const updatedIds = [...currentIds, newId];
				await ctx.call("v1.db.shopping_cart.update", {
					id: entityId,
					clientId,
					[arrayName]: updatedIds
				});
			} else {
				const currentEntities = await Promise.all(
					currentIds.map((id) => ctx.call(`v1.db.${dbField}.get`, { id, clientId }).catch(() => null))
				);

				const matches = JsonPatchQueryHelper.findMatchingElements(
					currentEntities.filter((e) => e !== null),
					filter,
					targetIndex
				);

				if (matches.length === 0) {
					throw new Error(`No matching element found for filter: ${filter}`, 404);
				}

				for (const match of matches) {
					const updates = this.buildNestedUpdateWithMerge(match.element, attribute, value);
					await ctx.call(`v1.db.${dbField}.update`, {
						id: match.element.id,
						clientId,
						...updates
					});
				}
			}

			return { changedAttribute: arrayName };
		},

		/**
		 * Apply REMOVE operation on array
		 */
		async applyRemoveOperation(ctx, entityId, clientId, existing, arrayName, filter, attribute, targetIndex = null) {
			const dbField = JsonPatchQueryHelper.toSnakeCase(arrayName);
			const currentIds = existing[arrayName] || [];

			const currentEntities = await Promise.all(currentIds.map((id) => ctx.call(`v1.db.${dbField}.get`, { id, clientId }).catch(() => null)));

			const matches = JsonPatchQueryHelper.findMatchingElements(
				currentEntities.filter((e) => e !== null),
				filter,
				targetIndex
			);

			if (matches.length === 0) {
				throw new Error(`No matching element found for filter: ${filter}`, 404);
			}

			if (!attribute) {
				const idsToRemove = matches.map((m) => m.element.id);

				for (const idToRemove of idsToRemove) {
					await ctx.call(`v1.db.${dbField}.remove`, { id: idToRemove, clientId }).catch(() => {});
				}

				const updatedIds = currentIds.filter((id) => !idsToRemove.includes(id));
				await ctx.call("v1.db.shopping_cart.update", {
					id: entityId,
					clientId,
					[arrayName]: updatedIds
				});
			} else {
				for (const match of matches) {
					const updates = this.buildNestedUpdateWithMerge(match.element, attribute, null);
					await ctx.call(`v1.db.${dbField}.update`, {
						id: match.element.id,
						clientId,
						...updates
					});
				}
			}

			return { changedAttribute: arrayName };
		},

		/**
		 * Apply REPLACE operation on array
		 */
		async applyReplaceOperation(ctx, entityId, clientId, existing, arrayName, filter, attribute, value, targetIndex = null) {
			const dbField = JsonPatchQueryHelper.toSnakeCase(arrayName);
			const currentIds = existing[arrayName] || [];

			const currentEntities = await Promise.all(currentIds.map((id) => ctx.call(`v1.db.${dbField}.get`, { id, clientId }).catch(() => null)));

			const matches = JsonPatchQueryHelper.findMatchingElements(
				currentEntities.filter((e) => e !== null),
				filter,
				targetIndex
			);

			if (matches.length === 0) {
				throw new Error(`No matching element found for filter: ${filter}`, 404);
			}

			for (const match of matches) {
				if (!attribute) {
					await ctx.call(`v1.db.${dbField}.update`, {
						id: match.element.id,
						clientId,
						...value
					});
				} else {
					const updates = this.buildNestedUpdateWithMerge(match.element, attribute, value);
					await ctx.call(`v1.db.${dbField}.update`, {
						id: match.element.id,
						clientId,
						...updates
					});
				}
			}

			return { changedAttribute: arrayName };
		},

		/**
		 * Build nested update object with merge (TMF630 compliant)
		 */
		buildNestedUpdateWithMerge(existingEntity, path, value) {
			if (!path || !path.includes(".")) {
				return typeof value === "object" ? value : { [path]: value };
			}

			const parts = path.split(".");
			const topLevelKey = parts[0];

			const existingTopLevel = existingEntity[topLevelKey] || {};
			const merged = JSON.parse(JSON.stringify(existingTopLevel));

			let current = merged;
			for (let i = 1; i < parts.length - 1; i++) {
				if (!current[parts[i]]) {
					current[parts[i]] = {};
				}
				current = current[parts[i]];
			}

			const targetField = parts[parts.length - 1];
			if (value === null) {
				delete current[targetField];
			} else {
				current[targetField] = value;
			}

			return { [topLevelKey]: merged };
		}
	},

	started() {
		this.logger.info("TMF663 Shopping Cart service started");
	}
};
