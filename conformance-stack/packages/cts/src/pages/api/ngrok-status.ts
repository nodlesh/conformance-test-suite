import { NextApiRequest, NextApiResponse } from 'next';
import { getNgrokUrl, getBaseUrl } from '@/services/agentService';

/**
 * Simple API endpoint to check ngrok status
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ngrokUrl = getNgrokUrl();
    const baseUrl = getBaseUrl();
    
    return res.status(200).json({
      ngrokActive: !!ngrokUrl,
      ngrokUrl: ngrokUrl || null,
      baseUrl: baseUrl
    });
  } catch (error) {
    console.error('Error checking ngrok status:', error);
    return res.status(500).json({ 
      error: 'Failed to check ngrok status',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
