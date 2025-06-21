import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import crypto from "crypto";
import {
  QDRANT_URL,
  COLLECTION_NAME,
  OPENAI_API_KEY,
  QDRANT_API_KEY
} from "../config.js";
import { Entity, Relation } from "../types.js";

// Create custom Qdrant client that adds auth header
class CustomQdrantClient extends QdrantClient {
  constructor(url: string) {
    const parsed = new URL(url);
    super({
      url: `${parsed.protocol}//${parsed.hostname}`,
      port: parsed.port ? parseInt(parsed.port) : 6333,
      https: parsed.protocol === 'https:',
      apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.x6NrWBMMtPqcep5dNxOqjXT42sQhATAMdxEqVFDJKew',
      timeout: 60000,
      checkCompatibility: false
    });
  }

  // Override request method to log requests
  async getCollections() {
    const result = await super.getCollections();   
    return result;
  }
}

interface EntityPayload extends Entity {
  type: "entity";
}

interface QdrantCollectionConfig {
  params: {
    vectors: {
      size: number;
      distance: string;
    };
  };
}

interface QdrantCollectionInfo {
  config: QdrantCollectionConfig;
}

interface RelationPayload extends Relation {
  type: "relation";
}

type Payload = EntityPayload | RelationPayload;

function isEntity(payload: Payload): payload is EntityPayload {
  return (
    payload.type === "entity" &&
    typeof payload.name === "string" &&
    typeof payload.entityType === "string" &&
    Array.isArray(payload.observations) &&
    payload.observations.every((obs: unknown) => typeof obs === "string")
  );
}

function isRelation(payload: Payload): payload is RelationPayload {
  return (
    payload.type === "relation" &&
    typeof payload.from === "string" &&
    typeof payload.to === "string" &&
    typeof payload.relationType === "string"
  );
}

export class QdrantPersistence {
  private client: CustomQdrantClient;
  private openai: OpenAI;
  private initialized: boolean = false;

  constructor() {
    if (!QDRANT_URL) {
      throw new Error("QDRANT_URL environment variable is required");
    }

    // Validate QDRANT_URL format and protocol
    if (
      !QDRANT_URL.startsWith("http://") &&
      !QDRANT_URL.startsWith("https://")
    ) {
      throw new Error("QDRANT_URL must start with http:// or https://");
    }

    this.client = new CustomQdrantClient(QDRANT_URL);

    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }

  async connect() {
    if (this.initialized) return;

    // Add retry logic for initial connection with exponential backoff
    let retries = 3;
    let delay = 2000; // Start with 2 second delay

    while (retries > 0) {
      try {
        await this.client.getCollections();
        this.initialized = true;
        break;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown Qdrant error";
        console.error(`Connection attempt failed: ${message}`);
        console.error("Full error:", error);

        retries--;
        if (retries === 0) {
          throw new Error(
            `Failed to connect to Qdrant after multiple attempts: ${message}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  async initialize() {
    await this.connect();

    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const requiredVectorSize = 1536; // OpenAI embedding dimension

    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const collection = collections.collections.find(
        (c) => c.name === COLLECTION_NAME
      );

      if (!collection) {
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            size: requiredVectorSize,
            distance: "Cosine",
          },
        });
        return;
      }

      // Get collection info to check vector size
      const collectionInfo = (await this.client.getCollection(
        COLLECTION_NAME
      )) as QdrantCollectionInfo;
      const currentVectorSize = collectionInfo.config?.params?.vectors?.size;

      if (!currentVectorSize) {
        await this.recreateCollection(requiredVectorSize);
        return;
      }

      if (currentVectorSize !== requiredVectorSize) {
        await this.recreateCollection(requiredVectorSize);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Qdrant error";
      console.error("Failed to initialize collection:", message);
      throw new Error(
        `Failed to initialize Qdrant collection. Please check server logs for details: ${message}`
      );
    }
  }

  private async recreateCollection(vectorSize: number) {
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required in recreateCollection");
    }

    try {
      await this.client.deleteCollection(COLLECTION_NAME);
      await this.client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Qdrant error";
      throw new Error(`Failed to recreate collection: ${message}`);
    }
  }

  private async generateEmbedding(text: string) {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown OpenAI error";
      console.error("OpenAI embedding error:", message);
      throw new Error(`Failed to generate embeddings with OpenAI: ${message}`);
    }
  }

  private async hashString(str: string) {
    const hash = crypto.createHash("sha256");
    hash.update(str);
    const buffer = hash.digest();
    return buffer.readUInt32BE(0);
  }

  async persistEntity(entity: Entity) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    // Enhanced text generation for better embeddings
    let text = `${entity.name} (${entity.entityType}): ${entity.observations.join(". ")}`;
    
    // Include metadata content if available
    if (entity.metadata?.content) {
      text += ` Content: ${entity.metadata.content}`;
    }
    
    // Include domain and tags for better context
    if (entity.metadata?.domain) {
      text += ` Domain: ${entity.metadata.domain}`;
    }
    
    if (entity.metadata?.tags?.length) {
      text += ` Tags: ${entity.metadata.tags.join(", ")}`;
    }

    const vector = await this.generateEmbedding(text);
    const id = await this.hashString(entity.metadata?.id || entity.name);

    const payload = {
      type: "entity",
      ...entity,
      // Ensure metadata is properly included
      metadata: entity.metadata ? {
        ...entity.metadata,
        created_at: entity.metadata.created_at || new Date().toISOString()
      } : {
        created_at: new Date().toISOString()
      }
    };

    await this.client.upsert(COLLECTION_NAME, {
      points: [
        {
          id,
          vector,
          payload: payload as Record<string, unknown>,
        },
      ],
    });
  }

  async persistRelation(relation: Relation) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    // Enhanced text generation for relations
    let text = `${relation.from} ${relation.relationType} ${relation.to}`;
    
    // Include context and evidence if available
    if (relation.metadata?.context) {
      text += ` Context: ${relation.metadata.context}`;
    }
    
    if (relation.metadata?.evidence?.length) {
      text += ` Evidence: ${relation.metadata.evidence.join(". ")}`;
    }

    const vector = await this.generateEmbedding(text);
    const id = await this.hashString(
      `${relation.from}-${relation.relationType}-${relation.to}`
    );

    const payload = {
      type: "relation",
      ...relation,
      // Ensure metadata is properly included
      metadata: relation.metadata ? {
        ...relation.metadata,
        created_at: relation.metadata.created_at || new Date().toISOString()
      } : {
        created_at: new Date().toISOString()
      }
    };

    await this.client.upsert(COLLECTION_NAME, {
      points: [
        {
          id,
          vector,
          payload: payload as Record<string, unknown>,
        },
      ],
    });
  }

  async searchSimilar(query: string, limit: number = 10) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const queryVector = await this.generateEmbedding(query);

    const results = await this.client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit,
      with_payload: true,
    });

    const validResults: Array<Entity | Relation> = [];

    for (const result of results) {
      if (!result.payload) continue;

      const payload = result.payload as unknown as Payload;

      if (isEntity(payload)) {
        const { type, ...entity } = payload;
        validResults.push(entity);
      } else if (isRelation(payload)) {
        const { type, ...relation } = payload;
        validResults.push(relation);
      }
    }

    return validResults;
  }

  async deleteEntity(entityName: string) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const id = await this.hashString(entityName);
    await this.client.delete(COLLECTION_NAME, {
      points: [id],
    });
  }

  async deleteRelation(relation: Relation) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const id = await this.hashString(
      `${relation.from}-${relation.relationType}-${relation.to}`
    );
    await this.client.delete(COLLECTION_NAME, {
      points: [id],
    });
  }

  // Batch operations for meta-learning
  async batchPersistEntities(entities: Entity[]) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const points = [];
    for (const entity of entities) {
      // Enhanced text generation for better embeddings
      let text = `${entity.name} (${entity.entityType}): ${entity.observations.join(". ")}`;
      
      if (entity.metadata?.content) {
        text += ` Content: ${entity.metadata.content}`;
      }
      
      if (entity.metadata?.domain) {
        text += ` Domain: ${entity.metadata.domain}`;
      }
      
      if (entity.metadata?.tags?.length) {
        text += ` Tags: ${entity.metadata.tags.join(", ")}`;
      }

      const vector = await this.generateEmbedding(text);
      const id = await this.hashString(entity.metadata?.id || entity.name);

      points.push({
        id,
        vector,
        payload: {
          type: "entity",
          ...entity,
          metadata: entity.metadata ? {
            ...entity.metadata,
            created_at: entity.metadata.created_at || new Date().toISOString()
          } : {
            created_at: new Date().toISOString()
          }
        } as Record<string, unknown>
      });
    }

    await this.client.upsert(COLLECTION_NAME, { points });
  }

  async batchPersistRelations(relations: Relation[]) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const points = [];
    for (const relation of relations) {
      let text = `${relation.from} ${relation.relationType} ${relation.to}`;
      
      if (relation.metadata?.context) {
        text += ` Context: ${relation.metadata.context}`;
      }
      
      if (relation.metadata?.evidence?.length) {
        text += ` Evidence: ${relation.metadata.evidence.join(". ")}`;
      }

      const vector = await this.generateEmbedding(text);
      const id = await this.hashString(
        `${relation.from}-${relation.relationType}-${relation.to}`
      );

      points.push({
        id,
        vector,
        payload: {
          type: "relation",
          ...relation,
          metadata: relation.metadata ? {
            ...relation.metadata,
            created_at: relation.metadata.created_at || new Date().toISOString()
          } : {
            created_at: new Date().toISOString()
          }
        } as Record<string, unknown>
      });
    }

    await this.client.upsert(COLLECTION_NAME, { points });
  }

  // Enhanced search with filters
  async searchWithFilters(query: string, filters?: any, limit: number = 10) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const queryVector = await this.generateEmbedding(query);
    
    // Build Qdrant filter conditions
    const filterConditions: any = {};
    
    if (filters) {
      const mustConditions: any[] = [];
      
      if (filters.entity_types?.length) {
        mustConditions.push({
          key: "entityType",
          match: {
            any: filters.entity_types
          }
        });
      }
      
      if (filters.domains?.length) {
        mustConditions.push({
          key: "metadata.domain",
          match: {
            any: filters.domains
          }
        });
      }
      
      if (filters.tags?.length) {
        mustConditions.push({
          key: "metadata.tags",
          match: {
            any: filters.tags
          }
        });
      }
      
      if (filters.date_range) {
        mustConditions.push({
          key: "metadata.created_at",
          range: {
            gte: filters.date_range.start,
            lte: filters.date_range.end
          }
        });
      }
      
      if (mustConditions.length > 0) {
        filterConditions.must = mustConditions;
      }
    }

    const searchParams: any = {
      vector: queryVector,
      limit,
      with_payload: true
    };
    
    if (Object.keys(filterConditions).length > 0) {
      searchParams.filter = filterConditions;
    }

    const results = await this.client.search(COLLECTION_NAME, searchParams);

    const validResults: Array<Entity | Relation> = [];
    for (const result of results) {
      if (!result.payload) continue;

      const payload = result.payload as unknown as Payload;

      if (isEntity(payload)) {
        const { type, ...entity } = payload;
        validResults.push(entity);
      } else if (isRelation(payload)) {
        const { type, ...relation } = payload;
        validResults.push(relation);
      }
    }

    return validResults;
  }

  // Get relationships by type
  async getRelationshipsByType(relationshipType: string, limit: number = 100) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error("COLLECTION_NAME environment variable is required");
    }

    const results = await this.client.scroll(COLLECTION_NAME, {
      filter: {
        must: [
          {
            key: "type",
            match: { value: "relation" }
          },
          {
            key: "relationType",
            match: { value: relationshipType }
          }
        ]
      },
      limit,
      with_payload: true
    });

    const relationships: Relation[] = [];
    for (const result of results.points) {
      if (!result.payload) continue;
      
      const payload = result.payload as unknown as Payload;
      if (isRelation(payload)) {
        const { type, ...relation } = payload;
        relationships.push(relation);
      }
    }

    return relationships;
  }
}
