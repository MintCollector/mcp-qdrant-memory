// Meta-learning entity types
export type MetaLearningEntityType = 
  | 'meta_learning' 
  | 'principle' 
  | 'validation' 
  | 'failure_mode' 
  | 'general';

// Meta-learning relationship types
export type MetaLearningRelationType = 
  | 'validates' 
  | 'contradicts' 
  | 'builds_upon' 
  | 'connects_to'
  | 'implements'  // Added for principle → implementation relationships
  | 'derives_from'; // Added for principle derivation chains

export interface EntityMetadata {
  id?: string;
  created_at: string;
  tags?: string[];
  domain?: string;
  content?: string; // For storing exact raw content separately from observations
}

export interface RelationshipMetadata {
  strength?: number; // 0.0-1.0 confidence/importance score
  created_at: string;
  context?: string; // Additional context about the relationship
  evidence?: string[]; // Supporting evidence for the relationship
}

export interface Entity extends Record<string, unknown> {
  name: string;
  entityType: MetaLearningEntityType | string; // Allow custom types while supporting meta-learning
  observations: string[];
  metadata?: EntityMetadata;
}

export interface Relation extends Record<string, unknown> {
  from: string;
  to: string;
  relationType: MetaLearningRelationType | string; // Allow custom types while supporting meta-learning
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
