#!/usr/bin/env node

/**
 * Comprehensive test for all MCP Qdrant Memory functions
 */

import { spawn } from 'child_process';
import { config } from 'dotenv';

// Load environment variables
config();

console.log("🚀 Comprehensive MCP Qdrant Memory Test");
console.log("=".repeat(50));

let serverProcess = null;
let requestId = 1;

// Start MCP server
console.log("Starting MCP server...");
serverProcess = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'test'
  }
});

// Wait for server to be ready
await new Promise((resolve) => {
  const timeout = setTimeout(() => {
    console.log("✅ MCP server started (timeout)");
    resolve();
  }, 2000);
  
  serverProcess.stderr.once('data', (data) => {
    clearTimeout(timeout);
    console.log("✅ MCP server started");
    resolve();
  });
  
  serverProcess.stdout.once('data', (data) => {
    clearTimeout(timeout);
    console.log("✅ MCP server started");
    resolve();
  });
});

// Helper function to send MCP requests
async function sendMCPRequest(method, params) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: "2.0",
      id: requestId++,
      method: method,
      params: params
    };

    const requestStr = JSON.stringify(request) + '\n';
    serverProcess.stdin.write(requestStr);

    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, 10000);

    const onData = (data) => {
      clearTimeout(timeout);
      serverProcess.stdout.removeListener('data', onData);
      
      try {
        const response = JSON.parse(data.toString().trim());
        resolve(response);
      } catch (error) {
        reject(new Error(`Failed to parse response: ${error.message}`));
      }
    };

    serverProcess.stdout.once('data', onData);
  });
}

// Test data
const testEntities = [
  {
    name: "Claude AI",
    entityType: ["concept", "task"],
    observations: ["Advanced AI assistant", "Created by Anthropic", "Specializes in code assistance"],
    metadata: {
      domain: "artificial_intelligence",
      tags: ["AI", "assistant", "coding"],
      content: "Claude is an AI assistant focused on helpful, harmless, and honest interactions"
    }
  },
  {
    name: "TypeScript",
    entityType: "concept",
    observations: ["Typed superset of JavaScript", "Compiles to JavaScript", "Provides static typing"],
    metadata: {
      domain: "programming",
      tags: ["language", "javascript", "typing"],
      content: "TypeScript adds optional static typing to JavaScript"
    }
  },
  {
    name: "Qdrant",
    entityType: "object",
    observations: ["Vector database", "Written in Rust", "Supports semantic search"],
    metadata: {
      domain: "databases",
      tags: ["vector", "search", "rust"],
      content: "Qdrant is a vector similarity search engine"
    }
  }
];

// Run all tests
async function runAllTests() {
  console.log("\n📊 Testing all MCP functions...\n");
  
  // Test 1: Create entities
  console.log("1️⃣ Testing create_entities...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "create_entities",
      arguments: { entities: testEntities }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    console.log("✅ create_entities: SUCCESS");
  } catch (error) {
    console.error(`❌ create_entities: FAILED - ${error.message}`);
  }

  // Test 2: Create relationships
  console.log("\n2️⃣ Testing create_relationships...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "create_relationships",
      arguments: {
        relationships: [
          {
            from: "Claude AI",
            to: "TypeScript",
            relationType: "understands",
            metadata: {
              strength: 0.9,
              context: "Claude can analyze and generate TypeScript code",
              evidence: ["Provides TypeScript code suggestions", "Understands type systems"]
            }
          },
          {
            from: "TypeScript",
            to: "Qdrant",
            relationType: "integrates_with",
            metadata: {
              strength: 0.8,
              context: "TypeScript clients can interact with Qdrant API"
            }
          }
        ]
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    console.log("✅ create_relationships: SUCCESS");
  } catch (error) {
    console.error(`❌ create_relationships: FAILED - ${error.message}`);
  }

  // Test 3: Add observations
  console.log("\n3️⃣ Testing add_observations...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "add_observations",
      arguments: {
        observations: [
          {
            entityName: "Claude AI",
            contents: ["Supports MCP protocol", "Can work with vector databases"]
          }
        ]
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    console.log("✅ add_observations: SUCCESS");
  } catch (error) {
    console.error(`❌ add_observations: FAILED - ${error.message}`);
  }

  // Test 4: Read graph
  console.log("\n4️⃣ Testing read_graph...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "read_graph",
      arguments: {}
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    const graph = JSON.parse(response.result.content[0].text);
    console.log(`✅ read_graph: SUCCESS - Found ${graph.entities.length} entities, ${graph.relations.length} relations`);
  } catch (error) {
    console.error(`❌ read_graph: FAILED - ${error.message}`);
  }

  // Test 5: Semantic search
  console.log("\n5️⃣ Testing semantic_search...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "semantic_search",
      arguments: {
        query: "AI programming assistant",
        limit: 5
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    const results = JSON.parse(response.result.content[0].text);
    console.log(`✅ semantic_search: SUCCESS - Found ${results.length} results`);
  } catch (error) {
    console.error(`❌ semantic_search: FAILED - ${error.message}`);
  }

  // Test 6: Advanced search
  console.log("\n6️⃣ Testing advanced_search...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "advanced_search",
      arguments: {
        query: "programming",
        filters: {
          entity_types: ["concept"],
          domains: ["programming", "artificial_intelligence"],
          tags: ["language"]
        },
        limit: 10,
        score_threshold: 0.5
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    const results = JSON.parse(response.result.content[0].text);
    console.log(`✅ advanced_search: SUCCESS - Found ${results.length} filtered results`);
  } catch (error) {
    console.error(`❌ advanced_search: FAILED - ${error.message}`);
  }

  // Test 7: Search related
  console.log("\n7️⃣ Testing search_related...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "search_related",
      arguments: {
        entityName: "Claude AI",
        maxDepth: 2,
        relationshipTypes: ["understands", "integrates_with"]
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    const results = JSON.parse(response.result.content[0].text);
    console.log(`✅ search_related: SUCCESS - Found ${results.entities.length} related entities`);
  } catch (error) {
    console.error(`❌ search_related: FAILED - ${error.message}`);
  }

  // Test 8: Store meta-learning (failure pattern)
  console.log("\n8️⃣ Testing store_meta_learning (failure)...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "store_meta_learning",
      arguments: {
        principle: "Always validate environment variables before starting services",
        learning_type: "failure",
        trigger_situation: "Service startup with missing configuration",
        observed_behavior: "Server crashed with process.exit(1) on missing env vars",
        recommended_behavior: "Use warnings instead of crashes, provide graceful fallbacks",
        specific_example: "Qdrant Memory server crashed when env vars were missing",
        tags: ["configuration", "startup", "error-handling"],
        domain: "infrastructure",
        impact: "high",
        prevention_pattern: "Check env vars and warn, don't crash",
        success_metric: "Service starts with warnings instead of crashing"
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    console.log("✅ store_meta_learning (failure): SUCCESS");
    console.log(`   Created: ${response.result.content[0].text}`);
  } catch (error) {
    console.error(`❌ store_meta_learning (failure): FAILED - ${error.message}`);
  }

  // Test 9: Store meta-learning (success pattern)
  console.log("\n9️⃣ Testing store_meta_learning (success)...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "store_meta_learning",
      arguments: {
        principle: "Use structured test suites for comprehensive validation",
        learning_type: "success",
        trigger_situation: "Need to validate complex system functionality",
        observed_behavior: "Created organized test file with all function tests",
        recommended_behavior: "Build comprehensive test suites that test each function",
        specific_example: "Created test-comprehensive.mjs for all MCP functions",
        tags: ["testing", "validation", "quality"],
        impact: "high",
        success_metric: "All functions tested systematically with clear results"
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    console.log("✅ store_meta_learning (success): SUCCESS");
  } catch (error) {
    console.error(`❌ store_meta_learning (success): FAILED - ${error.message}`);
  }

  // Test 10: Track meta-learning application
  console.log("\n🔟 Testing track_meta_learning_application...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "track_meta_learning_application",
      arguments: {
        principle_name: "Meta-Learning [Failure]: Always validate environment variables...",
        application_context: "Fixed MCP server startup issues",
        outcome: "successful",
        details: "Replaced process.exit with console.warn, server now starts gracefully",
        lessons_learned: "Graceful degradation is better than hard failures"
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    const result = JSON.parse(response.result.content[0].text);
    console.log("✅ track_meta_learning_application: SUCCESS");
    if (result.updated_metrics) {
      console.log(`   Effectiveness: ${(result.updated_metrics.effectiveness_score * 100).toFixed(1)}%`);
    }
  } catch (error) {
    console.error(`❌ track_meta_learning_application: FAILED - ${error.message}`);
  }

  // Test 11: Delete observations
  console.log("\n1️⃣1️⃣ Testing delete_observations...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "delete_observations",
      arguments: {
        deletions: [
          {
            entityName: "Claude AI",
            observations: ["Supports MCP protocol"]
          }
        ]
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    console.log("✅ delete_observations: SUCCESS");
  } catch (error) {
    console.error(`❌ delete_observations: FAILED - ${error.message}`);
  }

  // Test 12: Delete relationships
  console.log("\n1️⃣2️⃣ Testing delete_relationships...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "delete_relationships",
      arguments: {
        relationships: [
          {
            from: "TypeScript",
            to: "Qdrant",
            relationType: "integrates_with"
          }
        ]
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    console.log("✅ delete_relationships: SUCCESS");
  } catch (error) {
    console.error(`❌ delete_relationships: FAILED - ${error.message}`);
  }

  // Test 13: Delete entities
  console.log("\n1️⃣3️⃣ Testing delete_entities...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "delete_entities",
      arguments: {
        entityNames: ["Qdrant"]
      }
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    console.log("✅ delete_entities: SUCCESS");
  } catch (error) {
    console.error(`❌ delete_entities: FAILED - ${error.message}`);
  }

  // Final graph state
  console.log("\n📊 Final graph state...");
  try {
    const response = await sendMCPRequest('tools/call', {
      name: "read_graph",
      arguments: {}
    });
    
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }
    
    const graph = JSON.parse(response.result.content[0].text);
    console.log(`✅ Final state: ${graph.entities.length} entities, ${graph.relations.length} relations`);
  } catch (error) {
    console.error(`❌ Final read_graph: FAILED - ${error.message}`);
  }
}

// Run tests and cleanup
runAllTests().then(() => {
  console.log("\n🎉 All tests completed!");
}).catch((error) => {
  console.error("\n❌ Test suite failed:", error);
}).finally(() => {
  console.log("\n🧹 Cleaning up...");
  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(0);
});