import https from 'https';
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Parse REST API Service
 * Provides query, count, and aggregate operations against the Parse Server.
 * Uses Master Key for full access (admin chat tool).
 */

const PARSE_SERVER_URL = process.env.PARSE_SERVER_URL || '';
const PARSE_APP_ID = process.env.PARSE_APP_ID || '';
const PARSE_MASTER_KEY = process.env.PARSE_MASTER_KEY || '';

/**
 * Makes an HTTP(S) request to the Parse REST API.
 * @param {string} method - HTTP method (GET, POST)
 * @param {string} endpoint - API endpoint path (e.g., /classes/Patients, /login)
 * @param {object} [body] - Request body for POST requests
 * @param {object} [queryParams] - URL query parameters for GET requests
 * @param {string} [sessionToken] - Optional Parse user session token
 * @returns {Promise<object>} Parsed JSON response
 */
function parseRequest(method, endpoint, body = null, queryParams = {}, sessionToken = null) {
  return new Promise((resolve, reject) => {
    if (!PARSE_SERVER_URL || !PARSE_APP_ID || !PARSE_MASTER_KEY) {
      return reject(new Error('Parse Server configuration is missing. Set PARSE_SERVER_URL, PARSE_APP_ID, and PARSE_MASTER_KEY in .env'));
    }

    const baseUrl = new URL(PARSE_SERVER_URL);
    const fullPath = baseUrl.pathname.replace(/\/$/, '') + endpoint;

    // Build query string for GET params
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }
    const queryString = searchParams.toString();
    const pathWithQuery = queryString ? `${fullPath}?${queryString}` : fullPath;

    const isHttps = baseUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const headers = {
      'X-Parse-Application-Id': PARSE_APP_ID,
      'X-Parse-Master-Key': PARSE_MASTER_KEY,
      'Content-Type': 'application/json'
    };

    if (sessionToken) {
      headers['X-Parse-Session-Token'] = sessionToken;
    }

    const options = {
      hostname: baseUrl.hostname,
      port: baseUrl.port || (isHttps ? 443 : 80),
      path: pathWithQuery,
      method: method.toUpperCase(),
      headers
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          try {
            const parsed = JSON.parse(data);
            reject(new Error(parsed.error || `Parse API error (HTTP ${res.statusCode})`));
          } catch (e) {
            reject(new Error(`Parse Server error (HTTP ${res.statusCode}): ${data.trim() || 'Bad Gateway / Server Unavailable'}`));
          }
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Failed to parse Parse Server response (HTTP ${res.statusCode}): ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Parse Server connection failed: ${err.message}`));
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Parse Server request timed out (15s)'));
    });

    if (body && method.toUpperCase() !== 'GET') {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

const CLASS_NAME_MAP = {
  'doctor': 'Doctors',
  'doctors': 'Doctors',
  'patient': 'Patients',
  'patients': 'Patients',
  'hospital': 'Hospitals',
  'hospitals': 'Hospitals',
  'specialty': 'Specialties',
  'specialties': 'Specialties',
  'speciality': 'Specialties',
  'specialities': 'Specialties',
  'booking': 'PatientsBookings',
  'bookings': 'PatientsBookings',
  'patientbooking': 'PatientsBookings',
  'patientbookings': 'PatientsBookings',
  'patientsbooking': 'PatientsBookings',
  'patientsbookings': 'PatientsBookings',
  'appointment': 'DoctorAppointments',
  'appointments': 'DoctorAppointments',
  'doctorappointment': 'DoctorAppointments',
  'doctorappointments': 'DoctorAppointments',
  'review': 'DoctorsReviews',
  'reviews': 'DoctorsReviews',
  'doctorreview': 'DoctorsReviews',
  'doctorsreviews': 'DoctorsReviews',
  'payment': 'Payments',
  'payments': 'Payments',
  'package': 'Packages',
  'packages': 'Packages',
  'user': '_User',
  'users': '_User',
  '_user': '_User',
  '_users': '_User',
  'chatroom': 'ChatRooms',
  'chatrooms': 'ChatRooms',
  'message': 'Messages',
  'messages': 'Messages',
  'videoroom': 'VideoRooms',
  'videorooms': 'VideoRooms',
  'city': 'Cities',
  'cities': 'Cities',
  'area': 'Areas',
  'areas': 'Areas',
  'adminprofile': 'AdminProfile',
  'adminrole': 'AdminRole',
  'admintype': 'AdminType'
};

export function normalizeClassName(className) {
  if (!className || typeof className !== 'string') return className;
  const clean = className.trim().replace(/[\s_-]+/g, '').toLowerCase();
  return CLASS_NAME_MAP[clean] || className.trim();
}

/**
 * Query a Parse class with optional filters, sorting, pagination, field selection, and pointer includes.
 *
 * @param {string} rawClassName - Parse class name (e.g., 'Patients', 'Doctors')
 * @param {object} [where] - Parse query constraint object (e.g., { fullname: { $regex: "Ahmed", $options: "i" } })
 * @param {number} [limit=20] - Maximum number of results to return
 * @param {number} [skip=0] - Number of results to skip (for pagination)
 * @param {string} [order] - Comma-separated field names to sort by (prefix with - for descending, e.g., '-createdAt')
 * @param {string} [include] - Comma-separated pointer field names to include (e.g., 'doctorDetails,hospitalDetails')
 * @param {string} [keys] - Comma-separated field names to return (projection)
 * @returns {Promise<object>} { results: [...], count?: number }
 */
export async function queryParseClass(rawClassName, { where, limit = 20, skip = 0, order, include, keys, sessionToken } = {}) {
  const className = normalizeClassName(rawClassName);
  const queryParams = {
    limit,
    skip,
    count: 1  // Always include count for context
  };

  if (where && Object.keys(where).length > 0) {
    queryParams.where = where;
  }
  if (order) queryParams.order = order;
  if (include) queryParams.include = include;
  if (keys) queryParams.keys = keys;

  const result = await parseRequest('GET', `/classes/${className}`, null, queryParams, sessionToken);
  return {
    results: result.results || [],
    count: result.count !== undefined ? result.count : (result.results || []).length,
    className
  };
}

/**
 * Count records in a Parse class with optional filters.
 *
 * @param {string} rawClassName - Parse class name
 * @param {object} [where] - Parse query constraint object
 * @param {string} [sessionToken] - Parse user session token
 * @returns {Promise<object>} { count: number, className: string }
 */
export async function countParseClass(rawClassName, where = {}, sessionToken = null) {
  const className = normalizeClassName(rawClassName);
  const queryParams = {
    limit: 0,
    count: 1
  };

  if (where && Object.keys(where).length > 0) {
    queryParams.where = where;
  }

  const result = await parseRequest('GET', `/classes/${className}`, null, queryParams, sessionToken);
  return {
    count: result.count || 0,
    className
  };
}

/**
 * Run an aggregation pipeline on a Parse class.
 * Uses the Parse aggregate endpoint for group/sum/avg/match operations.
 *
 * @param {string} rawClassName - Parse class name
 * @param {Array} pipeline - MongoDB-style aggregation pipeline array
 * @param {string} [sessionToken] - Parse user session token
 * @returns {Promise<object>} { results: [...], className: string }
 */
export async function aggregateParseData(rawClassName, pipeline = [], sessionToken = null) {
  const className = normalizeClassName(rawClassName);
  // Parse Server aggregate endpoint: GET /aggregate/<className> with pipeline query param
  const result = await parseRequest('GET', `/aggregate/${className}`, null, {
    ...(pipeline.length > 0 ? { pipeline: JSON.stringify(pipeline) } : {})
  }, sessionToken);
  return {
    results: result.results || result || [],
    className
  };
}

/**
 * Authenticates a user against Parse Server /login endpoint.
 * @param {object} params - { username, password }
 * @returns {Promise<object>} Authenticated user profile and session token
 */
export async function loginParseUser({ username, password }) {
  if (!username || !password) {
    throw new Error('Username/Email and Password are required.');
  }

  // Parse REST API supports GET /login?username=...&password=...
  const user = await parseRequest('GET', '/login', null, { username, password });
  return {
    success: true,
    user: {
      objectId: user.objectId,
      username: user.username,
      email: user.email,
      fullname: user.fullname || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      type: user.type || 'user',
      sessionToken: user.sessionToken
    }
  };
}

/**
 * Validates a Parse user session token against /users/me.
 * @param {string} sessionToken
 * @returns {Promise<object>} User profile if valid
 */
export async function verifyParseSessionToken(sessionToken) {
  if (!sessionToken) {
    throw new Error('Session token is required.');
  }
  const user = await parseRequest('GET', '/users/me', null, {}, sessionToken);
  return {
    success: true,
    user: {
      objectId: user.objectId,
      username: user.username,
      email: user.email,
      fullname: user.fullname || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      type: user.type || 'user',
      sessionToken: user.sessionToken || sessionToken
    }
  };
}

/**
 * Check if Parse Server is reachable and configured.
 * @returns {Promise<object>} { connected: boolean, serverUrl: string, error?: string }
 */
export async function checkParseConnection() {
  try {
    if (!PARSE_SERVER_URL || !PARSE_APP_ID || !PARSE_MASTER_KEY) {
      return { connected: false, serverUrl: PARSE_SERVER_URL, error: 'Missing Parse configuration' };
    }

    // Try a simple health check by querying _User with limit 0
    await parseRequest('GET', '/classes/_User', null, { limit: 0 });
    return { connected: true, serverUrl: PARSE_SERVER_URL };
  } catch (err) {
    return { connected: false, serverUrl: PARSE_SERVER_URL, error: err.message };
  }
}
