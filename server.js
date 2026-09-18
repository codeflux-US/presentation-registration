require('dotenv').config();

const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
app.use((req, res, next) => {
  const allowedOrigin = 'https://codeflux-us.github.io';

  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY;
const COOKIE_NAME = 'token';
const SALT_ROUNDS = 10;

if (!JWT_SECRET || !ADMIN_SETUP_KEY) {
  console.error('FATAL: JWT_SECRET and ADMIN_SETUP_KEY must be set in .env');
  process.exit(1);
}

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 4000),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  ssl: process.env.DB_SSL === 'true'
  ?{
    minVersion: 'TLSv1.2'
  }
  : undefined
});

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function sendSuccess(res, status, data) {
  return res.status(status).json({ success: true, ...data });
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidPhone(phone) {
  return typeof phone === 'string' && /^[0-9]{7,15}$/.test(phone.trim());
}
function isNonEmptyString(val, maxLen = 255) {
  return typeof val === 'string' && val.trim().length > 0 && val.trim().length <= maxLen;
}

const VALID_SECTIONS = ['A', 'B', 'C'];
const VALID_TEAM_TYPES = ['Individual', 'Team of 2', 'Team of 3', 'Team of 4', 'Team of 5'];
const VALID_STATUSES = ['Registered', 'Pending', 'Completed', 'Cancelled'];

function teamTypeSize(teamType) {
  const map = {
    'Individual': 1,
    'Team of 2': 2,
    'Team of 3': 3,
    'Team of 4': 4,
    'Team of 5': 5
  };
  return map[teamType] || 0;
}

async function generateRegistrationId(connection) {
  const year = new Date().getFullYear();

  await connection.execute(
    'UPDATE registration_sequence SET sequence_value = sequence_value + 1 WHERE id = 1'
  );
  const [rows] = await connection.execute(
    'SELECT sequence_value FROM registration_sequence WHERE id = 1'
  );
  const seq = rows[0].sequence_value;
  const padded = String(seq).padStart(5, '0');
  return `SE-${year}-${padded}`;
}

function authenticate(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return sendError(res, 401, 'Not authenticated. Please log in.');
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return sendError(res, 401, 'Invalid or expired session. Please log in again.');
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(res, 403, 'Forbidden: admin access required.');
  }
  next();
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body || {};

    if (!isNonEmptyString(name, 150)) {
      return sendError(res, 400, 'Full name is required.');
    }
    if (!isValidEmail(email)) {
      return sendError(res, 400, 'A valid email address is required.');
    }
    if (typeof password !== 'string' || password.length < 8) {
      return sendError(res, 400, 'Password must be at least 8 characters long.');
    }
    if (password !== confirmPassword) {
      return sendError(res, 400, 'Password and confirm password do not match.');
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );
    if (existing.length > 0) {
      return sendError(res, 409, 'An account with this email already exists.');
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name.trim(), normalizedEmail, hashed, 'student']
    );

    return sendSuccess(res, 201, {
      message: 'Account created successfully. You can now log in.',
      user: { id: result.insertId, name: name.trim(), email: normalizedEmail, role: 'student' }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    return sendError(res, 500, 'Something went wrong while creating your account.');
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0) {
      return sendError(res, 400, 'Email and password are required.');
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [rows] = await pool.execute(
      'SELECT id, name, email, password, role FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return sendSuccess(res, 200, {
      message: 'Login successful.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return sendError(res, 500, 'Something went wrong while logging in.');
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return sendSuccess(res, 200, { message: 'Logged out successfully.' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  return sendSuccess(res, 200, { user: req.user });
});

app.post('/api/auth/setup-admin', async (req, res) => {
  try {
    const { setupKey, name, email, password } = req.body || {};

    if (typeof setupKey !== 'string' || setupKey !== ADMIN_SETUP_KEY) {
      return sendError(res, 403, 'Invalid setup key.');
    }
    if (!isNonEmptyString(name, 150)) {
      return sendError(res, 400, 'Admin name is required.');
    }
    if (!isValidEmail(email)) {
      return sendError(res, 400, 'A valid admin email is required.');
    }
    if (typeof password !== 'string' || password.length < 8) {
      return sendError(res, 400, 'Password must be at least 8 characters long.');
    }

    const [adminRows] = await pool.execute(
      'SELECT id FROM users WHERE role = ? LIMIT 1',
      ['admin']
    );
    if (adminRows.length > 0) {
      return sendError(res, 409, 'Admin account already exists.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );
    if (existing.length > 0) {
      return sendError(res, 409, 'An account with this email already exists.');
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name.trim(), normalizedEmail, hashed, 'admin']
    );

    return sendSuccess(res, 201, {
      message: 'Admin account created successfully.',
      user: { id: result.insertId, name: name.trim(), email: normalizedEmail, role: 'admin' }
    });
  } catch (err) {
    console.error('Setup admin error:', err.message);
    return sendError(res, 500, 'Something went wrong while creating the admin account.');
  }
});

app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return sendError(res, 404, 'User not found.');
    }

    const [countRows] = await pool.execute(
      'SELECT COUNT(*) AS count FROM presentations WHERE user_id = ?',
      [req.user.id]
    );

    return sendSuccess(res, 200, {
      profile: { ...rows[0], registrationCount: countRows[0].count }
    });
  } catch (err) {
    console.error('Profile error:', err.message);
    return sendError(res, 500, 'Could not load profile.');
  }
});

function validatePresentationPayload(body) {
  const errors = [];
  const { topic, subject, section, teamType, presentationDate, presentationTime, members } = body || {};

  if (!isNonEmptyString(topic, 255)) errors.push('Presentation topic is required.');
  if (!isNonEmptyString(subject, 150)) errors.push('Subject is required.');
  if (!VALID_SECTIONS.includes(section)) errors.push('A valid section (A, B, or C) is required.');
  if (!VALID_TEAM_TYPES.includes(teamType)) errors.push('A valid team type is required.');

  if (!presentationDate || isNaN(Date.parse(presentationDate))) {
    errors.push('A valid presentation date is required.');
  }
  if (typeof presentationTime !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(presentationTime)) {
    errors.push('A valid presentation time is required.');
  }

  const expectedSize = teamTypeSize(teamType);
  if (!Array.isArray(members) || members.length !== expectedSize) {
    errors.push(`Exactly ${expectedSize} team member(s) must be provided for "${teamType}".`);
  } else {
    const rollNumbers = new Set();
    const emails = new Set();
    members.forEach((m, idx) => {
      if (!isNonEmptyString(m.name, 150)) errors.push(`Member ${idx + 1}: name is required.`);
      if (!isNonEmptyString(m.rollNumber, 50)) errors.push(`Member ${idx + 1}: roll number is required.`);
      if (!isValidEmail(m.email)) errors.push(`Member ${idx + 1}: valid email is required.`);
      if (!isValidPhone(m.phone)) errors.push(`Member ${idx + 1}: valid phone number is required.`);

      if (m.rollNumber) {
        const roll = m.rollNumber.trim().toLowerCase();
        if (rollNumbers.has(roll)) errors.push(`Duplicate roll number found: ${m.rollNumber}`);
        rollNumbers.add(roll);
      }
      if (m.email) {
        const em = m.email.trim().toLowerCase();
        if (emails.has(em)) errors.push(`Duplicate member email found: ${m.email}`);
        emails.add(em);
      }
    });
  }

  return errors;
}

app.get('/api/presentations', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, registration_id, topic, subject, section, team_type,
              presentation_date, presentation_time, status, created_at
       FROM presentations
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    return sendSuccess(res, 200, { presentations: rows });
  } catch (err) {
    console.error('List presentations error:', err.message);
    return sendError(res, 500, 'Could not load registrations.');
  }
});

app.get('/api/presentations/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 400, 'Invalid registration id.');

    const [rows] = await pool.execute('SELECT * FROM presentations WHERE id = ?', [id]);
    if (rows.length === 0) return sendError(res, 404, 'Registration not found.');

    const presentation = rows[0];
    if (req.user.role !== 'admin' && presentation.user_id !== req.user.id) {
      return sendError(res, 403, 'You are not allowed to view this registration.');
    }

    const [members] = await pool.execute(
      'SELECT id, name, roll_number, email, phone FROM team_members WHERE presentation_id = ?',
      [id]
    );

    return sendSuccess(res, 200, { presentation, members });
  } catch (err) {
    console.error('Get presentation error:', err.message);
    return sendError(res, 500, 'Could not load registration details.');
  }
});

app.post('/api/presentations', authenticate, async (req, res) => {
  const errors = validatePresentationPayload(req.body);
  if (errors.length > 0) {
    return sendError(res, 400, errors[0]);
  }

  const { topic, subject, section, teamType, presentationDate, presentationTime, members } = req.body;

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const registrationId = await generateRegistrationId(connection);

    const [result] = await connection.execute(
      `INSERT INTO presentations
        (user_id, registration_id, topic, subject, section, team_type, presentation_date, presentation_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [req.user.id, registrationId, topic.trim(), subject.trim(), section, teamType, presentationDate, presentationTime]
    );

    const presentationId = result.insertId;

    for (const m of members) {
      await connection.execute(
        `INSERT INTO team_members (presentation_id, name, roll_number, email, phone)
         VALUES (?, ?, ?, ?, ?)`,
        [presentationId, m.name.trim(), m.rollNumber.trim(), m.email.trim().toLowerCase(), m.phone.trim()]
      );
    }

    await connection.commit();

    return sendSuccess(res, 201, {
      message: 'Registration submitted successfully.',
      presentation: {
        id: presentationId,
        registration_id: registrationId,
        topic, subject, section, team_type: teamType,
        presentation_date: presentationDate,
        presentation_time: presentationTime,
        status: 'Pending',
        member_count: members.length
      }
    });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Create presentation error:', err.message);
    return sendError(res, 500, 'Could not save registration. Please try again.');
  } finally {
    if (connection) connection.release();
  }
});

app.put('/api/presentations/:id', authenticate, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return sendError(res, 400, 'Invalid registration id.');

  const errors = validatePresentationPayload(req.body);
  if (errors.length > 0) {
    return sendError(res, 400, errors[0]);
  }

  const { topic, subject, section, teamType, presentationDate, presentationTime, members } = req.body;

  let connection;
  try {
    const [existingRows] = await pool.execute('SELECT * FROM presentations WHERE id = ?', [id]);
    if (existingRows.length === 0) return sendError(res, 404, 'Registration not found.');

    const existing = existingRows[0];
    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return sendError(res, 403, 'You are not allowed to edit this registration.');
    }
    if (existing.status === 'Cancelled') {
      return sendError(res, 400, 'A cancelled registration cannot be edited.');
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE presentations
       SET topic = ?, subject = ?, section = ?, team_type = ?, presentation_date = ?, presentation_time = ?
       WHERE id = ?`,
      [topic.trim(), subject.trim(), section, teamType, presentationDate, presentationTime, id]
    );

    await connection.execute('DELETE FROM team_members WHERE presentation_id = ?', [id]);

    for (const m of members) {
      await connection.execute(
        `INSERT INTO team_members (presentation_id, name, roll_number, email, phone)
         VALUES (?, ?, ?, ?, ?)`,
        [id, m.name.trim(), m.rollNumber.trim(), m.email.trim().toLowerCase(), m.phone.trim()]
      );
    }

    await connection.commit();
    return sendSuccess(res, 200, { message: 'Registration updated successfully.' });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Update presentation error:', err.message);
    return sendError(res, 500, 'Could not update registration.');
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/api/presentations/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 400, 'Invalid registration id.');

    const [rows] = await pool.execute('SELECT * FROM presentations WHERE id = ?', [id]);
    if (rows.length === 0) return sendError(res, 404, 'Registration not found.');

    const presentation = rows[0];
    if (req.user.role !== 'admin' && presentation.user_id !== req.user.id) {
      return sendError(res, 403, 'You are not allowed to cancel this registration.');
    }

    await pool.execute('UPDATE presentations SET status = ? WHERE id = ?', ['Cancelled', id]);
    return sendSuccess(res, 200, { message: 'Registration cancelled successfully.' });
  } catch (err) {
    console.error('Cancel presentation error:', err.message);
    return sendError(res, 500, 'Could not cancel registration.');
  }
});

app.get('/api/admin/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    const [[studentCount]] = await pool.query(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'student'"
    );
    const [[totalPresentations]] = await pool.query('SELECT COUNT(*) AS count FROM presentations');

    const [statusRows] = await pool.query(
      `SELECT status, COUNT(*) AS count FROM presentations GROUP BY status`
    );
    const [sectionRows] = await pool.query(
      `SELECT section, COUNT(*) AS count FROM presentations GROUP BY section`
    );

    const statusCounts = { Registered: 0, Pending: 0, Completed: 0, Cancelled: 0 };
    statusRows.forEach(r => { statusCounts[r.status] = r.count; });

    const sectionCounts = { A: 0, B: 0, C: 0 };
    sectionRows.forEach(r => { sectionCounts[r.section] = r.count; });

    return sendSuccess(res, 200, {
      stats: {
        totalStudents: studentCount.count,
        totalPresentations: totalPresentations.count,
        ...statusCounts,
        sectionA: sectionCounts.A,
        sectionB: sectionCounts.B,
        sectionC: sectionCounts.C
      }
    });
  } catch (err) {
    console.error('Admin dashboard error:', err.message);
    return sendError(res, 500, 'Could not load dashboard data.');
  }
});

app.get('/api/admin/presentations', authenticate, requireAdmin, async (req, res) => {
  try {
    const { search, section, subject, teamType, status, date, sortBy, sortOrder } = req.query;

    let sql = `
      SELECT p.*, u.name AS student_name, u.email AS student_email,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.presentation_id = p.id) AS member_count
      FROM presentations p
      JOIN users u ON u.id = p.user_id
      WHERE 1 = 1`;
    const params = [];

    if (search && search.trim() !== '') {
      sql += ` AND (p.registration_id LIKE ? OR p.topic LIKE ? OR u.name LIKE ?
                OR p.id IN (SELECT presentation_id FROM team_members WHERE roll_number LIKE ?))`;
      const like = `%${search.trim()}%`;
      params.push(like, like, like, like);
    }
    if (section && VALID_SECTIONS.includes(section)) {
      sql += ' AND p.section = ?';
      params.push(section);
    }
    if (subject && subject.trim() !== '') {
      sql += ' AND p.subject LIKE ?';
      params.push(`%${subject.trim()}%`);
    }
    if (teamType && VALID_TEAM_TYPES.includes(teamType)) {
      sql += ' AND p.team_type = ?';
      params.push(teamType);
    }
    if (status && VALID_STATUSES.includes(status)) {
      sql += ' AND p.status = ?';
      params.push(status);
    }
    if (date && !isNaN(Date.parse(date))) {
      sql += ' AND p.presentation_date = ?';
      params.push(date);
    }

    const sortColumns = { date: 'p.presentation_date', topic: 'p.topic', registration_id: 'p.registration_id' };
    const sortColumn = sortColumns[sortBy] || 'p.created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortColumn} ${order}`;

    const [rows] = await pool.query(sql, params);
    return sendSuccess(res, 200, { presentations: rows });
  } catch (err) {
    console.error('Admin list presentations error:', err.message);
    return sendError(res, 500, 'Could not load registrations.');
  }
});

app.put('/api/admin/presentations/:id/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body || {};
    if (isNaN(id)) return sendError(res, 400, 'Invalid registration id.');
    if (!VALID_STATUSES.includes(status)) return sendError(res, 400, 'Invalid status value.');

    const [result] = await pool.execute('UPDATE presentations SET status = ? WHERE id = ?', [status, id]);
    if (result.affectedRows === 0) return sendError(res, 404, 'Registration not found.');

    return sendSuccess(res, 200, { message: 'Status updated successfully.' });
  } catch (err) {
    console.error('Admin update status error:', err.message);
    return sendError(res, 500, 'Could not update status.');
  }
});

app.put('/api/admin/presentations/:id', authenticate, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return sendError(res, 400, 'Invalid registration id.');

  const errors = validatePresentationPayload(req.body);
  if (errors.length > 0) return sendError(res, 400, errors[0]);

  const { topic, subject, section, teamType, presentationDate, presentationTime, members } = req.body;

  let connection;
  try {
    const [existingRows] = await pool.execute('SELECT id FROM presentations WHERE id = ?', [id]);
    if (existingRows.length === 0) return sendError(res, 404, 'Registration not found.');

    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE presentations
       SET topic = ?, subject = ?, section = ?, team_type = ?, presentation_date = ?, presentation_time = ?
       WHERE id = ?`,
      [topic.trim(), subject.trim(), section, teamType, presentationDate, presentationTime, id]
    );

    await connection.execute('DELETE FROM team_members WHERE presentation_id = ?', [id]);
    for (const m of members) {
      await connection.execute(
        `INSERT INTO team_members (presentation_id, name, roll_number, email, phone)
         VALUES (?, ?, ?, ?, ?)`,
        [id, m.name.trim(), m.rollNumber.trim(), m.email.trim().toLowerCase(), m.phone.trim()]
      );
    }

    await connection.commit();
    return sendSuccess(res, 200, { message: 'Registration updated successfully.' });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Admin update presentation error:', err.message);
    return sendError(res, 500, 'Could not update registration.');
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/api/admin/presentations/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 400, 'Invalid registration id.');

    const [result] = await pool.execute('DELETE FROM presentations WHERE id = ?', [id]);
    if (result.affectedRows === 0) return sendError(res, 404, 'Registration not found.');

    return sendSuccess(res, 200, { message: 'Registration deleted successfully.' });
  } catch (err) {
    console.error('Admin delete presentation error:', err.message);
    return sendError(res, 500, 'Could not delete registration.');
  }
});

app.get('/api/admin/students', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
        (SELECT COUNT(*) FROM presentations p WHERE p.user_id = u.id) AS registration_count
       FROM users u
       WHERE u.role = 'student'
       ORDER BY u.created_at DESC`
    );
    return sendSuccess(res, 200, { students: rows });
  } catch (err) {
    console.error('Admin list students error:', err.message);
    return sendError(res, 500, 'Could not load students.');
  }
});

app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  sendError(res, 500, 'An unexpected server error occurred.');
});

app.listen(PORT, () => {
  console.log(`Student Presentation Registration System running at http://localhost:${PORT}`);
});
