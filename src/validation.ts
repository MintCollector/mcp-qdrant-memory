import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { 
  Entity, 
  Relation, 
  BatchMemoryWithRelationships,
  BatchCreateRelationshipsRequest,
  SearchFilters,
  HybridSearchRequest,
  EntityMetadata,
  RelationshipMetadata
} from "./types.js";

export interface CreateEntitiesRequest {
  entities: Entity[];
}

export interface CreateRelationsRequest {
  relations: Relation[];
}

export interface AddObservationsRequest {
  observations: Array<{
    entityName: string;
    contents: string[];
  }>;
}

export interface DeleteEntitiesRequest {
  entityNames: string[];
}

export interface DeleteObservationsRequest {
  deletions: Array<{
    entityName: string;
    observations: string[];
  }>;
}

export interface DeleteRelationsRequest {
  relations: Relation[];
}

export interface SearchSimilarRequest {
  query: string;
  limit?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isEntityMetadata(value: unknown): value is EntityMetadata {
  if (!isRecord(value)) return false;
  return (
    (value.id === undefined || typeof value.id === 'string') &&
    typeof value.created_at === 'string' &&
    (value.tags === undefined || isStringArray(value.tags)) &&
    (value.domain === undefined || typeof value.domain === 'string') &&
    (value.content === undefined || typeof value.content === 'string')
  );
}

function isRelationshipMetadata(value: unknown): value is RelationshipMetadata {
  if (!isRecord(value)) return false;
  return (
    (value.strength === undefined || (typeof value.strength === 'number' && value.strength >= 0 && value.strength <= 1)) &&
    typeof value.created_at === 'string' &&
    (value.context === undefined || typeof value.context === 'string') &&
    (value.evidence === undefined || isStringArray(value.evidence))
  );
}

function isEntity(value: unknown): value is Entity {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.entityType === 'string' &&
    Array.isArray(value.observations) &&
    value.observations.every(obs => typeof obs === 'string') &&
    (value.metadata === undefined || isEntityMetadata(value.metadata))
  );
}

function isRelation(value: unknown): value is Relation {
  if (!isRecord(value)) return false;
  return (
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.relationType === 'string' &&
    (value.metadata === undefined || isRelationshipMetadata(value.metadata))
  );
}

export function validateCreateEntitiesRequest(args: unknown): CreateEntitiesRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { entities } = args;
  if (!Array.isArray(entities) || !entities.every(isEntity)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid entities array");
  }

  return { entities };
}

export function validateCreateRelationsRequest(args: unknown): CreateRelationsRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { relations } = args;
  if (!Array.isArray(relations) || !relations.every(isRelation)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid relations array");
  }

  return { relations };
}

export function validateAddObservationsRequest(args: unknown): AddObservationsRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { observations } = args;
  if (!Array.isArray(observations)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid observations array");
  }

  for (const obs of observations) {
    if (!isRecord(obs) || typeof obs.entityName !== 'string' || !isStringArray(obs.contents)) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid observation format");
    }
  }

  return { observations: observations as AddObservationsRequest['observations'] };
}

export function validateDeleteEntitiesRequest(args: unknown): DeleteEntitiesRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { entityNames } = args;
  if (!isStringArray(entityNames)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid entityNames array");
  }

  return { entityNames };
}

export function validateDeleteObservationsRequest(args: unknown): DeleteObservationsRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { deletions } = args;
  if (!Array.isArray(deletions)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid deletions array");
  }

  for (const del of deletions) {
    if (!isRecord(del) || typeof del.entityName !== 'string' || !isStringArray(del.observations)) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid deletion format");
    }
  }

  return { deletions: deletions as DeleteObservationsRequest['deletions'] };
}

export function validateDeleteRelationsRequest(args: unknown): DeleteRelationsRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { relations } = args;
  if (!Array.isArray(relations) || !relations.every(isRelation)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid relations array");
  }

  return { relations };
}

export function validateSearchSimilarRequest(args: unknown): SearchSimilarRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { query, limit } = args;
  if (typeof query !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid query string");
  }

  if (limit !== undefined && (typeof limit !== 'number' || limit <= 0)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid limit value");
  }

  return { query, limit };
}

// New validation functions for meta-learning batch operations
export function validateSaveMemoriesWithRelationshipsRequest(args: unknown): BatchMemoryWithRelationships {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { memories, relationships } = args;
  
  if (!Array.isArray(memories) || !memories.every(isEntity)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid memories array");
  }

  if (!Array.isArray(relationships) || !relationships.every(isRelation)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid relationships array");
  }

  return { memories, relationships };
}

export function validateBatchCreateRelationshipsRequest(args: unknown): BatchCreateRelationshipsRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { relationships } = args;
  if (!Array.isArray(relationships)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid relationships array");
  }

  for (const rel of relationships) {
    if (!isRecord(rel) || 
        typeof rel.source_id !== 'string' || 
        typeof rel.target_id !== 'string' || 
        typeof rel.type !== 'string' ||
        (rel.metadata !== undefined && !isRelationshipMetadata(rel.metadata))) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid relationship format");
    }
  }

  return { relationships: relationships as BatchCreateRelationshipsRequest['relationships'] };
}

export function validateAnalyzeMemoryConnectionsRequest(args: unknown): { memory_id: string } {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { memory_id } = args;
  if (typeof memory_id !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid memory_id");
  }

  return { memory_id };
}

export function validateGetRelationshipsByTypeRequest(args: unknown): { relationship_type: string } {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { relationship_type } = args;
  if (typeof relationship_type !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid relationship_type");
  }

  return { relationship_type };
}

export function validateFindRelationshipChainsRequest(args: unknown): { start_memory_id: string; max_depth: number } {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { start_memory_id, max_depth } = args;
  if (typeof start_memory_id !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid start_memory_id");
  }

  if (typeof max_depth !== 'number' || max_depth <= 0 || max_depth > 10) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid max_depth (must be 1-10)");
  }

  return { start_memory_id, max_depth };
}

function isSearchFilters(value: unknown): value is SearchFilters {
  if (!isRecord(value)) return false;
  
  return (
    (value.entity_types === undefined || isStringArray(value.entity_types)) &&
    (value.date_range === undefined || (
      isRecord(value.date_range) &&
      typeof value.date_range.start === 'string' &&
      typeof value.date_range.end === 'string'
    )) &&
    (value.relationship_constraints === undefined || (
      Array.isArray(value.relationship_constraints) &&
      value.relationship_constraints.every(constraint => 
        isRecord(constraint) &&
        typeof constraint.type === 'string' &&
        (constraint.direction === undefined || 
         constraint.direction === 'inbound' || 
         constraint.direction === 'outbound' || 
         constraint.direction === 'both')
      )
    )) &&
    (value.domains === undefined || isStringArray(value.domains)) &&
    (value.tags === undefined || isStringArray(value.tags))
  );
}

export function validateSearchWithFiltersRequest(args: unknown): { query: string; filters?: SearchFilters; limit?: number } {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { query, filters, limit } = args;
  if (typeof query !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid query string");
  }

  if (filters !== undefined && !isSearchFilters(filters)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid filters format");
  }

  if (limit !== undefined && (typeof limit !== 'number' || limit <= 0)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid limit value");
  }

  return { query, filters, limit };
}

export function validateHybridSearchRequest(args: unknown): HybridSearchRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { query, relationship_paths, limit, filters } = args;
  if (typeof query !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid query string");
  }

  if (relationship_paths !== undefined && !isStringArray(relationship_paths)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid relationship_paths format");
  }

  if (limit !== undefined && (typeof limit !== 'number' || limit <= 0)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid limit value");
  }

  if (filters !== undefined && !isSearchFilters(filters)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid filters format");
  }

  return { query, relationship_paths, limit, filters };
}