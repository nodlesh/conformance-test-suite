import { NextApiRequest, NextApiResponse } from 'next';
import { createHolderInvitation, createVerifierInvitation } from '@/services/agentService';

/**
 * API handler for generating agent invitations
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { type, label } = req.body;

    if (!type || (type !== 'holder' && type !== 'verifier')) {
      return res.status(400).json({ 
        message: 'Invalid invitation type. Must be "holder" or "verifier"' 
      });
    }

    let invitation;
    if (type === 'holder') {
      invitation = await createHolderInvitation(label || 'Ayra Holder Test');
    } else {
      invitation = await createVerifierInvitation(label || 'Ayra Verifier Test');
    }

    return res.status(200).json(invitation);
  } catch (error) {
    console.error('Error generating invitation:', error);
    return res.status(500).json({ 
      message: 'Failed to generate invitation', 
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
