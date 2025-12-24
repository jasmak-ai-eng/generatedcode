"use strict";

/**
 * ============================================================================
 * TMF622 Product Order API Service - AI Generated Implementation
 * ============================================================================
 *
 * This file implements the TMF622 Product Ordering Management API
 * following the reference patterns from TMF632 Individual API Service.
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
 *    - Cascade operations: create, update, merge, delete
 *
 * 3. MULTI-TENANCY:
 *    - All entities are scoped by clientId (from ctx.meta.clientId)
 *
 * 4. NULL VALUE HANDLING:
 *    - Database stores "null" string instead of null (database constraint)
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
	name: "tmf622.productOrder",
	version: 1,

	settings: {
		defaultPageSize: 20,
		maxPageSize: 100,
		baseUrl: process.env.API_BASE_URL || "http://localhost:3000"
	},

	dependencies: [],

	actions: {
		/**
		 * LIST Action - Retrieve paginated list of ProductOrder entities
		 */
		list: {
			scope: ["productOrder.list"],
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

					const entities = await ctx.call("v1.db.product_order.find", {
						query,
						offset,
						limit,
						sort
					});

					const populated = await Promise.all(entities.map((entity) => this.populateProductOrder(ctx, entity)));

					const total = await ctx.call("v1.db.product_order.count", { query });

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
		 * CREATE Action - Create new ProductOrder entity
		 */
		create: {
			scope: ["productOrder.create"],
			rest: {
				method: "POST",
				path: "/create"
			},
			cache: false,
			params: {
				category: { type: "string", optional: true },
				description: { type: "string", optional: true },
				priority: { type: "string", optional: true },
				requestedCompletionDate: { type: "string", optional: true },
				requestedStartDate: { type: "string", optional: true },
				state: { type: "string", optional: true, default: "acknowledged" },
				requestedInitialState: { type: "string", optional: true, default: "acknowledged" },
				cancellationDate: { type: "string", optional: true },
				cancellationReason: { type: "string", optional: true },
				expectedCompletionDate: { type: "string", optional: true },
				completionDate: { type: "string", optional: true },
				notificationContact: { type: "string", optional: true },
				agreement: { type: "array", optional: true },
				billingAccount: { type: "object", optional: true },
				channel: { type: "array", optional: true },
				externalId: { type: "array", optional: true },
				note: { type: "array", optional: true },
				payment: { type: "array", optional: true },
				productOfferingQualification: { type: "array", optional: true },
				quote: { type: "array", optional: true },
				productOrderErrorMessage: { type: "array", optional: true },
				productOrderJeopardyAlert: { type: "array", optional: true },
				productOrderMilestone: { type: "array", optional: true },
				productOrderItem: { type: "array", optional: false },
				relatedParty: { type: "array", optional: true },
				"@type": { type: "string", optional: true, default: "ProductOrder" }
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

				Object.keys(entityData).forEach((key) => {
					if (entityData[key] === null) {
						entityData[key] = "null";
					}
				});

				const relatedEntities = {
					agreement: entityData.agreement,
					channel: entityData.channel,
					externalId: entityData.externalId,
					note: entityData.note,
					payment: entityData.payment,
					productOfferingQualification: entityData.productOfferingQualification,
					quote: entityData.quote,
					productOrderErrorMessage: entityData.productOrderErrorMessage,
					productOrderJeopardyAlert: entityData.productOrderJeopardyAlert,
					productOrderMilestone: entityData.productOrderMilestone,
					productOrderItem: entityData.productOrderItem,
					relatedParty: entityData.relatedParty
				};

				delete entityData.agreement;
				delete entityData.channel;
				delete entityData.externalId;
				delete entityData.note;
				delete entityData.payment;
				delete entityData.productOfferingQualification;
				delete entityData.quote;
				delete entityData.productOrderErrorMessage;
				delete entityData.productOrderJeopardyAlert;
				delete entityData.productOrderMilestone;
				delete entityData.productOrderItem;
				delete entityData.relatedParty;

				// Handle billingAccount as embedded object
				if (entityData.billingAccount) {
					entityData.billingAccount = JSON.stringify(entityData.billingAccount);
				}

				let created, entityId;

				try {
					created = await ctx.call("v1.db.product_order.create", entityData);
					entityId = created.id;

					created.href = `${this.settings.baseUrl}/api/v1/tmf622/productOrder/get/${entityId}`;
					await ctx.call("v1.db.product_order.update", {
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
						const duplicateError = new Error(`ProductOrder with these details already exists`);
						duplicateError.code = 409;
						duplicateError.type = "DUPLICATE_ENTITY_ERROR";
						duplicateError.data = {
							constraint: "unique",
							suggestion: "A ProductOrder with similar details already exists in the system"
						};
						throw duplicateError;
					}
					throw error;
				}

				try {
					for (const [relationType, relatedData] of Object.entries(relatedEntities)) {
						if (relatedData && relatedData.length > 0) {
							const ids = await this[`create${this.capitalize(relationType)}`](ctx, relatedData, entityId, clientId);
							created[relationType] = ids;
							await ctx.call("v1.db.product_order.update", {
								id: entityId,
								clientId,
								[relationType]: ids
							});
						}
					}

					const populated = await this.populateProductOrder(ctx, created);
					const schemaFiltered = this.mapToSchema(populated);
					const cleanedResponse = this.applyFinalCleanup(schemaFiltered);

					await ctx.call("v1.tmf622.event-publisher.publish", {
						eventType: "ProductOrderCreateEvent",
						event: {
							eventType: "ProductOrderCreateEvent",
							eventTime: new Date().toISOString(),
							event: { productOrder: cleanedResponse }
						}
					});

					return cleanedResponse;
				} catch (error) {
					await ctx.call("v1.db.product_order.remove", { id: entityId, clientId });
					throw error;
				}
			}
		},

		/**
		 * GET Action - Retrieve single ProductOrder by ID
		 */
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
			scope: ["productOrder.patch"],
			rest: {
				method: "PATCH",
				path: "/patch/:id"
			},
			cache: false,
			params: {
				id: { type: "string" },
				category: { type: "string", optional: true },
				description: { type: "string", optional: true },
				priority: { type: "string", optional: true },
				requestedCompletionDate: { type: "string", optional: true },
				requestedStartDate: { type: "string", optional: true },
				state: { type: "string", optional: true },
				cancellationDate: { type: "string", optional: true },
				cancellationReason: { type: "string", optional: true },
				expectedCompletionDate: { type: "string", optional: true },
				completionDate: { type: "string", optional: true },
				notificationContact: { type: "string", optional: true },
				agreement: { type: "array", optional: true },
				billingAccount: { type: "object", optional: true },
				channel: { type: "array", optional: true },
				externalId: { type: "array", optional: true },
				note: { type: "array", optional: true },
				payment: { type: "array", optional: true },
				productOfferingQualification: { type: "array", optional: true },
				quote: { type: "array", optional: true },
				productOrderErrorMessage: { type: "array", optional: true },
				productOrderJeopardyAlert: { type: "array", optional: true },
				productOrderMilestone: { type: "array", optional: true },
				productOrderItem: { type: "array", optional: true },
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
		 * REMOVE Action - Delete ProductOrder and all related entities
		 */
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
		/**
		 * Build search conditions for text search across multiple fields
		 */
		async buildSearchConditions(ctx, searchTerm, clientId) {
			if (!searchTerm || searchTerm.trim() === "") {
				return [];
			}

			const search = searchTerm.trim();
			const searchConditions = [];

			const nameFields = [
				"category",
				"description",
				"priority",
				"notificationContact"
			];

			nameFields.forEach((field) => {
				searchConditions.push({ [field]: { $iLike: `%${search}%` } });
			});

			return searchConditions;
		},

		/**
		 * Populate related entities
		 */
		async populateProductOrder(ctx, entity) {
			const populated = { ...entity };

			// Parse billingAccount if stored as JSON string
			if (populated.billingAccount && typeof populated.billingAccount === 'string') {
				try {
					populated.billingAccount = JSON.parse(populated.billingAccount);
				} catch (e) {
					// Keep as is if not valid JSON
				}
			}

			const relatedArrayFields = [
				"agreement",
				"channel",
				"externalId",
				"note",
				"payment",
				"productOfferingQualification",
				"quote",
				"productOrderErrorMessage",
				"productOrderJeopardyAlert",
				"productOrderMilestone",
				"productOrderItem",
				"relatedParty"
			];

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
		 * Recursively remove null values and internal fields
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
		 * Create related entities methods
		 */
		async createAgreement(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.agreement.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "AgreementRef"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createChannel(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.channel.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "RelatedChannel"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createExternalId(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.external_id.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "ExternalIdentifier"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createNote(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.note.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "Note"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createPayment(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.payment.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "PaymentRef"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createProductOfferingQualification(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.product_offering_qualification.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "ProductOfferingQualificationRef"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createQuote(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.quote.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "QuoteRef"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createProductOrderErrorMessage(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.product_order_error_message.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "ProductOrderErrorMessage"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createProductOrderJeopardyAlert(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.product_order_jeopardy_alert.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "ProductOrderJeopardyAlert"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createProductOrderMilestone(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = cuid();
				const created = await ctx.call("v1.db.product_order_milestone.create", {
					id,
					clientId,
					...entity,
					"@type": entity["@type"] || "ProductOrderMilestone"
				});
				ids.push(created.id);
			}
			return ids;
		},

		async createProductOrderItem(ctx, entities, parentId, clientId) {
			const ids = [];
			for (const entity of entities) {
				const id = entity.id || cuid();
				const created = await ctx.call("v1.db.product_order_item.create", {
					...entity,
					id,
					clientId,
					"@type": entity["@type"] || "ProductOrderItem"
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
					"@type": entity["@type"] || "RelatedPartyRefOrPartyRoleRef"
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
		 * Delete all related entities
		 */
		async deleteRelatedEntities(ctx, entity, clientId) {
			const relatedEntityTypes = [
				"agreement",
				"channel",
				"externalId",
				"note",
				"payment",
				"productOfferingQualification",
				"quote",
				"productOrderErrorMessage",
				"productOrderJeopardyAlert",
				"productOrderMilestone",
				"productOrderItem",
				"relatedParty"
			];

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
				"category",
				"description",
				"priority",
				"requestedCompletionDate",
				"requestedStartDate",
				"state",
				"requestedInitialState",
				"cancellationDate",
				"cancellationReason",
				"expectedCompletionDate",
				"completionDate",
				"creationDate",
				"notificationContact",
				"agreement",
				"billingAccount",
				"channel",
				"externalId",
				"note",
				"payment",
				"productOfferingQualification",
				"quote",
				"productOrderErrorMessage",
				"productOrderJeopardyAlert",
				"productOrderMilestone",
				"productOrderItem",
				"relatedParty",
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
		 * Validate required fields
		 */
		validateRequiredFields(data) {
			const requiredFields = ["productOrderItem"];
			const missingFields = requiredFields.filter((field) => !data[field] || (Array.isArray(data[field]) && data[field].length === 0));

			if (missingFields.length > 0) {
				throw new Error(`Missing required fields: ${missingFields.join(", ")}`, 400);
			}
		},

		/**
		 * Validate patchable fields
		 */
		validatePatchableFields(updates) {
			const nonPatchableFields = ["id", "href", "@type", "creationDate"];
			const invalidFields = Object.keys(updates).filter((field) => nonPatchableFields.includes(field));

			if (invalidFields.length > 0) {
				throw new Error(`Cannot update non-patchable fields: ${invalidFields.join(", ")}`, 400);
			}
		},

		/**
		 * Filter response fields
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
		 * Apply JSON Patch Query operations
		 */
		async applyJsonPatchQuery(ctx, id, clientId) {
			const operations = ctx.params;

			if (!Array.isArray(operations)) {
				throw new Error("JSON Patch Query request body must be an array of operations", 400);
			}

			JsonPatchQueryHelper.validateOperations(operations);

			const existing = await ctx.call("v1.db.product_order.get", { id, clientId });
			if (!existing) {
				throw new Error(`ProductOrder with id ${id} not found`, 404);
			}

			await this.checkOptimisticLocking(ctx, existing);

			const changedAttributes = new Set();
			let statusChanged = false;
			const oldStatus = existing.state;

			for (const operation of operations) {
				const result = await this.applyPatchOperation(ctx, id, clientId, existing, operation);
				if (result.changedAttribute) {
					changedAttributes.add(result.changedAttribute);
				}
				if (result.statusChanged) {
					statusChanged = true;
				}
			}

			await ctx.call("v1.db.product_order.update", {
				id,
				clientId,
				updatedAt: new Date().toISOString()
			});

			const updated = await ctx.call("v1.db.product_order.get", { id, clientId });
			const populated = await this.populateProductOrder(ctx, updated);
			const schemaFiltered = this.mapToSchema(populated);
			const cleanedResponse = this.applyFinalCleanup(schemaFiltered);

			const eventType = statusChanged && updated.state !== oldStatus ? "ProductOrderStateChangeEvent" : "ProductOrderAttributeValueChangeEvent";

			await ctx.call("v1.tmf622.event-publisher.publish", {
				eventType,
				event: {
					eventType,
					eventTime: new Date().toISOString(),
					event: {
						productOrder: cleanedResponse,
						changedAttributes: Array.from(changedAttributes)
					}
				}
			});

			return cleanedResponse;
		},

		/**
		 * Apply legacy merge strategy
		 */
		async applyMergeStrategy(ctx, id, clientId) {
			const { id: paramId, ...updates } = ctx.params;

			this.validatePatchableFields(updates);

			const existing = await ctx.call("v1.db.product_order.get", { id, clientId });
			if (!existing) {
				throw new Error(`ProductOrder with id ${id} not found`, 404);
			}

			await this.checkOptimisticLocking(ctx, existing);

			Object.keys(updates).forEach((key) => {
				if (updates[key] === null) {
					updates[key] = "null";
				}
			});

			// Handle billingAccount as embedded object
			if (updates.billingAccount) {
				updates.billingAccount = JSON.stringify(updates.billingAccount);
			}

			const changedAttributes = [];
			const relatedEntityTypes = [
				"agreement",
				"channel",
				"externalId",
				"note",
				"payment",
				"productOfferingQualification",
				"quote",
				"productOrderErrorMessage",
				"productOrderJeopardyAlert",
				"productOrderMilestone",
				"productOrderItem",
				"relatedParty"
			];

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

			const updated = await ctx.call("v1.db.product_order.update", {
				id,
				clientId,
				...updates,
				updatedAt: new Date().toISOString()
			});

			const populated = await this.populateProductOrder(ctx, updated);
			const schemaFiltered = this.mapToSchema(populated);
			const cleanedResponse = this.applyFinalCleanup(schemaFiltered);

			const eventType =
				updates.state && updates.state !== existing.state ? "ProductOrderStateChangeEvent" : "ProductOrderAttributeValueChangeEvent";

			await ctx.call("v1.tmf622.event-publisher.publish", {
				eventType,
				event: {
					eventType,
					eventTime: new Date().toISOString(),
					event: { productOrder: cleanedResponse, changedAttributes }
				}
			});

			return cleanedResponse;
		},

		/**
		 * Check optimistic locking
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
		 * Apply single patch operation
		 */
		async applyPatchOperation(ctx, entityId, clientId, existing, operation) {
			const { op, path, value } = operation;
			const pathInfo = JsonPatchQueryHelper.parsePath(path);

			if (pathInfo.isSimpleField) {
				return await this.applySimpleFieldOperation(ctx, entityId, clientId, operation);
			}

			const { arrayName, filter, attribute, isIndexBased, index } = pathInfo;
			const relatedEntityTypes = [
				"agreement",
				"channel",
				"externalId",
				"note",
				"payment",
				"productOfferingQualification",
				"quote",
				"productOrderErrorMessage",
				"productOrderJeopardyAlert",
				"productOrderMilestone",
				"productOrderItem",
				"relatedParty"
			];

			if (!relatedEntityTypes.includes(arrayName)) {
				throw new Error(
					`Invalid array field '${arrayName}'. Field does not exist in ProductOrder schema. Valid array fields are: ${relatedEntityTypes.join(", ")}`,
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
		 * Apply operation on simple field
		 */
		async applySimpleFieldOperation(ctx, entityId, clientId, operation) {
			const { op, path, value } = operation;
			const fieldName = path.replace(/^\$\./, "").replace(/^\//, "");

			const validSimpleFields = [
				"category",
				"description",
				"priority",
				"requestedCompletionDate",
				"requestedStartDate",
				"state",
				"cancellationDate",
				"cancellationReason",
				"expectedCompletionDate",
				"completionDate",
				"notificationContact"
			];

			if (!validSimpleFields.includes(fieldName)) {
				throw new Error(
					`Invalid field '${fieldName}'. Field does not exist in ProductOrder schema. Valid fields are: ${validSimpleFields.join(", ")}`,
					400
				);
			}

			const updates = {};
			let statusChanged = false;

			if (op === "replace" || op === "add") {
				updates[fieldName] = value;
				if (fieldName === "state") {
					statusChanged = true;
				}
			} else if (op === "remove") {
				updates[fieldName] = null;
			}

			await ctx.call("v1.db.product_order.update", {
				id: entityId,
				clientId,
				...updates
			});

			return { changedAttribute: fieldName, statusChanged };
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
				await ctx.call("v1.db.product_order.update", {
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

			return { changedAttribute: arrayName, statusChanged: false };
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
				await ctx.call("v1.db.product_order.update", {
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

			return { changedAttribute: arrayName, statusChanged: false };
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

			return { changedAttribute: arrayName, statusChanged: false };
		},

		/**
		 * Validate nested field
		 */
		isValidNestedField(objectType, fieldName) {
			const nestedSchemas = {
				partyOrPartyRole: ['id', 'href', 'name', 'role', '@type', '@referredType', '@baseType', '@schemaLocation'],
				channel: ['id', 'href', 'name', 'role', '@type', '@referredType', '@baseType', '@schemaLocation'],
				productOffering: ['id', 'href', 'name', 'version', '@type', '@referredType', '@baseType', '@schemaLocation'],
				product: ['id', 'href', 'name', '@type', '@referredType', '@baseType', '@schemaLocation'],
				billingAccount: ['id', 'href', 'name', '@type', '@referredType', '@baseType', '@schemaLocation']
			};

			const allowedFields = nestedSchemas[objectType] || [];
			return allowedFields.includes(fieldName);
		},

		/**
		 * Check if field is patchable
		 */
		isFieldPatchable(objectType, fieldName) {
			const nonPatchableFields = {
				partyOrPartyRole: ['id', 'href', '@type', '@referredType', '@baseType', '@schemaLocation'],
				channel: ['id', 'href', '@type', '@referredType', '@baseType', '@schemaLocation'],
				productOffering: ['id', 'href', '@type', '@referredType', '@baseType', '@schemaLocation'],
				product: ['id', 'href', '@type', '@referredType', '@baseType', '@schemaLocation'],
				billingAccount: ['id', 'href', '@type', '@referredType', '@baseType', '@schemaLocation'],
				agreement: ['id', 'href', '@type', '@baseType', '@schemaLocation'],
				note: ['id', '@type', '@baseType', '@schemaLocation'],
				externalId: ['id', '@type', '@baseType', '@schemaLocation'],
				payment: ['id', 'href', '@type', '@baseType', '@schemaLocation'],
				productOrderItem: ['id', '@type', '@baseType', '@schemaLocation'],
				relatedParty: ['id', 'href', '@type', '@referredType', '@baseType', '@schemaLocation']
			};

			const nonPatchable = nonPatchableFields[objectType] || ['id', 'href', '@type', '@baseType', '@schemaLocation'];
			return !nonPatchable.includes(fieldName);
		},

		/**
		 * Build nested update with merge
		 */
		buildNestedUpdateWithMerge(existingEntity, path, value) {
			if (!path || !path.includes('.')) {
				return typeof value === "object" ? value : { [path]: value };
			}

			const parts = path.split('.');
			const topLevelKey = parts[0];
			const targetField = parts[parts.length - 1];

			if (!this.isValidNestedField(topLevelKey, targetField)) {
				const error = new Error(`Invalid field '${targetField}' for '${topLevelKey}'. This field does not exist in the schema.`);
				error.code = 400;
				error.type = 'INVALID_FIELD_ERROR';
				throw error;
			}

			if (!this.isFieldPatchable(topLevelKey, targetField)) {
				const error = new Error(`Cannot update non-patchable field '${targetField}' in '${topLevelKey}'. This field is read-only.`);
				error.code = 400;
				error.type = 'NON_PATCHABLE_FIELD_ERROR';
				throw error;
			}

			const existingTopLevel = existingEntity[topLevelKey] || {};
			const merged = JSON.parse(JSON.stringify(existingTopLevel));

			let current = merged;
			for (let i = 1; i < parts.length - 1; i++) {
				if (!current[parts[i]]) {
					current[parts[i]] = {};
				}
				current = current[parts[i]];
			}

			if (value === null) {
				delete current[targetField];
			} else {
				current[targetField] = value;
			}

			return { [topLevelKey]: merged };
		}
	},

	started() {
		this.logger.info("ProductOrder service started");
	}
};
