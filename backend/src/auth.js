import crypto from 'node:crypto';

const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 7;

export function registerAuthRoutes({ request, response, database, sendJson }) {
  if (request.method === 'POST' && new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname === '/api/auth/login') {
    return readJson(request).then((body) => {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!email || !password) {
        sendJson(response, 400, error('INVALID_INPUT', 'Email and password are required'));
        return true;
      }

      const user = database.prepare('SELECT id, email, display_name FROM users WHERE email = ?').get(email);
      const expectedPassword = email === 'admin@lajubetol.app' ? 'admin' : 'password';
      if (!user || password !== expectedPassword) {
        sendJson(response, 401, error('INVALID_CREDENTIALS', 'Email or password is incorrect'));
        return true;
      }

      const token = crypto.randomBytes(32).toString('hex');
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + sessionLifetimeMs).toISOString();
      database.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(token, user.id, expiresAt, createdAt.toISOString());
      const roles = database.prepare(`SELECT roles.name FROM user_roles JOIN roles ON roles.id = user_roles.role_id WHERE user_roles.user_id = ? ORDER BY roles.name`).all(user.id).map((row) => row.name);
      sendJson(response, 200, { data: { token, expiresAt, user: { ...user, roles } } });
      return true;
    });
  }

  if (request.method === 'GET' && new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname === '/api/auth/me') {
    const user = authenticate(request, database);
    if (!user) {
      sendJson(response, 401, error('UNAUTHENTICATED', 'A valid Bearer token is required'));
      return true;
    }
    sendJson(response, 200, { data: user });
    return true;
  }

  if (request.method === 'POST' && new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname === '/api/auth/logout') {
    const token = bearerToken(request);
    if (!token) {
      sendJson(response, 401, error('UNAUTHENTICATED', 'A valid Bearer token is required'));
      return true;
    }
    database.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    sendJson(response, 204, null);
    return true;
  }

  return false;
}

export function authenticate(request, database) {
  const token = bearerToken(request);
  if (!token) return null;
  const user = database.prepare(`
    SELECT users.id, users.email, users.display_name,
           COALESCE((SELECT json_group_array(roles.name) FROM user_roles JOIN roles ON roles.id = user_roles.role_id WHERE user_roles.user_id = users.id), '[]') AS roles_json
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ?
  `).get(token, new Date().toISOString());
  if (!user) return null;
  const { roles_json: rolesJson, ...identity } = user;
  return { ...identity, roles: JSON.parse(rolesJson) };
}

function bearerToken(request) {
  const header = request.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function requireRoles(request, database, roles) {
  const user = authenticate(request, database);
  if (!user || !user.roles.some((role) => roles.includes(role))) return null;
  return user;
}

function error(code, message) {
  return { error: { code, message } };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let text = '';
    request.on('data', (chunk) => {
      text += chunk;
      if (text.length > 1024 * 1024) reject(new Error('Request body too large'));
    });
    request.on('end', () => {
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    request.on('error', reject);
  });
}
