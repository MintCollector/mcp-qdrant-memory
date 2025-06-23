#!/usr/bin/env node

/**
 * Comprehensive MCP Tools Test Suite
 * 
 * This test validates all MCP tool calls for the Qdrant Memory server:
 * - All 10 core MCP tools
 * - Error handling and edge cases
 * - Data validation and type checking
 * - End-to-end workflow testing
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

class MCPTestSuite {
  constructor() {
    this.serverProcess = null;
    this.testResults = [];
    this.requestId = 1;
  }

  async runMCPServer() {
    console.log("🚀 Starting MCP Qdrant Memory Server...");
    
    // Debug environment variables
    console.log("🔍 Environment check:");
    console.log(`  EMBEDDING_PROVIDER: ${process.env.EMBEDDING_PROVIDER || 'not set'}`);
    console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'set' : 'not set'}`);
    console.log(`  GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? 'set' : 'not set'}`);
    console.log(`  QDRANT_URL: ${process.env.QDRANT_URL || 'not set'}`);
    console.log(`  QDRANT_COLLECTION_NAME: ${process.env.QDRANT_COLLECTION_NAME || 'not set'}`);
    console.log(`  QDRANT_API_KEY: ${process.env.QDRANT_API_KEY ? 'set' : 'not set'}`);
    
    try {
      this.serverProcess = spawn('node', ['dist/index.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test'
        }
      });

      // Wait for server to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server startup timeout'));
        }, 30000);

        this.serverProcess.stderr.on('data', (data) => {
          const output = data.toString();
          console.log('Server stderr:', output);
        });

        this.serverProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log('Server stdout:', output);
          clearTimeout(timeout);
          resolve(true);
        });

        this.serverProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        this.serverProcess.on('exit', (code) => {
          if (code !== 0) {
            clearTimeout(timeout);
            reject(new Error(`Server exited with code ${code}`));
          }
        });
      });
      return true;
    } catch (error) {
      console.error(`❌ store_meta_learning failed: ${error.message}`);
      this.testResults.push({ test: 'store_meta_learning', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testStoreMetaLearningSuccess() {
    console.log("\n🧪 Testing store_meta_learning (success pattern)...");
    
    try {
      const testData = {
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
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      console.log("✅ store_meta_learning (success) completed successfully");
      this.testResults.push({ test: 'store_meta_learning_success', status: 'PASS' });
      return true;
    } catch (error) {
      console.error(`❌ store_meta_learning (success) failed: ${error.message}`);
      this.testResults.push({ test: 'store_meta_learning_success', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testTrackMetaLearningApplication() {
    console.log("\n🧪 Testing store_meta_learning...");
    
    try {
      const testData = {
        name: "track_meta_learning_application",
        arguments: {
          principle_name: "Meta-Learning [Failure]: Always validate context compatibility...",
          application_context: "User wants Slack integration with specific API version",
          outcome: "successful",
          details: "Asked about API version first, discovered they're on v1 not v2, avoided building wrong implementation",
          lessons_learned: "Version checking prevents significant rework and user frustration"
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      if (!response.result || !response.result.content) {
        throw new Error("No content in response");
      }

      const result = JSON.parse(response.result.content[0].text);
      console.log(`📊 Tracking result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      if (result.updated_metrics) {
        console.log(`📈 Updated metrics: Applied ${result.updated_metrics.times_applied}, Success rate: ${(result.updated_metrics.effectiveness_score * 100).toFixed(1)}%`);
      }
      
      console.log("✅ track_meta_learning_application completed successfully");
      this.testResults.push({ test: 'track_meta_learning_application', status: 'PASS' });
      return true;
    } catch (error) {
      console.error(`❌ track_meta_learning_application failed: ${error.message}`);
      this.testResults.push({ test: 'track_meta_learning_application', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testMetaLearningWorkflow() {
    console.log("\n🧪 Testing store_meta_learning...");
    
    try {
      // Store an optimization learning
      const storeData = {
        name: "store_meta_learning",
        arguments: {
          principle: "Use semantic search before detailed file traversal",
          learning_type: "optimization",
          trigger_situation: "Need to find specific code patterns in large codebase",
          observed_behavior: "Started with broad semantic search to identify likely files",
          recommended_behavior: "Always use semantic search to narrow scope before detailed analysis",
          specific_example: "Found authentication logic in 2 searches instead of reading 50+ files",
          tags: ["code exploration", "debugging"],
          impact: "transformative",
          success_metric: "Time to find target code reduced by >70%"
        }
      };

      const storeResponse = await this.sendMCPRequest('tools/call', storeData);
      if (storeResponse.error) {
        throw new Error(`Store failed: ${storeResponse.error.message}`);
      }

      // Track first application - successful
      const trackData1 = {
        name: "track_meta_learning_application",
        arguments: {
          principle_name: "Meta-Learning [Optimization]: Use semantic search before detailed file...",
          application_context: "User needs to find database connection logic in large enterprise codebase",
          outcome: "successful",
          details: "Used semantic search for 'database connection config', found in 3 files instead of scanning entire src/ directory"
        }
      };

      const trackResponse1 = await this.sendMCPRequest('tools/call', trackData1);
      if (trackResponse1.error) {
        throw new Error(`First tracking failed: ${trackResponse1.error.message}`);
      }

      // Track second application - partial success
      const trackData2 = {
        name: "track_meta_learning_application",
        arguments: {
          principle_name: "Meta-Learning [Optimization]: Use semantic search before detailed file...",
          application_context: "Finding legacy error handling patterns",
          outcome: "partially_successful",
          details: "Semantic search helped narrow to 5 files, but still needed manual review of all 5",
          lessons_learned: "Works best for concrete concepts, less effective for abstract patterns"
        }
      };

      const trackResponse2 = await this.sendMCPRequest('tools/call', trackData2);
      if (trackResponse2.error) {
        throw new Error(`Second tracking failed: ${trackResponse2.error.message}`);
      }

      console.log("✅ Complete meta-learning workflow test completed successfully");
      this.testResults.push({ test: 'meta_learning_workflow', status: 'PASS' });
      return true;
    } catch (error) {
      console.error(`❌ Meta-learning workflow test failed: ${error.message}`);
      this.testResults.push({ test: 'meta_learning_workflow', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async runAllTests() {
    console.log("🚀 Starting Comprehensive MCP Tools Test Suite");
    console.log("=".repeat(60));

    try {
      // Start the MCP server
      const serverStarted = await this.runMCPServer();
      if (!serverStarted) {
        throw new Error("Failed to start MCP server");
      }

      // Wait a bit for server to fully initialize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test new meta-learning tools
      await this.testStoreMetaLearning();
      await this.testStoreMetaLearningSuccess();
      await this.testTrackMetaLearningApplication();
      await this.testMetaLearningWorkflow();

    } catch (error) {
      console.error("❌ Test suite failed:", error.message);
      this.testResults.push({ test: 'test_suite', status: 'FAIL', error: error.message });
    } finally {
      await this.cleanup();
      this.printResults();
    }
  }

  async cleanup() {
    console.log("\n
🧹 Cleaning up..."););
    if (this.serverProcess) {
      this.serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  printResults() {
    console.log("\n

" + "=".repeat(60));
    console.log("📊 TEST RESULTS SUMMARY");
    console.log("=".repeat(60));
    
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const partial = this.testResults.filter(r => r.status === 'PARTIAL').length;
    
    this.testResults.forEach(result => {
      const emoji = result.status === 'PASS' ? '✅' : result.status === 'PARTIAL' ? '⚠️' : '❌';
      console.log(`${emoji} ${result.test}: ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    
    console.log("=".repeat(60));
    console.log(`📈 Total: ${total} | ✅ Passed: ${passed} | ⚠️ Partial: ${partial} | ❌ Failed: ${failed}`);
    console.log(`🏆 Success Rate: ${Math.round((passed + partial * 0.5) / total * 100)}%`);
    console.log("=".repeat(60));
  }

  async sendMCPRequest(method, params) {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: "2.0",
        id: this.requestId++,
        method: method,
        params: params
      };

      const requestStr = JSON.stringify(request) + '
';
      this.serverProcess.stdin.write(requestStr);

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 10000);

      const onData = (data) => {
        clearTimeout(timeout);
        this.serverProcess.stdout.removeListener('data', onData);
        
        try {
          const response = JSON.parse(data.toString().trim());
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      };

      this.serverProcess.stdout.once('data', onData);
    });
  }
}

// Run the test suite
const testSuite = new MCPTestSuite();
testSuite.runAllTests().then(() => {
  const totalTests = testSuite.testResults.length;
  const passedTests = testSuite.testResults.filter(r => r.status === 'PASS' || r.status === 'PARTIAL').length;
  process.exit(passedTests === totalTests ? 0 : 1);
}).catch((error) => {
  console.error("Fatal test error:", error);
  process.exit(1);
});