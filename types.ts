export interface Entity extends Record<string, unknown> {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation extends Record<string, unknown> {
  from: string;
  to: string;
  relationType: string;
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