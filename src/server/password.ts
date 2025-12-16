function BytesToHex(bytes: GoogleAppsScript.Byte[]): string {
  let hex: string = '';
  for (const byte of bytes) {
    hex += (byte < 0 ? 256 + byte : byte).toString(16).padStart(2, '0');
  }
  return hex;
}

function Sha256Hash(value: string): string {
  return BytesToHex(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
  );
}

function HMacSha256(value: string, key: string): string {
  return BytesToHex(
    Utilities.computeHmacSha256Signature(value, key)
  );
}

async function validatePassword(
  password: string,
  sessionId: string
): Promise<boolean> {
  if (!sessionId) {
    throw new Error('Session ID is required for password validation.');
  }

  if (typeof password !== 'string') {
    throw new Error('Invalid password provided.');
  }

  // Get the password from Script Properties
  // const scriptProperties = PropertiesService.getScriptProperties();
  // const correctPassword = scriptProperties.getProperty('PAGE_PASSWORD');

  const correctPassword = '123456'; // For testing purposes only

  if (!correctPassword) {
    return true;
  }

  const isValid = password === HMacSha256(correctPassword, sessionId);

  // If valid, store the session as authenticated
  if (isValid) {
    const cache = CacheService.getDocumentCache();
    if (cache) {
      // Store for 30 minutes (1800 seconds)
      cache.put(`auth_session_${sessionId}`, '1', 1800);
    }
  }

  return isValid;
}

function isSessionAuthenticated(sessionId: string): boolean {
  if (!sessionId) {
    return false;
  }

  const cache = CacheService.getDocumentCache();
  if (cache) {
    const authStatus = cache.get(`auth_session_${sessionId}`);
    return authStatus === '1';
  }

  return false;
}

export { validatePassword, isSessionAuthenticated };
