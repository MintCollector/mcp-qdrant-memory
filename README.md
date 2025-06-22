# MCP Memory Server with Qdrant Persistence
[![smithery badge](https://smithery.ai/badge/@delorenj/mcp-qdrant-memory)](https://smithery.ai/server/@delorenj/mcp-qdrant-memory)

This MCP server provides a knowledge graph implementation with semantic search capabilities powered by Qdrant vector database.

## Features

- Graph-based knowledge representation with entities and relations
- **Automatic UUID & Timestamp Management**:
  - Auto-generated UUIDs for all entities and relationships
  - Automatic `created_at` and `updated_at` timestamps
  - Guaranteed data integrity and traceability
- **Dual Persistence Options**:
  - **JSON**: File-based persistence (memory.json) - Default
  - **Neo4j**: Graph database with advanced querying capabilities
- Semantic search using Qdrant vector database
- **Dual Embedding Providers**:
  - OpenAI embeddings (text-embedding-ada-002, text-embedding-3-small/large)
  - Google embeddings (text-embedding-004, textembedding-gecko)
- HTTPS support with reverse proxy compatibility
- Docker support for easy deployment
- Advanced graph traversal and analytics (Neo4j mode)

## Environment Variables

The following environment variables are required:

```bash
# Persistence type: 'json' or 'neo4j' (default: 'json')
PERSISTENCE_TYPE=json

# Embedding provider: 'openai' or 'google' (default: 'openai')
EMBEDDING_PROVIDER=openai

# Embedding model (optional, defaults based on provider)
EMBEDDING_MODEL=text-embedding-ada-002

# For OpenAI embeddings
OPENAI_API_KEY=your-openai-api-key

# For Google embeddings
GOOGLE_API_KEY=your-google-api-key

# Qdrant server URL (supports both HTTP and HTTPS)
QDRANT_URL=https://your-qdrant-server

# Qdrant API key (if authentication is enabled)
QDRANT_API_KEY=your-qdrant-api-key

# Name of the Qdrant collection to use
QDRANT_COLLECTION_NAME=your-collection-name

# Neo4j configuration (only required if PERSISTENCE_TYPE=neo4j)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-neo4j-password
NEO4J_DATABASE=neo4j
```

## Supported Embedding Models

### OpenAI Models
- `text-embedding-ada-002` (1536 dimensions) - Default
- `text-embedding-3-small` (1536 dimensions) 
- `text-embedding-3-large` (3072 dimensions)

### Google Models  
- `text-embedding-004` (768 dimensions) - Default for Google
- `textembedding-gecko` (768 dimensions)

The system automatically detects vector dimensions and recreates the Qdrant collection when switching between models with different dimensions.

## Setup

### Local Setup

1. Install dependencies:
```bash
npm install
```

2. Build the server:
```bash
npm run build
```

### Docker Setup

1. Build the Docker image:
```bash
docker build -t mcp-qdrant-memory .
```

2. Run the Docker container with required environment variables:
```bash
docker run -d \
  -e OPENAI_API_KEY=your-openai-api-key \
  -e QDRANT_URL=http://your-qdrant-server:6333 \
  -e QDRANT_COLLECTION_NAME=your-collection-name \
  -e QDRANT_API_KEY=your-qdrant-api-key \
  --name mcp-qdrant-memory \
  mcp-qdrant-memory
```

### Add to MCP settings:

#### For JSON Persistence + OpenAI Embeddings:
```json
{
  "mcpServers": {
    "memory": {
      "command": "/bin/zsh",
      "args": ["-c", "cd /path/to/server && node dist/index.js"],
      "env": {
        "PERSISTENCE_TYPE": "json",
        "EMBEDDING_PROVIDER": "openai",
        "EMBEDDING_MODEL": "text-embedding-ada-002",
        "OPENAI_API_KEY": "your-openai-api-key",
        "QDRANT_API_KEY": "your-qdrant-api-key",
        "QDRANT_URL": "http://your-qdrant-server:6333",
        "QDRANT_COLLECTION_NAME": "your-collection-name"
      },
      "alwaysAllow": [
        "create_entities",
        "create_relationships",
        "add_observations",
        "delete_entities",
        "delete_observations",
        "delete_relationships",
        "read_graph",
        "semantic_search",
        "search_related"
      ]
    }
  }
}
```

#### For Neo4j Persistence + Google Embeddings:
```json
{
  "mcpServers": {
    "memory": {
      "command": "/bin/zsh",
      "args": ["-c", "cd /path/to/server && node dist/index.js"],
      "env": {
        "PERSISTENCE_TYPE": "neo4j",
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-neo4j-password",
        "NEO4J_DATABASE": "neo4j",
        "EMBEDDING_PROVIDER": "google",
        "EMBEDDING_MODEL": "text-embedding-004",
        "GOOGLE_API_KEY": "your-google-api-key",
        "QDRANT_API_KEY": "your-qdrant-api-key",
        "QDRANT_URL": "http://your-qdrant-server:6333",
        "QDRANT_COLLECTION_NAME": "your-collection-name"
      },
      "alwaysAllow": [
        "create_entities",
        "create_relationships",
        "add_observations",
        "delete_entities",
        "delete_observations",
        "delete_relationships",
        "read_graph",
        "semantic_search",
        "search_related"
      ]
    }
  }
}
```

## Tools

### Entity Management
- `create_entities`: Create multiple new entities
- `create_relationships`: Create relationships between entities
- `add_observations`: Add observations to entities
- `delete_entities`: Delete entities and their relationships
- `delete_observations`: Delete specific observations
- `delete_relationships`: Delete specific relationships
- `read_graph`: Get the full knowledge graph

### Search & Discovery
- `semantic_search`: Search for semantically similar entities and relationships (vector database)
- `search_related`: Find connected entities through graph traversal (supports both JSON and Neo4j)
  ```typescript
  interface SearchParams {
    query: string;     // Search query text
    limit?: number;    // Max results (default: 10)
  }
  ```

## Implementation Details

The server supports two persistence modes with semantic search capabilities:

### JSON Persistence Mode (Default)
1. **File-based** (memory.json):
   - Complete knowledge graph structure
   - Fast access to full graph
   - Used for graph operations

2. **Qdrant Vector DB**:
   - Semantic embeddings of entities and relations
   - Enables similarity search
   - Automatically synchronized with file storage

### Neo4j Persistence Mode
1. **Neo4j Graph Database**:
   - Native graph storage and operations
   - Advanced Cypher query capabilities
   - ACID transactions and data integrity
   - Efficient graph traversal algorithms
   - Built-in graph analytics (clustering, shortest paths, etc.)

2. **Qdrant Vector DB**:
   - Semantic embeddings for similarity search
   - Automatically synchronized with Neo4j

### Automatic Metadata Management
All entities and relationships automatically receive:
- **Unique IDs**: Auto-generated UUIDs for guaranteed uniqueness
- **Created Timestamp**: `created_at` set when first created
- **Updated Timestamp**: `updated_at` updated on every modification
- **Data Integrity**: Consistent metadata across both persistence layers

Example entity with auto-generated metadata:
```json
{
  "name": "My Knowledge Item",
  "entityType": "concept",
  "observations": ["Important information"],
  "metadata": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-06-21T23:03:12.126Z",
    "updated_at": "2025-06-21T23:03:12.126Z",
    "domain": "learning",
    "tags": ["important"]
  }
}
```

### Neo4j Advanced Features
When using Neo4j persistence, additional capabilities include:
- **Custom Cypher Queries**: Execute arbitrary graph queries
- **Shortest Path Finding**: Optimized pathfinding between entities
- **Graph Analytics**: Clustering coefficient, node degree analysis
- **Performance**: Optimized for large-scale graph operations
- **ACID Transactions**: Data consistency and reliability

### Synchronization

**JSON Mode**: When entities or relations are modified:
1. Changes are written to memory.json
2. Embeddings are generated using configured provider (OpenAI/Google)
3. Vectors are stored in Qdrant
4. Both storage systems remain consistent

**Neo4j Mode**: When entities or relations are modified:
1. Changes are written to Neo4j database
2. Embeddings are generated using configured provider (OpenAI/Google)
3. Vectors are stored in Qdrant
4. Both storage systems remain consistent

### Search Process

When searching:
1. Query text is converted to embedding
2. Qdrant performs similarity search
3. Results include both entities and relations
4. Results are ranked by semantic similarity

## Example Usage

```typescript
// Create entities
await client.callTool("create_entities", {
  entities: [{
    name: "Project",
    entityType: "Task",
    observations: ["A new development project"]
  }]
});

// Create relationships  
await client.callTool("create_relationships", {
  relationships: [{
    from: "Project",
    to: "Development Team",
    relationType: "assigned_to"
  }]
});

// Search similar concepts
const results = await client.callTool("semantic_search", {
  query: "development tasks",
  limit: 5
});

// Find related entities through graph traversal
const related = await client.callTool("search_related", {
  entityName: "Project",
  maxDepth: 2,
  relationshipTypes: ["assigned_to", "depends_on"]
});
```

## HTTPS and Reverse Proxy Configuration

The server supports connecting to Qdrant through HTTPS and reverse proxies. This is particularly useful when:
- Running Qdrant behind a reverse proxy like Nginx or Apache
- Using self-signed certificates
- Requiring custom SSL/TLS configurations

### Setting up with a Reverse Proxy

1. Configure your reverse proxy (example using Nginx):
```nginx
server {
    listen 443 ssl;
    server_name qdrant.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:6333;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

2. Update your environment variables:
```bash
QDRANT_URL=https://qdrant.yourdomain.com
```

### Security Considerations

The server implements robust HTTPS handling with:
- Custom SSL/TLS configuration
- Proper certificate verification options
- Connection pooling and keepalive
- Automatic retry with exponential backoff
- Configurable timeouts

### Troubleshooting HTTPS Connections

If you experience connection issues:

1. Verify your certificates:
```bash
openssl s_client -connect qdrant.yourdomain.com:443
```

2. Test direct connectivity:
```bash
curl -v https://qdrant.yourdomain.com/collections
```

3. Check for any proxy settings:
```bash
env | grep -i proxy
```

## Troubleshooting

### Common Setup Issues

#### Neo4j Configuration Error
**Error**: `NEO4J_USER environment variable is required when using Neo4j persistence`

**Solution**: This happens when `PERSISTENCE_TYPE=neo4j` is set but Neo4j variables are incomplete. You have two options:

1. **Use JSON persistence (recommended for most users)**:
   ```json
   {
     "env": {
       "PERSISTENCE_TYPE": "json",
       "EMBEDDING_PROVIDER": "openai",
       "OPENAI_API_KEY": "your-key",
       "QDRANT_URL": "your-qdrant-url",
       "QDRANT_COLLECTION_NAME": "your-collection"
     }
   }
   ```

2. **Complete Neo4j setup** (requires Neo4j database):
   ```json
   {
     "env": {
       "PERSISTENCE_TYPE": "neo4j",
       "NEO4J_URI": "bolt://localhost:7687",
       "NEO4J_USER": "neo4j", 
       "NEO4J_PASSWORD": "your-neo4j-password",
       "NEO4J_DATABASE": "neo4j",
       "EMBEDDING_PROVIDER": "openai",
       "OPENAI_API_KEY": "your-key",
       "QDRANT_URL": "your-qdrant-url",
       "QDRANT_COLLECTION_NAME": "your-collection"
     }
   }
   ```

#### Quick Fix for Most Users
If you're getting Neo4j errors and just want the system to work, add this to your MCP config:
```json
"PERSISTENCE_TYPE": "json"
```

This will use the reliable file-based storage instead of Neo4j.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT