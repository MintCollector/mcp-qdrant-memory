// Entity types (9 core types)
export const ENTITY_TYPES = [
               'person',       // People, individuals, characters, historical figures
               'organization', // Companies, institutions, groups, teams
               'location',     // Places, geographical entities, venues, virtual spaces
               'event',        // Temporal interactions, events, meetings, milestones
               'concept',      // Abstract ideas, theories, principles, mental models
               'workflow',     // Methods, procedures, workflows, algorithms, processes
               'object',       // Documents, products, tools, resources, assets, financial instruments
               'task',         // Objectives, projects, assignments
               'preferences'   // User choices, configurations, behavioral patterns
             ] as const;

export type EntityType = typeof ENTITY_TYPES[number];

// Relationship types
export type RelationType = 
  | 'relates_to'    // General relationship
  | 'part_of'       // Hierarchical relationship
  | 'creates'       // Creation relationship
  | 'uses'          // Usage relationship
  | 'influences'    // Influence relationship
  | 'depends_on'    // Dependency relationship
  | 'similar_to'    // Similarity relationship
  | 'opposite_of';  // Opposition relationship

// Meta-learning types
export type LearningType = 'failure' | 'success' | 'optimization' | 'insight';
export type ImpactLevel = 'low' | 'medium' | 'high' | 'transformative';
export type ApplicationOutcome = 'successful' | 'failed' | 'partially_successful';

// Store meta-learning request interface
export interface StoreMetaLearningRequest {
  principle: string;
  learning_type: LearningType;
  trigger_situation: string;
  observed_behavior: string;
  recommended_behavior: string;
  specific_example: string;
  tags: string[];
  domain?: string;
  impact?: ImpactLevel;
  project_context?: string;
  prevention_pattern?: string;
  success_metric?: string;
  is_general?: boolean;
}

// Track meta-learning application request interface
export interface TrackMetaLearningApplicationRequest {
  principle_name: string;
  application_context: string;
  outcome: ApplicationOutcome;
  details: string;
  lessons_learned?: string;
}
export interface EntityMetadata {
  id?: string;
  created_at: string;
  updated_at?: string;
  tags?: string[];
  domain?: string;
  content?: string; // For storing exact raw content separately from observations
}

// Input metadata interfaces (without auto-generated fields)
export interface EntityMetadataInput {
  tags?: string[];
  domain?: string;
  content?: string;
}

export interface RelationshipMetadataInput {
  strength?: number;
  context?: string;
  evidence?: string[];
}
export interface RelationshipMetadata {
  id?: string;
  strength?: number; // 0.0-1.0 confidence/importance score
  created_at: string;
  updated_at?: string;
  context?: string; // Additional context about the relationship
  evidence?: string[]; // Supporting evidence for the relationship
}

export interface Entity extends Record<string, unknown> {
  name: string;
  entityType: string | string[]; // Single type for backward compatibility, or array for multiple types
  observations: string[];
  metadata?: EntityMetadata;
}

export interface Relation extends Record<string, unknown> {
  from: string;
  to: string;
  relationType: RelationType | string; // Allow custom types while supporting standard types
  metadata?: RelationshipMetadata;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export interface SearchResult {
  type: 'entity' | 'relation';
  score: number;
  data: Entity | Relation;
}

export interface SearchFilters {
  entity_types?: string[];
  domains?: string[];
  tags?: string[];
  date_range?: {
    start: string;
    end: string;
  };
}