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
    console.error("Error: OPENAI_API_KEY environment variable is required when using OpenAI embeddings");
    process.exit(1);
  }
} else if (EMBEDDING_PROVIDER === "google") {
  if (!GOOGLE_API_KEY) {
    console.error("Error: GOOGLE_API_KEY environment variable is required when using Google embeddings");
    process.exit(1);
  }
} else {
  console.error("Error: EMBEDDING_PROVIDER must be either 'openai' or 'google'");
  process.exit(1);
}

const QDRANT_URL = process.env.QDRANT_URL;
if (!QDRANT_URL) {
  console.error("Error: QDRANT_URL environment variable is required");
  process.exit(1);
}

const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME;
if (!COLLECTION_NAME) {
  console.error("Error: QDRANT_COLLECTION_NAME environment variable is required");
  process.exit(1);
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
    console.error(`Error: Missing required Neo4j environment variables: ${missingVars.join(", ")}`);
    console.error("When using PERSISTENCE_TYPE=neo4j, you must provide:");
    console.error("  NEO4J_URI=bolt://localhost:7687");
    console.error("  NEO4J_USER=neo4j");
    console.error("  NEO4J_PASSWORD=your-password");
    console.error("  NEO4J_DATABASE=neo4j (optional)");
    console.error("");
    console.error("To use JSON persistence instead, set PERSISTENCE_TYPE=json or remove it entirely.");
    process.exit(1);
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