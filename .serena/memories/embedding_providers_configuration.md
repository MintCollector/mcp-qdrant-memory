# Embedding Providers Configuration

## Supported Providers
- **Google**: Uses Google's embedding models, requires GOOGLE_API_KEY
- **OpenAI**: Uses OpenAI's embedding models, requires OPENAI_API_KEY

## Environment Variables
- `EMBEDDING_PROVIDER`: Set to "google" or "openai" 
- `GOOGLE_API_KEY`: Required when EMBEDDING_PROVIDER=google
- `OPENAI_API_KEY`: Required when EMBEDDING_PROVIDER=openai (currently in .env but not actively used if Google is the provider)

## Current Configuration
- The .env file contains both API keys
- Google is likely the active embedding provider based on the error message
- When EMBEDDING_PROVIDER=google, the system uses Google's text-embedding-004 model by default