# Code Style and Conventions

## TypeScript Configuration
- **Target**: ES2020 with NodeNext modules
- **Module System**: ES modules (`"type": "module"` in package.json)
- **Strict Mode**: Enabled with strict type checking
- **Output**: `dist/` directory with declarations
- **Executable**: Uses shebang `#!/usr/bin/env node` and chmod +x

## Naming Conventions
- **Classes**: PascalCase (e.g., `KnowledgeGraphManager`, `QdrantPersistence`)
- **Methods/Functions**: camelCase (e.g., `addEntities`, `searchSimilar`)
- **Interfaces**: PascalCase (e.g., `Entity`, `Relation`, `SearchFilters`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MEMORY_FILE_PATH`, `COLLECTION_NAME`)
- **Types**: PascalCase with descriptive names (e.g., `MetaLearningEntityType`)

## Code Organization
- **Separation of Concerns**: Distinct modules for types, validation, persistence, and core logic
- **Error Handling**: Comprehensive try-catch with meaningful error messages
- **Async/Await**: Consistent use throughout, proper error propagation
- **Validation**: Input validation with typed schemas before processing

## File Structure
- `src/index.ts` - Main server implementation and KnowledgeGraphManager
- `src/types.ts` - All TypeScript interfaces and type definitions
- `src/validation.ts` - Input validation functions
- `src/persistence/qdrant.ts` - Vector database integration
- `src/config.ts` - Environment variable configuration

## Metadata Patterns
- **Timestamps**: ISO 8601 format (`new Date().toISOString()`)
- **IDs**: Prefixed strings (e.g., `ml_001`, `pr_001`, `val_001`)
- **Strength**: 0.0-1.0 range for relationship confidence
- **Content Preservation**: Exact content stored separately from observations