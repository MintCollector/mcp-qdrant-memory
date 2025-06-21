# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that provides persistent knowledge graph functionality with semantic search capabilities. It combines file-based storage with Qdrant vector database for semantic search using OpenAI embeddings.

## Development Commands

### Build and Development
- `npm run build` - Compiles TypeScript to JavaScript and makes output executable
- `npm run prepare` - Runs build (used by npm install)
- `npm run watch` - Watches TypeScript files for changes and rebuilds

### Testing
- `node test.mjs` - Direct test without authentication
- `node test-auth.mjs` - Test with authentication
- `node test-direct.mjs` - Direct Qdrant client test
- `node test-meta-learning.mjs` - Comprehensive meta-learning functionality test

## Architecture

### Core Components

1. **KnowledgeGraphManager** (`src/index.ts:31-158`) - Main business logic
   - Manages dual persistence (file + vector database)
   - Handles entity and relation operations
   - Coordinates between file storage and Qdrant

2. **QdrantPersistence** (`src/persistence/qdrant.ts:75-334`) - Vector database integration
   - Manages Qdrant client with custom authentication
   - Generates OpenAI embeddings for semantic search
   - Handles collection initialization and vector operations

3. **MemoryServer** (`src/index.ts:167-462`) - MCP server implementation
   - Exposes 15 tools for knowledge graph operations (8 core + 7 meta-learning)
   - Handles request validation and error management
   - Uses stdio transport for communication

### Data Flow

1. **Dual Persistence Strategy**:
   - File storage (`memory.json`) - Complete graph structure for fast access
   - Qdrant vectors - Semantic embeddings for similarity search
   - Both systems stay synchronized on all operations

2. **Enhanced Embedding Generation**:
   - Entities: `"${name} (${entityType}): ${observations.join('. ')} Content: ${metadata.content} Domain: ${metadata.domain} Tags: ${metadata.tags.join(', ')}"`
   - Relations: `"${from} ${relationType} ${to} Context: ${metadata.context} Evidence: ${metadata.evidence.join('. ')}"`
   - Uses OpenAI `text-embedding-ada-002` model (1536 dimensions)
   - Metadata enhances semantic search quality

3. **Search Process**:
   - Query → OpenAI embedding → Qdrant similarity search → Results
   - Advanced filtering by entity type, domain, tags, date ranges
   - Hybrid search combines vector similarity with graph traversal

4. **Meta-Learning Support**:
   - Entity types: `meta_learning`, `principle`, `validation`, `failure_mode`, `general`
   - Relationship types: `validates`, `contradicts`, `builds_upon`, `connects_to`, `implements`, `derives_from`
   - Metadata tracking for content preservation and analysis

### Configuration

Required environment variables:
- `OPENAI_API_KEY` - For generating embeddings
- `QDRANT_URL` - Qdrant server URL (HTTP/HTTPS supported)
- `QDRANT_COLLECTION_NAME` - Collection name to use
- `QDRANT_API_KEY` - Optional authentication

The server validates all required environment variables at startup in `src/config.ts`.

### MCP Tools

The server exposes 15 tools for knowledge graph operations:

**Core Operations:**
- `create_entities` - Create multiple entities
- `create_relations` - Create relations between entities  
- `add_observations` - Add observations to existing entities
- `delete_entities` - Delete entities and their relations
- `delete_observations` - Delete specific observations
- `delete_relations` - Delete specific relations
- `read_graph` - Get the complete knowledge graph
- `search_similar` - Semantic search with configurable limit

**Meta-Learning Extensions:**
- `save_memories_with_relationships` - Batch create memories and relationships atomically
- `batch_create_relationships` - Create multiple relationships in one operation
- `analyze_memory_connections` - Analyze connection patterns for specific memory
- `get_relationships_by_type` - Get all relationships of a specific type
- `find_relationship_chains` - Discover relationship chains (A→B→C)
- `search_with_filters` - Enhanced search with type/date/relationship filters
- `hybrid_search` - Vector similarity + graph traversal combined

### Error Handling

- Connection retry with exponential backoff for Qdrant
- Comprehensive request validation with typed schemas
- Graceful handling of missing files and collections
- Proper MCP error responses with error codes

### TypeScript Configuration

- Uses ES2020 target with NodeNext modules
- Outputs to `dist/` directory with declarations
- Strict type checking enabled
- Uses ES modules (`"type": "module"` in package.json)