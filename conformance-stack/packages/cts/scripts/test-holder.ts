#!/usr/bin/env ts-node

/**
 * HolderTest Validation Script
 * 
 * This script tests the HolderTest pipeline functionality:
 * 1. Create invitation (QR code generation)
 * 2. Send presentation request 
 * 3. Handle response verification
 * 
 * Usage: npm run test-holder
 */

import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const API_BASE = 'http://localhost:5005';
const SOCKET_URL = 'http://localhost:5005';

interface DAGState {
  sequence: number;
  dagState: {
    status: string;
    runState: string;
  };
  connectedClients: number;
  nodeStates: Array<{
    name: string;
    state: string;
    finished: boolean;
    taskStatus: string;
    taskRunState: string;
  }>;
}

class HolderTestValidator {
  private socket: Socket | null = null;
  private testStartTime: number = 0;
  private dagUpdates: DAGState[] = [];
  private invitationUrl: string | null = null;

  async runTest(): Promise<void> {
    console.log('🚀 Starting HolderTest Validation...\n');
    
    try {
      // Step 1: Check server health
      await this.checkServerHealth();
      
      // Step 2: Connect to socket
      await this.connectSocket();
      
      // Step 3: Test HolderTest pipeline
      await this.testHolderPipeline();
      
      // Step 4: Verify results
      this.verifyResults();
      
      console.log('✅ HolderTest validation completed successfully!');
      
    } catch (error) {
      console.error('❌ HolderTest validation failed:', error.message);
      process.exit(1);
    } finally {
      this.cleanup();
    }
  }

  private async checkServerHealth(): Promise<void> {
    console.log('📡 Checking server health...');
    
    try {
      const response = await axios.get(`${API_BASE}/api/health`, {
        timeout: 5000
      });
      console.log('✅ Server is healthy');
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Server is not running. Please start with: npm run start:server');
      }
      console.log('⚠️ Health check endpoint not found, but server appears to be running');
    }
  }

  private async connectSocket(): Promise<void> {
    console.log('🔌 Connecting to WebSocket...');
    
    return new Promise((resolve, reject) => {
      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      this.socket.on('connect', () => {
        console.log('✅ Socket connected');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        reject(new Error(`Socket connection failed: ${error.message}`));
      });

      this.socket.on('dag-state-update', (data: DAGState) => {
        console.log(`📊 DAG Update #${data.sequence}:`, {
          status: data.dagState.status,
          runState: data.dagState.runState,
          nodes: data.nodeStates.map(n => `${n.name}: ${n.taskStatus}`)
        });
        this.dagUpdates.push(data);
      });

      this.socket.on('invitation', (url: string) => {
        console.log('📧 Received invitation URL:', url.substring(0, 50) + '...');
        this.invitationUrl = url;
      });

      // Set timeout
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('Socket connection timeout'));
        }
      }, 10000);
    });
  }

  private async testHolderPipeline(): Promise<void> {
    console.log('🧪 Testing HolderTest pipeline...\n');
    
    this.testStartTime = Date.now();
    
    // Step 1: Select HOLDER_TEST pipeline
    console.log('1️⃣ Selecting HOLDER_TEST pipeline...');
    await this.selectPipeline('HOLDER_TEST');
    
    // Step 2: Start pipeline execution
    console.log('2️⃣ Starting pipeline execution...');
    await this.runPipeline();
    
    // Step 3: Wait for and verify invitation generation
    console.log('3️⃣ Waiting for invitation generation...');
    await this.waitForInvitation();
    
    // Step 4: Wait for pipeline completion or timeout
    console.log('4️⃣ Waiting for pipeline completion...');
    await this.waitForCompletion();
  }

  private async selectPipeline(pipelineType: string): Promise<void> {
    try {
      const response = await axios.get(`${API_BASE}/api/select/pipeline`, {
        params: { pipeline: pipelineType },
        timeout: 10000
      });
      
      if (response.status === 200) {
        console.log('✅ Pipeline selected successfully');
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Failed to select pipeline: ${error.message}`);
    }
  }

  private async runPipeline(): Promise<void> {
    try {
      const response = await axios.get(`${API_BASE}/api/run`, {
        timeout: 10000
      });
      
      if (response.status === 200) {
        console.log('✅ Pipeline execution started');
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Failed to run pipeline: ${error.message}`);
    }
  }

  private async waitForInvitation(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout: No invitation received within 30 seconds'));
      }, 30000);

      const checkInvitation = () => {
        if (this.invitationUrl) {
          clearTimeout(timeout);
          console.log('✅ Invitation generated successfully!');
          console.log('📋 Invitation details:', {
            length: this.invitationUrl.length,
            hasCredentialParam: this.invitationUrl.includes('c_i='),
            isValid: this.validateInvitationUrl(this.invitationUrl)
          });
          resolve();
        } else {
          // Check DAG state for setup connection task
          const latestDag = this.dagUpdates[this.dagUpdates.length - 1];
          if (latestDag) {
            const setupTask = latestDag.nodeStates.find(n => 
              n.name.toLowerCase().includes('setup') || 
              n.name.toLowerCase().includes('connection')
            );
            
            if (setupTask && setupTask.taskStatus === 'Running') {
              console.log('🔄 Connection setup in progress...');
            }
          }
          
          setTimeout(checkInvitation, 1000);
        }
      };

      checkInvitation();
    });
  }

  private validateInvitationUrl(url: string): boolean {
    try {
      new URL(url);
      return url.includes('c_i=') || url.includes('oob=');
    } catch {
      return false;
    }
  }

  private async waitForCompletion(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('⏱️ Test timeout reached (60s), checking results...');
        resolve();
      }, 60000);

      const checkCompletion = () => {
        const latestDag = this.dagUpdates[this.dagUpdates.length - 1];
        
        if (latestDag) {
          const allTasksCompleted = latestDag.nodeStates.every(node => 
            node.finished || 
            node.taskStatus === 'Completed' || 
            node.taskStatus === 'Accepted'
          );
          
          const hasFailures = latestDag.nodeStates.some(node => 
            node.taskStatus === 'Failed' || 
            node.taskStatus === 'Error'
          );
          
          if (allTasksCompleted) {
            clearTimeout(timeout);
            console.log('✅ All tasks completed!');
            resolve();
          } else if (hasFailures) {
            clearTimeout(timeout);
            reject(new Error('Pipeline execution failed - tasks reported failures'));
          } else {
            setTimeout(checkCompletion, 2000);
          }
        } else {
          setTimeout(checkCompletion, 1000);
        }
      };

      checkCompletion();
    });
  }

  private verifyResults(): void {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    const duration = Date.now() - this.testStartTime;
    console.log(`⏱️ Total execution time: ${duration}ms`);
    console.log(`📨 DAG updates received: ${this.dagUpdates.length}`);
    console.log(`🔗 Invitation generated: ${this.invitationUrl ? '✅ Yes' : '❌ No'}`);
    
    if (this.dagUpdates.length > 0) {
      const latestDag = this.dagUpdates[this.dagUpdates.length - 1];
      console.log('\\n🔍 Final DAG State:');
      console.log(`   Overall Status: ${latestDag.dagState.status}`);
      console.log(`   Run State: ${latestDag.dagState.runState}`);
      
      console.log('\\n📋 Task Status:');
      latestDag.nodeStates.forEach((node, index) => {
        const status = node.taskStatus;
        const icon = status === 'Completed' || status === 'Accepted' ? '✅' : 
                    status === 'Failed' || status === 'Error' ? '❌' : 
                    status === 'Running' || status === 'Started' ? '🔄' : '⏳';
        console.log(`   ${index + 1}. ${icon} ${node.name}: ${status}`);
      });
    }
    
    // Validate critical requirements
    const criticalChecks = {
      'Socket Connection': this.socket?.connected || false,
      'DAG Updates Received': this.dagUpdates.length > 0,
      'Invitation Generated': !!this.invitationUrl,
      'Valid Invitation Format': this.invitationUrl ? this.validateInvitationUrl(this.invitationUrl) : false
    };
    
    console.log('\\n✅ Critical Checks:');
    Object.entries(criticalChecks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });
    
    const allPassed = Object.values(criticalChecks).every(Boolean);
    
    if (!allPassed) {
      throw new Error('Some critical checks failed');
    }
  }

  private cleanup(): void {
    if (this.socket) {
      this.socket.disconnect();
      console.log('🔌 Socket disconnected');
    }
  }
}

// Main execution
if (require.main === module) {
  const validator = new HolderTestValidator();
  validator.runTest().catch(() => process.exit(1));
}

export { HolderTestValidator };
