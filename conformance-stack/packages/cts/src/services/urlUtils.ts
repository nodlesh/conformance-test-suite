/**
 * Formats a domain string to ensure it's valid for invitation URLs.
 * 
 * @param domain The domain to format
 * @returns A properly formatted domain
 */
export const formatDomain = (domain?: string): string => {
  if (!domain) return '';
  
  // Ensure protocol exists
  let formattedDomain = domain;
  if (!formattedDomain.startsWith('http://') && !formattedDomain.startsWith('https://')) {
    formattedDomain = `https://${formattedDomain}`;
  }
  
  // Remove trailing slashes to avoid double slashes in URLs
  return formattedDomain.replace(/\/+$/, '');
};

/**
 * Creates a valid invitation URL from an out-of-band invitation and domain.
 * 
 * @param outOfBandInvitation The out-of-band invitation to convert to a URL
 * @param domain The domain to use for the URL
 * @returns A properly formatted invitation URL
 */
export const createInvitationUrl = (outOfBandInvitation: any, domain?: string): string => {
  const formattedDomain = formatDomain(domain);
  
  try {
    const url = outOfBandInvitation.toUrl({ domain: formattedDomain });
    
    // Validate URL format
    new URL(url); // Will throw if invalid
    return url;
  } catch (error) {
    console.error('Error generating invitation URL:', error);
    
    // Try a fallback without domain if there's an issue
    try {
      return outOfBandInvitation.toUrl({});
    } catch (fallbackError) {
      console.error('Error with fallback invitation URL:', fallbackError);
      throw new Error('Unable to generate a valid invitation URL');
    }
  }
};
