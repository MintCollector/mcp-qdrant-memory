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
  validateStoreMetaLearningRequest,
  validateTrackMetaLearningApplicationRequest,
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
          description: "Create multiple new entities in the knowledge graph. Use for adding people, organizations, locations, events, concepts, workflows, objects, tasks, and preferences. Input: {entities: [{name: string, entityType: string|string[], observations: string[], metadata?: {domain?: string, tags?: string[], content?: string}}]}. Entity types: person, organization, location, event, concept, workflow, object, task, preferences. Custom types also supported. Note: id, created_at, and updated_at are auto-generated.",
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
          description: "Create relationships between existing entities. Use for connecting concepts, facts, or learning patterns. Input: {relationships: [{from: string, to: string, relationType: string, metadata?: {strength?: number, context?: string, evidence?: string[]}}]}. Note: id, created_at, and updated_at are auto-generated.",
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
          description: "Find semantically similar entities and relationships using AI embeddings. Returns results in two categories: 'search_results' (all types, limited) and optionally 'general_meta_learnings' (ordered by relevance). Input: {query: string, limit?: number, include_general_meta_learnings?: boolean}",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { 
                type: "number",
                default: 10
              },
              include_general_meta_learnings: {
                type: "boolean",
                default: true,
                description: "Include general meta-learnings in response"
              }
            },
            required: ["query"]
          }
        },
        {
          name: "meta_learnings_get",
          description: "[META-LEARNINGS] Search and retrieve stored meta-learning insights, principles, and patterns. Returns results in two categories: 'search_specific' (limited by limit parameter) and 'general_context' (all general meta-learnings). Use for discovering lessons learned, best practices, and failure patterns. Input: {query: string, limit?: number, score_threshold?: number}",
          inputSchema: {
            type: "object",
            properties: {
              query: { 
                type: "string",
                description: "Search query for finding related meta-learnings"
              },
              limit: { 
                type: "number",
                default: 10,
                description: "Maximum number of results to return"
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
        },
        {
          name: "meta_learnings_store",
          description: "Capture systematic learnings from failures, successes, optimizations, or insights by extracting universal principles that improve future performance. Use is_general=true for learnings that apply to 90%+ of interactions (personality, communication style). Input: {principle: string, learning_type: 'failure'|'success'|'optimization'|'insight', trigger_situation: string, observed_behavior: string, recommended_behavior: string, specific_example: string, tags: string[], is_general?: boolean, domain?: string, impact?: 'low'|'medium'|'high'|'transformative', project_context?: string, prevention_pattern?: string, success_metric?: string}",
          inputSchema: {
            type: "object",
            properties: {
              principle: { type: "string" },
              learning_type: { 
                type: "string", 
                enum: ["failure", "success", "optimization", "insight"] 
              },
              trigger_situation: { type: "string" },
              observed_behavior: { type: "string" },
              recommended_behavior: { type: "string" },
              specific_example: { type: "string" },
              tags: { 
                type: "array", 
                items: { type: "string" } 
              },
              domain: { type: "string" },
              impact: { 
                type: "string", 
                enum: ["low", "medium", "high", "transformative"],
                default: "medium"
              },
              project_context: { type: "string" },
              prevention_pattern: { type: "string" },
              success_metric: { type: "string" },
              is_general: { 
                type: "boolean",
                description: "Set to true if this learning applies to 90%+ of user interactions (e.g., personality traits, communication style, general preferences)"
              }
            },
            required: ["principle", "learning_type", "trigger_situation", "observed_behavior", "recommended_behavior", "specific_example", "tags"]
          }
        },
        {
          name: "meta_learnings_track",
          description: "Track real-world application and effectiveness of stored meta-learning principles over time. Input: {principle_name: string, application_context: string, outcome: 'successful'|'failed'|'partially_successful', details: string, lessons_learned?: string}",
          inputSchema: {
            type: "object",
            properties: {
              principle_name: { type: "string" },
              application_context: { type: "string" },
              outcome: { 
                type: "string", 
                enum: ["successful", "failed", "partially_successful"] 
              },
              details: { type: "string" },
              lessons_learned: { type: "string" }
            },
            required: ["principle_name", "application_context", "outcome", "details"]
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
            const args = request.params.arguments as any;
            const query = args.query;
            const limit = args.limit || 10;
            const includeGeneralMeta = args.include_general_meta_learnings !== false; // Default true
            
            // Get search results for all entity types
            const searchResults = await this.graphManager.searchSimilar(
              query,
              limit
            );
            
            let response: any = {
              search_results: searchResults
            };
            
            // If requested, get general meta-learnings ordered by relevance
            if (includeGeneralMeta) {
              // Get all entities to find general meta-learnings
              const graph = await this.graphManager.getGraph();
              const generalMetaLearnings = graph.entities.filter(entity => {
                const isMetaLearning = Array.isArray(entity.entityType) 
                  ? entity.entityType.includes("meta_learning")
                  : entity.entityType === "meta_learning";
                const entityMetadata = entity.metadata as import('./types.js').EntityMetadata | undefined;
                const hasGeneralTag = entityMetadata?.tags?.includes("general");
                return isMetaLearning && hasGeneralTag;
              });
              
              // If we have general meta-learnings, search them for relevance
              if (generalMetaLearnings.length > 0) {
                // Use semantic search to order general meta-learnings by relevance
                const generalSearchResults = await this.graphManager.searchSimilar(
                  query,
                  generalMetaLearnings.length + 10 // Get extra to ensure we find all generals
                );
                
                // Filter to only include the general meta-learnings, maintaining order
                const orderedGeneralMeta = generalSearchResults.filter(result => {
                  return generalMetaLearnings.some(gm => gm.id === result.id);
                });
                
                response.general_meta_learnings = orderedGeneralMeta;
              } else {
                response.general_meta_learnings = [];
              }
            }
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }


          case "meta_learnings_get": {
            const args = validateSemanticSearchRequest(request.params.arguments);
            
            // Search for relevant meta-learnings
            const relevantResults = await this.graphManager.searchWithFilters(
              args.query,
              {
                entity_types: ["meta_learning"]
              },
              args.limit
            );
            
            // Get all entities to find general meta-learnings
            const graph = await this.graphManager.getGraph();
            const generalMetaLearnings = graph.entities.filter(entity => {
              const isMetaLearning = Array.isArray(entity.entityType) 
                ? entity.entityType.includes("meta_learning")
                : entity.entityType === "meta_learning";
              const entityMetadata = entity.metadata as import('./types.js').EntityMetadata | undefined;
              const hasGeneralTag = entityMetadata?.tags?.includes("general");
              return isMetaLearning && hasGeneralTag;
            });
            
            // Remove general items from search results to avoid duplicates
            const searchSpecificResults = relevantResults.filter(r => {
              const entityMetadata = r.metadata as import('./types.js').EntityMetadata | undefined;
              return !entityMetadata?.tags?.includes("general");
            });
            
            // Create structured response with separate categories
            const structuredResponse = {
              search_specific: searchSpecificResults,
              general_context: generalMetaLearnings
            };
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(structuredResponse, null, 2),
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

          case "meta_learnings_store": {
            const args = validateStoreMetaLearningRequest(request.params.arguments);
            const entityId = await this.storeMetaLearning(args);
            return {
              content: [
                {
                  type: "text",
                  text: `Meta-learning principle stored successfully with ID: ${entityId}`,
                },
              ],
            };
          }

          case "meta_learnings_track": {
            const args = validateTrackMetaLearningApplicationRequest(request.params.arguments);
            const result = await this.trackMetaLearningApplication(args);
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
      private async storeMetaLearning(params: import('./types.js').StoreMetaLearningRequest): Promise<string> {
        // Generate entity name with learning type prefix
        const prefix = {
          failure: "Meta-Learning [Failure]:",
          success: "Meta-Learning [Success]:",
          optimization: "Meta-Learning [Optimization]:",
          insight: "Meta-Learning [Insight]:"
        };
        
        const entityName = `${prefix[params.learning_type]} ${params.principle.substring(0, 40)}${params.principle.length > 40 ? '...' : ''}`;
        
        // Format observations with tracking metadata
        const observations = this.formatMetaLearningObservations(params);
        
        // Create the entity
        // Add "general" tag if is_general is true
        const tags = params.is_general ? [...params.tags, "general"] : params.tags;
        
        const entity = {
          name: entityName,
          entityType: 'meta_learning',
          observations,
          metadata: {
            domain: params.domain,
            tags: tags,
            content: params.principle
          } as import('./types.js').EntityMetadataInput
        };
        
        await this.graphManager.addEntities([entity as any]);
        
        // Create relationships if domain entities exist
        await this.createMetaLearningRelationships(entityName, params);
        
        return entityName;
      }
      
      private formatMetaLearningObservations(params: import('./types.js').StoreMetaLearningRequest): string[] {
        const baseObservations = [
          `PRINCIPLE: ${params.principle}`,
          `LEARNING_TYPE: ${params.learning_type}`,
          `TRIGGER: ${params.trigger_situation}`,
          `OBSERVED_BEHAVIOR: ${params.observed_behavior}`,
          `RECOMMENDED_BEHAVIOR: ${params.recommended_behavior}`,
          `EXAMPLE: ${params.specific_example}`,
          `TAGS: ${params.tags.join(', ')}`,
          `IMPACT: ${params.impact || 'medium'}`,
          `DISCOVERED: ${new Date().toISOString()}`,
          `TIMES_APPLIED: 0`,
          `TIMES_SUCCESSFUL: 0`,
          `TIMES_FAILED: 0`,
          `EFFECTIVENESS_SCORE: 0.0`,
          `LAST_APPLIED: never`,
          `APPLICATION_LOG: []`
        ];
    
        if (params.domain) {
          baseObservations.push(`DOMAIN: ${params.domain}`);
        }
        
        if (params.project_context) {
          baseObservations.push(`PROJECT_CONTEXT: ${params.project_context}`);
        }
        
        if (params.prevention_pattern) {
          baseObservations.push(`PREVENTION_PATTERN: ${params.prevention_pattern}`);
        }
        
        if (params.success_metric) {
          baseObservations.push(`SUCCESS_METRIC: ${params.success_metric}`);
        }
    
        // Add type-specific metadata
        switch (params.learning_type) {
          case 'success':
            baseObservations.push('SUCCESS_PATTERN: True');
            break;
          case 'optimization':
            baseObservations.push('OPTIMIZATION_METRIC: pending');
            break;
          case 'insight':
            baseObservations.push('INSIGHT_DEPTH: strategic');
            break;
          case 'failure':
            baseObservations.push('FAILURE_MODE: identified');
            break;
        }
    
        return baseObservations;
      }
      
      private async createMetaLearningRelationships(entityName: string, params: import('./types.js').StoreMetaLearningRequest): Promise<void> {
        const relationships = [];
    
        // Create domain relationships if domain entities exist and we have a domain
        if (params.domain) {
          try {
            const domainEntities = await this.graphManager.searchSimilar(`domain:${params.domain}`, 3);
            for (const result of domainEntities.slice(0, 2)) { // Limit to top 2 matches
              if (result.type === 'entity' && result.data) {
                const entity = result.data as import('./types.js').Entity;
                relationships.push({
                  from: entityName,
                  to: entity.name,
                  relationType: 'relates_to',
                  metadata: {
                    context: `Applied in ${params.domain} domain`,
                    strength: 0.8
                  } as import('./types.js').RelationshipMetadataInput
                });
              }
            }
          } catch (error) {
            // Ignore search errors for relationship creation
            console.warn('Failed to create domain relationships:', error);
          }
        }
    
        // Create impact relationships based on learning type
        if (params.learning_type === 'success' || params.learning_type === 'optimization') {
          const bestPracticesEntity = `Best Practices - ${params.tags[0] || 'General'}`;
          relationships.push({
            from: entityName,
            to: bestPracticesEntity,
            relationType: 'influences',
            metadata: {
              context: 'Positive pattern for replication',
              strength: params.impact === 'transformative' ? 1.0 : 0.7
            } as import('./types.js').RelationshipMetadataInput
          });
        }
    
        if (relationships.length > 0) {
          try {
            await this.graphManager.addRelations(relationships as any);
          } catch (error) {
            // Ignore relationship creation errors to not fail the main operation
            console.warn('Failed to create some meta-learning relationships:', error);
          }
        }
      }
      
      private async trackMetaLearningApplication(params: import('./types.js').TrackMetaLearningApplicationRequest): Promise<{success: boolean, message: string, updated_metrics?: any}> {
        try {
          // Find the meta-learning principle entity
          const graph = await this.graphManager.getGraph();
          const entity = graph.entities.find(e => e.name === params.principle_name);
          
          if (!entity) {
            return {
              success: false,
              message: `Meta-learning principle '${params.principle_name}' not found`
            };
          }
          
          // Parse current tracking metrics from observations
          const metrics = this.parseTrackingMetrics(entity.observations);
          
          // Update metrics based on outcome
          metrics.times_applied += 1;
          if (params.outcome === 'successful') {
            metrics.times_successful += 1;
          } else if (params.outcome === 'failed') {
            metrics.times_failed += 1;
          } else { // partially_successful
            metrics.times_successful += 0.5;
            metrics.times_failed += 0.5;
          }
          
          // Calculate new effectiveness score
          const totalOutcomes = metrics.times_successful + metrics.times_failed;
          metrics.effectiveness_score = totalOutcomes > 0 ? (metrics.times_successful / totalOutcomes) : 0.0;
          metrics.last_applied = new Date().toISOString();
          
          // Add to application log
          const logEntry = `${new Date().toISOString().split('T')[0]}: ${params.outcome.toUpperCase()} - ${params.application_context}: ${params.details}`;
          metrics.application_log.push(logEntry);
          
          // Update observations with new metrics
          const updatedObservations = this.updateTrackingObservations(entity.observations, metrics, params);
          
          // Update the entity
          await this.graphManager.addObservations(params.principle_name, updatedObservations);
          
          return {
            success: true,
            message: `Successfully tracked application of meta-learning principle`,
            updated_metrics: {
              times_applied: metrics.times_applied,
              times_successful: metrics.times_successful,
              times_failed: metrics.times_failed,
              effectiveness_score: Math.round(metrics.effectiveness_score * 100) / 100,
              last_applied: metrics.last_applied
            }
          };
          
        } catch (error) {
          return {
            success: false,
            message: `Failed to track meta-learning application: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
      
      private parseTrackingMetrics(observations: string[]): {
        times_applied: number;
        times_successful: number;
        times_failed: number;
        effectiveness_score: number;
        last_applied: string;
        application_log: string[];
      } {
        const metrics = {
          times_applied: 0,
          times_successful: 0,
          times_failed: 0,
          effectiveness_score: 0.0,
          last_applied: 'never',
          application_log: [] as string[]
        };
        
        for (const obs of observations) {
          if (obs.startsWith('TIMES_APPLIED: ')) {
            metrics.times_applied = parseInt(obs.replace('TIMES_APPLIED: ', '')) || 0;
          } else if (obs.startsWith('TIMES_SUCCESSFUL: ')) {
            metrics.times_successful = parseFloat(obs.replace('TIMES_SUCCESSFUL: ', '')) || 0;
          } else if (obs.startsWith('TIMES_FAILED: ')) {
            metrics.times_failed = parseFloat(obs.replace('TIMES_FAILED: ', '')) || 0;
          } else if (obs.startsWith('EFFECTIVENESS_SCORE: ')) {
            metrics.effectiveness_score = parseFloat(obs.replace('EFFECTIVENESS_SCORE: ', '')) || 0;
          } else if (obs.startsWith('LAST_APPLIED: ')) {
            metrics.last_applied = obs.replace('LAST_APPLIED: ', '');
          } else if (obs.startsWith('APPLICATION_LOG: ')) {
            const logStr = obs.replace('APPLICATION_LOG: ', '');
            try {
              metrics.application_log = logStr === '[]' ? [] : JSON.parse(logStr);
            } catch {
              metrics.application_log = [];
            }
          }
        }
        
        return metrics;
      }
      
      private updateTrackingObservations(observations: string[], metrics: any, params: import('./types.js').TrackMetaLearningApplicationRequest): string[] {
        const updatedObs = [...observations];
        
        // Update tracking metrics in observations
        for (let i = 0; i < updatedObs.length; i++) {
          if (updatedObs[i].startsWith('TIMES_APPLIED: ')) {
            updatedObs[i] = `TIMES_APPLIED: ${metrics.times_applied}`;
          } else if (updatedObs[i].startsWith('TIMES_SUCCESSFUL: ')) {
            updatedObs[i] = `TIMES_SUCCESSFUL: ${metrics.times_successful}`;
          } else if (updatedObs[i].startsWith('TIMES_FAILED: ')) {
            updatedObs[i] = `TIMES_FAILED: ${metrics.times_failed}`;
          } else if (updatedObs[i].startsWith('EFFECTIVENESS_SCORE: ')) {
            updatedObs[i] = `EFFECTIVENESS_SCORE: ${metrics.effectiveness_score}`;
          } else if (updatedObs[i].startsWith('LAST_APPLIED: ')) {
            updatedObs[i] = `LAST_APPLIED: ${metrics.last_applied}`;
          } else if (updatedObs[i].startsWith('APPLICATION_LOG: ')) {
            updatedObs[i] = `APPLICATION_LOG: ${JSON.stringify(metrics.application_log)}`;
          }
        }
        
        // Add new application details if lessons were learned
        if (params.lessons_learned) {
          updatedObs.push(`LESSONS_LEARNED: ${params.lessons_learned} (${new Date().toISOString().split('T')[0]})`);
        }
        
        return updatedObs;
      }
  
    private setupResourceHandlers() {
          // List available resources
          this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            return {
              resources: [
                {
                  uri: "memory://usage-guide",
                  name: "Memory System Usage Guide",
                  description: "Complete guide for using all 12 memory tools with examples and patterns",
                  mimeType: "text/markdown"
                },
                {
                  uri: "memory://types-reference",
                  name: "Types Reference",
                  description: "Complete reference for entity and relationship types (9 entity types, 8 relationship types)",
                  mimeType: "text/markdown"
                },
                {
                  uri: "memory://meta-learning-guide",
                  name: "Meta-Learning Guide",
                  description: "Advanced guide for systematic learning pattern capture and effectiveness tracking",
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
    
              case "memory://meta-learning-guide":
                return {
                  contents: [{
                    uri: request.params.uri,
                    mimeType: "text/markdown",
                    text: this.getMetaLearningGuide()
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
      
      ## Current Architecture (June 2025)
      - **12 MCP Tools Total**: 7 core management + 3 search + 2 meta-learning
      - **Dual Persistence**: JSON file (memory.json) + Qdrant vector database
      - **Multi-Provider Embeddings**: Google AI (text-embedding-004, 768 dims) or OpenAI (text-embedding-ada-002, 1536 dims)
      - **Entity Types**: 9 core types (person, organization, location, event, concept, workflow, object, task, preferences)
      - **Relationship Types**: 8 core types (relates_to, part_of, creates, uses, influences, depends_on, similar_to, opposite_of)
      
      ## Core Management Tools (7 tools)
      
      ### 1. create_entities
      **PURPOSE**: Store new knowledge, facts, concepts, or learning patterns
      **INPUT**: \`{entities: [{name: string, entityType: string|string[], observations: string[], metadata?: object}]}\`
      
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
      
      ### 3. add_observations
      **PURPOSE**: Add new insights to existing entities
      **INPUT**: \`{observations: [{entityName: string, contents: string[]}]}\`
      
      ### 4. read_graph
      **PURPOSE**: View complete knowledge graph
      **INPUT**: \`{}\` (no parameters)
      
      ### 5. delete_entities
      **PURPOSE**: Remove entities and all their relationships
      **INPUT**: \`{entityNames: string[]}\`
      
      ### 6. delete_observations
      **PURPOSE**: Remove specific observations from entities
      **INPUT**: \`{deletions: [{entityName: string, observations: string[]}]}\`
      
      ### 7. delete_relationships
      **PURPOSE**: Remove specific relationships between entities
      **INPUT**: \`{relationships: [{from: string, to: string, relationType: string}]}\`
      
      ## Search Tools (3 tools)
      
      ### 8. semantic_search
      **PURPOSE**: Find semantically similar content using AI embeddings (searches vector database)
      **INPUT**: \`{query: string, limit?: number, include_general_meta_learnings?: boolean}\`
      **OUTPUT STRUCTURE**: 
      \`\`\`json
      {
        "search_results": [...],           // All entity types (limited by limit parameter)
        "general_meta_learnings": [...]    // Optional: General meta-learnings ordered by relevance
      }
      \`\`\`
      **BEST FOR**: Discovering related concepts while keeping important context available
      **EXAMPLE**: Query "API design" returns API-related entities + relevant personality/preference meta-learnings
      
      ### 9. advanced_search
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
      
      ### 10. search_related
      **PURPOSE**: Find connected entities via knowledge graph relationships (traverses graph structure)
      **INPUT**: \`{entityName: string, maxDepth?: number, relationshipTypes?: string[]}\`
      **BEST FOR**: Understanding how concepts connect, finding relationship chains
      
      ## Meta-Learning Tools (3 tools)
      
      ### 10. meta_learnings_get
      **PURPOSE**: Search and retrieve stored meta-learning insights, principles, and patterns
      **INPUT**: \`{query: string, limit?: number, score_threshold?: number}\`
      **OUTPUT STRUCTURE**: 
      \`\`\`json
      {
        "search_specific": [...],  // Results matching your query (limited by limit parameter)
        "general_context": [...]   // All general meta-learnings (personality, preferences, etc.)
      }
      \`\`\`
      **BEST FOR**: Discovering lessons learned, best practices, and failure patterns
      
      ### 11. meta_learnings_store
      **PURPOSE**: Capture systematic learnings from failures, successes, optimizations, or insights
      **INPUT**: \`{principle: string, learning_type: 'failure'|'success'|'optimization'|'insight', trigger_situation: string, observed_behavior: string, recommended_behavior: string, specific_example: string, tags: string[], domain?: string, impact?: 'low'|'medium'|'high'|'transformative', project_context?: string, prevention_pattern?: string, success_metric?: string}\`
      **CREATES**: Special entity with name "Meta-Learning [Type]: [principle]"
      
      ### 12. meta_learnings_track
      **PURPOSE**: Track real-world application and effectiveness of stored meta-learning principles
      **INPUT**: \`{principle_name: string, application_context: string, outcome: 'successful'|'failed'|'partially_successful', details: string, lessons_learned?: string}\`
      **UPDATES**: Effectiveness metrics in existing meta-learning entities
      
      ## Search Strategy Guide
      
      ### When to use each search tool:
      - **semantic_search**: "Find concepts similar to X" (AI similarity + optional general meta-learnings)
      - **advanced_search**: "Find X with specific criteria" (AI + filtering)  
      - **search_related**: "Show me what connects to X" (graph traversal)
      
      ### Common Workflows:
      1. **Store new learning**: create_entities → create_relationships
      2. **Explore knowledge**: semantic_search → search_related → read_graph
      3. **Update knowledge**: add_observations → create_relationships
      4. **Meta-learning**: meta_learnings_store → meta_learnings_track → meta_learnings_get
      5. **Clean up**: delete_observations → delete_relationships → delete_entities
      
      ## Multi-Type Entity Strategy
      
      ### Common Multi-Type Combinations:
      - **person + concept**: For influential thinkers (e.g., "Albert Einstein")
      - **object + workflow**: For tools that are also methodologies (e.g., "Docker")
      - **object + event**: For important publications/historical items
      - **organization + location**: For institutions tied to places (e.g., "MIT")
      
      ## Current Environment
      - **Testing**: \`node test-meta-learning.mjs\` (comprehensive test for all 12 tools)
      - **Build**: \`npm run build\` (TypeScript compilation)
      - **Embedding Provider**: Configurable via EMBEDDING_PROVIDER environment variable
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
      
          private getMetaLearningGuide(): string {
              return `# Meta-Learning System Guide
      
      ## Overview
      The meta-learning system transforms ad-hoc learning into structured, trackable knowledge with real-world effectiveness measurement. It uses 2 specialized tools to capture systematic learning patterns and track their application success.
      
      ## Memory Management Guidelines
      
      ### What to Include:
      - Information from external sources (users, searches, tools)
      - Experimental results and validations
      - User preferences and feedback
      
      ### What to Exclude:
      - Internal reasoning without external validation
      - Unverified assumptions
      
      ### Common Triggers:
      - User explicitly confirms success/failure
      - User corrects or validates approach
      - Unexpected outcomes from actions
      - Pattern recognition across multiple interactions
      
      ## Learning Capture Framework
      
      1. **Apply 5 Why Analysis** - Dig deep to find root causes
      2. **Answer Each Question** - Be thorough in understanding
      3. **Identify success or failure pattern** - Categorize the learning
      4. **Lookup LLM best practices** - Ensure proper information storage
      5. **Store meta_learning in memory** - Create persistent knowledge
      
      ### Requirements for Good Meta-Learnings:
      - Focus on **MY behavior** (the assistant's actions)
      - Apply **across domains** (not just specific to one area)
      - Have **clear triggers** (when to apply this learning)
      - Be **actionable** (specific steps to take)
      - Target **categories**, not instances (patterns, not one-offs)
      - Store under GENERAL tag if it should apply to everything (90%+ of interactions)
      
      ## Meta-Learning Tools
      
      ### meta_learnings_store
      **PURPOSE**: Capture systematic learnings from failures, successes, optimizations, or insights
      **CREATES**: Special entity with name "Meta-Learning [Type]: [principle]"
      **TRACKS**: Times applied, times successful, effectiveness score, impact level
      
      **INPUT STRUCTURE**:
      \`\`\`json
      {
        "principle": "Clear, actionable principle statement",
        "learning_type": "failure|success|optimization|insight",
        "trigger_situation": "When this situation occurs",
        "observed_behavior": "What typically happens",
        "recommended_behavior": "What should happen instead",
        "specific_example": "Concrete example from experience",
        "tags": ["relevant", "tags"],
        "domain": "Optional domain classification",
        "impact": "low|medium|high|transformative",
        "project_context": "Optional project context",
        "prevention_pattern": "How to prevent (for failures)",
        "success_metric": "How to measure success",
        "is_general": true/false  // Set true for learnings that apply to 90%+ of interactions
      }
      \`\`\`
      
      **EXAMPLE - Failure Learning**:
      \`\`\`json
      {
        "principle": "Always validate API inputs before processing",
        "learning_type": "failure",
        "trigger_situation": "Receiving user input via API endpoints",
        "observed_behavior": "Processing raw input leads to security vulnerabilities",
        "recommended_behavior": "Implement comprehensive input validation with type checking",
        "specific_example": "SQL injection attack through unvalidated search parameter",
        "tags": ["security", "api", "validation"],
        "domain": "software_development",
        "impact": "high",
        "prevention_pattern": "Use validation middleware on all endpoints"
      }
      \`\`\`
      
      **EXAMPLE - Success Learning**:
      \`\`\`json
      {
        "principle": "Use pair programming for complex algorithm implementation",
        "learning_type": "success",
        "trigger_situation": "Implementing complex algorithms or critical business logic",
        "observed_behavior": "Pair programming reduces bugs and improves code quality",
        "recommended_behavior": "Schedule pair programming sessions for complex tasks",
        "specific_example": "Payment processing algorithm had zero bugs after pair programming",
        "tags": ["collaboration", "code_quality", "algorithms"],
        "domain": "software_development",
        "impact": "medium",
        "success_metric": "Bug reduction rate and code review feedback scores"
      }
      \`\`\`
      
      ### The "General" Tag System
      
      **Purpose**: Ensure critical meta-learnings are always available
      **Criteria**: Use is_general=true for learnings that apply to 90%+ of interactions
      **Examples**: 
      - User communication preferences (e.g., "prefers concise responses")
      - Personality traits (e.g., "values directness over diplomacy")  
      - General working style (e.g., "wants to see code first, explanation second")
      
      **How it works**:
      1. When storing with is_general=true, "general" is added to tags
      2. meta_learnings_get always returns all general-tagged learnings
      3. This ensures personality and style preferences are never forgotten
      
      ### meta_learnings_track
      **PURPOSE**: Track real-world application and effectiveness of stored principles
      **UPDATES**: Effectiveness metrics in existing meta-learning entities
      
      **INPUT STRUCTURE**:
      \`\`\`json
      {
        "principle_name": "Meta-Learning [Type]: [principle name]",
        "application_context": "Description of when/how principle was applied",
        "outcome": "successful|failed|partially_successful",
        "details": "Specific details about the application",
        "lessons_learned": "Optional additional insights gained"
      }
      \`\`\`
      
      **EXAMPLE - Tracking Application**:
      \`\`\`json
      {
        "principle_name": "Meta-Learning Failure: Always validate API inputs before processing",
        "application_context": "New user registration endpoint implementation",
        "outcome": "successful",
        "details": "Added comprehensive validation middleware, prevented 3 potential security issues during testing",
        "lessons_learned": "Validation middleware pattern scales well across multiple endpoints"
      }
      \`\`\`
      
      ## Learning Types
      
      ### failure
      - **Purpose**: Capture patterns that lead to problems
      - **Focus**: Prevention and avoidance
      - **Special Fields**: prevention_pattern
      - **Example**: Security vulnerabilities, performance issues, communication breakdowns
      
      ### success
      - **Purpose**: Capture patterns that work well
      - **Focus**: Replication and scaling
      - **Special Fields**: success_metric
      - **Example**: Effective processes, successful techniques, winning strategies
      
      ### optimization
      - **Purpose**: Capture improvements to existing approaches
      - **Focus**: Efficiency and enhancement
      - **Example**: Performance improvements, workflow optimizations, cost reductions
      
      ### insight
      - **Purpose**: Capture new understanding or perspective
      - **Focus**: Knowledge expansion and mental models
      - **Example**: Conceptual breakthroughs, pattern recognition, strategic insights
      
      ## Impact Levels
      
      ### transformative
      - **Definition**: Changes fundamental approach or understanding
      - **Example**: Adopting new architecture that solves class of problems
      
      ### high
      - **Definition**: Significant improvement in outcomes
      - **Example**: Security practice that prevents major vulnerabilities
      
      ### medium
      - **Definition**: Moderate improvement with measurable benefits
      - **Example**: Process improvement that saves time
      
      ### low
      - **Definition**: Small but worthwhile improvement
      - **Example**: Minor optimization or convenience improvement
      
      ## Effectiveness Tracking
      
      ### Automatic Metrics
      - **TIMES_APPLIED**: Counter of how many times principle was used
      - **TIMES_SUCCESSFUL**: Counter of successful applications
      - **EFFECTIVENESS_SCORE**: Calculated success rate (successful/applied)
      - **LAST_APPLIED**: Timestamp of most recent application
      
      ### Manual Assessment
      - **Impact Level**: Subjective assessment of principle's importance
      - **Domain**: Context where principle applies
      - **Tags**: Categorization for discovery
      
      ## Meta-Learning Workflow
      
      ### 1. Capture Learning
      1. Identify a systematic pattern from experience
      2. Use **meta_learnings_store** to create structured record
      3. Include specific example and clear principle statement
      4. Categorize with appropriate type and impact level
      
      ### 2. Apply Learning
      1. Encounter similar situation in future work
      2. Reference stored meta-learning principles
      3. Apply recommended behavior
      4. Observe outcomes
      
      ### 3. Track Effectiveness
      1. Use **meta_learnings_track** to record usage
      2. Document outcome (successful/failed/partially_successful)
      3. Add context and lessons learned
      4. System automatically updates effectiveness metrics
      
      ### 4. Analyze Patterns
      1. Use **semantic_search** to find related meta-learning principles
      2. Use **advanced_search** with entity_types: ["concept"] filter
      3. Use **search_related** to find connected learning patterns
      4. Review effectiveness scores to identify most valuable principles
      
      ## Integration with Core System
      
      ### Entity Creation
      - Meta-learning principles become entities with type "concept"
      - Names follow pattern: "Meta-Learning [Type]: [principle]"
      - Rich metadata includes all tracking information
      
      ### Relationship Building
      - Auto-creates relationships to domain entities
      - Connects to related concepts and best practices
      - Links failure patterns to success patterns
      
      ### Search Integration
      - Principles discoverable via semantic search
      - Filterable by learning type, domain, impact level
      - Trackable via effectiveness metrics
      
      ## Best Practices
      
      ### Writing Effective Principles
      1. **Be Specific**: Clear, actionable statements
      2. **Include Context**: When and where to apply
      3. **Provide Examples**: Concrete illustrations
      4. **Measure Impact**: Define success criteria
      
      ### Tracking Applications
      1. **Be Honest**: Record both successes and failures
      2. **Add Context**: Explain circumstances of application
      3. **Note Variations**: How application differed from original
      4. **Extract Insights**: What was learned from this application
      
      ### Building Learning Systems
      1. **Regular Review**: Periodically review stored principles
      2. **Pattern Recognition**: Look for connections between learnings
      3. **Effectiveness Analysis**: Focus on high-success principles
      4. **Continuous Improvement**: Update principles based on new experience
      
      This system creates a living, learning knowledge base that systematically improves performance through evidence-based meta-learning.
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