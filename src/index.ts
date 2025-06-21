#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
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
          resources: {},
        },
      }
    );

    this.graphManager = new KnowledgeGraphManager();
    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "create_entities",
          description: "Create multiple new entities in the knowledge graph. Use for adding facts, concepts, or learning patterns. Input: {entities: [{name: string, entityType: string, observations: string[], metadata?: object}]}",
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
          description: "Create relationships between existing entities. Use for connecting concepts, facts, or learning patterns. Input: {relations: [{from: string, to: string, relationType: string, metadata?: object}]}",
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
          description: "Add new observations to existing entities. Use for updating knowledge or adding new insights. Input: {observations: [{entityName: string, contents: string[]}]}",
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
          description: "Delete entities and all their relationships. Use for removing outdated or incorrect information. Input: {entityNames: string[]}",
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
          description: "Remove specific observations from entities. Use for correcting mistakes or removing outdated info. Input: {deletions: [{entityName: string, observations: string[]}]}",
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
          description: "Remove specific relationships between entities. Use for correcting connection errors. Input: {relations: [{from: string, to: string, relationType: string}]}",
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
          description: "Get the complete knowledge graph with all entities and relationships. Use for full graph inspection. Input: {} (no parameters)",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "search_similar",
          description: "Find semantically similar entities and relationships using AI embeddings. Use for discovering related concepts. Input: {query: string, limit?: number}",
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
          description: "Store multiple related memories and connections atomically. Use for meta-learning patterns that connect to each other. Input: {memories: Array, relationships: Array}",
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
          description: "Create multiple relationships efficiently in one operation. Use for connecting many entities at once. Input: {relationships: [{source_id: string, target_id: string, type: string, metadata?: object}]}",
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
          description: "Analyze connection patterns and relationship strength for a specific memory. Use for understanding knowledge clusters. Input: {memory_id: string}",
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
          description: "Retrieve all relationships of a specific type (validates, contradicts, builds_upon, etc.). Use for exploring relationship patterns. Input: {relationship_type: string}",
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
          description: "Discover relationship chains (A→B→C) to trace knowledge paths. Use for understanding learning progression. Input: {start_memory_id: string, max_depth: number}",
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
          description: "Enhanced semantic search with filters for entity types, dates, domains, and tags. Use for targeted discovery. Input: {query: string, filters?: object, limit?: number}",
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
          description: "Combines vector similarity search with graph traversal for comprehensive discovery. Use for complex knowledge exploration. Input: {query: string, relationship_paths?: string[], limit?: number, filters?: object}",
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
  
    private setupResourceHandlers() {
      // List available resources
      this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
          resources: [
            {
              uri: "memory://usage-guide",
              name: "Memory System Usage Guide",
              description: "Detailed prompting instructions for memory tools",
              mimeType: "text/markdown"
            },
            {
              uri: "memory://meta-learning-guide",
              name: "Meta-Learning Tools Guide", 
              description: "Advanced usage patterns for meta-learning functionality",
              mimeType: "text/markdown"
            },
            {
              uri: "memory://entity-types",
              name: "Entity Types Reference",
              description: "Complete reference for entity types and their usage",
              mimeType: "text/markdown"
            },
            {
              uri: "memory://relationship-types",
              name: "Relationship Types Reference",
              description: "Complete reference for relationship types and their usage",
              mimeType: "text/markdown"
            }
          ]
        };
      });
  
      // Read specific resources
      this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const uri = request.params.uri;
  
        switch (uri) {
          case "memory://usage-guide":
            return {
              contents: [{
                uri: request.params.uri,
                mimeType: "text/markdown",
                text: this.getUsageGuide()
              }]
            };
  
          case "memory://meta-learning-guide":
            return {
              contents: [{
                uri: request.params.uri,
                mimeType: "text/markdown", 
                text: this.getMetaLearningGuide()
              }]
            };
  
          case "memory://entity-types":
            return {
              contents: [{
                uri: request.params.uri,
                mimeType: "text/markdown",
                text: this.getEntityTypesReference()
              }]
            };
  
          case "memory://relationship-types":
            return {
              contents: [{
                uri: request.params.uri,
                mimeType: "text/markdown",
                text: this.getRelationshipTypesReference()
              }]
            };
  
          default:
            throw new McpError(
              ErrorCode.InvalidParams,
              `Unknown resource: ${uri}`
            );
        }
      });
    }
    
      private getUsageGuide(): string {
        return `# Memory System Usage Guide
    
    ## Core Operations
    
    ### create_entities
    **WHEN TO USE**: When storing new facts, concepts, or learning patterns
    **INPUT FORMAT**: \`{entities: [{name: string, entityType: string, observations: string[], metadata?: object}]}\`
    **BEST PRACTICES**:
    - Use descriptive names that clearly identify the concept
    - Choose appropriate entityType (meta_learning, principle, validation, failure_mode, general)
    - Include rich observations with specific details
    - Add metadata with tags, domain, and content for better searchability
    
    **EXAMPLE**:
    \`\`\`json
    {
      "entities": [{
        "name": "Spaced Repetition Principle",
        "entityType": "principle", 
        "observations": [
          "Information is better retained when reviewed at increasing intervals",
          "Optimal intervals: 1 day, 3 days, 1 week, 2 weeks, 1 month"
        ],
        "metadata": {
          "domain": "learning_techniques",
          "tags": ["memory", "retention", "intervals"],
          "content": "Spaced repetition leverages the psychological spacing effect..."
        }
      }]
    }
    \`\`\`
    
    ### create_relations
    **WHEN TO USE**: When connecting existing entities with meaningful relationships
    **INPUT FORMAT**: \`{relations: [{from: string, to: string, relationType: string, metadata?: object}]}\`
    **RELATIONSHIP TYPES**: validates, contradicts, builds_upon, connects_to, implements, derives_from
    **BEST PRACTICES**:
    - Ensure both entities exist before creating relations
    - Use appropriate relationship types that reflect the actual connection
    - Include strength scores (0.0-1.0) in metadata for importance
    - Add context and evidence to support the relationship
    
    ### search_similar
    **WHEN TO USE**: When exploring related concepts or discovering connections
    **INPUT FORMAT**: \`{query: string, limit?: number}\`
    **BEST PRACTICES**:
    - Use natural language queries describing what you're looking for
    - Start with broader queries and narrow down with filters
    - Combine with other tools for comprehensive exploration
    
    ## Advanced Operations
    
    ### save_memories_with_relationships
    **WHEN TO USE**: When storing complex meta-learning patterns with multiple interconnected pieces
    **BEST PRACTICES**:
    - Use for atomic operations that require consistency
    - Group related memories that form a coherent learning pattern
    - Include rich metadata for better future retrieval
    
    ### analyze_memory_connections
    **WHEN TO USE**: When exploring how a specific concept relates to others
    **OUTPUT**: Connection patterns, relationship types, strength metrics, and related clusters
    
    ### hybrid_search
    **WHEN TO USE**: When you need both semantic similarity and relationship traversal
    **BEST PRACTICES**:
    - Specify relationship_paths to focus on specific connection types
    - Use filters to narrow search scope
    - Combine with connection analysis for comprehensive understanding
    `;
      }
    
      private getMetaLearningGuide(): string {
        return `# Meta-Learning Tools Guide
    
    ## Meta-Learning Entity Types
    
    ### meta_learning
    - **Purpose**: Core learning patterns and techniques
    - **Examples**: "Active Retrieval Pattern", "Elaborative Interrogation Technique"
    - **When to use**: For fundamental learning strategies that can be applied across domains
    
    ### principle
    - **Purpose**: Fundamental learning principles backed by research
    - **Examples**: "Spaced Repetition Principle", "Testing Effect Principle"
    - **When to use**: For well-established learning laws and principles
    
    ### validation
    - **Purpose**: Research evidence that supports or validates principles
    - **Examples**: "Ebbinghaus Forgetting Curve Study", "Pashler Meta-Analysis"
    - **When to use**: For empirical evidence and research findings
    
    ### failure_mode
    - **Purpose**: Common learning mistakes and ineffective approaches
    - **Examples**: "Cramming Failure Mode", "Highlighting Illusion"
    - **When to use**: For documenting what doesn't work and why
    
    ## Advanced Workflow Patterns
    
    ### Pattern 1: Building Learning Hierarchies
    1. Create principle entities for core concepts
    2. Add validation entities with supporting research
    3. Connect with "validates" relationships
    4. Add failure_mode entities showing what contradicts the principle
    5. Use "contradicts" relationships to link opposing evidence
    
    ### Pattern 2: Meta-Learning Discovery
    1. Use \`hybrid_search\` with relationship_paths=["builds_upon", "validates"]
    2. Analyze results with \`analyze_memory_connections\`
    3. Find chains with \`find_relationship_chains\` to trace learning progressions
    4. Create new connections based on discovered patterns
    
    ### Pattern 3: Knowledge Validation
    1. Search for existing principles with \`search_with_filters\`
    2. Get relationships by type: \`get_relationships_by_type\` with "validates"
    3. Analyze strength of evidence using connection analysis
    4. Add new validation or contradicting evidence as needed
    
    ## Relationship Strength Guidelines
    
    - **0.9-1.0**: Strong empirical evidence, multiple replications
    - **0.7-0.8**: Good evidence, some limitations or context-dependence  
    - **0.5-0.6**: Moderate evidence, mixed findings
    - **0.3-0.4**: Weak evidence, preliminary or conflicting
    - **0.1-0.2**: Very weak evidence, mostly theoretical
    `;
      }
    
      private getEntityTypesReference(): string {
        return `# Entity Types Reference
    
    ## Meta-Learning Types
    
    ### meta_learning
    - **Definition**: Core learning patterns, techniques, and strategies
    - **Usage**: For fundamental learning approaches that can be applied across domains
    - **Examples**: 
      - "Active Retrieval Practice"
      - "Elaborative Interrogation Technique"
      - "Interleaving Strategy"
    - **Metadata Tips**: Use domain tags like "cognitive_strategies", "memory_techniques"
    
    ### principle
    - **Definition**: Well-established learning principles backed by research
    - **Usage**: For fundamental learning laws and scientific principles
    - **Examples**:
      - "Spaced Repetition Principle"
      - "Testing Effect Principle" 
      - "Generation Effect"
    - **Metadata Tips**: Include strength indicators and research domains
    
    ### validation
    - **Definition**: Research evidence, studies, and empirical support
    - **Usage**: For documenting scientific evidence that supports or refutes principles
    - **Examples**:
      - "Ebbinghaus Forgetting Curve Study"
      - "Roediger Testing Effect Meta-Analysis"
      - "Bjork Desirable Difficulties Research"
    - **Metadata Tips**: Include study details, sample sizes, effect sizes
    
    ### failure_mode  
    - **Definition**: Common learning mistakes and ineffective approaches
    - **Usage**: For documenting what doesn't work and why
    - **Examples**:
      - "Cramming Failure Mode"
      - "Highlighting Illusion"
      - "Fluency Misattribution"
    - **Metadata Tips**: Include why it fails and better alternatives
    
    ### general
    - **Definition**: General purpose entities that don't fit other categories
    - **Usage**: For concepts, facts, or patterns outside the meta-learning domain
    - **Examples**:
      - Domain-specific knowledge
      - General facts or observations
      - Contextual information
    - **Metadata Tips**: Use clear domain and tag classification
    
    ## Best Practices
    
    1. **Choose the Right Type**: Match entity type to the nature of the knowledge
    2. **Rich Observations**: Include specific, actionable details in observations
    3. **Comprehensive Metadata**: Use all relevant metadata fields (tags, domain, content)
    4. **Consistent Naming**: Use clear, descriptive names that avoid ambiguity
    5. **Content Preservation**: Store exact content separately from interpreted observations
    `;
      }
    
      private getRelationshipTypesReference(): string {
        return `# Relationship Types Reference
    
    ## Meta-Learning Relationship Types
    
    ### validates
    - **Definition**: Evidence or research that supports a principle or pattern
    - **Direction**: validation → principle/pattern
    - **Strength**: Based on quality and quantity of evidence
    - **Examples**:
      - "Pashler Meta-Analysis" validates "Spaced Repetition Principle"
      - "Roediger Studies" validates "Testing Effect Principle"
    - **Metadata**: Include confidence level, study quality, replication status
    
    ### contradicts
    - **Definition**: Evidence or patterns that oppose or contradict each other
    - **Direction**: contradiction → target
    - **Strength**: Based on strength of contradictory evidence
    - **Examples**:
      - "Cramming" contradicts "Spaced Repetition Principle"
      - "Passive Reading" contradicts "Active Retrieval Pattern"
    - **Metadata**: Include why contradiction exists, context dependencies
    
    ### builds_upon
    - **Definition**: One concept extends or builds on another foundational concept
    - **Direction**: advanced_concept → foundational_concept
    - **Strength**: Based on how directly dependent the concepts are
    - **Examples**:
      - "Elaborative Interrogation" builds_upon "Active Retrieval"
      - "Spaced Testing" builds_upon "Testing Effect"
    - **Metadata**: Include how the extension works, added value
    
    ### connects_to
    - **Definition**: General connections between related concepts
    - **Direction**: concept1 ↔ concept2 (bidirectional)
    - **Strength**: Based on closeness of relationship
    - **Examples**:
      - "Memory Palace" connects_to "Elaborative Encoding"
      - "Metacognition" connects_to "Self-Testing"
    - **Metadata**: Include nature of connection, context
    
    ### implements
    - **Definition**: Practical application or implementation of a principle
    - **Direction**: implementation → principle
    - **Strength**: Based on how faithfully it implements the principle
    - **Examples**:
      - "Anki Algorithm" implements "Spaced Repetition Principle"
      - "Practice Testing" implements "Testing Effect"
    - **Metadata**: Include implementation details, effectiveness
    
    ### derives_from
    - **Definition**: Logical derivation or theoretical development from another concept
    - **Direction**: derived_concept → source_concept
    - **Strength**: Based on logical rigor and directness
    - **Examples**:
      - "Optimal Review Intervals" derives_from "Forgetting Curve"
      - "Difficulty Desirability" derives_from "Transfer Appropriate Processing"
    - **Metadata**: Include derivation logic, theoretical basis
    
    ## Relationship Strength Guidelines
    
    ### Evidence-Based Strength (validates, contradicts)
    - **0.9-1.0**: Multiple high-quality studies, strong effect sizes, consistent replication
    - **0.7-0.8**: Good evidence with some limitations or context dependencies
    - **0.5-0.6**: Moderate evidence, mixed findings, or limited scope
    - **0.3-0.4**: Weak evidence, preliminary findings, or contradictory results
    - **0.1-0.2**: Very weak evidence, mostly theoretical or anecdotal
    
    ### Conceptual Strength (builds_upon, derives_from, implements)
    - **0.9-1.0**: Direct, essential dependency; cannot exist without foundation
    - **0.7-0.8**: Strong relationship with clear logical connection
    - **0.5-0.6**: Moderate relationship, some independence possible
    - **0.3-0.4**: Weak relationship, mostly tangential connection
    - **0.1-0.2**: Very weak relationship, minor or disputed connection
    
    ## Usage Patterns
    
    ### Building Knowledge Hierarchies
    1. Start with foundational principles
    2. Add validating evidence with "validates" relationships
    3. Connect related concepts with "connects_to"
    4. Show implementations with "implements" relationships
    5. Document contradictions and failure modes
    
    ### Tracing Learning Progressions
    1. Use "builds_upon" to show concept development
    2. Use "derives_from" to show theoretical development
    3. Chain relationships to trace knowledge evolution
    4. Analyze chains to understand learning pathways
    `;
      }  async run() {
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