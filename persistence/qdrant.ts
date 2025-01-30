import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import https from 'https';
import type { OutgoingHttpHeaders, RequestOptions } from 'http';
import { Entity, Relation } from '../types.js';
import { QDRANT_URL, COLLECTION_NAME, OPENAI_API_KEY, QDRANT_API_KEY } from '../config.js';

// Custom fetch implementation using Node's HTTPS module
async function customFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const headers: OutgoingHttpHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (options.headers) {
      // Convert headers from RequestInit to OutgoingHttpHeaders
      Object.entries(options.headers).forEach(([key, value]) => {
        if (value) headers[key] = value.toString();
      });
    }

    const requestOptions: RequestOptions = {
      method: options.method || 'GET',
      hostname: urlObj.hostname,
      port: urlObj.port || urlObj.protocol === 'https:' ? 443 : 80,
      path: `${urlObj.pathname}${urlObj.search}`,
      headers,
      timeout: 60000,
      agent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
        timeout: 60000
      })
    };

    const req = https.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const response = {
          ok: res.statusCode && res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode || 500,
          statusText: res.statusMessage || '',
          headers: new Headers(Object.entries(res.headers).reduce((acc, [key, value]) => {
            if (key && value) acc[key] = Array.isArray(value) ? value.join(', ') : value;
            return acc;
          }, {} as Record<string, string>)),
          json: async () => JSON.parse(body),
          text: async () => body
        } as Response;
        resolve(response);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// Override global fetch for the Qdrant client
if (typeof globalThis !== 'undefined') {
  (globalThis as any).fetch = customFetch;
}

interface EntityPayload extends Entity {
  type: 'entity';
}

interface RelationPayload extends Relation {
  type: 'relation';
}

type QdrantPayload = EntityPayload | RelationPayload;

function isEntity(payload: Record<string, unknown>): payload is Entity {
  return (
    typeof payload.name === 'string' &&
    typeof payload.entityType === 'string' &&
    Array.isArray(payload.observations) &&
    payload.observations.every(obs => typeof obs === 'string')
  );
}

function isRelation(payload: Record<string, unknown>): payload is Relation {
  return (
    typeof payload.from === 'string' &&
    typeof payload.to === 'string' &&
    typeof payload.relationType === 'string'
  );
}

export class QdrantPersistence {
  private client: QdrantClient;
  private openai: OpenAI;
  private initialized: boolean = false;

  constructor() {
    // Validate QDRANT_URL format and protocol
    if (!QDRANT_URL.startsWith('http://') && !QDRANT_URL.startsWith('https://')) {
      throw new Error('QDRANT_URL must start with http:// or https://');
    }
    
    
    this.client = new QdrantClient({ 
      url: QDRANT_URL,
      timeout: 60000,
      apiKey: QDRANT_API_KEY,
      checkCompatibility: false
    });

    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }

  async connect(): Promise<void> {
    if (this.initialized) return;


    // Add retry logic for initial connection with exponential backoff
    let retries = 3;
    let delay = 2000; // Start with 2 second delay
    
    while (retries > 0) {
      try {
        const collections = await this.client.getCollections();
        this.initialized = true;
        break;
      } catch (error: unknown) {
        console.error('Connection attempt failed:', error instanceof Error ? error.message : error);
        console.error('Full error:', error);
        
        retries--;
        if (retries === 0) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          throw new Error(`Failed to connect to Qdrant after 3 attempts: ${errorMessage}`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  async initialize(): Promise<void> {
    await this.connect();

    try {
      await this.client.getCollection(COLLECTION_NAME);
    } catch {
      // Collection doesn't exist, create it
      try {
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            size: 1536, // OpenAI embedding dimension
            distance: 'Cosine'
          }
        });
      } catch (error) {
        console.error('Error creating collection:', error);
        throw error;
      }
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });
    return response.data[0].embedding;
  }

  private async hashString(str: string): Promise<number> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return new DataView(new Uint8Array(hashArray.slice(0, 4)).buffer).getUint32(0);
  }

  async persistEntity(entity: Entity): Promise<void> {
    await this.connect();
    const text = `${entity.name} (${entity.entityType}): ${entity.observations.join('. ')}`;
    const vector = await this.generateEmbedding(text);
    const id = await this.hashString(entity.name);

    const payload: Record<string, unknown> = {
      type: 'entity' as const,
      ...entity
    };

    await this.client.upsert(COLLECTION_NAME, {
      points: [{
        id,
        vector,
        payload
      }]
    });
  }

  async persistRelation(relation: Relation): Promise<void> {
    await this.connect();
    const text = `${relation.from} ${relation.relationType} ${relation.to}`;
    const vector = await this.generateEmbedding(text);
    const id = await this.hashString(`${relation.from}-${relation.relationType}-${relation.to}`);

    const payload: Record<string, unknown> = {
      type: 'relation' as const,
      ...relation
    };

    await this.client.upsert(COLLECTION_NAME, {
      points: [{
        id,
        vector,
        payload
      }]
    });
  }

  async searchSimilar(query: string, limit: number = 10): Promise<Array<Entity | Relation>> {
    await this.connect();
    const queryVector = await this.generateEmbedding(query);
    
    const results = await this.client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit,
      with_payload: true
    });

    const validResults: Array<Entity | Relation> = [];

    for (const result of results) {
      const payload = result.payload as Record<string, unknown>;
      
      if (payload.type === 'entity' && isEntity(payload)) {
        const { type, ...entity } = payload;
        validResults.push(entity as Entity);
      } else if (payload.type === 'relation' && isRelation(payload)) {
        const { type, ...relation } = payload;
        validResults.push(relation as Relation);
      }
    }

    return validResults;
  }

  async deleteEntity(entityName: string): Promise<void> {
    await this.connect();
    const id = await this.hashString(entityName);
    await this.client.delete(COLLECTION_NAME, {
      points: [id]
    });
  }

  async deleteRelation(relation: Relation): Promise<void> {
    await this.connect();
    const id = await this.hashString(`${relation.from}-${relation.relationType}-${relation.to}`);
    await this.client.delete(COLLECTION_NAME, {
      points: [id]
    });
  }
}
