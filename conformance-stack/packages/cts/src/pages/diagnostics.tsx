import React, { useState, useEffect } from 'react';
import { getNgrokUrl, getBaseUrl } from '@/services/agentService';

export default function DiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDiagnostics = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/diagnostics');
        const data = await response.json();
        setDiagnostics(data);
      } catch (err) {
        console.error('Error fetching diagnostics:', err);
        setError('Failed to fetch diagnostics information');
      } finally {
        setLoading(false);
      }
    };
    
    fetchDiagnostics();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-center mb-6">Connection Diagnostics</h1>
        
        {loading ? (
          <div className="flex justify-center items-center p-8">
            <div className="animate-spin h-8 w-8 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
            <span className="ml-2 text-gray-500">Loading diagnostics...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-300 rounded text-red-800">
            {error}
          </div>
        ) : diagnostics ? (
          <div>
            <div className={`p-4 mb-6 rounded-lg ${diagnostics.status === 'active' ? 'bg-green-50 border border-green-300' : 'bg-yellow-50 border border-yellow-300'}`}>
              <h2 className="text-lg font-semibold mb-2">
                {diagnostics.status === 'active' ? '✓ Connection Status: Active' : '⚠️ Connection Status: Local Only'}
              </h2>
              <p className={diagnostics.status === 'active' ? 'text-green-700' : 'text-yellow-700'}>
                {diagnostics.message}
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-3">Connection Information</h3>
                <dl className="space-y-2">
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Ngrok Active:</dt>
                    <dd className="flex-1">{diagnostics.diagnostics.connections.ngrokActive ? '✓ Yes' : '✗ No'}</dd>
                  </div>
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Ngrok URL:</dt>
                    <dd className="flex-1 font-mono text-sm">{diagnostics.diagnostics.connections.ngrokUrl || 'Not available'}</dd>
                  </div>
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Base URL:</dt>
                    <dd className="flex-1 font-mono text-sm">{diagnostics.diagnostics.connections.baseUrl}</dd>
                  </div>
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Using Localhost:</dt>
                    <dd className={`flex-1 ${diagnostics.diagnostics.connections.usingLocalhost ? 'text-yellow-600' : 'text-green-600'}`}>
                      {diagnostics.diagnostics.connections.usingLocalhost ? '⚠️ Yes (Mobile connections limited)' : 'No'}
                    </dd>
                  </div>
                </dl>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-3">System Information</h3>
                <dl className="space-y-2">
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Environment:</dt>
                    <dd className="flex-1">{diagnostics.diagnostics.environment}</dd>
                  </div>
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Node Version:</dt>
                    <dd className="flex-1">{diagnostics.diagnostics.versions.node}</dd>
                  </div>
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Ngrok Version:</dt>
                    <dd className="flex-1">{diagnostics.diagnostics.versions.ngrok}</dd>
                  </div>
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Timestamp:</dt>
                    <dd className="flex-1 text-sm">{new Date(diagnostics.diagnostics.timestamp).toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow md:col-span-2">
                <h3 className="text-lg font-semibold mb-3">Ngrok Configuration</h3>
                <dl className="space-y-2">
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">USE_NGROK:</dt>
                    <dd className="flex-1">{diagnostics.diagnostics.ngrokSettings.useNgrok ? '✓ Enabled' : '✗ Disabled'}</dd>
                  </div>
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Auth Token:</dt>
                    <dd className={`flex-1 ${diagnostics.diagnostics.ngrokSettings.hasAuthToken ? 'text-green-600' : 'text-red-600'}`}>
                      {diagnostics.diagnostics.ngrokSettings.hasAuthToken ? '✓ Configured' : '✗ Not Configured'}
                    </dd>
                  </div>
                  <div className="flex items-baseline">
                    <dt className="w-32 text-sm text-gray-600">Ngrok Port:</dt>
                    <dd className="flex-1">
                      <span className={typeof window !== 'undefined' && diagnostics.diagnostics.ngrokSettings.ngrokPort !== String(window.location.port) ? 'text-red-600' : ''}>
                        {diagnostics.diagnostics.ngrokSettings.ngrokPort}
                      </span>
                      
                      {typeof window !== 'undefined' && diagnostics.diagnostics.ngrokSettings.ngrokPort !== String(window.location.port) && (
                        <span className="ml-2 text-red-600 font-medium">
                          ⚠️ Port mismatch! Application is running on port {window.location.port}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                {/* Critical configuration issue warning */}
                {(!diagnostics.diagnostics.ngrokSettings.ngrokPort || diagnostics.diagnostics.ngrokSettings.ngrokPort === 'not set') && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-300 rounded text-red-700 text-sm">
                    <p className="font-semibold">Critical Configuration Issue:</p>
                    <p>NGROK_PORT is not set in your environment variables.</p>
                    <p className="mt-2">To fix this:</p>
                    <ol className="list-decimal list-inside ml-2 mt-1">
                      <li>Edit your <code className="bg-red-100 px-1 rounded">.env.local</code> file</li>
                      <li>Add this line: <code className="bg-red-100 px-1 rounded">NGROK_PORT=3000</code></li>
                      <li>Restart the application</li>
                    </ol>
                  </div>
                )}
              </div>
              
              {diagnostics.diagnostics.tunnels && (
                <div className="bg-white p-6 rounded-lg shadow md:col-span-2 mt-6">
                  <h3 className="text-lg font-semibold mb-3">Ngrok Tunnels</h3>
                  
                  {diagnostics.diagnostics.tunnels.error ? (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
                      {diagnostics.diagnostics.tunnels.error}
                    </div>
                  ) : diagnostics.diagnostics.tunnels.tunnels?.length === 0 ? (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
                      No active ngrok tunnels found.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Protocol</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Forwarding To</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {diagnostics.diagnostics.tunnels.tunnels.map((tunnel: any, index: number) => (
                            <tr key={index} className="text-xs">
                              <td className="px-3 py-2 whitespace-nowrap font-mono">{tunnel.name}</td>
                              <td className="px-3 py-2 whitespace-nowrap font-mono text-blue-600">
                                <a href={tunnel.public_url} target="_blank" rel="noopener noreferrer">
                                  {tunnel.public_url}
                                </a>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap font-mono">{tunnel.proto}</td>
                              <td className="px-3 py-2 whitespace-nowrap font-mono">
                                {tunnel.config?.addr || 'unknown'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {!diagnostics.diagnostics.connections.ngrokActive && (
              <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Troubleshooting Steps</h3>
                <ol className="list-decimal list-inside space-y-2 text-blue-800">
                  <li>Check that you have a valid ngrok authentication token in your <code className="bg-blue-100 px-1 rounded">.env.local</code> file</li>
                  <li>Ensure <code className="bg-blue-100 px-1 rounded">USE_NGROK=true</code> is set in your environment variables</li>
                  <li><strong>Add <code className="bg-blue-100 px-1 rounded">NGROK_PORT=3000</code> to your .env.local file</strong></li>
                  <li>Verify that <code className="bg-blue-100 px-1 rounded">NGROK_PORT</code> matches your application port ({typeof window !== 'undefined' ? window.location.port || '3000' : '3000'})</li>
                  <li>Try running <code className="bg-blue-100 px-1 rounded">npm run demo</code> which will automatically update ngrok and handle configuration</li>
                  <li>Check if port 4040 is already in use by another process</li>
                  <li>If you're still having issues, try updating ngrok: <code className="bg-blue-100 px-1 rounded">npm uninstall ngrok && npm install ngrok@latest</code></li>
                </ol>
              </div>
            )}
            
            <div className="mt-8 flex justify-center">
              <a 
                href="/invitation-demo" 
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow transition"
              >
                Go to Invitation Demo
              </a>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-100 border border-gray-300 rounded">
            No diagnostic information available
          </div>
        )}
      </div>
    </div>
  );
}
