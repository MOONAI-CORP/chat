// Simple basic auth for admin dashboard
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Cozy Cloud Admin"');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const base64 = authHeader.split(' ')[1];
  const [username, password] = Buffer.from(base64, 'base64').toString().split(':');

  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Cozy Cloud Admin"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }
}

module.exports = { adminAuth };
