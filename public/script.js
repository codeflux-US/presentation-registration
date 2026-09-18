const API_BASE_URL = 'https://presentation-registration.vercel.app';

async function apiRequest(url, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    credentials: 'include'
  };

  if (options.body) {
    opts.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE_URL}${url}`, opts);

  let data;

  try {
    data = await res.json();
  } catch {
    data = {
      success: false,
      message: 'Unexpected server response.'
    };
  }

  if (!res.ok) {
    const err = new Error(data.message || 'Request failed.');
    err.status = res.status;
    throw err;
  }

  return data;
}

let currentUser = null; 
let currentPresentations = []; 

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

function setButtonLoading(btn, loading) {
  if (!btn) return;
  const text = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.spinner');
  btn.disabled = loading;
  if (spinner) spinner.classList.toggle('hidden', !loading);
  if (text) text.style.opacity = loading ? '0.6' : '1';
}

function showConfirmModal(title, message) {
  const overlay = document.getElementById('confirmModalOverlay');
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalMessage').textContent = message;
  overlay.classList.remove('hidden');

  return new Promise((resolve) => {
    const confirmBtn = document.getElementById('confirmModalConfirmBtn');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');

    function cleanup(result) {
      overlay.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
  });
}

const PUBLIC_VIEWS = ['home', 'login', 'signup', 'guidelines', 'about'];
const STUDENT_VIEWS = ['student-dashboard', 'new-registration', 'my-registrations', 'registration-details', 'profile'];
const ADMIN_VIEWS = ['admin-dashboard', 'admin-registrations', 'admin-students', 'profile', 'registration-details'];

async function showView(viewName, params = {}) {
  if (STUDENT_VIEWS.includes(viewName) && (!currentUser)) {
    viewName = 'login';
  }
  if (ADMIN_VIEWS.includes(viewName) && currentUser && currentUser.role !== 'admin' && !STUDENT_VIEWS.includes(viewName)) {
    viewName = 'student-dashboard';
  }
  if ((viewName === 'login' || viewName === 'signup') && currentUser) {
    viewName = currentUser.role === 'admin' ? 'admin-dashboard' : 'student-dashboard';
  }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  closeMobileMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderNav(viewName);

  try {
    if (viewName === 'student-dashboard') await loadDashboard();
    if (viewName === 'my-registrations') await loadRegistrations();
    if (viewName === 'new-registration') await setupRegistrationForm(params.editId || null);
    if (viewName === 'registration-details') await viewRegistration(params.id);
    if (viewName === 'profile') await loadProfile();
    if (viewName === 'admin-dashboard') await loadAdminDashboard();
    if (viewName === 'admin-registrations') await searchRegistrations();
    if (viewName === 'admin-students') await loadAdminStudents();
  } catch (err) {
    showToast(err.message || 'Something went wrong.', 'error');
  }
}

function closeMobileMenu() {
  document.getElementById('navLinks').classList.remove('open');
}

function renderNav(activeView) {
  const nav = document.getElementById('navLinks');
  nav.innerHTML = '';

  function link(label, view) {
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = label;
    a.dataset.nav = view;
    if (activeView === view) a.classList.add('active');
    a.addEventListener('click', (e) => { e.preventDefault(); showView(view); });
    return a;
  }

  if (!currentUser) {
    nav.appendChild(link('Home', 'home'));
    nav.appendChild(link('Guidelines', 'guidelines'));
    nav.appendChild(link('About', 'about'));
    nav.appendChild(link('Login', 'login'));
    nav.appendChild(link('Register', 'signup'));
  } else if (currentUser.role === 'student') {
    nav.appendChild(link('Dashboard', 'student-dashboard'));
    nav.appendChild(link('New Registration', 'new-registration'));
    nav.appendChild(link('My Registrations', 'my-registrations'));
    nav.appendChild(link('Profile', 'profile'));
    appendLogout(nav);
  } else if (currentUser.role === 'admin') {
    nav.appendChild(link('Dashboard', 'admin-dashboard'));
    nav.appendChild(link('Registrations', 'admin-registrations'));
    nav.appendChild(link('Students', 'admin-students'));
    nav.appendChild(link('Profile', 'profile'));
    appendLogout(nav);
  }
}

function appendLogout(nav) {
  const btn = document.createElement('button');
  btn.textContent = 'Logout';
  btn.className = 'btn-logout';
  btn.addEventListener('click', logout);
  nav.appendChild(btn);
}

async function checkAuthentication() {
  try {
    const data = await apiRequest('/api/auth/me');
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  setButtonLoading(btn, true);
  try {
    const data = await apiRequest('/api/auth/login', { method: 'POST', body: { email, password } });
    currentUser = data.user;
    showToast('Login successful.', 'success');
    document.getElementById('loginForm').reset();
    showView(currentUser.role === 'admin' ? 'admin-dashboard' : 'student-dashboard');
  } catch (err) {
    showToast(err.message || 'Invalid email or password.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const btn = document.getElementById('signupBtn');
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;

  if (password.length < 8) {
    showToast('Password must be at least 8 characters.', 'warning');
    return;
  }
  if (password !== confirmPassword) {
    showToast('Passwords do not match.', 'warning');
    return;
  }

  setButtonLoading(btn, true);
  try {
    await apiRequest('/api/auth/register', { method: 'POST', body: { name, email, password, confirmPassword } });
    showToast('Account created successfully. Please log in.', 'success');
    document.getElementById('signupForm').reset();
    showView('login');
  } catch (err) {
    showToast(err.message || 'Could not create account.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch { /* ignore */ }
  currentUser = null;
  showToast('You have been logged out.', 'info');
  showView('home');
}

async function loadDashboard() {
  document.getElementById('studentGreeting').textContent = `Welcome back, ${currentUser.name}`;

  const grid = document.getElementById('studentStatsGrid');
  grid.innerHTML = `<div class="page-loading">Loading dashboard...</div>`;

  const data = await apiRequest('/api/presentations');
  currentPresentations = data.presentations;

  const total = currentPresentations.length;
  const counts = { Registered: 0, Pending: 0, Completed: 0, Cancelled: 0 };
  currentPresentations.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });

  grid.innerHTML = `
    <div class="stat-card accent-navy"><div class="stat-value">${total}</div><div class="stat-label">Total Registrations</div></div>
    <div class="stat-card accent-blue"><div class="stat-value">${counts.Registered}</div><div class="stat-label">Registered</div></div>
    <div class="stat-card accent-amber"><div class="stat-value">${counts.Pending}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card accent-green"><div class="stat-value">${counts.Completed}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card accent-red"><div class="stat-value">${counts.Cancelled}</div><div class="stat-label">Cancelled</div></div>
  `;

  const recent = currentPresentations.slice(0, 5);
  const listEl = document.getElementById('studentRecentList');
  listEl.innerHTML = renderPresentationsTable(recent, false);
  attachRowActionListeners(listEl, false);
}

async function loadRegistrations() {
  const listEl = document.getElementById('myRegistrationsList');
  listEl.innerHTML = `<div class="page-loading">Loading registrations...</div>`;

  const data = await apiRequest('/api/presentations');
  currentPresentations = data.presentations;

  listEl.innerHTML = renderPresentationsTable(currentPresentations, true);
  attachRowActionListeners(listEl, true);
}

function statusBadge(status) {
  const map = { Registered: 'badge-registered', Pending: 'badge-pending', Completed: 'badge-completed', Cancelled: 'badge-cancelled' };
  return `<span class="badge ${map[status] || ''}">${status}</span>`;
}

function renderPresentationsTable(list, withActions) {
  if (!list || list.length === 0) {
    return `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M9 12h6m-6 4h6M9 8h6M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5"/></svg>
      <p>No registrations found.</p>
    </div>`;
  }

  const rows = list.map(p => `
    <tr data-id="${p.id}">
      <td>${p.registration_id}</td>
      <td>${escapeHtml(p.topic)}</td>
      <td>${escapeHtml(p.subject)}</td>
      <td>Section ${p.section}</td>
      <td>${p.team_type}</td>
      <td>${formatDate(p.presentation_date)}</td>
      <td>${p.presentation_time}</td>
      <td>${statusBadge(p.status)}</td>
      ${withActions ? `<td>
        <button class="btn btn-sm btn-outline action-view">View</button>
        ${p.status !== 'Cancelled' ? `<button class="btn btn-sm btn-outline action-edit">Edit</button>
        <button class="btn btn-sm btn-danger action-cancel">Cancel</button>` : ''}
      </td>` : `<td><button class="btn btn-sm btn-outline action-view">View</button></td>`}
    </tr>
  `).join('');

  return `<table class="data-table">
    <thead><tr>
      <th>Reg. ID</th><th>Topic</th><th>Subject</th><th>Section</th><th>Team Type</th><th>Date</th><th>Time</th><th>Status</th><th>Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function attachRowActionListeners(container, withFullActions) {
  container.querySelectorAll('tr[data-id]').forEach(row => {
    const id = row.dataset.id;
    const viewBtn = row.querySelector('.action-view');
    if (viewBtn) viewBtn.addEventListener('click', () => showView('registration-details', { id }));

    const editBtn = row.querySelector('.action-edit');
    if (editBtn) editBtn.addEventListener('click', () => showView('new-registration', { editId: id }));

    const cancelBtn = row.querySelector('.action-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => cancelRegistration(id));
  });
}

async function cancelRegistration(id) {
  const confirmed = await showConfirmModal('Cancel Registration', 'Are you sure you want to cancel this registration?');
  if (!confirmed) return;

  try {
    await apiRequest(`/api/presentations/${id}`, { method: 'DELETE' });
    showToast('Registration cancelled successfully.', 'success');
    if (document.getElementById('view-my-registrations').classList.contains('active')) {
      loadRegistrations();
    } else {
      loadDashboard();
    }
  } catch (err) {
    showToast(err.message || 'Could not cancel registration.', 'error');
  }
}

async function setupRegistrationForm(editId) {
  const form = document.getElementById('registrationForm');
  form.reset();
  document.getElementById('editingPresentationId').value = editId || '';
  document.getElementById('registrationFormTitle').textContent = editId ? 'Edit Registration' : 'New Registration';
  document.getElementById('teamMembersContainer').innerHTML = '';

  if (editId) {
    const data = await apiRequest(`/api/presentations/${editId}`);
    const p = data.presentation;
    document.getElementById('regTopic').value = p.topic;
    document.getElementById('regSubject').value = p.subject;
    document.getElementById('regSection').value = p.section;
    document.getElementById('regDate').value = p.presentation_date;
    document.getElementById('regTime').value = p.presentation_time.slice(0, 5);
    document.getElementById('regTeamType').value = p.team_type;
    generateTeamFields(p.team_type, data.members);
  }
}

function generateTeamFields(teamType, existingMembers = []) {
  const container = document.getElementById('teamMembersContainer');
  container.innerHTML = '';
  const sizeMap = { 'Individual': 1, 'Team of 2': 2, 'Team of 3': 3, 'Team of 4': 4, 'Team of 5': 5 };
  const count = sizeMap[teamType] || 0;

  for (let i = 0; i < count; i++) {
    const existing = existingMembers[i] || {};
    const card = document.createElement('div');
    card.className = 'member-card';
    card.dataset.memberIndex = i;
    card.innerHTML = `
      <h4>Student ${i + 1}</h4>
      <div class="form-grid">
        <div class="form-field">
          <label>Name</label>
          <input type="text" class="member-name" required value="${escapeHtml(existing.name || '')}" />
        </div>
        <div class="form-field">
          <label>Roll Number</label>
          <input type="text" class="member-roll" required value="${escapeHtml(existing.roll_number || '')}" />
        </div>
        <div class="form-field">
          <label>Email</label>
          <input type="email" class="member-email" required value="${escapeHtml(existing.email || '')}" />
        </div>
        <div class="form-field">
          <label>Phone Number</label>
          <input type="tel" class="member-phone" required value="${escapeHtml(existing.phone || '')}" />
        </div>
      </div>
    `;
    container.appendChild(card);
  }
}

function collectMembersFromForm() {
  const cards = document.querySelectorAll('#teamMembersContainer .member-card');
  return Array.from(cards).map(card => ({
    name: card.querySelector('.member-name').value.trim(),
    rollNumber: card.querySelector('.member-roll').value.trim(),
    email: card.querySelector('.member-email').value.trim(),
    phone: card.querySelector('.member-phone').value.trim()
  }));
}

function validateRegistrationForm(payload) {
  if (!payload.topic) return 'Presentation topic is required.';
  if (!payload.subject) return 'Subject is required.';
  if (!payload.section) return 'Please select a section.';
  if (!payload.teamType) return 'Please select a team type.';
  if (!payload.presentationDate) return 'Please select a presentation date.';
  if (!payload.presentationTime) return 'Please select a presentation time.';
  if (!payload.members || payload.members.length === 0) return 'At least one team member is required.';

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^[0-9]{7,15}$/;
  const rolls = new Set(), emails = new Set();

  for (const [i, m] of payload.members.entries()) {
    if (!m.name) return `Member ${i + 1}: name is required.`;
    if (!m.rollNumber) return `Member ${i + 1}: roll number is required.`;
    if (!emailRe.test(m.email)) return `Member ${i + 1}: valid email is required.`;
    if (!phoneRe.test(m.phone)) return `Member ${i + 1}: valid phone number is required.`;

    const rollKey = m.rollNumber.toLowerCase();
    const emailKey = m.email.toLowerCase();
    if (rolls.has(rollKey)) return `Duplicate roll number: ${m.rollNumber}`;
    if (emails.has(emailKey)) return `Duplicate member email: ${m.email}`;
    rolls.add(rollKey);
    emails.add(emailKey);
  }
  return null;
}

async function submitRegistration(e) {
  e.preventDefault();
  const btn = document.getElementById('submitRegistrationBtn');
  const editId = document.getElementById('editingPresentationId').value;

  const payload = {
    topic: document.getElementById('regTopic').value.trim(),
    subject: document.getElementById('regSubject').value.trim(),
    section: document.getElementById('regSection').value,
    teamType: document.getElementById('regTeamType').value,
    presentationDate: document.getElementById('regDate').value,
    presentationTime: document.getElementById('regTime').value,
    members: collectMembersFromForm()
  };

  const validationError = validateRegistrationForm(payload);
  if (validationError) {
    showToast(validationError, 'warning');
    return;
  }

  setButtonLoading(btn, true);
  try {
    if (editId) {
      await apiRequest(`/api/presentations/${editId}`, { method: 'PUT', body: payload });
      showToast('Registration updated successfully.', 'success');
      showView('my-registrations');
    } else {
      const data = await apiRequest('/api/presentations', { method: 'POST', body: payload });
      showRegistrationSuccessModal(data.presentation);
    }
  } catch (err) {
    showToast(err.message || 'Could not save registration.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function showRegistrationSuccessModal(p) {
  const overlay = document.getElementById('successModalOverlay');
  document.getElementById('successDetails').innerHTML = `
    <div class="detail-row"><span>Registration ID</span><span>${p.registration_id}</span></div>
    <div class="detail-row"><span>Topic</span><span>${escapeHtml(p.topic)}</span></div>
    <div class="detail-row"><span>Subject</span><span>${escapeHtml(p.subject)}</span></div>
    <div class="detail-row"><span>Section</span><span>Section ${p.section}</span></div>
    <div class="detail-row"><span>Team Type</span><span>${p.team_type}</span></div>
    <div class="detail-row"><span>Date</span><span>${formatDate(p.presentation_date)}</span></div>
    <div class="detail-row"><span>Time</span><span>${p.presentation_time}</span></div>
    <div class="detail-row"><span>Members</span><span>${p.member_count}</span></div>
    <div class="detail-row"><span>Status</span><span>${p.status}</span></div>
  `;
  overlay.classList.remove('hidden');

  document.getElementById('successViewBtn').onclick = () => {
    overlay.classList.add('hidden');
    showView('registration-details', { id: p.id });
  };
  document.getElementById('successPrintBtn').onclick = () => {
    overlay.classList.add('hidden');
    showView('registration-details', { id: p.id }).then(() => window.print());
  };
  document.getElementById('successAnotherBtn').onclick = () => {
    overlay.classList.add('hidden');
    showView('new-registration');
  };
}

async function viewRegistration(id) {
  const panel = document.getElementById('registrationDetailsPanel');
  panel.innerHTML = `<div class="page-loading">Loading details...</div>`;

  const data = await apiRequest(`/api/presentations/${id}`);
  const p = data.presentation;
  const members = data.members;

  const membersRows = members.map(m => `
    <tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.roll_number)}</td><td>${escapeHtml(m.email)}</td><td>${escapeHtml(m.phone)}</td></tr>
  `).join('');

  panel.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Registration ID</div><div class="detail-value">${p.registration_id}</div></div>
      <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${statusBadge(p.status)}</div></div>
      <div class="detail-item"><div class="detail-label">Topic</div><div class="detail-value">${escapeHtml(p.topic)}</div></div>
      <div class="detail-item"><div class="detail-label">Subject</div><div class="detail-value">${escapeHtml(p.subject)}</div></div>
      <div class="detail-item"><div class="detail-label">Section</div><div class="detail-value">Section ${p.section}</div></div>
      <div class="detail-item"><div class="detail-label">Team Type</div><div class="detail-value">${p.team_type}</div></div>
      <div class="detail-item"><div class="detail-label">Date</div><div class="detail-value">${formatDate(p.presentation_date)}</div></div>
      <div class="detail-item"><div class="detail-label">Time</div><div class="detail-value">${p.presentation_time}</div></div>
    </div>
    <h3 class="form-section-title">Team Members</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Roll Number</th><th>Email</th><th>Phone</th></tr></thead>
        <tbody>${membersRows}</tbody>
      </table>
    </div>
  `;
}

function printRegistration() {
  window.print();
}

async function loadProfile() {
  const panel = document.getElementById('profilePanel');
  panel.innerHTML = `<div class="page-loading">Loading profile...</div>`;

  const data = await apiRequest('/api/profile');
  const p = data.profile;

  panel.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Name</div><div class="detail-value">${escapeHtml(p.name)}</div></div>
      <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${escapeHtml(p.email)}</div></div>
      <div class="detail-item"><div class="detail-label">Role</div><div class="detail-value">${capitalize(p.role)}</div></div>
      ${p.role === 'student' ? `<div class="detail-item"><div class="detail-label">Registration Count</div><div class="detail-value">${p.registrationCount}</div></div>` : ''}
      <div class="detail-item"><div class="detail-label">Account Created</div><div class="detail-value">${formatDate(p.created_at)}</div></div>
    </div>
  `;
}

async function loadAdminDashboard() {
  const grid = document.getElementById('adminStatsGrid');
  grid.innerHTML = `<div class="page-loading">Loading dashboard...</div>`;

  const data = await apiRequest('/api/admin/dashboard');
  const s = data.stats;

  grid.innerHTML = `
    <div class="stat-card accent-navy"><div class="stat-value">${s.totalStudents}</div><div class="stat-label">Total Students</div></div>
    <div class="stat-card accent-navy"><div class="stat-value">${s.totalPresentations}</div><div class="stat-label">Total Presentations</div></div>
    <div class="stat-card accent-blue"><div class="stat-value">${s.Registered}</div><div class="stat-label">Registered</div></div>
    <div class="stat-card accent-amber"><div class="stat-value">${s.Pending}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card accent-green"><div class="stat-value">${s.Completed}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card accent-red"><div class="stat-value">${s.Cancelled}</div><div class="stat-label">Cancelled</div></div>
    <div class="stat-card accent-blue"><div class="stat-value">${s.sectionA}</div><div class="stat-label">Section A</div></div>
    <div class="stat-card accent-blue"><div class="stat-value">${s.sectionB}</div><div class="stat-label">Section B</div></div>
    <div class="stat-card accent-blue"><div class="stat-value">${s.sectionC}</div><div class="stat-label">Section C</div></div>
  `;
}

let searchDebounceTimer = null;

function debounceSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(searchRegistrations, 350);
}

async function searchRegistrations() {
  const listEl = document.getElementById('adminRegistrationsList');
  listEl.innerHTML = `<div class="page-loading">Loading registrations...</div>`;

  const params = new URLSearchParams();
  const search = document.getElementById('adminSearchInput').value.trim();
  const section = document.getElementById('adminFilterSection').value;
  const subject = document.getElementById('adminFilterSubject').value.trim();
  const teamType = document.getElementById('adminFilterTeamType').value;
  const status = document.getElementById('adminFilterStatus').value;
  const date = document.getElementById('adminFilterDate').value;
  const sortBy = document.getElementById('adminSortBy').value;

  if (search) params.set('search', search);
  if (section) params.set('section', section);
  if (subject) params.set('subject', subject);
  if (teamType) params.set('teamType', teamType);
  if (status) params.set('status', status);
  if (date) params.set('date', date);
  if (sortBy) params.set('sortBy', sortBy);

  const data = await apiRequest(`/api/admin/presentations?${params.toString()}`);
  renderAdminRegistrationsTable(data.presentations, listEl);
}

function filterRegistrations() {
  searchRegistrations();
}

function renderAdminRegistrationsTable(list, container) {
  if (!list || list.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No registrations match your search or filters.</p></div>`;
    return;
  }

  const rows = list.map(p => `
    <tr data-id="${p.id}">
      <td>${p.registration_id}</td>
      <td>${escapeHtml(p.topic)}</td>
      <td>${escapeHtml(p.student_name)}</td>
      <td>${escapeHtml(p.subject)}</td>
      <td>Section ${p.section}</td>
      <td>${p.team_type}</td>
      <td>${p.member_count}</td>
      <td>${formatDate(p.presentation_date)}</td>
      <td>${p.presentation_time}</td>
      <td>${statusBadge(p.status)}</td>
      <td>
        <button class="btn btn-sm btn-outline admin-view">View</button>
        <button class="btn btn-sm btn-outline admin-status">Status</button>
        <button class="btn btn-sm btn-danger admin-delete">Delete</button>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>Reg. ID</th><th>Topic</th><th>Student</th><th>Subject</th><th>Section</th><th>Team Type</th><th>Members</th><th>Date</th><th>Time</th><th>Status</th><th>Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  container.querySelectorAll('tr[data-id]').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.admin-view').addEventListener('click', () => showView('registration-details', { id }));
    row.querySelector('.admin-status').addEventListener('click', () => openStatusModal(id, row));
    row.querySelector('.admin-delete').addEventListener('click', () => deleteRegistrationAsAdmin(id));
  });
}

function openStatusModal(id, row) {
  const overlay = document.getElementById('statusModalOverlay');
  const select = document.getElementById('statusModalSelect');
  const currentBadge = row.querySelector('.badge');
  const currentStatus = currentBadge ? currentBadge.textContent.trim() : 'Pending';
  select.value = currentStatus;
  overlay.classList.remove('hidden');

  const confirmBtn = document.getElementById('statusModalConfirmBtn');
  const cancelBtn = document.getElementById('statusModalCancelBtn');

  function cleanup() {
    overlay.classList.add('hidden');
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
  }
  async function onConfirm() {
    try {
      await updateStatus(id, select.value);
      cleanup();
    } catch (err) {
      showToast(err.message || 'Could not update status.', 'error');
    }
  }
  function onCancel() { cleanup(); }

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
}

async function updateStatus(id, status) {
  await apiRequest(`/api/admin/presentations/${id}/status`, { method: 'PUT', body: { status } });
  showToast('Status updated successfully.', 'success');
  searchRegistrations();
}

async function deleteRegistrationAsAdmin(id) {
  const confirmed = await showConfirmModal('Delete Registration', 'This will permanently delete the registration. This action cannot be undone.');
  if (!confirmed) return;

  try {
    await apiRequest(`/api/admin/presentations/${id}`, { method: 'DELETE' });
    showToast('Registration deleted successfully.', 'success');
    searchRegistrations();
  } catch (err) {
    showToast(err.message || 'Could not delete registration.', 'error');
  }
}

async function loadAdminStudents() {
  const listEl = document.getElementById('adminStudentsList');
  listEl.innerHTML = `<div class="page-loading">Loading students...</div>`;

  const data = await apiRequest('/api/admin/students');
  if (!data.students || data.students.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No students found.</p></div>`;
    return;
  }

  const rows = data.students.map(s => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.email)}</td>
      <td>${s.registration_count}</td>
      <td>${formatDate(s.created_at)}</td>
      <td>${capitalize(s.role)}</td>
    </tr>
  `).join('');

  listEl.innerHTML = `<table class="data-table">
    <thead><tr><th>Name</th><th>Email</th><th>Registrations</th><th>Account Created</th><th>Role</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.tagName === 'A') e.preventDefault();
      showView(el.dataset.nav);
    });
  });

  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
  });

  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('signupForm').addEventListener('submit', handleSignup);
  document.getElementById('registrationForm').addEventListener('submit', submitRegistration);

  document.getElementById('regTeamType').addEventListener('change', (e) => {
    generateTeamFields(e.target.value);
  });

  document.getElementById('printRegistrationBtn').addEventListener('click', printRegistration);

  document.getElementById('adminSearchInput').addEventListener('input', debounceSearch);
  document.getElementById('adminFilterSection').addEventListener('change', filterRegistrations);
  document.getElementById('adminFilterSubject').addEventListener('input', debounceSearch);
  document.getElementById('adminFilterTeamType').addEventListener('change', filterRegistrations);
  document.getElementById('adminFilterStatus').addEventListener('change', filterRegistrations);
  document.getElementById('adminFilterDate').addEventListener('change', filterRegistrations);
  document.getElementById('adminSortBy').addEventListener('change', filterRegistrations);

  await checkAuthentication();
  const initialView = currentUser ? (currentUser.role === 'admin' ? 'admin-dashboard' : 'student-dashboard') : 'home';
  showView(initialView);
});
