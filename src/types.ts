// Entity types (8 core types)
export const ENTITY_TYPES = [
  'person',      // People, individuals, characters
  'concept',     // Abstract ideas, theories, principles
  'event',       // Historical events, occurrences, incidents
  'location',    // Places, geographical entities
  'organization', // Companies, institutions, groups
  'document',    // Books, papers, articles, records
  'technology',  // Tools, systems, platforms, software
  'process'      // Methods, procedures, workflows
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

export interface EntityMetadata {
  id?: string;
  created_at: string;
  updated_at?: string;
  tags?: string[];
  domain?: string;
  content?: string; // For storing exact raw content separately from observations
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
