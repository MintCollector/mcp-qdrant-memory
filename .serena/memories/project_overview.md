# MCP Qdrant Memory Server - Project Overview

## Purpose
This is an MCP (Model Context Protocol) server that provides persistent knowledge graph functionality with semantic search capabilities. It combines file-based storage with Qdrant vector database for semantic search using OpenAI embeddings.

## Key Features
- **Dual Persistence**: File-based storage (memory.json) + Qdrant vector database
- **Semantic Search**: Uses OpenAI embeddings for similarity search
- **Meta-Learning Support**: Specialized entity types and relationship types for learning patterns
- **Knowledge Graph**: Entities and relations with rich metadata
- **Batch Operations**: Efficient multi-entity/relationship creation
- **Advanced Analytics**: Connection analysis, relationship chains, hybrid search

## Tech Stack
- **Language**: TypeScript with ES modules
- **Runtime**: Node.js (ES2020 target)
- **Vector Database**: Qdrant (with custom client for auth)
- **Embeddings**: OpenAI text-embedding-ada-002 (1536 dimensions)
- **MCP SDK**: @modelcontextprotocol/sdk v1.0.1
- **Build Tool**: TypeScript compiler with shx for permissions
- **Package Manager**: npm

## Architecture
- **KnowledgeGraphManager**: Core business logic, dual persistence coordination
- **QdrantPersistence**: Vector database integration with custom auth
- **MemoryServer**: MCP server implementation with 15 tools
- **Types**: Comprehensive TypeScript interfaces for meta-learning
- **Validation**: Input validation with typed schemas