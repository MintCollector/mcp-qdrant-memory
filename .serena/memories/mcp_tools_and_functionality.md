# MCP Tools and Functionality

## Core MCP Tools (8 tools)
1. **create_entities** - Create multiple entities with metadata
2. **create_relations** - Create relations between entities
3. **add_observations** - Add observations to existing entities
4. **delete_entities** - Delete entities and their relations
5. **delete_observations** - Delete specific observations
6. **delete_relations** - Delete specific relations
7. **read_graph** - Get the complete knowledge graph
8. **search_similar** - Semantic search with configurable limit

## Meta-Learning Extensions (7 tools)
9. **save_memories_with_relationships** - Batch create memories and relationships atomically
10. **batch_create_relationships** - Create multiple relationships in one operation
11. **analyze_memory_connections** - Analyze connection patterns for specific memory
12. **get_relationships_by_type** - Get all relationships of a specific type
13. **find_relationship_chains** - Discover relationship chains (A→B→C)
14. **search_with_filters** - Enhanced search with type/date/relationship filters
15. **hybrid_search** - Vector similarity + graph traversal combined

## Entity Types (Meta-Learning)
- `meta_learning` - Learning patterns and techniques
- `principle` - Fundamental learning principles
- `validation` - Research validation and evidence
- `failure_mode` - Common learning failures
- `general` - General purpose entities

## Relationship Types (Meta-Learning)
- `validates` - Evidence supports a principle
- `contradicts` - Evidence contradicts a principle/pattern
- `builds_upon` - One concept builds on another
- `connects_to` - General connection between concepts
- `implements` - Implementation of a principle
- `derives_from` - Derivation relationship

## Data Flow
1. **Input** → Validation → KnowledgeGraphManager
2. **File Storage** ↔ **Qdrant Vectors** (synchronized)
3. **Search**: Query → OpenAI embedding → Qdrant similarity → Results