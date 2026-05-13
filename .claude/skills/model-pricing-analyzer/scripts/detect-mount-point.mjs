#!/usr/bin/env node
/**
 * Detect AIGNE Hub blocklet mount point from __blocklet__.js
 * Returns the mount point for constructing correct API URLs
 */

import axios from 'axios';

// AIGNE Hub blocklet DID (ai-kit)
const AIGNE_HUB_DID = 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ';

/**
 * @param {string} hubUrl - Base Hub URL (e.g., https://staging-hub.aigne.io)
 * @returns {Promise<string>} - Mount point prefix (e.g., "/" or "/app")
 */
export async function detectMountPoint(hubUrl) {
  try {
    const { origin } = new URL(hubUrl);

    // Use the more precise endpoint that returns JSON
    const response = await axios.get(`${origin}/__blocklet__.js?type=json&owner=1&nocache=1`, {
      timeout: 10000,
    });

    // Response is JSON with componentMountPoints array
    const data = response.data;

    if (data.componentMountPoints && Array.isArray(data.componentMountPoints)) {
      // Find AIGNE Hub component by DID
      const aigneHub = data.componentMountPoints.find((comp) => comp.did === AIGNE_HUB_DID);

      if (aigneHub && aigneHub.mountPoint) {
        return aigneHub.mountPoint;
      }
    }

    // Fallback to root if not found
    console.warn(`Could not find AIGNE Hub component in ${hubUrl}, defaulting to "/"`);
    return '/';
  } catch (error) {
    console.warn(`Failed to detect mount point for ${hubUrl}: ${error.message}`);
    return '/'; // Default fallback
  }
}

/**
 * Build API URL with correct mount point
 * @param {string} hubUrl - Base Hub URL
 * @param {string} apiPath - API path (e.g., "/api/ai-providers/model-rates")
 * @returns {Promise<string>} - Complete API URL
 */
export async function buildApiUrl(hubUrl, apiPath) {
  const { origin } = new URL(hubUrl);
  const mountPoint = await detectMountPoint(hubUrl);

  // Remove leading slash from apiPath if present
  const cleanApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;

  // Construct: origin + mountPoint + apiPath
  // mountPoint already has leading slash, apiPath too
  // Need to avoid double slashes
  if (mountPoint === '/') {
    return `${origin}${cleanApiPath}`;
  }

  return `${origin}${mountPoint}${cleanApiPath}`;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const hubUrl = process.argv[2];

  if (!hubUrl) {
    console.error('Usage: node detect-mount-point.mjs <hub-url>');
    process.exit(1);
  }

  detectMountPoint(hubUrl)
    .then((prefix) => {
      console.log(prefix);
    })
    .catch((error) => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
