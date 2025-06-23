// Check for embedding provider configuration
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "openai";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;

// Set default models based on provider
function getDefaultModel(provider: string): string {
  switch (provider) {
    case "openai":
      return "text-embedding-ada-002";
    case "google":
      return "text-embedding-004";
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}

const FINAL_EMBEDDING_MODEL = EMBEDDING_MODEL || getDefaultModel(EMBEDDING_PROVIDER);

// Validate embedding provider configuration
if (EMBEDDING_PROVIDER === "openai") {
  if (!OPENAI_API_KEY) {
    console.warn("Warning: OPENAI_API_KEY environment variable is missing when using OpenAI embeddings");
  }
} else if (EMBEDDING_PROVIDER === "google") {
  if (!GOOGLE_API_KEY) {
    console.warn("Warning: GOOGLE_API_KEY environment variable is missing when using Google embeddings");
  }
} else {
  console.warn("Warning: EMBEDDING_PROVIDER must be either 'openai' or 'google'");
}

const QDRANT_URL = process.env.QDRANT_URL;
if (!QDRANT_URL) {
  console.warn("Warning: QDRANT_URL environment variable is required");
}

const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME;
if (!COLLECTION_NAME) {
  console.warn("Warning: QDRANT_COLLECTION_NAME environment variable is required");
}

const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
// Note: QDRANT_API_KEY is optional, so we don't check if it exists

// Neo4j configuration
const PERSISTENCE_TYPE = process.env.PERSISTENCE_TYPE || "json"; // "json" or "neo4j"
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const NEO4J_DATABASE = process.env.NEO4J_DATABASE;

// Validate Neo4j configuration if selected
if (PERSISTENCE_TYPE === "neo4j") {
  const missingVars = [];
  if (!NEO4J_URI) missingVars.push("NEO4J_URI");
  if (!NEO4J_USER) missingVars.push("NEO4J_USER");
  if (!NEO4J_PASSWORD) missingVars.push("NEO4J_PASSWORD");
  
  if (missingVars.length > 0) {
    console.warn(`Warning: Missing Neo4j environment variables: ${missingVars.join(", ")}. Falling back to JSON persistence.`);
  }
}

export { 
  EMBEDDING_PROVIDER,
  FINAL_EMBEDDING_MODEL,
  OPENAI_API_KEY, 
  GOOGLE_API_KEY,
  QDRANT_URL, 
  COLLECTION_NAME, 
  QDRANT_API_KEY,
  PERSISTENCE_TYPE,
  NEO4J_URI,
  NEO4J_USER,
  NEO4J_PASSWORD,
  NEO4J_DATABASE
};