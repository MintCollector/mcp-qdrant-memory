import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import https from 'https';
import http from 'http';
import { QDRANT_URL, COLLECTION_NAME, OPENAI_API_KEY, QDRANT_API_KEY } from '../config.js';
import { Entity, Relation } from '../types.js';

// Custom fetch implementation using Node's HTTP/HTTPS modules
async function customFetch(url: string, options: RequestInit = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const headers: { [key: string]: string } = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        if (value) headers[key] = value.toString();
      });
    }

    const requestOptions: http.RequestOptions = {
      method: options.method || 'GET',
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search}`,
      headers,
      timeout: 60000
    };

    // Choose http or https module based on protocol
    const protocol = urlObj.protocol === 'https:' ? https : http;
    if (urlObj.protocol === 'https:') {
      requestOptions.agent = new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
        timeout: 60000
      });
    } else {
      requestOptions.agent = new http.Agent({
        keepAlive: true,
        timeout: 60000
      });
    }

    const req = protocol.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const response = {
          ok: res.statusCode && res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode || 500,
          statusText: res.statusMessage || '',
          headers: new Headers(Object.entries(res.headers).reduce((acc, [key, value]) => {
            if (key && value) acc[key] = Array.isArray(value) ? value.join(', ') : value;
            return acc;
          }, {} as { [key: string]: string })),
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

type Payload = EntityPayload | RelationPayload;

function isEntity(payload: Payload): payload is EntityPayload {
  return (
    payload.type === 'entity' &&
    typeof payload.name === 'string' &&
    typeof payload.entityType === 'string' &&
    Array.isArray(payload.observations) &&
    payload.observations.every((obs: unknown) => typeof obs === 'string')
  );
}

function isRelation(payload: Payload): payload is RelationPayload {
  return (
    payload.type === 'relation' &&
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
    if (!QDRANT_URL) {
      throw new Error('QDRANT_URL environment variable is required');
    }

    // Validate QDRANT_URL format and protocol
    if (!QDRANT_URL.startsWith('http://') && !QDRANT_URL.startsWith('https://')) {
      throw new Error('QDRANT_URL must start with http:// or https://');
    }

    this.client = new QdrantClient({
      url: QDRANT_URL,
      timeout: 60000,
      apiKey: QDRANT_API_KEY
    });

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
        const collections = await this.client.getCollections();
        console.log('Connected to Qdrant successfully:', collections);
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

  async initialize() {
    await this.connect();

    if (!COLLECTION_NAME) {
      throw new Error('COLLECTION_NAME environment variable is required');
    }

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

  private async generateEmbedding(text: string) {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });
    return response.data[0].embedding;
  }

  private async hashString(str: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return new DataView(new Uint8Array(hashArray.slice(0, 4)).buffer).getUint32(0);
  }

  async persistEntity(entity: Entity) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error('COLLECTION_NAME environment variable is required');
    }

    const text = `${entity.name} (${entity.entityType}): ${entity.observations.join('. ')}`;
    const vector = await this.generateEmbedding(text);
    const id = await this.hashString(entity.name);

    const payload = {
      type: 'entity' as const,
      ...entity
    };

    await this.client.upsert(COLLECTION_NAME, {
      points: [{
        id,
        vector,
        payload: payload as Record<string, unknown>
      }]
    });
  }

  async persistRelation(relation: Relation) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error('COLLECTION_NAME environment variable is required');
    }

    const text = `${relation.from} ${relation.relationType} ${relation.to}`;
    const vector = await this.generateEmbedding(text);
    const id = await this.hashString(`${relation.from}-${relation.relationType}-${relation.to}`);

    const payload = {
      type: 'relation' as const,
      ...relation
    };

    await this.client.upsert(COLLECTION_NAME, {
      points: [{
        id,
        vector,
        payload: payload as Record<string, unknown>
      }]
    });
  }

  async searchSimilar(query: string, limit: number = 10) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error('COLLECTION_NAME environment variable is required');
    }

    const queryVector = await this.generateEmbedding(query);

    const results = await this.client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit,
      with_payload: true
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
      throw new Error('COLLECTION_NAME environment variable is required');
    }

    const id = await this.hashString(entityName);
    await this.client.delete(COLLECTION_NAME, {
      points: [id]
    });
  }

  async deleteRelation(relation: Relation) {
    await this.connect();
    if (!COLLECTION_NAME) {
      throw new Error('COLLECTION_NAME environment variable is required');
    }

    const id = await this.hashString(`${relation.from}-${relation.relationType}-${relation.to}`);
    await this.client.delete(COLLECTION_NAME, {
      points: [id]
    });
  }
}