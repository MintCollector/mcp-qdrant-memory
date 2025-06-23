#!/usr/bin/env node

/**
 * Test for the new get_meta_learnings tool
 */

import { spawn } from 'child_process';
import { config } from 'dotenv';

// Load environment variables
config();

console.log("🚀 Testing get_meta_learnings Tool");
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
  serverProcess.stderr.once('data', (data) => {
    if (data.toString().includes('Memory MCP server running')) {
      console.log("✅ MCP server started");
      resolve();
    }
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

// First, create some meta-learning entities for testing
console.log("\n📝 Creating test meta-learning entities...");
try {
  const response = await sendMCPRequest('tools/call', {
    name: "create_entities",
    arguments: {
      entities: [
        {
          name: "Always validate API compatibility",
          entityType: "meta_learning",
          observations: ["Critical for API integrations", "Prevents wasted implementation effort"],
          metadata: {
            domain: "api-integration",
            tags: ["validation", "compatibility", "best-practice"],
            content: "Before implementing any API integration, verify version compatibility and available features"
          }
        },
        {
          name: "Context-aware error handling patterns",
          entityType: "meta_learning", 
          observations: ["Improves user experience", "Reduces debugging time"],
          metadata: {
            domain: "error-handling",
            tags: ["errors", "debugging", "patterns"],
            content: "Design error handling that preserves context and provides actionable feedback"
          }
        },
        {
          name: "Modular architecture principles",
          entityType: "meta_learning",
          observations: ["Enhances maintainability", "Facilitates testing"],
          metadata: {
            domain: "architecture",
            tags: ["design", "modularity", "scalability"],
            content: "Build systems with clear module boundaries and minimal coupling"
          }
        }
      ]
    }
  });
  
  if (response.error) {
    throw new Error(`MCP Error: ${response.error.message}`);
  }
  
  console.log("✅ Created 3 meta-learning entities");
} catch (error) {
  console.error(`❌ Failed to create entities: ${error.message}`);
}

// Test 1: Search for API-related meta-learnings
console.log("\n🧪 Test 1: Searching for API-related meta-learnings...");
try {
  const response = await sendMCPRequest('tools/call', {
    name: "get_meta_learnings",
    arguments: {
      query: "API integration compatibility validation",
      limit: 5
    }
  });
  
  if (response.error) {
    throw new Error(`MCP Error: ${response.error.message}`);
  }
  
  const results = JSON.parse(response.result.content[0].text);
  console.log(`✅ Found ${results.length} meta-learnings`);
  
  if (results.length > 0) {
    console.log("\n📋 Results:");
    results.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name}`);
      if (item.metadata?.domain) {
        console.log(`     Domain: ${item.metadata.domain}`);
      }
      if (item.metadata?.tags) {
        console.log(`     Tags: ${item.metadata.tags.join(', ')}`);
      }
    });
  }
} catch (error) {
  console.error(`❌ Test 1 FAILED: ${error.message}`);
}

// Test 2: Search for error handling patterns
console.log("\n🧪 Test 2: Searching for error handling patterns...");
try {
  const response = await sendMCPRequest('tools/call', {
    name: "get_meta_learnings",
    arguments: {
      query: "error handling debugging patterns",
      limit: 3,
      score_threshold: 0.5
    }
  });
  
  if (response.error) {
    throw new Error(`MCP Error: ${response.error.message}`);
  }
  
  const results = JSON.parse(response.result.content[0].text);
  console.log(`✅ Found ${results.length} meta-learnings`);
  
  if (results.length > 0) {
    console.log("\n📋 Results:");
    results.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name}`);
      if (item.observations && item.observations.length > 0) {
        console.log(`     Observations: ${item.observations[0]}`);
      }
    });
  }
} catch (error) {
  console.error(`❌ Test 2 FAILED: ${error.message}`);
}

// Test 3: Compare with regular semantic_search (should return mixed types)
console.log("\n🧪 Test 3: Comparing with regular semantic_search...");
try {
  // First, create a non-meta-learning entity
  await sendMCPRequest('tools/call', {
    name: "create_entities",
    arguments: {
      entities: [{
        name: "API Documentation",
        entityType: "concept",
        observations: ["Contains API integration guidelines"],
        metadata: {
          domain: "documentation",
          tags: ["api", "docs"],
          content: "General API documentation resource"
        }
      }]
    }
  });
  
  // Regular semantic search
  const semanticResponse = await sendMCPRequest('tools/call', {
    name: "semantic_search",
    arguments: {
      query: "API integration",
      limit: 10
    }
  });
  
  const semanticResults = JSON.parse(semanticResponse.result.content[0].text);
  
  // Meta-learning search
  const metaResponse = await sendMCPRequest('tools/call', {
    name: "get_meta_learnings",
    arguments: {
      query: "API integration",
      limit: 10
    }
  });
  
  const metaResults = JSON.parse(metaResponse.result.content[0].text);
  
  console.log(`✅ Regular search: ${semanticResults.length} results (mixed types)`);
  console.log(`✅ Meta-learning search: ${metaResults.length} results (only meta_learning type)`);
  
  // Verify filtering works
  const allMetaLearnings = metaResults.every(item => 
    item.entityType === "meta_learning" || 
    (Array.isArray(item.entityType) && item.entityType.includes("meta_learning"))
  );
  
  if (allMetaLearnings) {
    console.log("✅ Verification: All results are meta-learning entities");
  } else {
    console.log("❌ Verification: Found non-meta-learning entities in results");
  }
} catch (error) {
  console.error(`❌ Test 3 FAILED: ${error.message}`);
}

// Cleanup
console.log("\n🧹 Cleaning up...");
if (serverProcess) {
  serverProcess.kill();
}

console.log("\n🎉 get_meta_learnings test completed!");