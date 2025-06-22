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

  async searchSimilar(query: string, limit: number = 10): Promise<Array<Entity | Relation>> {
    // Ensure limit is a positive number
    const validLimit = Math.max(1, Math.min(limit, 100)); // Cap at 100 results
    return await this.persistence.searchSimilar(query, validLimit);
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
          description: "Create multiple new entities in the knowledge graph. Use for adding facts, concepts, people, places, organizations, documents, technologies, and processes. Input: {entities: [{name: string, entityType: string|string[], observations: string[], metadata?: object}]}. Entity types: person, concept, event, location, organization, document, technology, process. Custom types also supported.",
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
              description: "Detailed prompting instructions for memory tools",
              mimeType: "text/markdown"
            },
            {
              uri: "memory://advanced-usage-guide",
              name: "Advanced Usage Guide", 
              description: "Multi-type entities and advanced knowledge graph patterns",
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
  
          case "memory://advanced-usage-guide":
            return {
              contents: [{
                uri: request.params.uri,
                mimeType: "text/markdown", 
                text: this.getAdvancedUsageGuide()
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

## Quick Start - Essential Tools

### 1. create_entities
**PURPOSE**: Store new knowledge, facts, concepts, or learning patterns
**INPUT**: \`{entities: [{name: string, entityType: string|string[], observations: string[], metadata?: object}]}\`

**ENTITY TYPES**: Choose from 8 core types (person, concept, event, location, organization, document, technology, process). Custom types also supported.

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
    "entityType": ["technology", "process"],
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
**RELATIONSHIP TYPES**: validates, contradicts, builds_upon, connects_to, implements, derives_from
**EXAMPLE**:
\`\`\`json
{
  "relationships": [{
    "from": "Ebbinghaus Study",
    "to": "Spaced Repetition Principle", 
    "relationType": "validates",
    "metadata": {
      "strength": 0.9,
      "context": "Empirical evidence from memory experiments"
    }
  }]
}
\`\`\`

### 3. semantic_search
**PURPOSE**: Find semantically similar content using AI embeddings (searches vector database)
**INPUT**: \`{query: string, limit?: number}\`
**BEST FOR**: Discovering related concepts, exploring similar ideas
**EXAMPLE**: "memory techniques for better learning"

### 4. search_related
**PURPOSE**: Find connected entities via knowledge graph relationships (traverses graph structure)
**INPUT**: \`{entityName: string, maxDepth?: number, relationshipTypes?: string[]}\`
**BEST FOR**: Understanding how concepts connect, finding relationship chains
**EXAMPLE**:
\`\`\`json
{
  "entityName": "Spaced Repetition Principle",
  "maxDepth": 2,
  "relationshipTypes": ["validates", "builds_upon"]
}
\`\`\`

## Management Tools

### 5. add_observations
**PURPOSE**: Add new insights to existing entities
**INPUT**: \`{observations: [{entityName: string, contents: string[]}]}\`

### 6. read_graph
**PURPOSE**: View complete knowledge graph
**INPUT**: \`{}\` (no parameters)

### 7. delete_entities
**PURPOSE**: Remove entities and all their relationships
**INPUT**: \`{entityNames: string[]}\`

### 8. delete_observations
**PURPOSE**: Remove specific observations from entities
**INPUT**: \`{deletions: [{entityName: string, observations: string[]}]}\`

### 9. delete_relationships
**PURPOSE**: Remove specific relationships between entities
**INPUT**: \`{relationships: [{from: string, to: string, relationType: string}]}\`

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
    
      private getAdvancedUsageGuide(): string {
        return `# Advanced Usage Guide

## Overview
Use the 9 core tools to build rich knowledge graphs. The system supports 8 entity types with full multi-type functionality for complex knowledge representation.

## Multi-Type Entity Strategy

### Common Multi-Type Combinations

#### person + concept
- **Use**: For influential thinkers whose ideas are concepts themselves
- **Example**: ["person", "concept"] for "Albert Einstein" (both the person and his conceptual contributions)

#### technology + process  
- **Use**: For tools that are also methodologies
- **Example**: ["technology", "process"] for "Docker" (both software and deployment methodology)

#### document + event
- **Use**: For important publications that are also historical events
- **Example**: ["document", "event"] for "Declaration of Independence" (both a document and historical event)

#### organization + location
- **Use**: For institutions tied to specific places
- **Example**: ["organization", "location"] for "MIT" (both an institution and a place)

### Single Entity Types

#### person
- **Purpose**: People, individuals, characters, historical figures
- **Examples**: "Marie Curie", "John Doe", "Shakespeare"
- **Best for**: When the focus is on the individual rather than their ideas

#### concept
- **Purpose**: Abstract ideas, theories, principles, mental models
- **Examples**: "Democracy", "Machine Learning", "Supply and Demand"
- **Best for**: Theoretical or abstract knowledge

#### event
- **Purpose**: Historical events, occurrences, incidents, milestones
- **Examples**: "World War II", "2008 Financial Crisis", "Product Launch"
- **Best for**: Time-bound occurrences

#### location
- **Purpose**: Places, geographical entities, venues, virtual spaces
- **Examples**: "New York City", "Office Building", "Cloud Infrastructure"
- **Best for**: Physical or virtual places

#### organization
- **Purpose**: Companies, institutions, groups, teams
- **Examples**: "Microsoft", "Harvard University", "Development Team"
- **Best for**: Structured groups of people

#### document
- **Purpose**: Books, papers, articles, records, files
- **Examples**: "Research Paper", "User Manual", "Meeting Notes"
- **Best for**: Information artifacts

#### technology
- **Purpose**: Tools, systems, platforms, software
- **Examples**: "Kubernetes", "Neural Networks", "Programming Language"
- **Best for**: Technical tools and systems

#### process
- **Purpose**: Methods, procedures, workflows, algorithms
- **Examples**: "Code Review Process", "Scientific Method", "Customer Onboarding"
- **Best for**: Systematic approaches and procedures

## Relationship Types

### relates_to
- **Purpose**: General connection between entities
- **Example**: "Einstein" relates_to "Theory of Relativity"

### part_of
- **Purpose**: Hierarchical relationship (component → container)
- **Example**: "Marketing Team" part_of "Sales Organization"

### creates
- **Purpose**: Creation or authorship relationship
- **Example**: "Shakespeare" creates "Romeo and Juliet"

### uses
- **Purpose**: Usage or dependency relationship
- **Example**: "Development Team" uses "Docker"

### influences
- **Purpose**: Impact or influence relationship
- **Example**: "Einstein" influences "Modern Physics"

### depends_on
- **Purpose**: Dependency relationship
- **Example**: "Frontend Application" depends_on "Backend API"

### similar_to
- **Purpose**: Similarity relationship
- **Example**: "Docker" similar_to "Podman"

### opposite_of
- **Purpose**: Opposition or contrast relationship
- **Example**: "Centralized System" opposite_of "Decentralized System"

## Workflow Patterns

### Pattern 1: Building Knowledge Networks
1. **create_entities**: Add core concepts as single types
2. **create_entities**: Add related people, documents, technologies
3. **create_relationships**: Connect with appropriate relationship types
4. **search_related**: Explore connections

### Pattern 2: Multi-Type Entity Modeling
1. **create_entities**: Use multi-type entities for complex concepts
2. **add_observations**: Enrich with detailed information
3. **semantic_search**: Find similar multi-faceted entities
4. **create_relationships**: Connect different aspects

### Pattern 3: Domain Knowledge Mapping
1. **create_entities**: Map domain concepts, people, tools
2. **create_relationships**: Show how they interact
3. **read_graph**: Get complete domain picture
4. **add_observations**: Update with new insights

## Example: Complete Workflow with Multi-Types

\`\`\`json
// 1. Create multi-type entity
{
  "entities": [{
    "name": "Docker",
    "entityType": ["technology", "process"],
    "observations": [
      "Containerization platform for applications",
      "Standard deployment methodology in DevOps"
    ]
  }]
}

// 2. Add supporting entities
{
  "entities": [
    {
      "name": "Kubernetes",
      "entityType": "technology", 
      "observations": ["Container orchestration platform"]
    },
    {
      "name": "DevOps Team",
      "entityType": "organization",
      "observations": ["Team responsible for deployment infrastructure"]
    }
  ]
}

// 3. Create relationships
{
  "relationships": [
    {
      "from": "Kubernetes",
      "to": "Docker",
      "relationType": "uses"
    },
    {
      "from": "DevOps Team", 
      "to": "Docker",
      "relationType": "uses"
    }
  ]
}
\`\`\`
`;
      }
    
      private getEntityTypesReference(): string {
        return `# Entity Types Reference

## Available Entity Types

### Entity Types (8 Core Types)

#### person
- **Purpose**: People, individuals, characters, historical figures
- **Examples**: "Albert Einstein", "Marie Curie", "John Smith"
- **Multi-type example**: ["person", "concept"] for influential thinkers
- **When to use**: For any individual human being, real or fictional

#### concept
- **Purpose**: Abstract ideas, theories, principles, mental models
- **Examples**: "Democracy", "Machine Learning", "Supply and Demand"
- **Multi-type example**: ["concept", "process"] for methodological concepts
- **When to use**: For theoretical or abstract knowledge

#### event
- **Purpose**: Historical events, occurrences, incidents, milestones
- **Examples**: "World War II", "2008 Financial Crisis", "Product Launch"
- **Multi-type example**: ["event", "process"] for procedural events
- **When to use**: For time-bound occurrences or happenings

#### location
- **Purpose**: Places, geographical entities, venues, virtual spaces
- **Examples**: "New York City", "Office Building", "Cloud Infrastructure"
- **Multi-type example**: ["location", "organization"] for corporate headquarters
- **When to use**: For physical or virtual places

#### organization
- **Purpose**: Companies, institutions, groups, teams
- **Examples**: "Microsoft", "Harvard University", "Development Team"
- **Multi-type example**: ["organization", "technology"] for tech companies
- **When to use**: For structured groups of people

#### document
- **Purpose**: Books, papers, articles, records, files
- **Examples**: "Research Paper", "User Manual", "Meeting Notes"
- **Multi-type example**: ["document", "event"] for historic documents
- **When to use**: For information artifacts and written materials

#### technology
- **Purpose**: Tools, systems, platforms, software, methodologies
- **Examples**: "Docker", "Neural Networks", "Agile Methodology"
- **Multi-type example**: ["technology", "process"] for systematic tools
- **When to use**: For technical tools, systems, and platforms

#### process
- **Purpose**: Methods, procedures, workflows, algorithms
- **Examples**: "Code Review Process", "Scientific Method", "Customer Onboarding"
- **Multi-type example**: ["process", "technology"] for automated processes
- **When to use**: For systematic approaches and procedures

### Multiple Entity Types
Entities can have multiple types for richer categorization:
\`\`\`json
{
  "name": "Docker",
  "entityType": ["technology", "process"],
  "observations": ["Containerization platform and deployment methodology"]
}
\`\`\`

### Custom Types
Additional custom types can be added beyond the 8 core types when needed for domain-specific use cases.

## Best Practices

### Naming Conventions
- Use clear, descriptive names: "Spaced Repetition Principle" not "Spacing"
- Be specific: "Ebbinghaus 1885 Forgetting Curve Study" not "Memory Study"
- Include key identifiers when relevant: "Roediger Butler 2011 Meta-Analysis"

### Observations
- Include specific, actionable details
- Use concrete examples and measurable outcomes
- Provide context for application
- Reference original sources when applicable

### Metadata
- **domain**: Learning area (e.g., "cognitive_psychology", "educational_methods")
- **tags**: Relevant keywords for discoverability
- **content**: Preserve exact original content
- **created_at**: Timestamp for tracking
- **id**: Unique identifier (auto-generated)

## Entity Type Selection Guide

**If it's a person or individual** → person
**If it's an abstract idea or theory** → concept  
**If it's a time-bound occurrence** → event
**If it's a place or location** → location
**If it's a group or institution** → organization
**If it's written material or artifact** → document
**If it's a tool or system** → technology
**If it's a method or procedure** → process

**For complex entities**: Use multiple types like ["person", "concept"] for influential thinkers
`;
      }
    
      private getRelationshipTypesReference(): string {
        return `# Relationship Types Reference

## Available Relationship Types

### relates_to
- **Purpose**: General connection between entities
- **Direction**: bidirectional (entity_a ↔ entity_b)
- **When to use**: For general relationships that don't fit other specific categories
- **Example**: "Einstein" relates_to "Theory of Relativity"
- **Metadata**: Include nature of connection, context

### part_of  
- **Purpose**: Hierarchical relationship (component is part of container)
- **Direction**: component → container
- **When to use**: When one entity is a component or subset of another
- **Example**: "Marketing Team" part_of "Sales Organization"
- **Metadata**: Include hierarchical context, percentage if relevant

### creates
- **Purpose**: Creation, authorship, or origination relationship
- **Direction**: creator → created_entity
- **When to use**: When one entity brings another into existence
- **Example**: "Shakespeare" creates "Romeo and Juliet"
- **Metadata**: Include creation date, context, method

### uses
- **Purpose**: Usage, utilization, or dependency relationship
- **Direction**: user → used_entity
- **When to use**: When one entity utilizes or depends on another
- **Example**: "Development Team" uses "Docker"
- **Metadata**: Include usage context, frequency, purpose

### influences
- **Purpose**: Impact, influence, or effect relationship
- **Direction**: influencer → influenced_entity
- **When to use**: When one entity affects or impacts another
- **Example**: "Einstein" influences "Modern Physics"
- **Metadata**: Include type of influence, degree, timeframe

### depends_on
- **Purpose**: Strong dependency relationship
- **Direction**: dependent → dependency
- **When to use**: When one entity cannot function without another
- **Example**: "Frontend Application" depends_on "Backend API"
- **Metadata**: Include criticality, type of dependency

### similar_to
- **Purpose**: Similarity or comparison relationship
- **Direction**: bidirectional (entity_a ↔ entity_b)
- **When to use**: When entities share characteristics or serve similar purposes
- **Example**: "Docker" similar_to "Podman"
- **Metadata**: Include similarities, differences, comparison criteria

### opposite_of
- **Purpose**: Opposition, contrast, or antithetical relationship
- **Direction**: bidirectional (entity_a ↔ entity_b)
- **When to use**: When entities represent opposing concepts or approaches
- **Example**: "Centralized System" opposite_of "Decentralized System"
- **Metadata**: Include nature of opposition, context

## Strength Guidelines

### 0.9-1.0: Very Strong
- Multiple high-quality studies
- Consistent replication
- Strong theoretical basis

### 0.7-0.8: Strong  
- Good empirical support
- Some replication
- Clear logical connection

### 0.5-0.6: Moderate
- Limited evidence
- Some theoretical support
- Contextual relationship

### 0.3-0.4: Weak
- Minimal evidence
- Speculative connection
- Context-dependent

## Best Practices

### Choosing Relationship Types
1. **Start specific**: Use validates, contradicts, implements when applicable
2. **Fall back to general**: Use connects_to for unclear relationships
3. **Consider direction**: Most relationships have a natural direction
4. **Check existing**: Use search_related to see existing relationship patterns

### Setting Strength Scores
- Base on evidence quality, not personal opinion
- Consider replication and sample sizes
- Account for context dependencies
- Update as new evidence emerges

### Metadata Guidelines
- **strength**: 0.0-1.0 numerical score
- **context**: Why this relationship exists
- **evidence**: Supporting facts or studies
- **created_at**: Timestamp
- **confidence**: Your confidence in this relationship

## Relationship Selection Guide

**Strong empirical support** → validates
**Clear opposition/contradiction** → contradicts  
**Technique puts principle into practice** → implements
**Advanced builds on basic** → builds_upon
**Logical development** → derives_from
**General connection** → connects_to
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