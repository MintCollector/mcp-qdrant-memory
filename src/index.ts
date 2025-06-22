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
import { HybridPersistence } from './persistence/factory.js';
import { 
  Entity, 
  Relation, 
  KnowledgeGraph, 
  SearchFilters,

} from './types.js';
import {
  validateCreateEntitiesRequest,
  validateAddObservationsRequest,
  validateDeleteEntitiesRequest,
  validateDeleteObservationsRequest,
  validateSemanticSearchRequest,
  validateCreateRelationshipsRequest,
  validateDeleteRelationshipsRequest,
  validateSearchRelatedRequest,

} from './validation.js';

class KnowledgeGraphManager {
  private persistence: HybridPersistence;

  constructor() {
    this.persistence = new HybridPersistence();
  }

  async initialize(): Promise<void> {
    await this.persistence.initialize();
  }

  async addEntities(entities: Entity[]): Promise<void> {
    await this.persistence.addEntities(entities);
  }

  async addRelations(relations: Relation[]): Promise<void> {
    await this.persistence.addRelations(relations);
  }

  async addObservations(entityName: string, observations: string[]): Promise<void> {
    await this.persistence.addObservations(entityName, observations);
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    await this.persistence.deleteEntities(entityNames);
  }

  async deleteObservations(entityName: string, observations: string[]): Promise<void> {
    await this.persistence.deleteObservations(entityName, observations);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    await this.persistence.deleteRelations(relations);
  }

  async getGraph(): Promise<KnowledgeGraph> {
    return this.persistence.getGraph();
  }

  async searchSimilar(query: string, limit: number = 10, scoreThreshold?: number): Promise<Array<Entity | Relation>> {
      // Ensure limit is a positive number
      const validLimit = Math.max(1, Math.min(limit, 100)); // Cap at 100 results
      return await this.persistence.searchSimilar(query, validLimit, scoreThreshold);
    }
  
  async searchWithFilters(query: string, filters?: SearchFilters, limit: number = 10, scoreThreshold?: number): Promise<Array<Entity | Relation>> {
      // Ensure limit is a positive number
      const validLimit = Math.max(1, Math.min(limit, 100)); // Cap at 100 results
      return await this.persistence.searchWithFilters(query, filters, validLimit, scoreThreshold);
    }

  async searchRelated(entityName: string, maxDepth: number = 2, relationshipTypes?: string[]): Promise<{
    entities: Entity[];
    relationships: Relation[];
    paths: Array<{
      path: string[];
      depth: number;
    }>;
  }> {
    return this.persistence.searchRelated(entityName, maxDepth, relationshipTypes);
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
          description: "Create multiple new entities in the knowledge graph. Use for adding people, organizations, locations, events, concepts, workflows, objects, tasks, and preferences. Input: {entities: [{name: string, entityType: string|string[], observations: string[], metadata?: object}]}. Entity types: person, organization, location, event, concept, workflow, object, task, preferences. Custom types also supported.",
          inputSchema: {
            type: "object",
            properties: {
              entities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    entityType: { 
                      oneOf: [
                        { type: "string" },
                        { 
                          type: "array",
                          items: { type: "string" },
                          minItems: 1
                        }
                      ]
                    },
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
          name: "create_relationships",
          description: "Create relationships between existing entities. Use for connecting concepts, facts, or learning patterns. Input: {relationships: [{from: string, to: string, relationType: string, metadata?: object}]}",
          inputSchema: {
            type: "object",
            properties: {
              relationships: {
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
            required: ["relationships"]
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
          name: "delete_relationships",
          description: "Remove specific relationships between entities. Use for correcting connection errors. Input: {relationships: [{from: string, to: string, relationType: string}]}",
          inputSchema: {
            type: "object",
            properties: {
              relationships: {
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
            required: ["relationships"]
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
          name: "semantic_search",
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
          name: "advanced_search",
          description: "Advanced semantic search with filtering capabilities. Use for precise searches with entity type, domain, tag, or date filters. Input: {query: string, filters?: {entity_types?: string[], domains?: string[], tags?: string[], date_range?: {start: string, end: string}}, limit?: number, score_threshold?: number}",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              filters: {
                type: "object",
                properties: {
                  entity_types: {
                    type: "array",
                    items: { type: "string" },
                    description: "Filter by entity types (person, organization, location, event, concept, workflow, object, task, preferences)"
                  },
                  domains: {
                    type: "array", 
                    items: { type: "string" },
                    description: "Filter by domain metadata"
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Filter by tag metadata"
                  },
                  date_range: {
                    type: "object",
                    properties: {
                      start: { type: "string", description: "Start date (ISO 8601)" },
                      end: { type: "string", description: "End date (ISO 8601)" }
                    },
                    required: ["start", "end"]
                  }
                }
              },
              limit: {
                type: "number",
                default: 10,
                description: "Maximum results (1-100)"
              },
              score_threshold: {
                type: "number",
                description: "Minimum similarity score (0.0-1.0)"
              }
            },
            required: ["query"]
          }
        },
        {
          name: "search_related",
          description: "Find entities connected through the knowledge graph structure. Use for discovering related information via relationships. Input: {entityName: string, maxDepth?: number, relationshipTypes?: string[]}",
          inputSchema: {
            type: "object",
            properties: {
              entityName: { type: "string" },
              maxDepth: { 
                type: "number",
                default: 2,
                minimum: 1,
                maximum: 5
              },
              relationshipTypes: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["entityName"]
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

          case "create_relationships": {
            const args = validateCreateRelationshipsRequest(request.params.arguments);
            await this.graphManager.addRelations(args.relationships);
            return {
              content: [{ type: "text", text: "Relationships created successfully" }],
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

          case "delete_relationships": {
            const args = validateDeleteRelationshipsRequest(request.params.arguments);
            await this.graphManager.deleteRelations(args.relationships);
            return {
              content: [{ type: "text", text: "Relationships deleted successfully" }],
            };
          }

          case "read_graph": {
            const graph = await this.graphManager.getGraph();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(graph, null, 2),
                },
              ],
            };
          }

          case "semantic_search": {
            const args = validateSemanticSearchRequest(request.params.arguments);
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

          case "advanced_search": {
            // For now, use basic argument validation since we don't have a specific validator yet
            const args = request.params.arguments as any;
            const results = await this.graphManager.searchWithFilters(
              args.query,
              args.filters,
              args.limit,
              args.score_threshold
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

          case "search_related": {
            const args = validateSearchRelatedRequest(request.params.arguments);
            const results = await this.graphManager.searchRelated(
              args.entityName,
              args.maxDepth,
              args.relationshipTypes
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
  
    private setupResourceHandlers() {
      // List available resources
      this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
          resources: [
            {
              uri: "memory://usage-guide",
              name: "Memory System Usage Guide",
              description: "Complete guide for using memory tools with examples and patterns",
              mimeType: "text/markdown"
            },
            {
              uri: "memory://types-reference",
              name: "Types Reference",
              description: "Complete reference for entity and relationship types",
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
  
          case "memory://types-reference":
            return {
              contents: [{
                uri: request.params.uri,
                mimeType: "text/markdown",
                text: this.getTypesReference()
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

## Quick Start - Essential Tools

### 1. create_entities
**PURPOSE**: Store new knowledge, facts, concepts, or learning patterns
**INPUT**: \`{entities: [{name: string, entityType: string|string[], observations: string[], metadata?: object}]}\`

**ENTITY TYPES**: Choose from 9 core types (person, organization, location, event, concept, workflow, object, task, preferences). Custom types also supported.

**SINGLE TYPE EXAMPLE**:
\`\`\`json
{
  "entities": [{
    "name": "Albert Einstein",
    "entityType": "person",
    "observations": [
      "Theoretical physicist who developed relativity theory",
      "Nobel Prize winner in Physics (1921)"
    ],
    "metadata": {
      "domain": "science",
      "tags": ["physics", "relativity", "nobel_prize"]
    }
  }]
}
\`\`\`

**MULTIPLE TYPES EXAMPLE**:
\`\`\`json
{
  "entities": [{
    "name": "Docker",
    "entityType": ["object", "workflow"],
    "observations": [
      "Containerization platform for applications",
      "Standard deployment and development workflow"
    ],
    "metadata": {
      "domain": "software_development",
      "tags": ["containers", "devops", "deployment"]
    }
  }]
}
\`\`\`

### 2. create_relationships
**PURPOSE**: Connect existing entities with meaningful relationships
**INPUT**: \`{relationships: [{from: string, to: string, relationType: string, metadata?: object}]}\`
**RELATIONSHIP TYPES**: relates_to, part_of, creates, uses, influences, depends_on, similar_to, opposite_of
**EXAMPLE**:
\`\`\`json
{
  "relationships": [{
    "from": "Einstein",
    "to": "Theory of Relativity", 
    "relationType": "creates",
    "metadata": {
      "strength": 0.9,
      "context": "Einstein developed the theory of relativity"
    }
  }]
}
\`\`\`

### 3. semantic_search
**PURPOSE**: Find semantically similar content using AI embeddings (searches vector database)
**INPUT**: \`{query: string, limit?: number}\`
**BEST FOR**: Discovering related concepts, exploring similar ideas
**EXAMPLE**: "memory techniques for better learning"

### 4. advanced_search
**PURPOSE**: Advanced semantic search with filtering capabilities (combines AI similarity with precise filtering)
**INPUT**: \`{query: string, filters?: {entity_types?: string[], domains?: string[], tags?: string[], date_range?: {start: string, end: string}}, limit?: number, score_threshold?: number}\`
**BEST FOR**: Precise searches when you know specific criteria
**EXAMPLES**:
\`\`\`json
// Find people in science domain
{
  "query": "physicist researcher",
  "filters": {
    "entity_types": ["person"],
    "domains": ["science"]
  }
}

// Find recent technology concepts
{
  "query": "AI machine learning",
  "filters": {
    "entity_types": ["concept"],
    "tags": ["technology"],
    "date_range": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    }
  }
}

// High-confidence similarity search
{
  "query": "quantum computing",
  "score_threshold": 0.8
}
\`\`\`

### 5. search_related
**PURPOSE**: Find connected entities via knowledge graph relationships (traverses graph structure)
**INPUT**: \`{entityName: string, maxDepth?: number, relationshipTypes?: string[]}\`
**BEST FOR**: Understanding how concepts connect, finding relationship chains

## Management Tools

### 6. add_observations
**PURPOSE**: Add new insights to existing entities
**INPUT**: \`{observations: [{entityName: string, contents: string[]}]}\`

### 7. read_graph
**PURPOSE**: View complete knowledge graph
**INPUT**: \`{}\` (no parameters)

### 8. delete_entities
**PURPOSE**: Remove entities and all their relationships
**INPUT**: \`{entityNames: string[]}\`

### 9. delete_observations
**PURPOSE**: Remove specific observations from entities
**INPUT**: \`{deletions: [{entityName: string, observations: string[]}]}\`

### 10. delete_relationships
**PURPOSE**: Remove specific relationships between entities
**INPUT**: \`{relationships: [{from: string, to: string, relationType: string}]}\`

## Multi-Type Entity Strategy

### Common Multi-Type Combinations

#### person + concept
- **Use**: For influential thinkers whose ideas are concepts themselves
- **Example**: ["person", "concept"] for "Albert Einstein" (both the person and his conceptual contributions)

#### object + workflow  
- **Use**: For tools that are also methodologies
- **Example**: ["object", "workflow"] for "Docker" (both software and deployment methodology)

#### object + event
- **Use**: For important publications that are also historical events
- **Example**: ["object", "event"] for "Declaration of Independence"

#### organization + location
- **Use**: For institutions tied to specific places
- **Example**: ["organization", "location"] for "MIT"

## Search Strategy Guide

### When to use semantic_search vs search_related:
- **semantic_search**: "Find concepts similar to X" (AI similarity)
- **search_related**: "Show me what connects to X" (graph traversal)

### Workflow Examples:
1. **Store new learning**: create_entities → create_relationships
2. **Explore knowledge**: semantic_search → search_related → read_graph
3. **Update knowledge**: add_observations → create_relationships
4. **Clean up**: delete_observations → delete_relationships → delete_entities
`;
      }
    
      private getTypesReference(): string {
        return `# Types Reference
      
      ## Entity Types (9 Core Types)
      
      ### person
      - **Purpose**: People, individuals, characters, historical figures
      - **Examples**: "Albert Einstein", "Marie Curie", "John Smith"
      - **Multi-type example**: ["person", "concept"] for influential thinkers
      - **When to use**: For any individual human being, real or fictional
      
      ### organization
      - **Purpose**: Companies, institutions, groups, teams
      - **Examples**: "Microsoft", "Harvard University", "Development Team"
      - **Multi-type example**: ["organization", "object"] for tech companies
      - **When to use**: For structured groups of people
      
      ### location
      - **Purpose**: Places, geographical entities, venues, virtual spaces
      - **Examples**: "New York City", "Office Building", "Cloud Infrastructure"
      - **Multi-type example**: ["location", "organization"] for corporate headquarters
      - **When to use**: For physical or virtual places
      
      ### event
      - **Purpose**: Temporal interactions, Historical events, occurrences, incidents, milestones, calendar appointments, meetings
      - **Examples**: "World War II", "2008 Financial Crisis", "Product Launch", "Team Meeting"
      - **Multi-type example**: ["event", "workflow"] for procedural events
      - **When to use**: For time-bound occurrences or happenings
      
      ### concept
      - **Purpose**: Abstract ideas, theories, principles, mental models
      - **Examples**: "Democracy", "Machine Learning", "Supply and Demand"
      - **Multi-type example**: ["concept", "workflow"] for methodological concepts
      - **When to use**: For theoretical or abstract knowledge
      
      ### workflow
      - **Purpose**: Methods, procedures, workflows, algorithms, processes
      - **Examples**: "Code Review Process", "Scientific Method", "Customer Onboarding"
      - **Multi-type example**: ["workflow", "object"] for automated processes
      - **When to use**: For systematic approaches and procedures
      
      ### object
      - **Purpose**: Documents, products, tools, resources, assets, financial instruments
      - **Examples**: "Research Paper", "Docker", "Financial Report", "API Documentation"
      - **Multi-type example**: ["object", "concept"] for knowledge artifacts
      - **When to use**: For concrete items and their relationships
      
      ### task
      - **Purpose**: Objectives, projects, assignments
      - **Examples**: "Complete Project Alpha", "Review Code", "Schedule Meeting"
      - **Multi-type example**: ["task", "event"] for scheduled assignments
      - **When to use**: Things worth recording with status, priority, deadline, dependencies. Enables procedural memory and goal tracking
      
      ### preferences
      - **Purpose**: User choices, configurations, behavioral patterns, report formatting, likes, dislikes
      - **Examples**: "Dark Mode Setting", "Notification Preferences", "Preferred Meeting Times"
      - **Multi-type example**: ["preferences", "object"] for configuration files
      - **When to use**: Maintains personalization state and user behavior patterns
      
      ## Relationship Types (8 Core Types)
      
      ### relates_to
      - **Purpose**: General connection between entities
      - **Direction**: bidirectional (entity_a ↔ entity_b)
      - **When to use**: For general relationships that don't fit other specific categories
      - **Example**: "Einstein" relates_to "Theory of Relativity"
      
      ### part_of  
      - **Purpose**: Hierarchical relationship (component is part of container)
      - **Direction**: component → container
      - **When to use**: When one entity is a component or subset of another
      - **Example**: "Marketing Team" part_of "Sales Organization"
      
      ### creates
      - **Purpose**: Creation, authorship, or origination relationship
      - **Direction**: creator → created_entity
      - **When to use**: When one entity brings another into existence
      - **Example**: "Shakespeare" creates "Romeo and Juliet"
      
      ### uses
      - **Purpose**: Usage, utilization, or dependency relationship
      - **Direction**: user → used_entity
      - **When to use**: When one entity utilizes or depends on another
      - **Example**: "Development Team" uses "Docker"
      
      ### influences
      - **Purpose**: Impact, influence, or effect relationship
      - **Direction**: influencer → influenced_entity
      - **When to use**: When one entity affects or impacts another
      - **Example**: "Einstein" influences "Modern Physics"
      
      ### depends_on
      - **Purpose**: Strong dependency relationship
      - **Direction**: dependent → dependency
      - **When to use**: When one entity cannot function without another
      - **Example**: "Frontend Application" depends_on "Backend API"
      
      ### similar_to
      - **Purpose**: Similarity or comparison relationship
      - **Direction**: bidirectional (entity_a ↔ entity_b)
      - **When to use**: When entities share characteristics or serve similar purposes
      - **Example**: "Docker" similar_to "Podman"
      
      ### opposite_of
      - **Purpose**: Opposition, contrast, or antithetical relationship
      - **Direction**: bidirectional (entity_a ↔ entity_b)
      - **When to use**: When entities represent opposing concepts or approaches
      - **Example**: "Centralized System" opposite_of "Decentralized System"
      
      ## Type Selection Guide
      
      **If it's a person or individual** → person
      **If it's a group or institution** → organization
      **If it's a place or location** → location
      **If it's a time-bound occurrence** → event
      **If it's an abstract idea or theory** → concept
      **If it's a method or procedure** → workflow
      **If it's a concrete item or artifact** → object
      **If it's an objective or assignment** → task
      **If it's a user choice or setting** → preferences
      
      **For complex entities**: Use multiple types like ["person", "concept"] for influential thinkers
      
      ## Custom Types
      Additional custom types can be added beyond the 9 core types when needed for domain-specific use cases.
      `;
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