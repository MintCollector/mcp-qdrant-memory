import neo4j, { Driver, Session, ManagedTransaction } from 'neo4j-driver';
import { randomUUID } from 'crypto';
import { Entity, Relation, KnowledgeGraph } from '../types.js';

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database?: string;
}

// Utility functions for automatic ID and timestamp management
function ensureEntityMetadata(entity: Entity): Entity {
  const now = new Date().toISOString();
  
  if (!entity.metadata) {
    entity.metadata = {
      created_at: now
    };
  }
  
  if (!entity.metadata.id) {
    entity.metadata.id = randomUUID();
  }
  
  if (!entity.metadata.created_at) {
    entity.metadata.created_at = now;
  }
  
  entity.metadata.updated_at = now;
  
  return entity;
}

function ensureRelationMetadata(relation: Relation): Relation {
  const now = new Date().toISOString();
  
  if (!relation.metadata) {
    relation.metadata = {
      created_at: now
    };
  }
  
  if (!relation.metadata.id) {
    relation.metadata.id = randomUUID();
  }
  
  if (!relation.metadata.created_at) {
    relation.metadata.created_at = now;
  }
  
  relation.metadata.updated_at = now;
  
  return relation;
}

export class Neo4jPersistence {
  private driver: Driver | null = null;
  private database: string;

  constructor(config: Neo4jConfig) {
    this.database = config.database || 'neo4j';
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
      {
        disableLosslessIntegers: true,
        connectionTimeout: 10000,
        maxConnectionLifetime: 30000,
        maxConnectionPoolSize: 50
      }
    );
  }

  async initialize(): Promise<void> {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized');
    }

    // Test connection
    await this.driver.verifyConnectivity();

    // Create constraints and indexes
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(`
        CREATE CONSTRAINT entity_name_unique IF NOT EXISTS
        FOR (e:Entity) REQUIRE e.name IS UNIQUE
      `);
      
      await session.run(`
        CREATE INDEX entity_type_index IF NOT EXISTS
        FOR (e:Entity) ON (e.entityType)
      `);
      
      await session.run(`
        CREATE INDEX relation_type_index IF NOT EXISTS
        FOR ()-[r:RELATES_TO]-() ON (r.relationType)
      `);
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  async addEntities(entities: Entity[]): Promise<void> {
    const session = this.driver!.session({ database: this.database });
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        for (const entity of entities) {
          const processedEntity = ensureEntityMetadata(entity);
          
          // Handle multiple entity types using Neo4j multi-label syntax
          const entityTypes = Array.isArray(processedEntity.entityType) 
            ? processedEntity.entityType 
            : [processedEntity.entityType];
          
          // Build labels for Neo4j - use ampersand syntax for multiple labels
          const additionalLabels = entityTypes.map(type => `:${type}`).join('');
          
          // Create/update entity with multiple labels using dynamic Cypher
          const query = `
            MERGE (e:Entity${additionalLabels} {name: $name})
            SET e.entityTypes = $entityTypes,
                e.observations = $observations,
                e.metadata = $metadata,
                e.created_at = CASE WHEN e.created_at IS NULL THEN datetime() ELSE e.created_at END,
                e.updated_at = datetime()
          `;
          
          await tx.run(query, {
            name: processedEntity.name,
            entityTypes: entityTypes,
            observations: processedEntity.observations,
            metadata: JSON.stringify(processedEntity.metadata || {})
          });
        }
      });
    } finally {
      await session.close();
    }
  }

  async addRelations(relations: Relation[]): Promise<void> {
    const session = this.driver!.session({ database: this.database });
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        for (const relation of relations) {
          // Check if entities exist
          const fromExists = await tx.run(`
            MATCH (e:Entity {name: $name}) RETURN e
          `, { name: relation.from });
          
          const toExists = await tx.run(`
            MATCH (e:Entity {name: $name}) RETURN e
          `, { name: relation.to });

          if (fromExists.records.length === 0) {
            throw new Error(`Entity not found: ${relation.from}`);
          }
          if (toExists.records.length === 0) {
            throw new Error(`Entity not found: ${relation.to}`);
          }

          // Create or update relationship
          const processedRelation = ensureRelationMetadata(relation);
          await tx.run(`
            MATCH (from:Entity {name: $fromName})
            MATCH (to:Entity {name: $toName})
            MERGE (from)-[r:RELATES_TO {relationType: $relationType}]->(to)
            SET r.metadata = $metadata,
                r.created_at = CASE WHEN r.created_at IS NULL THEN datetime() ELSE r.created_at END,
                r.updated_at = datetime()
          `, {
            fromName: processedRelation.from,
            toName: processedRelation.to,
            relationType: processedRelation.relationType,
            metadata: JSON.stringify(processedRelation.metadata || {})
          });
        }
      });
    } finally {
      await session.close();
    }
  }

  async addObservations(entityName: string, observations: string[]): Promise<void> {
    const session = this.driver!.session({ database: this.database });
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        const result = await tx.run(`
          MATCH (e:Entity {name: $name})
          RETURN e.observations as currentObservations
        `, { name: entityName });

        if (result.records.length === 0) {
          throw new Error(`Entity not found: ${entityName}`);
        }

        const currentObservations = result.records[0].get('currentObservations') || [];
        const updatedObservations = [...currentObservations, ...observations];

        await tx.run(`
          MATCH (e:Entity {name: $name})
          SET e.observations = $observations,
              e.updated_at = datetime()
        `, {
          name: entityName,
          observations: updatedObservations
        });
      });
    } finally {
      await session.close();
    }
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const session = this.driver!.session({ database: this.database });
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        for (const name of entityNames) {
          await tx.run(`
            MATCH (e:Entity {name: $name})
            DETACH DELETE e
          `, { name });
        }
      });
    } finally {
      await session.close();
    }
  }

  async deleteObservations(entityName: string, observations: string[]): Promise<void> {
    const session = this.driver!.session({ database: this.database });
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        const result = await tx.run(`
          MATCH (e:Entity {name: $name})
          RETURN e.observations as currentObservations
        `, { name: entityName });

        if (result.records.length === 0) {
          throw new Error(`Entity not found: ${entityName}`);
        }

        const currentObservations = result.records[0].get('currentObservations') || [];
        const updatedObservations = currentObservations.filter((obs: string) => !observations.includes(obs));

        await tx.run(`
          MATCH (e:Entity {name: $name})
          SET e.observations = $observations,
              e.updated_at = datetime()
        `, {
          name: entityName,
          observations: updatedObservations
        });
      });
    } finally {
      await session.close();
    }
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const session = this.driver!.session({ database: this.database });
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        for (const relation of relations) {
          await tx.run(`
            MATCH (from:Entity {name: $fromName})-[r:RELATES_TO {relationType: $relationType}]->(to:Entity {name: $toName})
            DELETE r
          `, {
            fromName: relation.from,
            toName: relation.to,
            relationType: relation.relationType
          });
        }
      });
    } finally {
      await session.close();
    }
  }

  async getGraph(): Promise<KnowledgeGraph> {
    const session = this.driver!.session({ database: this.database });
    try {
      // Get all entities
      const entitiesResult = await session.run(`
        MATCH (e:Entity)
        RETURN e.name as name,
               e.entityTypes as entityTypes,
               e.observations as observations,
               e.metadata as metadata
      `);

      const entities: Entity[] = entitiesResult.records.map(record => {
        const entityTypes = record.get('entityTypes') || [];
        const metadataStr = record.get('metadata');
        let metadata: any;
        
        try {
          const parsed = metadataStr ? JSON.parse(metadataStr) : {};
          metadata = {
            created_at: new Date().toISOString(),
            ...parsed
          };
        } catch (e) {
          console.error('Failed to parse metadata JSON:', e);
          metadata = {
            created_at: new Date().toISOString()
          };
        }
        
        return {
          name: record.get('name'),
          entityType: entityTypes.length === 1 ? entityTypes[0] : entityTypes,
          observations: record.get('observations') || [],
          metadata
        };
      });

      // Get all relationships
      const relationsResult = await session.run(`
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        RETURN from.name as fromName,
               to.name as toName,
               r.relationType as relationType,
               r.metadata as metadata
      `);

      const relations: Relation[] = relationsResult.records.map(record => {
        const metadataStr = record.get('metadata');
        let metadata: any;
        
        try {
          const parsed = metadataStr ? JSON.parse(metadataStr) : {};
          metadata = {
            created_at: new Date().toISOString(),
            ...parsed
          };
        } catch (e) {
          console.error('Failed to parse relation metadata JSON:', e);
          metadata = {
            created_at: new Date().toISOString()
          };
        }
        
        return {
          from: record.get('fromName'),
          to: record.get('toName'),
          relationType: record.get('relationType'),
          metadata
        };
      });

      return { entities, relations };
    } finally {
      await session.close();
    }
  }

  async searchRelated(entityName: string, maxDepth: number = 2, relationshipTypes?: string[]): Promise<{
    entities: Entity[];
    relationships: Relation[];
    paths: Array<{
      path: string[];
      depth: number;
    }>;
  }> {
    const session = this.driver!.session({ database: this.database });
    try {
      // Build the Cypher query with optional relationship type filtering
      let relationshipFilter = '';
      if (relationshipTypes && relationshipTypes.length > 0) {
        relationshipFilter = `WHERE r.relationType IN $relationshipTypes`;
      }

      const query = `
        MATCH path = (start:Entity {name: $entityName})-[r:RELATES_TO*1..${maxDepth}]-(connected:Entity)
        ${relationshipFilter}
        RETURN path,
               nodes(path) as pathNodes,
               relationships(path) as pathRelationships,
               length(path) as depth
        ORDER BY depth
      `;

      const result = await session.run(query, {
        entityName,
        relationshipTypes: relationshipTypes || []
      });

      const entitiesSet = new Set<string>();
      const relationshipsMap = new Map<string, Relation>();
      const paths: Array<{ path: string[]; depth: number }> = [];

      // Process results
      for (const record of result.records) {
        const pathNodes = record.get('pathNodes');
        const pathRelationships = record.get('pathRelationships');
        const depth = record.get('depth');

        // Extract path
        const pathNames = pathNodes.map((node: any) => node.properties.name);
        paths.push({ path: pathNames, depth });

        // Collect entities
        pathNodes.forEach((node: any) => {
          entitiesSet.add(node.properties.name);
        });

        // Collect relationships
        pathRelationships.forEach((rel: any, index: number) => {
          const fromNode = pathNodes[index];
          const toNode = pathNodes[index + 1];
          const key = `${fromNode.properties.name}-${rel.properties.relationType}-${toNode.properties.name}`;
          
          relationshipsMap.set(key, {
            from: fromNode.properties.name,
            to: toNode.properties.name,
            relationType: rel.properties.relationType,
            metadata: rel.properties.metadata || {}
          });
        });
      }

      // Get full entity details
      const entityNames = Array.from(entitiesSet);
      const entitiesResult = await session.run(`
        MATCH (e:Entity)
        WHERE e.name IN $names
        RETURN e.name as name,
               e.entityType as entityType,
               e.observations as observations,
               e.metadata as metadata
      `, { names: entityNames });

      const entities: Entity[] = entitiesResult.records.map(record => ({
        name: record.get('name'),
        entityType: record.get('entityType'),
        observations: record.get('observations') || [],
        metadata: record.get('metadata') || {}
      }));

      const relationships = Array.from(relationshipsMap.values());

      return { entities, relationships, paths };
    } finally {
      await session.close();
    }
  }

  // Advanced Neo4j-specific query methods
  async executeCustomQuery(cypher: string, parameters: Record<string, any> = {}): Promise<any[]> {
    const session = this.driver!.session({ database: this.database });
    try {
      const result = await session.run(cypher, parameters);
      return result.records.map(record => record.toObject());
    } finally {
      await session.close();
    }
  }

  async getShortestPath(fromEntity: string, toEntity: string, relationshipTypes?: string[]): Promise<{
    path: string[];
    relationships: Relation[];
    length: number;
  } | null> {
    const session = this.driver!.session({ database: this.database });
    try {
      let relationshipFilter = '';
      if (relationshipTypes && relationshipTypes.length > 0) {
        relationshipFilter = `WHERE ALL(r IN relationships(path) WHERE r.relationType IN $relationshipTypes)`;
      }

      const query = `
        MATCH (from:Entity {name: $fromEntity}), (to:Entity {name: $toEntity})
        MATCH path = shortestPath((from)-[r:RELATES_TO*]-(to))
        ${relationshipFilter}
        RETURN path,
               nodes(path) as pathNodes,
               relationships(path) as pathRelationships,
               length(path) as pathLength
        LIMIT 1
      `;

      const result = await session.run(query, {
        fromEntity,
        toEntity,
        relationshipTypes: relationshipTypes || []
      });

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      const pathNodes = record.get('pathNodes');
      const pathRelationships = record.get('pathRelationships');
      const pathLength = record.get('pathLength');

      const path = pathNodes.map((node: any) => node.properties.name);
      const relationships: Relation[] = pathRelationships.map((rel: any, index: number) => ({
        from: pathNodes[index].properties.name,
        to: pathNodes[index + 1].properties.name,
        relationType: rel.properties.relationType,
        metadata: rel.properties.metadata || {}
      }));

      return { path, relationships, length: pathLength };
    } finally {
      await session.close();
    }
  }

  async getEntityDegree(entityName: string): Promise<{ inDegree: number; outDegree: number; totalDegree: number }> {
    const session = this.driver!.session({ database: this.database });
    try {
      const result = await session.run(`
        MATCH (e:Entity {name: $entityName})
        OPTIONAL MATCH (e)<-[inRel:RELATES_TO]-()
        OPTIONAL MATCH (e)-[outRel:RELATES_TO]->()
        RETURN count(DISTINCT inRel) as inDegree,
               count(DISTINCT outRel) as outDegree
      `, { entityName });

      if (result.records.length === 0) {
        throw new Error(`Entity not found: ${entityName}`);
      }

      const record = result.records[0];
      const inDegree = record.get('inDegree').toNumber();
      const outDegree = record.get('outDegree').toNumber();
      const totalDegree = inDegree + outDegree;

      return { inDegree, outDegree, totalDegree };
    } finally {
      await session.close();
    }
  }

  async getClusteringCoefficient(entityName: string): Promise<number> {
    const session = this.driver!.session({ database: this.database });
    try {
      const result = await session.run(`
        MATCH (e:Entity {name: $entityName})-[:RELATES_TO]-(neighbor)
        WITH e, collect(DISTINCT neighbor) as neighbors
        UNWIND neighbors as n1
        UNWIND neighbors as n2
        WITH e, n1, n2, neighbors
        WHERE id(n1) < id(n2)
        OPTIONAL MATCH (n1)-[:RELATES_TO]-(n2)
        WITH e, neighbors, count(*) as actualConnections, 
             size(neighbors) * (size(neighbors) - 1) / 2 as possibleConnections
        RETURN CASE 
                 WHEN possibleConnections = 0 THEN 0.0 
                 ELSE toFloat(actualConnections) / possibleConnections 
               END as clusteringCoefficient
      `, { entityName });

      if (result.records.length === 0) {
        return 0.0;
      }

      return result.records[0].get('clusteringCoefficient');
    } finally {
      await session.close();
    }
  }
}