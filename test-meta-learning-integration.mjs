#!/usr/bin/env node

/**
 * Test that store_meta_learning and get_meta_learnings work together
 */

import { spawn } from 'child_process';
import { config } from 'dotenv';

// Load environment variables
config();

console.log("🚀 Testing Meta-Learning Integration");
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

// Test: Store a meta-learning and then search for it
console.log("\n📝 Storing a meta-learning principle...");
try {
  const storeResponse = await sendMCPRequest('tools/call', {
    name: "store_meta_learning",
    arguments: {
      principle: "Always validate user context before implementing solutions",
      learning_type: "failure",
      trigger_situation: "User requests technical implementation",
      observed_behavior: "Jumped into coding without checking constraints",
      recommended_behavior: "First ask about environment, versions, and constraints",
      specific_example: "Built Node.js solution for user on Windows without WSL",
      tags: ["validation", "context", "implementation"],
      domain: "software-development",
      impact: "high"
    }
  });
  
  if (storeResponse.error) {
    throw new Error(`Store failed: ${storeResponse.error.message}`);
  }
  
  const storedId = storeResponse.result.content[0].text.match(/ID: (.+)/)?.[1];
  console.log(`✅ Stored with ID: ${storedId}`);
  
  // Wait a moment for indexing
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Now search for it
  console.log("\n🔍 Searching for the stored meta-learning...");
  const searchResponse = await sendMCPRequest('tools/call', {
    name: "get_meta_learnings",
    arguments: {
      query: "validate user context implementation",
      limit: 5
    }
  });
  
  if (searchResponse.error) {
    throw new Error(`Search failed: ${searchResponse.error.message}`);
  }
  
  const results = JSON.parse(searchResponse.result.content[0].text);
  console.log(`✅ Found ${results.length} meta-learnings`);
  
  // Check if our stored principle is in the results
  const found = results.some(item => 
    item.name && item.name.includes("Always validate user context")
  );
  
  if (found) {
    console.log("✅ SUCCESS: The stored meta-learning was found by get_meta_learnings!");
    console.log("\n📋 Search results:");
    results.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name}`);
      if (item.entityType) {
        console.log(`     Type: ${Array.isArray(item.entityType) ? item.entityType.join(', ') : item.entityType}`);
      }
    });
  } else {
    console.log("❌ FAILED: The stored meta-learning was NOT found");
    console.log("Results received:", JSON.stringify(results, null, 2));
  }
  
} catch (error) {
  console.error(`❌ Test failed: ${error.message}`);
}

// Cleanup
console.log("\n🧹 Cleaning up...");
if (serverProcess) {
  serverProcess.kill();
}

console.log("\n✨ Integration test completed!");