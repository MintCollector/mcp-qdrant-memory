#!/usr/bin/env node

/**
 * Simple test for new meta-learning tools
 */

import { spawn } from 'child_process';
import { config } from 'dotenv';

// Load environment variables
config();

console.log("🚀 Testing Meta-Learning Tools");
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

// Test 1: Store meta-learning principle
console.log("\n🧪 Testing store_meta_learning...");
try {
  const response = await sendMCPRequest('tools/call', {
    name: "store_meta_learning",
    arguments: {
      principle: "Always validate context compatibility before implementation",
      learning_type: "failure",
      trigger_situation: "User requests new technical approach",
      observed_behavior: "Jumped straight into implementation without validation",
      recommended_behavior: "Validate feasibility in their context first",
      specific_example: "Built Alfred workflow that didn't work with Keyword Inputs",
      tags: ["API integrations", "validation", "workflow"],
      domain: "automation",
      impact: "high",
      prevention_pattern: "Ask 'Does this work in their version/environment?' before coding",
      success_metric: "Catch incompatibility issues before building, user confirms feasibility"
    }
  });
  
  if (response.error) {
    throw new Error(`MCP Error: ${response.error.message}`);
  }
  
  console.log("✅ store_meta_learning: SUCCESS");
  console.log(`📊 Response: ${response.result.content[0].text}`);
} catch (error) {
  console.error(`❌ store_meta_learning: FAILED - ${error.message}`);
}

// Test 2: Track application of the principle
console.log("\n🧪 Testing track_meta_learning_application...");
try {
  const response = await sendMCPRequest('tools/call', {
    name: "track_meta_learning_application",
    arguments: {
      principle_name: "Meta-Learning [Failure]: Always validate context compatibility...",
      application_context: "User wants Slack integration with specific API version",
      outcome: "successful",
      details: "Asked about API version first, discovered they're on v1 not v2, avoided building wrong implementation",
      lessons_learned: "Version checking prevents significant rework and user frustration"
    }
  });
  
  if (response.error) {
    throw new Error(`MCP Error: ${response.error.message}`);
  }
  
  const result = JSON.parse(response.result.content[0].text);
  console.log("✅ track_meta_learning_application: SUCCESS");
  console.log(`📊 Tracking result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  if (result.updated_metrics) {
    console.log(`📈 Updated metrics: Applied ${result.updated_metrics.times_applied}, Success rate: ${(result.updated_metrics.effectiveness_score * 100).toFixed(1)}%`);
  }
} catch (error) {
  console.error(`❌ track_meta_learning_application: FAILED - ${error.message}`);
}

// Test 3: Store a success pattern
console.log("\n🧪 Testing store_meta_learning (success pattern)...");
try {
  const response = await sendMCPRequest('tools/call', {
    name: "store_meta_learning",
    arguments: {
      principle: "Break complex queries into semantic chunks for better comprehension",
      learning_type: "success",
      trigger_situation: "User presents multi-part technical question",
      observed_behavior: "Decomposed query into sub-questions before answering",
      recommended_behavior: "Always decompose complex queries before comprehensive answer",
      specific_example: "API design + performance + security handled separately then synthesized",
      tags: ["complex queries", "technical consulting"],
      impact: "high",
      success_metric: "User confirms all aspects were addressed clearly and thoroughly"
    }
  });
  
  if (response.error) {
    throw new Error(`MCP Error: ${response.error.message}`);
  }
  
  console.log("✅ store_meta_learning (success): SUCCESS");
} catch (error) {
  console.error(`❌ store_meta_learning (success): FAILED - ${error.message}`);
}

// Cleanup
console.log("\n🧹 Cleaning up...");
if (serverProcess) {
  serverProcess.kill();
}

console.log("\n🎉 Meta-learning tools test completed!");