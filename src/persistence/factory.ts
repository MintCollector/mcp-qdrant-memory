import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { Neo4jPersistence } from './neo4j.js';
import { QdrantPersistence } from './qdrant.js';
import { 
  PERSISTENCE_TYPE, 
  NEO4J_URI, 
  NEO4J_USER, 
  NEO4J_PASSWORD, 
  NEO4J_DATABASE 
} from '../config.js';
import { Entity, Relation, KnowledgeGraph } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE_PATH = path.join(__dirname, '../memory.json');

// Utility functions for automatic ID and timestamp management
function ensureEntityMetadata(entity: Entity): Entity {
  const now = new Date().toISOString();
  
  // Ensure metadata exists
  if (!entity.metadata) {
    entity.metadata = {
      created_at: now
    };
  }
  
  // Auto-generate ID if missing
  if (!entity.metadata.id) {
    entity.metadata.id = randomUUID();
  }
  
  // Set created_at if missing
  if (!entity.metadata.created_at) {
    entity.metadata.created_at = now;
  }
  
  // Always update updated_at
  entity.metadata.updated_at = now;
  
  return entity;
}

function ensureRelationMetadata(relation: Relation): Relation {
  const now = new Date().toISOString();
  
  // Ensure metadata exists
  if (!relation.metadata) {
    relation.metadata = {
      created_at: now
    };
  }
  
  // Auto-generate ID if missing
  if (!relation.metadata.id) {
    relation.metadata.id = randomUUID();
  }
  
  // Set created_at if missing
  if (!relation.metadata.created_at) {
    relation.metadata.created_at = now;
  }
  
  // Always update updated_at
  relation.metadata.updated_at = now;
  
  return relation;
}

export interface PersistenceInterface {
  initialize(): Promise<void>;
  addEntities(entities: Entity[]): Promise<void>;
  addRelations(relations: Relation[]): Promise<void>;
  addObservations(entityName: string, observations: string[]): Promise<void>;
  deleteEntities(entityNames: string[]): Promise<void>;
  deleteObservations(entityName: string, observations: string[]): Promise<void>;
  deleteRelations(relations: Relation[]): Promise<void>;
  getGraph(): Promise<KnowledgeGraph>;
  searchRelated(entityName: string, maxDepth?: number, relationshipTypes?: string[]): Promise<{
    entities: Entity[];
    relationships: Relation[];
    paths: Array<{
      path: string[];
      depth: number;
    }>;
  }>;
  close?(): Promise<void>;
}

export class JsonPersistence implements PersistenceInterface {
  private graph: KnowledgeGraph = { entities: [], relations: [] };

  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(MEMORY_FILE_PATH, 'utf-8');
      const parsedData = JSON.parse(data);
      this.graph = {
        entities: parsedData.entities.map((e: Entity) => ({
          ...e,
          observations: e.observations || []
        })),
        relations: parsedData.relations || []
      };
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.graph = { entities: [], relations: [] };
      } else {
        throw new Error(`Failed to initialize graph: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async save(): Promise<void> {
    await fs.writeFile(MEMORY_FILE_PATH, JSON.stringify(this.graph, null, 2));
  }

  async addEntities(entities: Entity[]): Promise<void> {
    for (const entity of entities) {
      const processedEntity = ensureEntityMetadata(entity);
      const existingIndex = this.graph.entities.findIndex((e: Entity) => e.name === entity.name);
      if (existingIndex !== -1) {
        this.graph.entities[existingIndex] = processedEntity;
      } else {
        this.graph.entities.push(processedEntity);
      }
    }
    await this.save();
  }

  async addRelations(relations: Relation[]): Promise<void> {
    for (const relation of relations) {
      if (!this.graph.entities.some(e => e.name === relation.from)) {
        throw new Error(`Entity not found: ${relation.from}`);
      }
      if (!this.graph.entities.some(e => e.name === relation.to)) {
        throw new Error(`Entity not found: ${relation.to}`);
      }
      const processedRelation = ensureRelationMetadata(relation);
      const existingIndex = this.graph.relations.findIndex(
        (r: Relation) => r.from === relation.from && r.to === relation.to && r.relationType === relation.relationType
      );
      if (existingIndex !== -1) {
        this.graph.relations[existingIndex] = processedRelation;
      } else {
        this.graph.relations.push(processedRelation);
      }
    }
    await this.save();
  }

  async addObservations(entityName: string, observations: string[]): Promise<void> {
    const entity = this.graph.entities.find((e: Entity) => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    entity.observations.push(...observations);
    // Update the entity metadata with new timestamp
    ensureEntityMetadata(entity);
    await this.save();
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    for (const name of entityNames) {
      const index = this.graph.entities.findIndex((e: Entity) => e.name === name);
      if (index !== -1) {
        this.graph.entities.splice(index, 1);
        this.graph.relations = this.graph.relations.filter(
          (r: Relation) => r.from !== name && r.to !== name
        );
      }
    }
    await this.save();
  }

  async deleteObservations(entityName: string, observations: string[]): Promise<void> {
    const entity = this.graph.entities.find((e: Entity) => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    entity.observations = entity.observations.filter((o: string) => !observations.includes(o));
    // Update the entity metadata with new timestamp
    ensureEntityMetadata(entity);
    await this.save();
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    for (const relation of relations) {
      const index = this.graph.relations.findIndex(
        (r: Relation) => r.from === relation.from && r.to === relation.to && r.relationType === relation.relationType
      );
      if (index !== -1) {
        this.graph.relations.splice(index, 1);
      }
    }
    await this.save();
  }

  async getGraph(): Promise<KnowledgeGraph> {
    return this.graph;
  }

  async searchRelated(entityName: string, maxDepth: number = 2, relationshipTypes?: string[]): Promise<{
    entities: Entity[];
    relationships: Relation[];
    paths: Array<{
      path: string[];
      depth: number;
    }>;
  }> {
    const startEntity = this.graph.entities.find(e => e.name === entityName);
    if (!startEntity) {
      throw new Error(`Entity not found: ${entityName}`);
    }

    const relatedEntities = new Set<string>();
    const relatedRelationships: Relation[] = [];
    const paths: Array<{ path: string[]; depth: number }> = [];
    const visited = new Set<string>();

    const traverse = (currentEntity: string, currentPath: string[], depth: number) => {
      if (depth > maxDepth || visited.has(currentEntity)) {
        return;
      }

      visited.add(currentEntity);
      relatedEntities.add(currentEntity);

      if (depth > 0) {
        paths.push({ path: [...currentPath], depth });
      }

      const entityRelations = this.graph.relations.filter(r => {
        const isConnected = r.from === currentEntity || r.to === currentEntity;
        const typeMatches = !relationshipTypes || relationshipTypes.includes(r.relationType);
        return isConnected && typeMatches;
      });

      for (const relation of entityRelations) {
        relatedRelationships.push(relation);
        const connectedEntity = relation.from === currentEntity ? relation.to : relation.from;
        
        if (depth < maxDepth && !visited.has(connectedEntity)) {
          traverse(connectedEntity, [...currentPath, connectedEntity], depth + 1);
        } else if (!relatedEntities.has(connectedEntity)) {
          relatedEntities.add(connectedEntity);
        }
      }
    };

    traverse(entityName, [entityName], 0);

    const entities = this.graph.entities.filter(e => relatedEntities.has(e.name));
    const uniqueRelationships = Array.from(
      new Map(relatedRelationships.map(r => [`${r.from}-${r.relationType}-${r.to}`, r])).values()
    );

    return {
      entities,
      relationships: uniqueRelationships,
      paths
    };
  }
}

export function createPersistence(): PersistenceInterface {
  if (PERSISTENCE_TYPE === "neo4j") {
    if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
      throw new Error("Neo4j configuration incomplete. Check NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD environment variables.");
    }
    
    return new Neo4jPersistence({
      uri: NEO4J_URI,
      user: NEO4J_USER,
      password: NEO4J_PASSWORD,
      database: NEO4J_DATABASE
    });
  } else {
    return new JsonPersistence();
  }
}

export class HybridPersistence implements PersistenceInterface {
  private persistence: PersistenceInterface;
  private qdrant: QdrantPersistence;

  constructor() {
    this.persistence = createPersistence();
    this.qdrant = new QdrantPersistence();
  }

  async initialize(): Promise<void> {
    await this.persistence.initialize();
    await this.qdrant.initialize();
  }

  async addEntities(entities: Entity[]): Promise<void> {
    // Ensure metadata is added before persistence
    const processedEntities = entities.map(ensureEntityMetadata);
    await this.persistence.addEntities(processedEntities);
    for (const entity of processedEntities) {
      await this.qdrant.persistEntity(entity);
    }
  }

  async addRelations(relations: Relation[]): Promise<void> {
    // Ensure metadata is added before persistence
    const processedRelations = relations.map(ensureRelationMetadata);
    await this.persistence.addRelations(processedRelations);
    for (const relation of processedRelations) {
      await this.qdrant.persistRelation(relation);
    }
  }

  async addObservations(entityName: string, observations: string[]): Promise<void> {
    await this.persistence.addObservations(entityName, observations);
    // Update Qdrant with the modified entity
    const graph = await this.persistence.getGraph();
    const entity = graph.entities.find(e => e.name === entityName);
    if (entity) {
      await this.qdrant.persistEntity(entity);
    }
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    await this.persistence.deleteEntities(entityNames);
    for (const name of entityNames) {
      await this.qdrant.deleteEntity(name);
    }
  }

  async deleteObservations(entityName: string, observations: string[]): Promise<void> {
    await this.persistence.deleteObservations(entityName, observations);
    // Update Qdrant with the modified entity
    const graph = await this.persistence.getGraph();
    const entity = graph.entities.find(e => e.name === entityName);
    if (entity) {
      await this.qdrant.persistEntity(entity);
    }
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    await this.persistence.deleteRelations(relations);
    for (const relation of relations) {
      await this.qdrant.deleteRelation(relation);
    }
  }

  async getGraph(): Promise<KnowledgeGraph> {
    return this.persistence.getGraph();
  }

  async searchRelated(entityName: string, maxDepth?: number, relationshipTypes?: string[]): Promise<{
    entities: Entity[];
    relationships: Relation[];
    paths: Array<{
      path: string[];
      depth: number;
    }>;
  }> {
    return this.persistence.searchRelated(entityName, maxDepth, relationshipTypes);
  }

  async searchSimilar(query: string, limit: number = 10): Promise<Array<Entity | Relation>> {
    return this.qdrant.searchSimilar(query, limit);
  }

  async close(): Promise<void> {
    if (this.persistence.close) {
      await this.persistence.close();
    }
  }
}