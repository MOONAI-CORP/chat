#!/usr/bin/env node
/**
 * Shopify OAuth Token Exchange
 * 1. Starts a local server to catch the callback
 * 2. Opens the auth URL in your browser
 * 3. Catches the code and exchanges it for a permanent access token
 * 4. Saves the token to .env
 */
require('dotenv').config();
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STORE = process.env.SHOPIFY_STORE_URL;
const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const PORT = 3457;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'read_products,read_orders,write_orders,read_customers,read_inventory,read_fulfillments';

const authUrl = `https://${STORE}/admin/oauth/authorize?client_id=${API_KEY}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

console.log('\n  ☁️  Cozy Cloud — Shopify OAuth Setup');
console.log('  ────────────────────────────────────\n');
console.log('  IMPORTANT: First, go to your Shopify app settings and add this redirect URL:\n');
console.log(`  ${REDIRECT_URI}\n`);
console.log('  Then press ENTER to open the authorization page...\n');

process.stdin.once('data', () => {
  // Start callback server
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const shop = url.searchParams.get('shop');

      if (!code) {
        res.writeHead(400);
        res.end('Missing code parameter');
        return;
      }

      console.log(`  ✓ Got authorization code: ${code.substring(0, 8)}...`);
      console.log('  Exchanging for permanent access token...\n');

      try {
        const token = await exchangeToken(code);
        console.log(`  ✓ Access Token: ${token}\n`);

        // Save to .env
        const envPath = path.join(__dirname, '..', '..', '.env');
        let envContent = fs.readFileSync(envPath, 'utf8');
        envContent = envContent.replace(
          /SHOPIFY_ACCESS_TOKEN=.*/,
          `SHOPIFY_ACCESS_TOKEN=${token}`
        );
        fs.writeFileSync(envPath, envContent);
        console.log('  ✓ Token saved to .env\n');
        console.log('  You can now start the server with: npm start\n');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
            <h1>✅ Authorized!</h1>
            <p>Access token saved. You can close this window.</p>
            <p style="color:#888;font-size:14px;">Token: ${token.substring(0, 12)}...</p>
          </body></html>
        `);

        setTimeout(() => { server.close(); process.exit(0); }, 2000);
      } catch (err) {
        console.error('  ✗ Token exchange failed:', err.message);
        res.writeHead(500);
        res.end('Token exchange failed: ' + err.message);
        setTimeout(() => { server.close(); process.exit(1); }, 2000);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`  Callback server running on http://localhost:${PORT}`);
    console.log(`  Opening authorization page...\n`);

    // Open in default browser
    try {
      execSync(`open "${authUrl}"`);
    } catch (e) {
      console.log(`  Could not auto-open. Visit this URL manually:\n`);
      console.log(`  ${authUrl}\n`);
    }
  });
});

function exchangeToken(code) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      client_id: API_KEY,
      client_secret: API_SECRET,
      code: code,
    });

    const req = https.request({
      hostname: STORE,
      path: '/admin/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(JSON.stringify(parsed)));
          }
        } catch (e) {
          reject(new Error('Invalid response: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
