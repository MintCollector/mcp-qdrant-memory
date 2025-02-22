# Memory Management Plan (Knowledge Graph)

This document outlines the plan for managing memories within the `mcp-qdrant-memory` server, focusing on the knowledge graph functionality.

## 1. Collection Naming Convention

We will use the following naming convention for knowledge graph collections:

*   `project-name-knowledge-graph`: For the knowledge graph of a specific project.  For example, `website-knowledge-graph` for a project named "website".
*   `personal-knowledge-graph`: For personal knowledge graph data that is not tied to a specific project.

## 2. Automatic Context Switching (Directory-Based)

The `mcp-qdrant-memory` server will automatically infer the appropriate knowledge graph collection based on the current working directory:

*   If the current working directory is within a recognized project directory (e.g., `/home/delorenj/projects/my-project`), the server will use the corresponding `project-name-knowledge-graph` collection (e.g., `my-project-knowledge-graph`).
*   If the current working directory is *not* within a recognized project directory, the server will default to the `personal-knowledge-graph` collection.

## 3. Explicit Context Switching (Tool-Based)

The `mcp-qdrant-memory` server will provide a tool called `set_knowledge_graph_collection` to explicitly set the active knowledge graph collection.

*   **Tool Name:** `set_knowledge_graph_collection`
*   **Argument:** `collection_name` (string) - The name of the collection to switch to.
*   **Usage:** This tool is particularly useful when the working directory is static (e.g., in Claude Desktop) and cannot be used for automatic context switching. It allows the user to explicitly specify which knowledge graph collection should be used. The server will prioritize the explicitly set collection over the directory-based default.

## 4. Implementation

The `mcp-qdrant-memory` server will be modified to:

* Accept a `collection_name` argument in its configuration, allowing for a default collection to be specified.
* Implement the `set_knowledge_graph_collection` tool.
* Implement the automatic context switching logic, prioritizing any explicitly set collection (via the tool) over the directory-based inference.
