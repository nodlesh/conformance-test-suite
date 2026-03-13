import React, { useState, useEffect } from 'react';
import InviteCreator from '@/components/InviteCreator';
import { getNgrokUrl, getBaseUrl } from '@/services/agentService';

export default function InvitationDemo() {
  const [inviteType, setInviteType] = useState<'holder' | 'verifier'>('holder');
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [ngrokUrl, setNgrokUrl] = useState<string | null>(null);
  const [serverNgrokStatus, setServerNgrokStatus] = useState<any>(null);

  // Fetch the URLs on client-side
  useEffect(() => {
    const fetchUrls = async () => {
      const baseUrlResult = await getBaseUrl();
      const ngrokUrlResult = await getNgrokUrl();
      setBaseUrl(baseUrlResult);
      setNgrokUrl(ngrokUrlResult);
    };
    
    fetchUrls();
    
    // Also check server-side ngrok status
    fetch('/api/diagnostics')
      .then(response => response.json())
      .then(data => {
        if (data.diagnostics?.connections?.ngrokActive) {
          setNgrokUrl(data.diagnostics.connections.ngrokUrl);
        }
      })
      .catch(error => {
        console.error('Error fetching diagnostics:', error);
      });
  }, []);

  // Determine if ngrok is active using either local state or server state
  const isNgrokActive = !!ngrokUrl || (serverNgrokStatus?.ngrokActive || false);
  const actualNgrokUrl = ngrokUrl || (serverNgrokStatus?.ngrokUrl || null);

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Ayra DIDComm Invitation Demo
        </h1>
        
        <div className="bg-white shadow-sm rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Connection Details</h2>
          
          <div className="mb-4">
            <div className="font-medium text-sm text-gray-500 mb-1">Base URL:</div>
            <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200">
              {baseUrl || 'Loading...'}
            </div>
          </div>
          
          {actualNgrokUrl && (
            <div className="mb-4">
              <div className="font-medium text-sm text-gray-500 mb-1">Ngrok URL (Active):</div>
              <div className="px-3 py-2 bg-green-50 rounded border border-green-200 text-green-800">
                {actualNgrokUrl}
              </div>
            </div>
          )}
          
          {!isNgrokActive && (
            <div className="mb-4">
              <div className="px-3 py-2 bg-yellow-50 rounded border border-yellow-200 text-yellow-700">
                <p className="font-semibold">⚠️ No ngrok tunnel detected!</p>
                <p className="text-sm">Mobile devices will need to be on the same network to connect.</p>
                <a href="/diagnostics" className="text-blue-600 underline text-sm">View Diagnostics</a>
              </div>
            </div>
          )}
          
          <div className="bg-yellow-50 rounded p-4 text-sm text-yellow-800">
            <p className="font-medium">Note:</p>
            <p>
              For mobile testing, ensure your device can access the ngrok URL. 
              When no ngrok tunnel is used, the mobile device must be on the same network.
            </p>
          </div>
        </div>
        
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setInviteType('holder')}
              className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                inviteType === 'holder'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Holder Invitation
            </button>
            <button
              type="button"
              onClick={() => setInviteType('verifier')}
              className={`px-4 py-2 text-sm font-medium rounded-r-md border ${
                inviteType === 'verifier'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Verifier Invitation
            </button>
          </div>
        </div>

        <InviteCreator 
          type={inviteType} 
          label={inviteType === 'holder' ? 'Ayra Holder Test' : 'Ayra Verifier Test'}
          size={300}
        />
        
        <div className="mt-12 bg-indigo-50 p-4 rounded-lg text-sm">
          <h2 className="font-medium text-indigo-800 mb-2">End-to-End Flow:</h2>
          <ol className="list-decimal list-inside text-indigo-700 space-y-1">
            <li>Select the invitation type (Holder or Verifier) above</li>
            <li>Scan the QR code with a compatible wallet app</li>
            <li>For Holder: A presentation will be requested from the holder app from Ayra</li>
            <li>For Verifier: A presentation will be requested from the verifier to Ayra</li>
          </ol>
        </div>
        
        {/* Debug section - hidden by default */}
        <details className="mt-6 text-xs border border-gray-200 rounded p-2 bg-gray-50">
          <summary className="font-medium cursor-pointer">Connection Status Debug</summary>
          <div className="mt-2 p-2">
            <p className="mb-1">Client-side state:</p>
            <ul className="list-disc list-inside mb-2 font-mono bg-gray-100 p-2 rounded">
              <li>ngrokUrl: {ngrokUrl || 'null'}</li>
              <li>baseUrl: {baseUrl || 'null'}</li>
              <li>isNgrokActive: {isNgrokActive ? 'true' : 'false'}</li>
            </ul>
            
            <p className="mb-1">Server-side state:</p>
            <div className="font-mono bg-gray-100 p-2 rounded">
              {serverNgrokStatus ? (
                <pre>{JSON.stringify(serverNgrokStatus, null, 2)}</pre>
              ) : (
                'Loading server status...'
              )}
            </div>
            
            <div className="mt-4">
              <a href="/diagnostics" className="text-blue-600 underline">
                Open Full Diagnostics Page
              </a>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
