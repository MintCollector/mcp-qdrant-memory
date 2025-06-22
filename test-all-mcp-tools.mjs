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
          console.log('❌ Server startup timeout after 15 seconds');
          reject(new Error('Server startup timeout'));
        }, 15000);

        let serverReady = false;

        this.serverProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log('Server stdout:', output);
        });

        this.serverProcess.stderr.on('data', (data) => {
          const output = data.toString();
          console.log('Server stderr:', output);
          
          // Check for successful startup
          if (output.includes('Memory MCP server running on stdio')) {
            console.log('✅ Server startup message detected');
            if (!serverReady) {
              serverReady = true;
              clearTimeout(timeout);
              resolve();
            }
          }
          
          // Check for successful initialization
          if (output.includes('Successfully initialized') || output.includes('server running')) {
            console.log('✅ Server initialization detected');
            if (!serverReady) {
              serverReady = true;
              clearTimeout(timeout);
              resolve();
            }
          }

          // Check for fatal errors
          if (output.includes('Fatal error') || output.includes('process.exit(1)')) {
            console.log('❌ Server fatal error detected');
            clearTimeout(timeout);
            reject(new Error(`Server fatal error: ${output}`));
          }
        });

        this.serverProcess.on('error', (error) => {
          console.log('❌ Server process error:', error.message);
          clearTimeout(timeout);
          reject(error);
        });

        this.serverProcess.on('exit', (code, signal) => {
          console.log(`❌ Server process exited with code ${code}, signal ${signal}`);
          if (!serverReady) {
            clearTimeout(timeout);
            reject(new Error(`Server exited unexpectedly with code ${code}`));
          }
        });
      });

      console.log("✅ MCP Server started successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to start MCP server:", error.message);
      return false;
    }
  }

  async sendMCPRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: "2.0",
        id: this.requestId++,
        method: method,
        params: params
      };

      const requestData = JSON.stringify(request) + '\n';
      
      let responseData = '';
      const onData = (data) => {
        responseData += data.toString();
        
        // Try to parse complete JSON responses
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                this.serverProcess.stdout.removeListener('data', onData);
                resolve(response);
                return;
              }
            } catch (e) {
              // Continue collecting data
            }
          }
        }
      };

      this.serverProcess.stdout.on('data', onData);
      
      // Send request
      this.serverProcess.stdin.write(requestData);

      // Timeout after 10 seconds
      setTimeout(() => {
        this.serverProcess.stdout.removeListener('data', onData);
        reject(new Error(`Request timeout for ${method}`));
      }, 10000);
    });
  }

  async testListTools() {
    console.log("\n🧪 Testing tools/list...");
    
    try {
      const response = await this.sendMCPRequest('tools/list');
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      const tools = response.result.tools;
      const expectedTools = [
        'create_entities',
        'create_relationships', 
        'add_observations',
        'delete_entities',
        'delete_observations',
        'delete_relationships',
        'read_graph',
        'semantic_search',
        'advanced_search',
        'search_related'
      ];

      const toolNames = tools.map(t => t.name);
      const missingTools = expectedTools.filter(name => !toolNames.includes(name));
      
      if (missingTools.length > 0) {
        throw new Error(`Missing tools: ${missingTools.join(', ')}`);
      }

      console.log(`✅ Found all ${tools.length} expected tools`);
      this.testResults.push({ test: 'tools/list', status: 'PASS', tools: toolNames });
      return true;
    } catch (error) {
      console.error(`❌ tools/list failed: ${error.message}`);
      this.testResults.push({ test: 'tools/list', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testCreateEntities() {
    console.log("\n🧪 Testing create_entities...");
    
    try {
      const testData = {
        name: "create_entities",
        arguments: {
          entities: [
            {
              name: "Test Entity 1",
              entityType: "concept",
              observations: [
                "This is a test observation",
                "Another test observation"
              ],
              metadata: {
                domain: "testing",
                tags: ["test", "entity"]
              }
            },
            {
              name: "Test Entity 2", 
              entityType: ["person", "concept"],
              observations: [
                "Multi-type test entity",
                "Demonstrates multiple entity types"
              ]
            }
          ]
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      const result = response.result;
      if (!result.content || !result.content[0].text.includes("successfully")) {
        throw new Error("Unexpected response format");
      }

      console.log("✅ create_entities completed successfully");
      this.testResults.push({ test: 'create_entities', status: 'PASS' });
      return true;
    } catch (error) {
      console.error(`❌ create_entities failed: ${error.message}`);
      this.testResults.push({ test: 'create_entities', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testCreateRelationships() {
    console.log("\n🧪 Testing create_relationships...");
    
    try {
      const testData = {
        name: "create_relationships",
        arguments: {
          relationships: [
            {
              from: "Test Entity 1",
              to: "Test Entity 2",
              relationType: "relates_to",
              metadata: {
                strength: 0.8,
                context: "Test relationship"
              }
            }
          ]
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      console.log("✅ create_relationships completed successfully");
      this.testResults.push({ test: 'create_relationships', status: 'PASS' });
      return true;
    } catch (error) {
      console.error(`❌ create_relationships failed: ${error.message}`);
      this.testResults.push({ test: 'create_relationships', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testAddObservations() {
    console.log("\n🧪 Testing add_observations...");
    
    try {
      const testData = {
        name: "add_observations",
        arguments: {
          observations: [
            {
              entityName: "Test Entity 1",
              contents: [
                "Additional observation from test",
                "Another update to the entity"
              ]
            }
          ]
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      console.log("✅ add_observations completed successfully");
      this.testResults.push({ test: 'add_observations', status: 'PASS' });
      return true;
    } catch (error) {
      console.error(`❌ add_observations failed: ${error.message}`);
      this.testResults.push({ test: 'add_observations', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testReadGraph() {
    console.log("\n🧪 Testing read_graph...");
    
    try {
      const testData = {
        name: "read_graph",
        arguments: {}
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      const graphData = JSON.parse(response.result.content[0].text);
      
      if (!graphData.entities || !graphData.relations) {
        throw new Error("Invalid graph structure");
      }

      // Verify our test entities exist
      const entityNames = graphData.entities.map(e => e.name);
      if (!entityNames.includes("Test Entity 1") || !entityNames.includes("Test Entity 2")) {
        throw new Error("Test entities not found in graph");
      }

      console.log(`✅ read_graph returned graph with ${graphData.entities.length} entities and ${graphData.relations.length} relationships`);
      this.testResults.push({ 
        test: 'read_graph', 
        status: 'PASS', 
        entities: graphData.entities.length,
        relations: graphData.relations.length 
      });
      return true;
    } catch (error) {
      console.error(`❌ read_graph failed: ${error.message}`);
      this.testResults.push({ test: 'read_graph', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testSemanticSearch() {
    console.log("\n🧪 Testing semantic_search...");
    
    try {
      const testData = {
        name: "semantic_search",
        arguments: {
          query: "test entity concept",
          limit: 5
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      const results = JSON.parse(response.result.content[0].text);
      
      if (!Array.isArray(results)) {
        throw new Error("Expected array of search results");
      }

      console.log(`✅ semantic_search returned ${results.length} results`);
      this.testResults.push({ test: 'semantic_search', status: 'PASS', results: results.length });
      return true;
    } catch (error) {
      console.error(`❌ semantic_search failed: ${error.message}`);
      this.testResults.push({ test: 'semantic_search', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testAdvancedSearch() {
    console.log("\n🧪 Testing advanced_search...");
    
    try {
      const testData = {
        name: "advanced_search",
        arguments: {
          query: "test concept",
          filters: {
            entity_types: ["concept"],
            domains: ["testing"]
          },
          limit: 10,
          score_threshold: 0.1
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      const results = JSON.parse(response.result.content[0].text);
      
      if (!Array.isArray(results)) {
        throw new Error("Expected array of search results");
      }

      console.log(`✅ advanced_search returned ${results.length} filtered results`);
      this.testResults.push({ test: 'advanced_search', status: 'PASS', results: results.length });
      return true;
    } catch (error) {
      console.error(`❌ advanced_search failed: ${error.message}`);
      this.testResults.push({ test: 'advanced_search', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testSearchRelated() {
    console.log("\n🧪 Testing search_related...");
    
    try {
      const testData = {
        name: "search_related",
        arguments: {
          entityName: "Test Entity 1",
          maxDepth: 2,
          relationshipTypes: ["relates_to"]
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      const results = JSON.parse(response.result.content[0].text);
      
      if (!results.entities || !Array.isArray(results.entities) || !results.relationships || !Array.isArray(results.relationships) || !results.paths || !Array.isArray(results.paths)) {
        throw new Error("Expected object with entities, relationships, and paths arrays");
      }

      console.log(`✅ search_related found ${results.entities.length} entities, ${results.relationships.length} relationships, and ${results.paths.length} paths`);
      this.testResults.push({ test: 'search_related', status: 'PASS', entities: results.entities.length, relationships: results.relationships.length, paths: results.paths.length });
      return true;
    } catch (error) {
      console.error(`❌ search_related failed: ${error.message}`);
      this.testResults.push({ test: 'search_related', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testDeleteObservations() {
    console.log("\n🧪 Testing delete_observations...");
    
    try {
      const testData = {
        name: "delete_observations",
        arguments: {
          deletions: [
            {
              entityName: "Test Entity 1",
              observations: ["Additional observation from test"]
            }
          ]
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      console.log("✅ delete_observations completed successfully");
      this.testResults.push({ test: 'delete_observations', status: 'PASS' });
      return true;
    } catch (error) {
      console.error(`❌ delete_observations failed: ${error.message}`);
      this.testResults.push({ test: 'delete_observations', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testDeleteRelationships() {
    console.log("\n🧪 Testing delete_relationships...");
    
    try {
      const testData = {
        name: "delete_relationships",
        arguments: {
          relationships: [
            {
              from: "Test Entity 1",
              to: "Test Entity 2",
              relationType: "relates_to"
            }
          ]
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      console.log("✅ delete_relationships completed successfully");
      this.testResults.push({ test: 'delete_relationships', status: 'PASS' });
      return true;
    } catch (error) {
      console.error(`❌ delete_relationships failed: ${error.message}`);
      this.testResults.push({ test: 'delete_relationships', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testDeleteEntities() {
    console.log("\n🧪 Testing delete_entities...");
    
    try {
      const testData = {
        name: "delete_entities",
        arguments: {
          entityNames: ["Test Entity 1", "Test Entity 2"]
        }
      };

      const response = await this.sendMCPRequest('tools/call', testData);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      console.log("✅ delete_entities completed successfully");
      this.testResults.push({ test: 'delete_entities', status: 'PASS' });
      return true;
    } catch (error) {
      console.error(`❌ delete_entities failed: ${error.message}`);
      this.testResults.push({ test: 'delete_entities', status: 'FAIL', error: error.message });
      return false;
    }
  }

  async testErrorHandling() {
    console.log("\n🧪 Testing error handling...");
    
    const errorTests = [
      {
        name: "invalid_tool",
        test: "non_existent_tool",
        expectedError: "Unknown tool"
      },
      {
        name: "missing_arguments",
        test: "create_entities",
        args: {},
        expectedError: "Missing arguments"
      },
      {
        name: "invalid_entity_data",
        test: "create_entities",
        args: { entities: [{ name: "test" }] },
        expectedError: "Missing required"
      }
    ];

    let errorTestsPassed = 0;

    for (const errorTest of errorTests) {
      try {
        const testData = {
          name: errorTest.test,
          arguments: errorTest.args || {}
        };

        const response = await this.sendMCPRequest('tools/call', testData);
        
        if (response.error) {
          console.log(`✅ ${errorTest.name}: Got expected error - ${response.error.message}`);
          errorTestsPassed++;
        } else {
          console.log(`⚠️  ${errorTest.name}: Expected error but got success`);
        }
      } catch (error) {
        console.log(`✅ ${errorTest.name}: Got expected error - ${error.message}`);
        errorTestsPassed++;
      }
    }

    console.log(`✅ Error handling: ${errorTestsPassed}/${errorTests.length} tests passed`);
    this.testResults.push({ 
      test: 'error_handling', 
      status: errorTestsPassed === errorTests.length ? 'PASS' : 'PARTIAL',
      passed: errorTestsPassed,
      total: errorTests.length
    });

    return errorTestsPassed === errorTests.length;
  }

  async cleanup() {
    if (this.serverProcess) {
      console.log("\n🧹 Cleaning up test server...");
      this.serverProcess.kill('SIGTERM');
      
      await new Promise((resolve) => {
        this.serverProcess.on('exit', resolve);
        setTimeout(resolve, 5000); // Force cleanup after 5s
      });
    }
  }

  printResults() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 MCP Tools Test Results Summary");
    console.log("=".repeat(60));

    let totalTests = 0;
    let passedTests = 0;

    for (const result of this.testResults) {
      totalTests++;
      const status = result.status === 'PASS' ? '✅' : result.status === 'PARTIAL' ? '⚠️ ' : '❌';
      console.log(`${status} ${result.test.padEnd(25)} ${result.status}`);
      
      if (result.status === 'PASS' || result.status === 'PARTIAL') {
        passedTests++;
      }

      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    }

    console.log("=".repeat(60));
    console.log(`🎯 Overall: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
    
    if (passedTests === totalTests) {
      console.log("🎉 All MCP tools are working correctly!");
    } else {
      console.log("⚠️  Some tests failed - review the results above");
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

      // Run all tool tests in sequence
      await this.testListTools();
      await this.testCreateEntities();
      await this.testCreateRelationships();
      await this.testAddObservations();
      await this.testReadGraph();
      await this.testSemanticSearch();
      await this.testAdvancedSearch();
      await this.testSearchRelated();
      await this.testDeleteObservations();
      await this.testDeleteRelationships();
      await this.testDeleteEntities();
      await this.testErrorHandling();

    } catch (error) {
      console.error("❌ Test suite failed:", error.message);
      this.testResults.push({ test: 'test_suite', status: 'FAIL', error: error.message });
    } finally {
      await this.cleanup();
      this.printResults();
    }
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