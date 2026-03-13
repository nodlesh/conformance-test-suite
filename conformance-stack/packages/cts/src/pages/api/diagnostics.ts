import { NextApiRequest, NextApiResponse } from 'next';
import { getNgrokUrl, getBaseUrl } from '@/services/agentService';

/**
 * Get the installed ngrok version
 */
function getNgrokVersion(): string {
  try {
    // Try to get the ngrok version another way
    const fs = require('fs');
    const path = require('path');
    
    // First try via fs
    try {
      const packagePath = path.resolve(process.cwd(), 'node_modules/ngrok/package.json');
      if (fs.existsSync(packagePath)) {
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageData.version || 'unknown';
      }
    } catch (fsError) {
      console.log('Could not read ngrok package.json:', fsError);
    }
    
    // Try exec as a fallback
    return 'unknown (exec not available in this environment)';
  } catch (e) {
    console.error('Error detecting ngrok version:', e);
    return 'detection failed';
  }
}

/**
 * Check active ngrok tunnels via API (if available)
 */
async function checkNgrokTunnels(): Promise<any> {
  try {
    // Try to check ngrok API directly
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: 4040,
        path: '/api/tunnels',
        method: 'GET'
      };
      
      const req = http.request(options, (res: any) => {
        let data = '';
        
        res.on('data', (chunk: any) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const tunnelInfo = JSON.parse(data);
            resolve(tunnelInfo);
          } catch (err) {
            reject(new Error(`Failed to parse ngrok API response: ${err}`));
          }
        });
      });
      
      req.on('error', (err: any) => {
        // API connection refused - ngrok web interface not running
        resolve({ tunnels: [], error: `Ngrok API not available: ${err.message}` });
      });
      
      req.end();
    });
  } catch (e) {
    console.error('Error connecting to ngrok API:', e);
    return { tunnels: [], error: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * API handler for checking the status of the agent and ngrok connection
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get current versions
    const nodeVersion = process.version;
    const ngrokVersion = getNgrokVersion();
    
    // Get current connection status
    const ngrokUrl = await getNgrokUrl();
    const baseUrl = await getBaseUrl();
    
    // Check active tunnels
    const tunnelInfo = await checkNgrokTunnels();
    
    // Provide helpful diagnostics
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      versions: {
        node: nodeVersion,
        ngrok: ngrokVersion,
      },
      connections: {
        ngrokActive: !!ngrokUrl,
        ngrokUrl: ngrokUrl || null,
        baseUrl: baseUrl,
        usingLocalhost: !ngrokUrl && baseUrl.includes('localhost'),
      },
      ngrokSettings: {
        useNgrok: process.env.USE_NGROK === 'true',
        hasAuthToken: !!process.env.NGROK_AUTH_TOKEN && process.env.NGROK_AUTH_TOKEN !== 'your_ngrok_auth_token',
        ngrokPort: process.env.NGROK_PORT || 'not set',
      },
      tunnels: tunnelInfo
    };

    // Return diagnostics
    return res.status(200).json({
      status: ngrokUrl ? 'active' : 'local-only',
      message: ngrokUrl 
        ? 'Ngrok tunnel is active. Mobile wallet connections should work fine.' 
        : 'No ngrok tunnel detected. Connections will only work on devices on the same network.',
      diagnostics
    });
    
  } catch (error) {
    console.error('Error in diagnostics API:', error);
    return res.status(500).json({ 
      status: 'error', 
      message: 'Failed to get diagnostic information', 
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
