# Google Embeddings Integration

## What Was Added

### Multi-Provider Embedding Support
- Added Google's `text-embedding-004` model as an alternative to OpenAI
- Configurable via `EMBEDDING_PROVIDER` environment variable
- Automatic vector dimension handling (OpenAI: 1536, Google: 768)

### New Environment Variables
```bash
EMBEDDING_PROVIDER=google|openai  # Defaults to 'openai'
GOOGLE_API_KEY=your-google-api-key
GOOGLE_PROJECT_ID=your-google-project-id
```

### Implementation Details
- Updated `src/config.ts` with provider validation
- Modified `QdrantPersistence` class to support both providers
- Dynamic vector size configuration (1536 vs 768 dimensions)
- Automatic collection recreation when switching providers

### Google Integration Features
- Uses Google's Generative AI SDK (`@google/generative-ai`)
- `text-embedding-004` model (768 dimensions)
- Proper error handling and provider-specific error messages
- Backward compatibility with existing OpenAI configurations

### Testing
- Created `test-google-embeddings.mjs` for validation
- Tests embedding generation, dimensions, and multiple text inputs
- Verifies proper Google AI client initialization

### Benefits
- **Cost Efficiency**: Google embeddings may be more cost-effective
- **Provider Diversity**: Reduces dependency on single provider
- **Performance Options**: Different embedding characteristics
- **Easy Migration**: Simple environment variable change

### Usage Example
```json
{
  "mcpServers": {
    "memory": {
      "env": {
        "EMBEDDING_PROVIDER": "google",
        "GOOGLE_API_KEY": "your-key",
        "GOOGLE_PROJECT_ID": "your-project-id"
      }
    }
  }
}
```

### Migration Notes
- Switching providers requires collection recreation (different vector dimensions)
- Server automatically detects dimension mismatch and recreates collection
- Existing data is preserved in `memory.json` file
- No manual intervention required for provider switching