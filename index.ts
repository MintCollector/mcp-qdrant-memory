#!/usr/bin/env node
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
import { Entity, Relation, KnowledgeGraph } from './types.js';
import {
  validateCreateEntitiesRequest,
  validateCreateRelationsRequest,
  validateAddObservationsRequest,
  validateDeleteEntitiesRequest,
  validateDeleteObservationsRequest,
  validateDeleteRelationsRequest,
  validateSearchSimilarRequest,
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
      this.graph = JSON.parse(data);
    } catch {
      // If file doesn't exist, use empty graph
      this.graph = { entities: [], relations: [] };
    }
    await this.qdrant.initialize();
  }

  async save(): Promise<void> {
    await fs.writeFile(MEMORY_FILE_PATH, JSON.stringify(this.graph, null, 2));
  }

  async addEntities(entities: Entity[]): Promise<void> {
    for (const entity of entities) {
      const existingIndex = this.graph.entities.findIndex(e => e.name === entity.name);
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
        r => r.from === relation.from && r.to === relation.to && r.relationType === relation.relationType
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
    const entity = this.graph.entities.find(e => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    entity.observations.push(...observations);
    await this.qdrant.persistEntity(entity);
    await this.save();
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    for (const name of entityNames) {
      const index = this.graph.entities.findIndex(e => e.name === name);
      if (index !== -1) {
        this.graph.entities.splice(index, 1);
        this.graph.relations = this.graph.relations.filter(
          r => r.from !== name && r.to !== name
        );
        await this.qdrant.deleteEntity(name);
      }
    }
    await this.save();
  }

  async deleteObservations(entityName: string, observations: string[]): Promise<void> {
    const entity = this.graph.entities.find(e => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    entity.observations = entity.observations.filter(o => !observations.includes(o));
    await this.qdrant.persistEntity(entity);
    await this.save();
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    for (const relation of relations) {
      const index = this.graph.relations.findIndex(
        r => r.from === relation.from && r.to === relation.to && r.relationType === relation.relationType
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
    return await this.qdrant.searchSimilar(query, limit);
  }
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
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
    await this.graphManager.initialize();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Memory MCP server running on stdio");
  }
}

const server = new MemoryServer();
server.run().catch(console.error);