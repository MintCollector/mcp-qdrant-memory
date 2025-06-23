import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { 
  Entity, 
  Relation, 

  EntityMetadata,
  RelationshipMetadata
} from "./types.js";

export interface CreateEntitiesRequest {
  entities: Entity[];
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

// For user input validation - only user-provided fields, no auto-generated fields
function isEntityMetadataInput(value: unknown): boolean {
  if (!isRecord(value)) return false;
  
  // Only validate user-provided fields
  // Auto-generated fields (id, created_at, updated_at) are NOT part of the input
  return (
    (value.tags === undefined || isStringArray(value.tags)) &&
    (value.domain === undefined || typeof value.domain === 'string') &&
    (value.content === undefined || typeof value.content === 'string')
  );
}

// For user input validation - only user-provided fields, no auto-generated fields
function isRelationshipMetadataInput(value: unknown): boolean {
  if (!isRecord(value)) return false;
  
  // Only validate user-provided fields
  // Auto-generated fields (id, created_at, updated_at) are NOT part of the input
  return (
    (value.strength === undefined || (typeof value.strength === 'number' && value.strength >= 0 && value.strength <= 1)) &&
    (value.context === undefined || typeof value.context === 'string') &&
    (value.evidence === undefined || isStringArray(value.evidence))
  );
}

function isEntity(value: unknown): value is Entity {
  if (!isRecord(value)) return false;
  
  // Check entityType is either string or string array
  const isValidEntityType = (
    typeof value.entityType === 'string' ||
    (Array.isArray(value.entityType) && 
     value.entityType.length > 0 &&
     value.entityType.every(type => typeof type === 'string'))
  );
  
  return (
    typeof value.name === 'string' &&
    isValidEntityType &&
    Array.isArray(value.observations) &&
    value.observations.every(obs => typeof obs === 'string') &&
    (value.metadata === undefined || isEntityMetadataInput(value.metadata))
  );
}

function isRelation(value: unknown): value is Relation {
  if (!isRecord(value)) return false;
  return (
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.relationType === 'string' &&
    (value.metadata === undefined || isRelationshipMetadataInput(value.metadata))
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



export function validateCreateRelationshipsRequest(args: unknown): { relationships: Relation[] } {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { relationships } = args;
  if (!Array.isArray(relationships) || !relationships.every(isRelation)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid relationships array");
  }

  return { relationships };
}

export function validateDeleteRelationshipsRequest(args: unknown): { relationships: Relation[] } {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { relationships } = args;
  if (!Array.isArray(relationships) || !relationships.every(isRelation)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid relationships array");
  }

  return { relationships };
}

export function validateSearchRelatedRequest(args: unknown): { 
  entityName: string; 
  maxDepth?: number; 
  relationshipTypes?: string[] 
} {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { entityName, maxDepth, relationshipTypes } = args;
  
  if (typeof entityName !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid entityName");
  }

  if (maxDepth !== undefined && (typeof maxDepth !== 'number' || maxDepth < 1 || maxDepth > 5)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid maxDepth (must be 1-5)");
  }

  if (relationshipTypes !== undefined && !isStringArray(relationshipTypes)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid relationshipTypes format");
  }

  return { entityName, maxDepth, relationshipTypes };
}

export function validateSemanticSearchRequest(args: unknown): SearchSimilarRequest {
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

export function validateStoreMetaLearningRequest(args: unknown): import('./types.js').StoreMetaLearningRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { 
    principle, 
    learning_type, 
    trigger_situation, 
    observed_behavior, 
    recommended_behavior, 
    specific_example, 
    tags,
    domain,
    impact,
    project_context,
    prevention_pattern,
    success_metric
  } = args;

  // Validate required fields
  if (typeof principle !== 'string' || principle.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid principle");
  }

  const validLearningTypes = ['failure', 'success', 'optimization', 'insight'];
  if (typeof learning_type !== 'string' || !validLearningTypes.includes(learning_type)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid learning_type (must be: failure, success, optimization, insight)");
  }

  if (typeof trigger_situation !== 'string' || trigger_situation.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid trigger_situation");
  }

  if (typeof observed_behavior !== 'string' || observed_behavior.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid observed_behavior");
  }

  if (typeof recommended_behavior !== 'string' || recommended_behavior.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid recommended_behavior");
  }

  if (typeof specific_example !== 'string' || specific_example.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid specific_example");
  }

  if (!isStringArray(tags) || tags.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid tags array");
  }

  // Validate optional fields
  if (domain !== undefined && typeof domain !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Invalid domain (must be string)");
  }

  const validImpactLevels = ['low', 'medium', 'high', 'transformative'];
  if (impact !== undefined && (typeof impact !== 'string' || !validImpactLevels.includes(impact))) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid impact (must be: low, medium, high, transformative)");
  }

  if (project_context !== undefined && typeof project_context !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Invalid project_context (must be string)");
  }

  if (prevention_pattern !== undefined && typeof prevention_pattern !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Invalid prevention_pattern (must be string)");
  }

  if (success_metric !== undefined && typeof success_metric !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Invalid success_metric (must be string)");
  }

  return {
    principle: principle.trim(),
    learning_type: learning_type as import('./types.js').LearningType,
    trigger_situation: trigger_situation.trim(),
    observed_behavior: observed_behavior.trim(),
    recommended_behavior: recommended_behavior.trim(),
    specific_example: specific_example.trim(),
    tags: tags.map(tag => tag.trim()).filter(tag => tag.length > 0),
    domain: domain?.trim(),
    impact: impact as import('./types.js').ImpactLevel | undefined,
    project_context: project_context?.trim(),
    prevention_pattern: prevention_pattern?.trim(),
    success_metric: success_metric?.trim()
  };
}

export function validateTrackMetaLearningApplicationRequest(args: unknown): import('./types.js').TrackMetaLearningApplicationRequest {
  if (!isRecord(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid request format");
  }

  const { 
    principle_name, 
    application_context, 
    outcome, 
    details,
    lessons_learned
  } = args;

  // Validate required fields
  if (typeof principle_name !== 'string' || principle_name.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid principle_name");
  }

  if (typeof application_context !== 'string' || application_context.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid application_context");
  }

  const validOutcomes = ['successful', 'failed', 'partially_successful'];
  if (typeof outcome !== 'string' || !validOutcomes.includes(outcome)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid outcome (must be: successful, failed, partially_successful)");
  }

  if (typeof details !== 'string' || details.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Missing or invalid details");
  }

  // Validate optional fields
  if (lessons_learned !== undefined && typeof lessons_learned !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, "Invalid lessons_learned (must be string)");
  }

  return {
    principle_name: principle_name.trim(),
    application_context: application_context.trim(),
    outcome: outcome as import('./types.js').ApplicationOutcome,
    details: details.trim(),
    lessons_learned: lessons_learned?.trim()
  };
}
