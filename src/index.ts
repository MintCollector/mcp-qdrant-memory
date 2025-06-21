#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { QdrantPersistence } from './persistence/qdrant.js';
import { 
  Entity, 
  Relation, 
  KnowledgeGraph, 
  BatchMemoryWithRelationships,
  MemoryConnectionAnalysis,
  RelationshipChain,
  SearchFilters,
  HybridSearchResult
} from './types.js';
import {
  validateCreateEntitiesRequest,
  validateCreateRelationsRequest,
  validateAddObservationsRequest,
  validateDeleteEntitiesRequest,
  validateDeleteObservationsRequest,
  validateDeleteRelationsRequest,
  validateSearchSimilarRequest,
  validateSaveMemoriesWithRelationshipsRequest,
  validateBatchCreateRelationshipsRequest,
  validateAnalyzeMemoryConnectionsRequest,
  validateGetRelationshipsByTypeRequest,
  validateFindRelationshipChainsRequest,
  validateSearchWithFiltersRequest,
  validateHybridSearchRequest,
} from './validation.js';

// Define paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE_PATH = path.join(__dirname, 'memory.json');

class KnowledgeGraphManager {
  private graph: KnowledgeGraph;
  private qdrant: QdrantPersistence;

  constructor() {
    this.graph = { entities: [], relations: [] };
    this.qdrant = new QdrantPersistence();
  }

  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(MEMORY_FILE_PATH, 'utf-8');
      const parsedData = JSON.parse(data);
      // Ensure entities have observations array
      this.graph = {
        entities: parsedData.entities.map((e: Entity) => ({
          ...e,
          observations: e.observations || []
        })),
        relations: parsedData.relations || []
      };
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // If file doesn't exist, use empty graph
        this.graph = { entities: [], relations: [] };
      } else {
        // Re-throw unexpected errors
        throw new Error(`Failed to initialize graph: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await this.qdrant.initialize();
  }

  async save(): Promise<void> {
    await fs.writeFile(MEMORY_FILE_PATH, JSON.stringify(this.graph, null, 2));
  }

  async addEntities(entities: Entity[]): Promise<void> {
    for (const entity of entities) {
      const existingIndex = this.graph.entities.findIndex((e: Entity) => e.name === entity.name);
      if (existingIndex !== -1) {
        this.graph.entities[existingIndex] = entity;
      } else {
        this.graph.entities.push(entity);
      }
      await this.qdrant.persistEntity(entity);
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
      const existingIndex = this.graph.relations.findIndex(
        (r: Relation) => r.from === relation.from && r.to === relation.to && r.relationType === relation.relationType
      );
      if (existingIndex !== -1) {
        this.graph.relations[existingIndex] = relation;
      } else {
        this.graph.relations.push(relation);
      }
      await this.qdrant.persistRelation(relation);
    }
    await this.save();
  }

  async addObservations(entityName: string, observations: string[]): Promise<void> {
    const entity = this.graph.entities.find((e: Entity) => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    entity.observations.push(...observations);
    await this.qdrant.persistEntity(entity);
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
        await this.qdrant.deleteEntity(name);
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
    await this.qdrant.persistEntity(entity);
    await this.save();
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    for (const relation of relations) {
      const index = this.graph.relations.findIndex(
        (r: Relation) => r.from === relation.from && r.to === relation.to && r.relationType === relation.relationType
      );
      if (index !== -1) {
        this.graph.relations.splice(index, 1);
        await this.qdrant.deleteRelation(relation);
      }
    }
    await this.save();
  }

  getGraph(): KnowledgeGraph {
    return this.graph;
  }

  async searchSimilar(query: string, limit: number = 10): Promise<Array<Entity | Relation>> {
    // Ensure limit is a positive number
    const validLimit = Math.max(1, Math.min(limit, 100)); // Cap at 100 results
    return await this.qdrant.searchSimilar(query, validLimit);
  }

  // New batch operations for meta-learning
  async saveMemoriesWithRelationships(data: BatchMemoryWithRelationships): Promise<{ memory_ids: string[]; relationship_ids: string[] }> {
    const memory_ids: string[] = [];
    const relationship_ids: string[] = [];

    // Add entities to graph
    for (const entity of data.memories) {
      // Ensure entity has proper metadata
      if (!entity.metadata) {
        entity.metadata = { created_at: new Date().toISOString() };
      }
      if (!entity.metadata.id) {
        entity.metadata.id = `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      const existingIndex = this.graph.entities.findIndex((e: Entity) => e.name === entity.name);
      if (existingIndex !== -1) {
        this.graph.entities[existingIndex] = entity;
      } else {
        this.graph.entities.push(entity);
      }
      memory_ids.push(entity.metadata.id);
    }

    // Add relationships to graph
    for (const relation of data.relationships) {
      // Ensure relation has proper metadata
      if (!relation.metadata) {
        relation.metadata = { created_at: new Date().toISOString() };
      }
      
      // Validate entities exist
      if (!this.graph.entities.some(e => e.name === relation.from)) {
        throw new Error(`Entity not found: ${relation.from}`);
      }
      if (!this.graph.entities.some(e => e.name === relation.to)) {
        throw new Error(`Entity not found: ${relation.to}`);
      }

      const existingIndex = this.graph.relations.findIndex(
        (r: Relation) => r.from === relation.from && r.to === relation.to && r.relationType === relation.relationType
      );
      if (existingIndex !== -1) {
        this.graph.relations[existingIndex] = relation;
      } else {
        this.graph.relations.push(relation);
      }
      relationship_ids.push(`${relation.from}-${relation.relationType}-${relation.to}`);
    }

    // Batch persist to Qdrant
    await this.qdrant.batchPersistEntities(data.memories);
    await this.qdrant.batchPersistRelations(data.relationships);
    
    // Save to file
    await this.save();

    return { memory_ids, relationship_ids };
  }

  async batchCreateRelationships(relationships: Array<{source_id: string; target_id: string; type: string; metadata?: any}>): Promise<{ relationship_ids: string[] }> {
    const relationship_ids: string[] = [];
    const relationsToAdd: Relation[] = [];

    for (const rel of relationships) {
      // Find entities by ID (check metadata.id) or name
      const sourceEntity = this.graph.entities.find(e => e.metadata?.id === rel.source_id || e.name === rel.source_id);
      const targetEntity = this.graph.entities.find(e => e.metadata?.id === rel.target_id || e.name === rel.target_id);

      if (!sourceEntity || !targetEntity) {
        throw new Error(`Entity not found: ${!sourceEntity ? rel.source_id : rel.target_id}`);
      }

      const relation: Relation = {
        from: sourceEntity.name,
        to: targetEntity.name,
        relationType: rel.type,
        metadata: rel.metadata || { created_at: new Date().toISOString() }
      };

      const existingIndex = this.graph.relations.findIndex(
        (r: Relation) => r.from === relation.from && r.to === relation.to && r.relationType === relation.relationType
      );
      
      if (existingIndex !== -1) {
        this.graph.relations[existingIndex] = relation;
      } else {
        this.graph.relations.push(relation);
      }
      
      relationsToAdd.push(relation);
      relationship_ids.push(`${relation.from}-${relation.relationType}-${relation.to}`);
    }

    // Batch persist to Qdrant
    await this.qdrant.batchPersistRelations(relationsToAdd);
    
    // Save to file
    await this.save();

    return { relationship_ids };
  }

  async analyzeMemoryConnections(memoryId: string): Promise<MemoryConnectionAnalysis> {
    // Find entity by ID or name
    const entity = this.graph.entities.find(e => e.metadata?.id === memoryId || e.name === memoryId);
    if (!entity) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    // Get all relationships involving this entity
    const relatedRelations = this.graph.relations.filter(r => r.from === entity.name || r.to === entity.name);
    
    // Count relationship types
    const relationshipTypes = [...new Set(relatedRelations.map(r => r.relationType))];
    
    // Calculate connection strength (simple metric based on number of connections and their strength)
    let connectionStrength = 0;
    const relatedEntities = new Set<string>();
    
    for (const rel of relatedRelations) {
      const relatedEntity = rel.from === entity.name ? rel.to : rel.from;
      relatedEntities.add(relatedEntity);
      
      // Factor in relationship metadata strength if available
      const strength = rel.metadata?.strength || 0.5;
      connectionStrength += strength;
    }
    
    // Normalize by number of connections
    connectionStrength = relatedEntities.size > 0 ? connectionStrength / relatedEntities.size : 0;

    // Simple clustering - group related entities by relationship type
    const clusters: Array<{ cluster_id: string; entities: string[]; strength: number }> = [];
    const relationshipGroups = new Map<string, string[]>();
    
    for (const rel of relatedRelations) {
      const relatedEntity = rel.from === entity.name ? rel.to : rel.from;
      if (!relationshipGroups.has(rel.relationType)) {
        relationshipGroups.set(rel.relationType, []);
      }
      relationshipGroups.get(rel.relationType)!.push(relatedEntity);
    }
    
    for (const [relType, entities] of relationshipGroups) {
      clusters.push({
        cluster_id: `${relType}_cluster`,
        entities: [...new Set(entities)],
        strength: entities.length / relatedEntities.size
      });
    }

    return {
      memory_id: memoryId,
      relationship_types: relationshipTypes,
      connection_strength: connectionStrength,
      related_clusters: clusters
    };
  }

  async getRelationshipsByType(relationshipType: string): Promise<Relation[]> {
    return await this.qdrant.getRelationshipsByType(relationshipType);
  }

  async findRelationshipChains(startMemoryId: string, maxDepth: number): Promise<RelationshipChain[]> {
    // Find starting entity
    const startEntity = this.graph.entities.find(e => e.metadata?.id === startMemoryId || e.name === startMemoryId);
    if (!startEntity) {
      throw new Error(`Memory not found: ${startMemoryId}`);
    }

    const chains: RelationshipChain[] = [];
    const visited = new Set<string>();

    const findChains = (currentEntity: string, currentChain: string[], depth: number, totalStrength: number) => {
      if (depth >= maxDepth) return;
      
      const outgoingRelations = this.graph.relations.filter(r => r.from === currentEntity);
      
      for (const relation of outgoingRelations) {
        if (visited.has(`${currentEntity}-${relation.to}`)) continue;
        
        const newChain = [...currentChain, relation.to];
        const relationStrength = relation.metadata?.strength || 0.5;
        const newTotalStrength = totalStrength + relationStrength;
        
        chains.push({
          chain: [startEntity.name, ...newChain],
          depth: depth + 1,
          chain_type: relation.relationType,
          total_strength: newTotalStrength / (depth + 1) // Average strength
        });
        
        visited.add(`${currentEntity}-${relation.to}`);
        findChains(relation.to, newChain, depth + 1, newTotalStrength);
        visited.delete(`${currentEntity}-${relation.to}`);
      }
    };

    findChains(startEntity.name, [], 0, 0);
    
    // Sort by total strength descending
    return chains.sort((a, b) => (b.total_strength || 0) - (a.total_strength || 0));
  }

  async searchWithFilters(query: string, filters?: SearchFilters, limit: number = 10): Promise<Array<Entity | Relation>> {
    const validLimit = Math.max(1, Math.min(limit, 100));
    return await this.qdrant.searchWithFilters(query, filters, validLimit);
  }

  async hybridSearch(query: string, relationshipPaths?: string[], limit: number = 10, filters?: SearchFilters): Promise<HybridSearchResult> {
    const validLimit = Math.max(1, Math.min(limit, 100));
    
    // Start with semantic search
    const semanticResults = await this.qdrant.searchWithFilters(query, filters, validLimit * 2);
    
    const memories: Entity[] = [];
    const relationshipContext: Array<{
      source: Entity;
      target: Entity;
      relation: Relation;
      path_relevance: number;
    }> = [];
    
    // Filter to entities only for memories
    for (const result of semanticResults) {
      if ('entityType' in result) {
        memories.push(result as Entity);
      }
    }
    
    // If relationship paths are specified, find relevant connections
    if (relationshipPaths && relationshipPaths.length > 0) {
      const pathRelations = this.graph.relations.filter(r => 
        relationshipPaths.includes(r.relationType)
      );
      
      // Find relationships that connect our semantic results
      for (const relation of pathRelations) {
        const sourceEntity = memories.find(e => e.name === relation.from);
        const targetEntity = memories.find(e => e.name === relation.to);
        
        if (sourceEntity && targetEntity) {
          relationshipContext.push({
            source: sourceEntity,
            target: targetEntity,
            relation,
            path_relevance: relation.metadata?.strength || 0.5
          });
        }
      }
    }
    
    // Sort relationship context by relevance
    relationshipContext.sort((a, b) => b.path_relevance - a.path_relevance);
    
    return {
      memories: memories.slice(0, validLimit),
      relationship_context: relationshipContext,
      total_count: memories.length
    };
  }
}

interface CallToolRequest {
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

class MemoryServer {
  private server: Server;
  private graphManager: KnowledgeGraphManager;

  constructor() {
    this.server = new Server(
      {
        name: "memory",
        version: "0.6.2",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.graphManager = new KnowledgeGraphManager();
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "create_entities",
          description: "Create multiple new entities in the knowledge graph",
          inputSchema: {
            type: "object",
            properties: {
              entities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    entityType: { type: "string" },
                    observations: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["name", "entityType", "observations"]
                }
              }
            },
            required: ["entities"]
          }
        },
        {
          name: "create_relations",
          description: "Create multiple new relations between entities",
          inputSchema: {
            type: "object",
            properties: {
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    relationType: { type: "string" }
                  },
                  required: ["from", "to", "relationType"]
                }
              }
            },
            required: ["relations"]
          }
        },
        {
          name: "add_observations",
          description: "Add new observations to existing entities",
          inputSchema: {
            type: "object",
            properties: {
              observations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entityName: { type: "string" },
                    contents: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["entityName", "contents"]
                }
              }
            },
            required: ["observations"]
          }
        },
        {
          name: "delete_entities",
          description: "Delete multiple entities and their relations",
          inputSchema: {
            type: "object",
            properties: {
              entityNames: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["entityNames"]
          }
        },
        {
          name: "delete_observations",
          description: "Delete specific observations from entities",
          inputSchema: {
            type: "object",
            properties: {
              deletions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entityName: { type: "string" },
                    observations: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["entityName", "observations"]
                }
              }
            },
            required: ["deletions"]
          }
        },
        {
          name: "delete_relations",
          description: "Delete multiple relations",
          inputSchema: {
            type: "object",
            properties: {
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    relationType: { type: "string" }
                  },
                  required: ["from", "to", "relationType"]
                }
              }
            },
            required: ["relations"]
          }
        },
        {
          name: "read_graph",
          description: "Read the entire knowledge graph",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "search_similar",
          description: "Search for similar entities and relations using semantic search",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { 
                type: "number",
                default: 10
              }
            },
            required: ["query"]
          }
        },
        {
          name: "save_memories_with_relationships",
          description: "Store multiple related memories and connections atomically",
          inputSchema: {
            type: "object",
            properties: {
              memories: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    entityType: { type: "string" },
                    observations: {
                      type: "array",
                      items: { type: "string" }
                    },
                    metadata: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        created_at: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                        domain: { type: "string" },
                        content: { type: "string" }
                      }
                    }
                  },
                  required: ["name", "entityType", "observations"]
                }
              },
              relationships: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    relationType: { type: "string" },
                    metadata: {
                      type: "object",
                      properties: {
                        strength: { type: "number", minimum: 0, maximum: 1 },
                        created_at: { type: "string" },
                        context: { type: "string" },
                        evidence: { type: "array", items: { type: "string" } }
                      }
                    }
                  },
                  required: ["from", "to", "relationType"]
                }
              }
            },
            required: ["memories", "relationships"]
          }
        },
        {
          name: "batch_create_relationships",
          description: "Create multiple relationships in one operation",
          inputSchema: {
            type: "object",
            properties: {
              relationships: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    source_id: { type: "string" },
                    target_id: { type: "string" },
                    type: { type: "string" },
                    metadata: {
                      type: "object",
                      properties: {
                        strength: { type: "number", minimum: 0, maximum: 1 },
                        created_at: { type: "string" },
                        context: { type: "string" },
                        evidence: { type: "array", items: { type: "string" } }
                      }
                    }
                  },
                  required: ["source_id", "target_id", "type"]
                }
              }
            },
            required: ["relationships"]
          }
        },
        {
          name: "analyze_memory_connections",
          description: "Analyze connection patterns for specific memory",
          inputSchema: {
            type: "object",
            properties: {
              memory_id: { type: "string" }
            },
            required: ["memory_id"]
          }
        },
        {
          name: "get_relationships_by_type",
          description: "Get all relationships of specific type",
          inputSchema: {
            type: "object",
            properties: {
              relationship_type: { type: "string" }
            },
            required: ["relationship_type"]
          }
        },
        {
          name: "find_relationship_chains",
          description: "Discover relationship chains (A→B→C)",
          inputSchema: {
            type: "object",
            properties: {
              start_memory_id: { type: "string" },
              max_depth: { type: "number", minimum: 1, maximum: 10 }
            },
            required: ["start_memory_id", "max_depth"]
          }
        },
        {
          name: "search_with_filters",
          description: "Enhanced search with type/date/relationship filters",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              filters: {
                type: "object",
                properties: {
                  entity_types: { type: "array", items: { type: "string" } },
                  date_range: {
                    type: "object",
                    properties: {
                      start: { type: "string" },
                      end: { type: "string" }
                    },
                    required: ["start", "end"]
                  },
                  relationship_constraints: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        direction: { type: "string", enum: ["inbound", "outbound", "both"] }
                      },
                      required: ["type"]
                    }
                  },
                  domains: { type: "array", items: { type: "string" } },
                  tags: { type: "array", items: { type: "string" } }
                }
              },
              limit: { type: "number", default: 10 }
            },
            required: ["query"]
          }
        },
        {
          name: "hybrid_search",
          description: "Vector similarity + graph traversal combined",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              relationship_paths: { type: "array", items: { type: "string" } },
              limit: { type: "number", default: 10 },
              filters: {
                type: "object",
                properties: {
                  entity_types: { type: "array", items: { type: "string" } },
                  date_range: {
                    type: "object",
                    properties: {
                      start: { type: "string" },
                      end: { type: "string" }
                    },
                    required: ["start", "end"]
                  },
                  domains: { type: "array", items: { type: "string" } },
                  tags: { type: "array", items: { type: "string" } }
                }
              }
            },
            required: ["query"]
          }
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments"
        );
      }

      try {
        switch (request.params.name) {
          case "create_entities": {
            const args = validateCreateEntitiesRequest(request.params.arguments);
            await this.graphManager.addEntities(args.entities);
            return {
              content: [{ type: "text", text: "Entities created successfully" }],
            };
          }

          case "create_relations": {
            const args = validateCreateRelationsRequest(request.params.arguments);
            await this.graphManager.addRelations(args.relations);
            return {
              content: [{ type: "text", text: "Relations created successfully" }],
            };
          }

          case "add_observations": {
            const args = validateAddObservationsRequest(request.params.arguments);
            for (const obs of args.observations) {
              await this.graphManager.addObservations(obs.entityName, obs.contents);
            }
            return {
              content: [{ type: "text", text: "Observations added successfully" }],
            };
          }

          case "delete_entities": {
            const args = validateDeleteEntitiesRequest(request.params.arguments);
            await this.graphManager.deleteEntities(args.entityNames);
            return {
              content: [{ type: "text", text: "Entities deleted successfully" }],
            };
          }

          case "delete_observations": {
            const args = validateDeleteObservationsRequest(request.params.arguments);
            for (const del of args.deletions) {
              await this.graphManager.deleteObservations(del.entityName, del.observations);
            }
            return {
              content: [{ type: "text", text: "Observations deleted successfully" }],
            };
          }

          case "delete_relations": {
            const args = validateDeleteRelationsRequest(request.params.arguments);
            await this.graphManager.deleteRelations(args.relations);
            return {
              content: [{ type: "text", text: "Relations deleted successfully" }],
            };
          }

          case "read_graph":
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(this.graphManager.getGraph(), null, 2),
                },
              ],
            };

          case "search_similar": {
            const args = validateSearchSimilarRequest(request.params.arguments);
            const results = await this.graphManager.searchSimilar(
              args.query,
              args.limit
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };
          }

          case "save_memories_with_relationships": {
            const args = validateSaveMemoriesWithRelationshipsRequest(request.params.arguments);
            const result = await this.graphManager.saveMemoriesWithRelationships(args);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "batch_create_relationships": {
            const args = validateBatchCreateRelationshipsRequest(request.params.arguments);
            const result = await this.graphManager.batchCreateRelationships(args.relationships);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "analyze_memory_connections": {
            const args = validateAnalyzeMemoryConnectionsRequest(request.params.arguments);
            const result = await this.graphManager.analyzeMemoryConnections(args.memory_id);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "get_relationships_by_type": {
            const args = validateGetRelationshipsByTypeRequest(request.params.arguments);
            const result = await this.graphManager.getRelationshipsByType(args.relationship_type);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "find_relationship_chains": {
            const args = validateFindRelationshipChainsRequest(request.params.arguments);
            const result = await this.graphManager.findRelationshipChains(
              args.start_memory_id,
              args.max_depth
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "search_with_filters": {
            const args = validateSearchWithFiltersRequest(request.params.arguments);
            const result = await this.graphManager.searchWithFilters(
              args.query,
              args.filters,
              args.limit
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "hybrid_search": {
            const args = validateHybridSearchRequest(request.params.arguments);
            const result = await this.graphManager.hybridSearch(
              args.query,
              args.relationship_paths,
              args.limit,
              args.filters
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }

  async run() {
    try {
      await this.graphManager.initialize();
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Memory MCP server running on stdio");
    } catch (error) {
      console.error("Fatal error running server:", error);
      process.exit(1);
    }
  }
}

// Server startup
const server = new MemoryServer();
server.run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});