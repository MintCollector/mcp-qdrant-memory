// Check for required environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable is required");
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

export { OPENAI_API_KEY, QDRANT_URL, COLLECTION_NAME, QDRANT_API_KEY };