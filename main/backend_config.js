// Backend configuration for OHR
// Automatically detects development vs production environment

function getBackendUrl() {
  // Check for explicit override via URL parameter or environment
  const urlParams = new URLSearchParams(window.location.search);
  const explicitBackend = urlParams.get('backend');
  if (explicitBackend) {
    return explicitBackend;
  }

  // Production: Use environment variable or default to your deployed Workers URL
  // Set this when deploying to production, e.g., https://ohr-backend.yourname.workers.dev
  if (typeof window !== 'undefined' && window.OHR_BACKEND_URL) {
    return window.OHR_BACKEND_URL;
  }

  // Development: Detect if running on localhost
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '';
  
  if (isLocalhost) {
    return 'http://127.0.0.1:8787'; // Local development
  }

  // Production fallback: deployed Cloudflare Worker (race API)
  return 'https://ohr-backend.capscrewunlimited.workers.dev';
}

const BACKEND_CONFIG = {
  backendBaseUrl: getBackendUrl(),
  features: {
    // Client-side only modules remain local
    jukeboxClientSide: true,
    selectionClientSide: true,
    // Race visuals sync from server
    raceVisualsFromServer: true,
  },
  // Expose environment info for debugging
  isDevelopment: window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' ||
                 window.location.hostname === ''
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BACKEND_CONFIG;
} else {
  window.BACKEND_CONFIG = BACKEND_CONFIG;
}

// Log backend configuration (helpful for debugging)
if (BACKEND_CONFIG.isDevelopment) {
  console.log('[OHR] Running in DEVELOPMENT mode');
  console.log('[OHR] Backend URL:', BACKEND_CONFIG.backendBaseUrl);
  console.log('[OHR] Tip: Use ?backend=URL to override backend URL');
} else {
  console.log('[OHR] Running in PRODUCTION mode');
  console.log('[OHR] Backend URL:', BACKEND_CONFIG.backendBaseUrl);
}


