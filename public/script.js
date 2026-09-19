const API_BASE_URL =
  'https://presentation-registration.vercel.app';

async function apiRequest(
  url,
  options = {}
) {
  const headers = {
    'Content-Type':
      'application/json',

    ...(options.headers || {})
  };

  const requestOptions = {
    method:
      options.method || 'GET',

    headers,

    credentials: 'include',

    cache: 'no-store'
  };

  if (
    options.body !== undefined
  ) {
    requestOptions.body =
      JSON.stringify(
        options.body
      );
  }

  let response;

  try {
    response =
      await fetch(
        `${API_BASE_URL}${url}`,
        requestOptions
      );
  } catch (networkError) {
    console.error(
      'Network error:',
      networkError
    );

    const error =
      new Error(
        'Unable to connect to the server. Please check the backend URL, CORS and internet connection.'
      );

    error.status = 0;

    throw error;
  }

  let data;

  try {
    data =
      await response.json();
  } catch {
    data = {
      success: false,
      message:
        'Unexpected server response.'
    };
  }

  if (!response.ok) {
    const error =
      new Error(
        data.message ||
        'Request failed.'
      );

    error.status =
      response.status;

    throw error;
  }

  return data;
}

let currentUser = null;

let currentPresentations = [];

function showToast(
  message,
  type = 'info'
) {
  const container =
    document.getElementById(
      'toastContainer'
    );

  if (!container) {
    console.warn(
      'toastContainer not found:',
      message
    );

    return;
  }

  const toast =
    document.createElement(
      'div'
    );

  toast.className =
    `toast toast-${type}`;

  toast.textContent =
    message;

  container.appendChild(
    toast
  );

  setTimeout(() => {
    toast.style.opacity = '0';

    toast.style.transition =
      'opacity 0.3s ease';

    setTimeout(
      () => {
        toast.remove();
      },
      300
    );
  }, 3800);
}

function setButtonLoading(
  btn,
  loading
) {
  if (!btn) return;

  const text =
    btn.querySelector(
      '.btn-text'
    );

  const spinner =
    btn.querySelector(
      '.spinner'
    );

  btn.disabled =
    loading;

  if (spinner) {
    spinner.classList.toggle(
      'hidden',
      !loading
    );
  }

  if (text) {
    text.style.opacity =
      loading
        ? '0.6'
        : '1';
  }
}

function showConfirmModal(
  title,
  message
) {
  const overlay =
    document.getElementById(
      'confirmModalOverlay'
    );

  const titleElement =
    document.getElementById(
      'confirmModalTitle'
    );

  const messageElement =
    document.getElementById(
      'confirmModalMessage'
    );

  const confirmBtn =
    document.getElementById(
      'confirmModalConfirmBtn'
    );

  const cancelBtn =
    document.getElementById(
      'confirmModalCancelBtn'
    );

  if (
    !overlay ||
    !titleElement ||
    !messageElement ||
    !confirmBtn ||
    !cancelBtn
  ) {
    return Promise.resolve(
      window.confirm(
        `${title}\n\n${message}`
      )
    );
  }

  titleElement.textContent =
    title;

  messageElement.textContent =
    message;

  overlay.classList.remove(
    'hidden'
  );

  return new Promise(
    resolve => {
      function cleanup(
        result
      ) {
        overlay.classList.add(
          'hidden'
        );

        confirmBtn.removeEventListener(
          'click',
          onConfirm
        );

        cancelBtn.removeEventListener(
          'click',
          onCancel
        );

        resolve(result);
      }

      function onConfirm() {
        cleanup(true);
      }

      function onCancel() {
        cleanup(false);
      }

      confirmBtn.addEventListener(
        'click',
        onConfirm
      );

      cancelBtn.addEventListener(
        'click',
        onCancel
      );
    }
  );
}

const PUBLIC_VIEWS = [
  'home',
  'login',
  'signup',
  'guidelines',
  'about'
];

const STUDENT_VIEWS = [
  'student-dashboard',
  'new-registration',
  'my-registrations',
  'registration-details',
  'profile'
];

const ADMIN_VIEWS = [
  'admin-dashboard',
  'admin-registrations',
  'admin-students',
  'profile',
  'registration-details'
];

async function showView(
  viewName,
  params = {}
) {
  
  if (
    STUDENT_VIEWS.includes(
      viewName
    ) &&
    !currentUser
  ) {
    viewName = 'login';
  }

  if (
    ADMIN_VIEWS.includes(
      viewName
    ) &&
    currentUser &&
    currentUser.role !== 'admin' &&
    !STUDENT_VIEWS.includes(
      viewName
    )
  ) {
    viewName =
      'student-dashboard';
  }

  if (
    (
      viewName === 'login' ||
      viewName === 'signup'
    ) &&
    currentUser
  ) {
    viewName =
      currentUser.role === 'admin'
        ? 'admin-dashboard'
        : 'student-dashboard';
  }

  document
    .querySelectorAll(
      '.view'
    )
    .forEach(
      view => {
        view.classList.remove(
          'active'
        );
      }
    );

  const target =
    document.getElementById(
      `view-${viewName}`
    );

  if (!target) {
    console.error(
      `View not found: view-${viewName}`
    );

    return;
  }

  target.classList.add(
    'active'
  );

  closeMobileMenu();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

  renderNav(
    viewName
  );

  try {
    if (
      viewName ===
      'student-dashboard'
    ) {
      await loadDashboard();
    }

    if (
      viewName ===
      'my-registrations'
    ) {
      await loadRegistrations();
    }

    if (
      viewName ===
      'new-registration'
    ) {
      await setupRegistrationForm(
        params.editId ||
          null
      );
    }

    if (
      viewName ===
      'registration-details'
    ) {
      await viewRegistration(
        params.id
      );
    }

    if (
      viewName ===
      'profile'
    ) {
      await loadProfile();
    }

    if (
      viewName ===
      'admin-dashboard'
    ) {
      await loadAdminDashboard();
    }

    if (
      viewName ===
      'admin-registrations'
    ) {
      await searchRegistrations();
    }

    if (
      viewName ===
      'admin-students'
    ) {
      await loadAdminStudents();
    }

  } catch (error) {
    console.error(
      `Error loading ${viewName}:`,
      error
    );

    showToast(
      error.message ||
        'Something went wrong.',
      'error'
    );
  }
}

function closeMobileMenu() {
  const navLinks =
    document.getElementById(
      'navLinks'
    );

  if (!navLinks) {
    return;
  }

  navLinks.classList.remove(
    'open'
  );
}

function renderNav(
  activeView
) {
  const nav =
    document.getElementById(
      'navLinks'
    );

  if (!nav) {
    return;
  }

  nav.innerHTML = '';

  function createLink(
    label,
    view
  ) {
    const anchor =
      document.createElement(
        'a'
      );

    anchor.href = '#';

    anchor.textContent =
      label;

    anchor.dataset.nav =
      view;

    if (
      activeView ===
      view
    ) {
      anchor.classList.add(
        'active'
      );
    }

    anchor.addEventListener(
      'click',
      event => {
        event.preventDefault();

        showView(
          view
        );
      }
    );

    return anchor;
  }

  if (!currentUser) {
    nav.appendChild(
      createLink(
        'Home',
        'home'
      )
    );

    nav.appendChild(
      createLink(
        'Guidelines',
        'guidelines'
      )
    );

    nav.appendChild(
      createLink(
        'About',
        'about'
      )
    );

    nav.appendChild(
      createLink(
        'Login',
        'login'
      )
    );

    nav.appendChild(
      createLink(
        'Register',
        'signup'
      )
    );

    return;
  }

  if (
    currentUser.role ===
    'student'
  ) {
    nav.appendChild(
      createLink(
        'Dashboard',
        'student-dashboard'
      )
    );

    nav.appendChild(
      createLink(
        'New Registration',
        'new-registration'
      )
    );

    nav.appendChild(
      createLink(
        'My Registrations',
        'my-registrations'
      )
    );

    nav.appendChild(
      createLink(
        'Profile',
        'profile'
      )
    );

    appendLogout(nav);

    return;
  }

  if (
    currentUser.role ===
    'admin'
  ) {
    nav.appendChild(
      createLink(
        'Dashboard',
        'admin-dashboard'
      )
    );

    nav.appendChild(
      createLink(
        'Registrations',
        'admin-registrations'
      )
    );

    nav.appendChild(
      createLink(
        'Students',
        'admin-students'
      )
    );

    nav.appendChild(
      createLink(
        'Profile',
        'profile'
      )
    );

    appendLogout(nav);
  }
}

function appendLogout(
  nav
) {
  const button =
    document.createElement(
      'button'
    );

  button.type =
    'button';

  button.textContent =
    'Logout';

  button.className =
    'btn-logout';

  button.addEventListener(
    'click',
    async event => {
      event.preventDefault();
      event.stopPropagation();

      await logout();
    }
  );

  nav.appendChild(
    button
  );
}

async function checkAuthentication() {
  try {
    const data =
      await apiRequest(
        '/api/auth/me'
      );

    currentUser =
      data.user || null;

    return currentUser;

  } catch (error) {
    currentUser =
      null;

    return null;
  }
}

async function handleLogin(
  event
) {
  event.preventDefault();

  const button =
    document.getElementById(
      'loginBtn'
    );

  const emailInput =
    document.getElementById(
      'loginEmail'
    );

  const passwordInput =
    document.getElementById(
      'loginPassword'
    );

  if (
    !emailInput ||
    !passwordInput
  ) {
    showToast(
      'Login form is not available.',
      'error'
    );

    return;
  }

  const email =
    emailInput.value
      .trim();

  const password =
    passwordInput.value;

  if (
    !email ||
    !password
  ) {
    showToast(
      'Email and password are required.',
      'warning'
    );

    return;
  }

  setButtonLoading(
    button,
    true
  );

  try {
    const data =
      await apiRequest(
        '/api/auth/login',
        {
          method: 'POST',

          body: {
            email,
            password
          }
        }
      );

    currentUser =
      data.user || null;

    if (!currentUser) {
      throw new Error(
        'Login succeeded but user information was not returned.'
      );
    }

    showToast(
      'Login successful.',
      'success'
    );

    const form =
      document.getElementById(
        'loginForm'
      );

    if (form) {
      form.reset();
    }

    await showView(
      currentUser.role ===
        'admin'
        ? 'admin-dashboard'
        : 'student-dashboard'
    );

  } catch (error) {
    console.error(
      'Login error:',
      error
    );

    showToast(
      error.message ||
        'Invalid email or password.',
      'error'
    );

  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}

async function handleSignup(
  event
) {
  event.preventDefault();

  const button =
    document.getElementById(
      'signupBtn'
    );

  const nameInput =
    document.getElementById(
      'signupName'
    );

  const emailInput =
    document.getElementById(
      'signupEmail'
    );

  const passwordInput =
    document.getElementById(
      'signupPassword'
    );

  const confirmInput =
    document.getElementById(
      'signupConfirmPassword'
    );

  if (
    !nameInput ||
    !emailInput ||
    !passwordInput ||
    !confirmInput
  ) {
    showToast(
      'Signup form is not available.',
      'error'
    );

    return;
  }

  const name =
    nameInput.value
      .trim();

  const email =
    emailInput.value
      .trim();

  const password =
    passwordInput.value;

  const confirmPassword =
    confirmInput.value;

  if (!name) {
    showToast(
      'Full name is required.',
      'warning'
    );

    return;
  }

  if (!email) {
    showToast(
      'Email is required.',
      'warning'
    );

    return;
  }

  if (
    password.length < 8
  ) {
    showToast(
      'Password must be at least 8 characters.',
      'warning'
    );

    return;
  }

  if (
    password !==
    confirmPassword
  ) {
    showToast(
      'Passwords do not match.',
      'warning'
    );

    return;
  }

  setButtonLoading(
    button,
    true
  );

  try {
    await apiRequest(
      '/api/auth/register',
      {
        method: 'POST',

        body: {
          name,
          email,
          password,
          confirmPassword
        }
      }
    );

    showToast(
      'Account created successfully. Please log in.',
      'success'
    );

    const form =
      document.getElementById(
        'signupForm'
      );

    if (form) {
      form.reset();
    }

    await showView(
      'login'
    );

  } catch (error) {
    console.error(
      'Signup error:',
      error
    );

    showToast(
      error.message ||
        'Could not create account.',
      'error'
    );

  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}

async function logout() {
  try {
    await apiRequest(
      '/api/auth/logout',
      {
        method: 'POST'
      }
    );

    currentUser =
      null;

    currentPresentations =
      [];

    showToast(
      'You have been logged out.',
      'success'
    );

    await showView(
      'home'
    );

  } catch (error) {
    console.error(
      'Logout error:',
      error
    );
    
    currentUser =
      null;

    currentPresentations =
      [];

    showToast(
      'Logout request failed. Please try again.',
      'error'
    );

    await showView(
      'login'
    );
  }
}

async function loadDashboard() {
  const greeting =
    document.getElementById(
      'studentGreeting'
    );

  if (
    greeting &&
    currentUser
  ) {
    greeting.textContent =
      `Welcome back, ${currentUser.name}`;
  }

  const grid =
    document.getElementById(
      'studentStatsGrid'
    );

  if (!grid) {
    return;
  }

  grid.innerHTML =
    `
      <div class="page-loading">
        Loading dashboard...
      </div>
    `;

  const data =
    await apiRequest(
      '/api/presentations'
    );

  currentPresentations =
    Array.isArray(
      data.presentations
    )
      ? data.presentations
      : [];

  const total =
    currentPresentations.length;

  const counts = {
    Registered: 0,
    Pending: 0,
    Completed: 0,
    Cancelled: 0
  };

  currentPresentations.forEach(
    presentation => {
      counts[
        presentation.status
      ] =
        (
          counts[
            presentation.status
          ] || 0
        ) + 1;
    }
  );

  grid.innerHTML =
    `
      <div class="stat-card accent-navy">
        <div class="stat-value">
          ${total}
        </div>
        <div class="stat-label">
          Total Registrations
        </div>
      </div>

      <div class="stat-card accent-blue">
        <div class="stat-value">
          ${counts.Registered}
        </div>
        <div class="stat-label">
          Registered
        </div>
      </div>

      <div class="stat-card accent-amber">
        <div class="stat-value">
          ${counts.Pending}
        </div>
        <div class="stat-label">
          Pending
        </div>
      </div>

      <div class="stat-card accent-green">
        <div class="stat-value">
          ${counts.Completed}
        </div>
        <div class="stat-label">
          Completed
        </div>
      </div>

      <div class="stat-card accent-red">
        <div class="stat-value">
          ${counts.Cancelled}
        </div>
        <div class="stat-label">
          Cancelled
        </div>
      </div>
    `;

  const recent =
    currentPresentations.slice(
      0,
      5
    );

  const list =
    document.getElementById(
      'studentRecentList'
    );

  if (!list) {
    return;
  }

  list.innerHTML =
    renderPresentationsTable(
      recent,
      false
    );

  attachRowActionListeners(
    list
  );
}

async function loadRegistrations() {
  const list =
    document.getElementById(
      'myRegistrationsList'
    );

  if (!list) {
    return;
  }

  list.innerHTML =
    `
      <div class="page-loading">
        Loading registrations...
      </div>
    `;

  const data =
    await apiRequest(
      '/api/presentations'
    );

  currentPresentations =
    Array.isArray(
      data.presentations
    )
      ? data.presentations
      : [];

  list.innerHTML =
    renderPresentationsTable(
      currentPresentations,
      true
    );

  attachRowActionListeners(
    list
  );
}

function statusBadge(
  status
) {
  const classes = {
    Registered:
      'badge-registered',

    Pending:
      'badge-pending',

    Completed:
      'badge-completed',

    Cancelled:
      'badge-cancelled'
  };

  return `
    <span class="badge ${
      classes[status] || ''
    }">
      ${escapeHtml(status)}
    </span>
  `;
}

function renderPresentationsTable(
  list,
  withActions
) {
  if (
    !list ||
    list.length === 0
  ) {
    return `
      <div class="empty-state">

        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M9 12h6m-6 4h6M9 8h6M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>

        <p>
          No registrations found.
        </p>

      </div>
    `;
  }

  const rows =
    list
      .map(
        presentation => `
          <tr
            data-id="${escapeHtml(
              presentation.id
            )}"
          >

            <td>
              ${escapeHtml(
                presentation.registration_id
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.topic
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.subject
              )}
            </td>

            <td>
              Section
              ${escapeHtml(
                presentation.section
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.team_type
              )}
            </td>

            <td>
              ${formatDate(
                presentation.presentation_date
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.presentation_time
              )}
            </td>

            <td>
              ${statusBadge(
                presentation.status
              )}
            </td>

            ${
              withActions
                ? `
                  <td>

                    <button
                      type="button"
                      class="btn btn-sm btn-outline action-view"
                    >
                      View
                    </button>

                    ${
                      presentation.status !==
                      'Cancelled'
                        ? `
                          <button
                            type="button"
                            class="btn btn-sm btn-outline action-edit"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            class="btn btn-sm btn-danger action-cancel"
                          >
                            Cancel
                          </button>
                        `
                        : ''
                    }

                  </td>
                `
                : `
                  <td>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline action-view"
                    >
                      View
                    </button>
                  </td>
                `
            }

          </tr>
        `
      )
      .join('');

  return `
    <div class="table-wrap">

      <table class="data-table">

        <thead>
          <tr>
            <th>Reg. ID</th>
            <th>Topic</th>
            <th>Subject</th>
            <th>Section</th>
            <th>Team Type</th>
            <th>Date</th>
            <th>Time</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>

      </table>

    </div>
  `;
}

function attachRowActionListeners(
  container
) {
  if (!container) {
    return;
  }

  container
    .querySelectorAll(
      'tr[data-id]'
    )
    .forEach(
      row => {
        const id =
          row.dataset.id;

        const viewButton =
          row.querySelector(
            '.action-view'
          );

        if (viewButton) {
          viewButton.addEventListener(
            'click',
            () => {
              showView(
                'registration-details',
                {
                  id
                }
              );
            }
          );
        }

        const editButton =
          row.querySelector(
            '.action-edit'
          );

        if (editButton) {
          editButton.addEventListener(
            'click',
            () => {
              showView(
                'new-registration',
                {
                  editId: id
                }
              );
            }
          );
        }

        const cancelButton =
          row.querySelector(
            '.action-cancel'
          );

        if (cancelButton) {
          cancelButton.addEventListener(
            'click',
            () => {
              cancelRegistration(
                id
              );
            }
          );
        }
      }
    );
}

async function cancelRegistration(
  id
) {
  const confirmed =
    await showConfirmModal(
      'Cancel Registration',
      'Are you sure you want to cancel this registration?'
    );

  if (!confirmed) {
    return;
  }

  try {
    await apiRequest(
      `/api/presentations/${encodeURIComponent(
        id
      )}`,
      {
        method: 'DELETE'
      }
    );

    showToast(
      'Registration cancelled successfully.',
      'success'
    );

    const registrationsView =
      document.getElementById(
        'view-my-registrations'
      );

    if (
      registrationsView &&
      registrationsView.classList.contains(
        'active'
      )
    ) {
      await loadRegistrations();
    } else {
      await loadDashboard();
    }

  } catch (error) {
    console.error(
      'Cancel registration error:',
      error
    );

    showToast(
      error.message ||
        'Could not cancel registration.',
      'error'
    );
  }
}

async function setupRegistrationForm(
  editId
) {
  const form =
    document.getElementById(
      'registrationForm'
    );

  const editingId =
    document.getElementById(
      'editingPresentationId'
    );

  const title =
    document.getElementById(
      'registrationFormTitle'
    );

  const membersContainer =
    document.getElementById(
      'teamMembersContainer'
    );

  if (!form) {
    return;
  }

  form.reset();

  if (editingId) {
    editingId.value =
      editId || '';
  }

  if (title) {
    title.textContent =
      editId
        ? 'Edit Registration'
        : 'New Registration';
  }

  if (membersContainer) {
    membersContainer.innerHTML =
      '';
  }

  if (!editId) {
    return;
  }

  const data =
    await apiRequest(
      `/api/presentations/${encodeURIComponent(
        editId
      )}`
    );

  const presentation =
    data.presentation;

  const topic =
    document.getElementById(
      'regTopic'
    );

  const subject =
    document.getElementById(
      'regSubject'
    );

  const section =
    document.getElementById(
      'regSection'
    );

  const date =
    document.getElementById(
      'regDate'
    );

  const time =
    document.getElementById(
      'regTime'
    );

  const teamType =
    document.getElementById(
      'regTeamType'
    );

  if (topic) {
    topic.value =
      presentation.topic ||
      '';
  }

  if (subject) {
    subject.value =
      presentation.subject ||
      '';
  }

  if (section) {
    section.value =
      presentation.section ||
      '';
  }

  if (date) {
    date.value =
      presentation.presentation_date ||
      '';
  }

  if (time) {
    time.value =
      presentation.presentation_time
        ? presentation.presentation_time.slice(
            0,
            5
          )
        : '';
  }

  if (teamType) {
    teamType.value =
      presentation.team_type ||
      '';
  }

  generateTeamFields(
    presentation.team_type,
    data.members || []
  );
}

function generateTeamFields(
  teamType,
  existingMembers = []
) {
  const container =
    document.getElementById(
      'teamMembersContainer'
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    '';

  const sizeMap = {
    'Individual': 1,
    'Team of 2': 2,
    'Team of 3': 3,
    'Team of 4': 4,
    'Team of 5': 5
  };

  const count =
    sizeMap[teamType] ||
    0;

  for (
    let index = 0;
    index < count;
    index++
  ) {
    const existing =
      existingMembers[
        index
      ] || {};

    const card =
      document.createElement(
        'div'
      );

    card.className =
      'member-card';

    card.dataset.memberIndex =
      index;

    card.innerHTML =
      `
        <h4>
          Student ${index + 1}
        </h4>

        <div class="form-grid">

          <div class="form-field">
            <label>
              Name
            </label>

            <input
              type="text"
              class="member-name"
              required
              value="${escapeHtml(
                existing.name || ''
              )}"
            />
          </div>

          <div class="form-field">
            <label>
              Roll Number
            </label>

            <input
              type="text"
              class="member-roll"
              required
              value="${escapeHtml(
                existing.roll_number || ''
              )}"
            />
          </div>

          <div class="form-field">
            <label>
              Email
            </label>

            <input
              type="email"
              class="member-email"
              required
              value="${escapeHtml(
                existing.email || ''
              )}"
            />
          </div>

          <div class="form-field">
            <label>
              Phone Number
            </label>

            <input
              type="tel"
              class="member-phone"
              required
              value="${escapeHtml(
                existing.phone || ''
              )}"
            />
          </div>

        </div>
      `;

    container.appendChild(
      card
    );
  }
}

function collectMembersFromForm() {
  const cards =
    document.querySelectorAll(
      '#teamMembersContainer .member-card'
    );

  return Array.from(
    cards
  ).map(
    card => ({
      name:
        card.querySelector(
          '.member-name'
        )?.value
          .trim() || '',

      rollNumber:
        card.querySelector(
          '.member-roll'
        )?.value
          .trim() || '',

      email:
        card.querySelector(
          '.member-email'
        )?.value
          .trim() || '',

      phone:
        card.querySelector(
          '.member-phone'
        )?.value
          .trim() || ''
    })
  );
}

function validateRegistrationForm(
  payload
) {
  if (!payload.topic) {
    return 'Presentation topic is required.';
  }

  if (!payload.subject) {
    return 'Subject is required.';
  }

  if (!payload.section) {
    return 'Please select a section.';
  }

  if (!payload.teamType) {
    return 'Please select a team type.';
  }

  if (
    !payload.presentationDate
  ) {
    return 'Please select a presentation date.';
  }

  if (
    !payload.presentationTime
  ) {
    return 'Please select a presentation time.';
  }

  if (
    !Array.isArray(
      payload.members
    ) ||
    payload.members.length === 0
  ) {
    return 'At least one team member is required.';
  }

  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const phoneRegex =
    /^[0-9]{7,15}$/;

  const rolls =
    new Set();

  const emails =
    new Set();

  for (
    const [
      index,
      member
    ]
      of payload.members.entries()
  ) {
    if (!member.name) {
      return `Member ${
        index + 1
      }: name is required.`;
    }

    if (!member.rollNumber) {
      return `Member ${
        index + 1
      }: roll number is required.`;
    }

    if (
      !emailRegex.test(
        member.email
      )
    ) {
      return `Member ${
        index + 1
      }: valid email is required.`;
    }

    if (
      !phoneRegex.test(
        member.phone
      )
    ) {
      return `Member ${
        index + 1
      }: valid phone number is required.`;
    }

    const rollKey =
      member.rollNumber
        .trim()
        .toLowerCase();

    const emailKey =
      member.email
        .trim()
        .toLowerCase();

    if (
      rolls.has(
        rollKey
      )
    ) {
      return `Duplicate roll number: ${member.rollNumber}`;
    }

    if (
      emails.has(
        emailKey
      )
    ) {
      return `Duplicate member email: ${member.email}`;
    }

    rolls.add(
      rollKey
    );

    emails.add(
      emailKey
    );
  }

  return null;
}

async function submitRegistration(
  event
) {
  event.preventDefault();

  const button =
    document.getElementById(
      'submitRegistrationBtn'
    );

  const editingId =
    document.getElementById(
      'editingPresentationId'
    )?.value || '';

  const topic =
    document.getElementById(
      'regTopic'
    )?.value
      .trim() || '';

  const subject =
    document.getElementById(
      'regSubject'
    )?.value
      .trim() || '';

  const section =
    document.getElementById(
      'regSection'
    )?.value || '';

  const teamType =
    document.getElementById(
      'regTeamType'
    )?.value || '';

  const presentationDate =
    document.getElementById(
      'regDate'
    )?.value || '';

  const presentationTime =
    document.getElementById(
      'regTime'
    )?.value || '';

  const payload = {
    topic,
    subject,
    section,
    teamType,
    presentationDate,
    presentationTime,
    members:
      collectMembersFromForm()
  };

  const validationError =
    validateRegistrationForm(
      payload
    );

  if (validationError) {
    showToast(
      validationError,
      'warning'
    );

    return;
  }

  setButtonLoading(
    button,
    true
  );

  try {
    if (editingId) {
      await apiRequest(
        `/api/presentations/${encodeURIComponent(
          editingId
        )}`,
        {
          method: 'PUT',
          body: payload
        }
      );

      showToast(
        'Registration updated successfully.',
        'success'
      );

      await showView(
        'my-registrations'
      );

    } else {
      const data =
        await apiRequest(
          '/api/presentations',
          {
            method: 'POST',
            body: payload
          }
        );

      showRegistrationSuccessModal(
        data.presentation
      );
    }

  } catch (error) {
    console.error(
      'Submit registration error:',
      error
    );

    showToast(
      error.message ||
        'Could not save registration.',
      'error'
    );

  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}

function showRegistrationSuccessModal(
  presentation
) {
  const overlay =
    document.getElementById(
      'successModalOverlay'
    );

  const details =
    document.getElementById(
      'successDetails'
    );

  if (
    !overlay ||
    !details
  ) {
    showToast(
      'Registration submitted successfully.',
      'success'
    );

    return;
  }

  details.innerHTML =
    `
      <div class="detail-row">
        <span>
          Registration ID
        </span>

        <span>
          ${escapeHtml(
            presentation.registration_id
          )}
        </span>
      </div>

      <div class="detail-row">
        <span>
          Topic
        </span>

        <span>
          ${escapeHtml(
            presentation.topic
          )}
        </span>
      </div>

      <div class="detail-row">
        <span>
          Subject
        </span>

        <span>
          ${escapeHtml(
            presentation.subject
          )}
        </span>
      </div>

      <div class="detail-row">
        <span>
          Section
        </span>

        <span>
          Section
          ${escapeHtml(
            presentation.section
          )}
        </span>
      </div>

      <div class="detail-row">
        <span>
          Team Type
        </span>

        <span>
          ${escapeHtml(
            presentation.team_type
          )}
        </span>
      </div>

      <div class="detail-row">
        <span>
          Date
        </span>

        <span>
          ${formatDate(
            presentation.presentation_date
          )}
        </span>
      </div>

      <div class="detail-row">
        <span>
          Time
        </span>

        <span>
          ${escapeHtml(
            presentation.presentation_time
          )}
        </span>
      </div>

      <div class="detail-row">
        <span>
          Members
        </span>

        <span>
          ${escapeHtml(
            presentation.member_count
          )}
        </span>
      </div>

      <div class="detail-row">
        <span>
          Status
        </span>

        <span>
          ${escapeHtml(
            presentation.status
          )}
        </span>
      </div>
    `;

  overlay.classList.remove(
    'hidden'
  );

  const viewButton =
    document.getElementById(
      'successViewBtn'
    );

  if (viewButton) {
    viewButton.onclick =
      async () => {
        overlay.classList.add(
          'hidden'
        );

        await showView(
          'registration-details',
          {
            id:
              presentation.id
          }
        );
      };
  }

  const printButton =
    document.getElementById(
      'successPrintBtn'
    );

  if (printButton) {
    printButton.onclick =
      async () => {
        overlay.classList.add(
          'hidden'
        );

        await showView(
          'registration-details',
          {
            id:
              presentation.id
          }
        );

        window.print();
      };
  }

  const anotherButton =
    document.getElementById(
      'successAnotherBtn'
    );

  if (anotherButton) {
    anotherButton.onclick =
      async () => {
        overlay.classList.add(
          'hidden'
        );

        await showView(
          'new-registration'
        );
      };
  }
}

async function viewRegistration(
  id
) {
  const panel =
    document.getElementById(
      'registrationDetailsPanel'
    );

  if (!panel) {
    return;
  }

  if (!id) {
    panel.innerHTML =
      `
        <div class="empty-state">
          Registration ID is missing.
        </div>
      `;

    return;
  }

  panel.innerHTML =
    `
      <div class="page-loading">
        Loading details...
      </div>
    `;

  const data =
    await apiRequest(
      `/api/presentations/${encodeURIComponent(
        id
      )}`
    );

  const presentation =
    data.presentation;

  const members =
    Array.isArray(
      data.members
    )
      ? data.members
      : [];

  const membersRows =
    members
      .map(
        member => `
          <tr>

            <td>
              ${escapeHtml(
                member.name
              )}
            </td>

            <td>
              ${escapeHtml(
                member.roll_number
              )}
            </td>

            <td>
              ${escapeHtml(
                member.email
              )}
            </td>

            <td>
              ${escapeHtml(
                member.phone
              )}
            </td>

          </tr>
        `
      )
      .join('');

  panel.innerHTML =
    `
      <div class="detail-grid">

        <div class="detail-item">
          <div class="detail-label">
            Registration ID
          </div>

          <div class="detail-value">
            ${escapeHtml(
              presentation.registration_id
            )}
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">
            Status
          </div>

          <div class="detail-value">
            ${statusBadge(
              presentation.status
            )}
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">
            Topic
          </div>

          <div class="detail-value">
            ${escapeHtml(
              presentation.topic
            )}
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">
            Subject
          </div>

          <div class="detail-value">
            ${escapeHtml(
              presentation.subject
            )}
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">
            Section
          </div>

          <div class="detail-value">
            Section
            ${escapeHtml(
              presentation.section
            )}
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">
            Team Type
          </div>

          <div class="detail-value">
            ${escapeHtml(
              presentation.team_type
            )}
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">
            Date
          </div>

          <div class="detail-value">
            ${formatDate(
              presentation.presentation_date
            )}
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">
            Time
          </div>

          <div class="detail-value">
            ${escapeHtml(
              presentation.presentation_time
            )}
          </div>
        </div>

      </div>

      <h3 class="form-section-title">
        Team Members
      </h3>

      <div class="table-wrap">

        <table class="data-table">

          <thead>
            <tr>
              <th>Name</th>
              <th>Roll Number</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>

          <tbody>
            ${
              membersRows ||
              `
                <tr>
                  <td colspan="4">
                    No team members found.
                  </td>
                </tr>
              `
            }
          </tbody>

        </table>

      </div>
    `;
}

function printRegistration() {
  window.print();
}

async function loadProfile() {
  const panel =
    document.getElementById(
      'profilePanel'
    );

  if (!panel) {
    return;
  }

  panel.innerHTML =
    `
      <div class="page-loading">
        Loading profile...
      </div>
    `;

  const data =
    await apiRequest(
      '/api/profile'
    );

  const profile =
    data.profile;

  panel.innerHTML =
    `
      <div class="detail-grid">

        <div class="detail-item">
          <div class="detail-label">
            Name
          </div>

          <div class="detail-value">
            ${escapeHtml(
              profile.name
            )}
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">
            Email
          </div>

          <div class="detail-value">
            ${escapeHtml(
              profile.email
            )}
          </div>
        </div>

        <div class="detail-item">
          <div class="detail-label">
            Role
          </div>

          <div class="detail-value">
            ${capitalize(
              profile.role
            )}
          </div>
        </div>

        ${
          profile.role ===
          'student'
            ? `
              <div class="detail-item">

                <div class="detail-label">
                  Registration Count
                </div>

                <div class="detail-value">
                  ${escapeHtml(
                    profile.registrationCount
                  )}
                </div>

              </div>
            `
            : ''
        }

        <div class="detail-item">

          <div class="detail-label">
            Account Created
          </div>

          <div class="detail-value">
            ${formatDate(
              profile.created_at
            )}
          </div>

        </div>

      </div>
    `;
}

async function loadAdminDashboard() {
  const grid =
    document.getElementById(
      'adminStatsGrid'
    );

  if (!grid) {
    return;
  }

  grid.innerHTML =
    `
      <div class="page-loading">
        Loading dashboard...
      </div>
    `;

  const data =
    await apiRequest(
      '/api/admin/dashboard'
    );

  const stats =
    data.stats;

  grid.innerHTML =
    `
      <div class="stat-card accent-navy">
        <div class="stat-value">
          ${stats.totalStudents}
        </div>

        <div class="stat-label">
          Total Students
        </div>
      </div>

      <div class="stat-card accent-navy">
        <div class="stat-value">
          ${stats.totalPresentations}
        </div>

        <div class="stat-label">
          Total Presentations
        </div>
      </div>

      <div class="stat-card accent-blue">
        <div class="stat-value">
          ${stats.Registered}
        </div>

        <div class="stat-label">
          Registered
        </div>
      </div>

      <div class="stat-card accent-amber">
        <div class="stat-value">
          ${stats.Pending}
        </div>

        <div class="stat-label">
          Pending
        </div>
      </div>

      <div class="stat-card accent-green">
        <div class="stat-value">
          ${stats.Completed}
        </div>

        <div class="stat-label">
          Completed
        </div>
      </div>

      <div class="stat-card accent-red">
        <div class="stat-value">
          ${stats.Cancelled}
        </div>

        <div class="stat-label">
          Cancelled
        </div>
      </div>

      <div class="stat-card accent-blue">
        <div class="stat-value">
          ${stats.sectionA}
        </div>

        <div class="stat-label">
          Section A
        </div>
      </div>

      <div class="stat-card accent-blue">
        <div class="stat-value">
          ${stats.sectionB}
        </div>

        <div class="stat-label">
          Section B
        </div>
      </div>

      <div class="stat-card accent-blue">
        <div class="stat-value">
          ${stats.sectionC}
        </div>

        <div class="stat-label">
          Section C
        </div>
      </div>
    `;
}

let searchDebounceTimer =
  null;

function debounceSearch() {
  clearTimeout(
    searchDebounceTimer
  );

  searchDebounceTimer =
    setTimeout(
      () => {
        searchRegistrations();
      },
      350
    );
}

async function searchRegistrations() {
  const list =
    document.getElementById(
      'adminRegistrationsList'
    );

  if (!list) {
    return;
  }

  list.innerHTML =
    `
      <div class="page-loading">
        Loading registrations...
      </div>
    `;

  const params =
    new URLSearchParams();

  const searchInput =
    document.getElementById(
      'adminSearchInput'
    );

  const sectionInput =
    document.getElementById(
      'adminFilterSection'
    );

  const subjectInput =
    document.getElementById(
      'adminFilterSubject'
    );

  const teamTypeInput =
    document.getElementById(
      'adminFilterTeamType'
    );

  const statusInput =
    document.getElementById(
      'adminFilterStatus'
    );

  const dateInput =
    document.getElementById(
      'adminFilterDate'
    );

  const sortInput =
    document.getElementById(
      'adminSortBy'
    );

  const search =
    searchInput?.value
      .trim() || '';

  const section =
    sectionInput?.value ||
    '';

  const subject =
    subjectInput?.value
      .trim() || '';

  const teamType =
    teamTypeInput?.value ||
    '';

  const status =
    statusInput?.value ||
    '';

  const date =
    dateInput?.value ||
    '';

  const sortBy =
    sortInput?.value ||
    '';

  if (search) {
    params.set(
      'search',
      search
    );
  }

  if (section) {
    params.set(
      'section',
      section
    );
  }

  if (subject) {
    params.set(
      'subject',
      subject
    );
  }

  if (teamType) {
    params.set(
      'teamType',
      teamType
    );
  }

  if (status) {
    params.set(
      'status',
      status
    );
  }

  if (date) {
    params.set(
      'date',
      date
    );
  }

  if (sortBy) {
    params.set(
      'sortBy',
      sortBy
    );
  }

  try {
    const query =
      params.toString();

    const data =
      await apiRequest(
        `/api/admin/presentations${
          query
            ? `?${query}`
            : ''
        }`
      );

    renderAdminRegistrationsTable(
      data.presentations ||
        [],
      list
    );

  } catch (error) {
    console.error(
      'Admin search error:',
      error
    );

    list.innerHTML =
      `
        <div class="empty-state">
          <p>
            ${
              escapeHtml(
                error.message ||
                  'Could not load registrations.'
              )
            }
          </p>
        </div>
      `;
  }
}

function filterRegistrations() {
  searchRegistrations();
}

function renderAdminRegistrationsTable(
  list,
  container
) {
  if (
    !list ||
    list.length === 0
  ) {
    container.innerHTML =
      `
        <div class="empty-state">
          <p>
            No registrations match your search or filters.
          </p>
        </div>
      `;

    return;
  }

  const rows =
    list
      .map(
        presentation => `
          <tr
            data-id="${escapeHtml(
              presentation.id
            )}"
          >

            <td>
              ${escapeHtml(
                presentation.registration_id
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.topic
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.student_name
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.subject
              )}
            </td>

            <td>
              Section
              ${escapeHtml(
                presentation.section
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.team_type
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.member_count
              )}
            </td>

            <td>
              ${formatDate(
                presentation.presentation_date
              )}
            </td>

            <td>
              ${escapeHtml(
                presentation.presentation_time
              )}
            </td>

            <td>
              ${statusBadge(
                presentation.status
              )}
            </td>

            <td>

              <button
                type="button"
                class="btn btn-sm btn-outline admin-view"
              >
                View
              </button>

              <button
                type="button"
                class="btn btn-sm btn-outline admin-status"
              >
                Status
              </button>

              <button
                type="button"
                class="btn btn-sm btn-danger admin-delete"
              >
                Delete
              </button>

            </td>

          </tr>
        `
      )
      .join('');

  container.innerHTML =
    `
      <div class="table-wrap">

        <table class="data-table">

          <thead>

            <tr>
              <th>Reg. ID</th>
              <th>Topic</th>
              <th>Student</th>
              <th>Subject</th>
              <th>Section</th>
              <th>Team Type</th>
              <th>Members</th>
              <th>Date</th>
              <th>Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>

          </thead>

          <tbody>
            ${rows}
          </tbody>

        </table>

      </div>
    `;

  container
    .querySelectorAll(
      'tr[data-id]'
    )
    .forEach(
      row => {
        const id =
          row.dataset.id;

        const viewButton =
          row.querySelector(
            '.admin-view'
          );

        if (viewButton) {
          viewButton.addEventListener(
            'click',
            () => {
              showView(
                'registration-details',
                {
                  id
                }
              );
            }
          );
        }

        const statusButton =
          row.querySelector(
            '.admin-status'
          );

        if (statusButton) {
          statusButton.addEventListener(
            'click',
            () => {
              openStatusModal(
                id,
                row
              );
            }
          );
        }

        const deleteButton =
          row.querySelector(
            '.admin-delete'
          );

        if (deleteButton) {
          deleteButton.addEventListener(
            'click',
            () => {
              deleteRegistrationAsAdmin(
                id
              );
            }
          );
        }
      }
    );
}

function openStatusModal(
  id,
  row
) {
  const overlay =
    document.getElementById(
      'statusModalOverlay'
    );

  const select =
    document.getElementById(
      'statusModalSelect'
    );

  const confirmButton =
    document.getElementById(
      'statusModalConfirmBtn'
    );

  const cancelButton =
    document.getElementById(
      'statusModalCancelBtn'
    );

  if (
    !overlay ||
    !select ||
    !confirmButton ||
    !cancelButton
  ) {
    return;
  }

  const badge =
    row.querySelector(
      '.badge'
    );

  const currentStatus =
    badge
      ? badge.textContent
          .trim()
      : 'Pending';

  select.value =
    currentStatus;

  overlay.classList.remove(
    'hidden'
  );

  function cleanup() {
    overlay.classList.add(
      'hidden'
    );

    confirmButton.removeEventListener(
      'click',
      onConfirm
    );

    cancelButton.removeEventListener(
      'click',
      onCancel
    );
  }

  async function onConfirm() {
    try {
      confirmButton.disabled =
        true;

      await updateStatus(
        id,
        select.value
      );

      cleanup();

    } catch (error) {
      console.error(
        'Update status error:',
        error
      );

      showToast(
        error.message ||
          'Could not update status.',
        'error'
      );

    } finally {
      confirmButton.disabled =
        false;
    }
  }

  function onCancel() {
    cleanup();
  }

  confirmButton.addEventListener(
    'click',
    onConfirm
  );

  cancelButton.addEventListener(
    'click',
    onCancel
  );
}

async function updateStatus(
  id,
  status
) {
  await apiRequest(
    `/api/admin/presentations/${encodeURIComponent(
      id
    )}/status`,
    {
      method: 'PUT',

      body: {
        status
      }
    }
  );

  showToast(
    'Status updated successfully.',
    'success'
  );

  await searchRegistrations();
}

async function deleteRegistrationAsAdmin(
  id
) {
  const confirmed =
    await showConfirmModal(
      'Delete Registration',
      'This will permanently delete the registration. This action cannot be undone.'
    );

  if (!confirmed) {
    return;
  }

  try {
    await apiRequest(
      `/api/admin/presentations/${encodeURIComponent(
        id
      )}`,
      {
        method: 'DELETE'
      }
    );

    showToast(
      'Registration deleted successfully.',
      'success'
    );

    await searchRegistrations();

  } catch (error) {
    console.error(
      'Admin delete error:',
      error
    );

    showToast(
      error.message ||
        'Could not delete registration.',
      'error'
    );
  }
}

async function loadAdminStudents() {
  const list =
    document.getElementById(
      'adminStudentsList'
    );

  if (!list) {
    return;
  }

  list.innerHTML =
    `
      <div class="page-loading">
        Loading students...
      </div>
    `;

  const data =
    await apiRequest(
      '/api/admin/students'
    );

  const students =
    Array.isArray(
      data.students
    )
      ? data.students
      : [];

  if (
    students.length === 0
  ) {
    list.innerHTML =
      `
        <div class="empty-state">
          <p>
            No students found.
          </p>
        </div>
      `;

    return;
  }

  const rows =
    students
      .map(
        student => `
          <tr>

            <td>
              ${escapeHtml(
                student.name
              )}
            </td>

            <td>
              ${escapeHtml(
                student.email
              )}
            </td>

            <td>
              ${escapeHtml(
                student.registration_count
              )}
            </td>

            <td>
              ${formatDate(
                student.created_at
              )}
            </td>

            <td>
              ${capitalize(
                student.role
              )}
            </td>

          </tr>
        `
      )
      .join('');

  list.innerHTML =
    `
      <div class="table-wrap">

        <table class="data-table">

          <thead>

            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Registrations</th>
              <th>Account Created</th>
              <th>Role</th>
            </tr>

          </thead>

          <tbody>
            ${rows}
          </tbody>

        </table>

      </div>
    `;
}

function escapeHtml(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value)
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}

function formatDate(
  dateValue
) {
  if (!dateValue) {
    return '';
  }

  const date =
    new Date(
      dateValue
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(
      dateValue
    );
  }

  return date.toLocaleDateString(
    'en-IN',
    {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }
  );
}

function capitalize(
  value
) {
  if (!value) {
    return '';
  }

  const stringValue =
    String(value);

  return (
    stringValue
      .charAt(0)
      .toUpperCase() +
    stringValue.slice(1)
  );
}

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    document
      .querySelectorAll(
        '[data-nav]'
      )
      .forEach(
        element => {
          element.addEventListener(
            'click',
            event => {

              if (
                element.tagName ===
                'A'
              ) {
                event.preventDefault();
              }

              const view =
                element.dataset
                  .nav;

              if (view) {
                showView(
                  view
                );
              }
            }
          );
        }
      );

    const hamburger =
      document.getElementById(
        'hamburgerBtn'
      );

    const navLinks =
      document.getElementById(
        'navLinks'
      );

    if (
      hamburger &&
      navLinks
    ) {
      hamburger.addEventListener(
        'click',
        () => {
          navLinks.classList.toggle(
            'open'
          );
        }
      );
    }

    const loginForm =
      document.getElementById(
        'loginForm'
      );

    if (loginForm) {
      loginForm.addEventListener(
        'submit',
        handleLogin
      );
    }

    const signupForm =
      document.getElementById(
        'signupForm'
      );

    if (signupForm) {
      signupForm.addEventListener(
        'submit',
        handleSignup
      );
    }

    const registrationForm =
      document.getElementById(
        'registrationForm'
      );

    if (registrationForm) {
      registrationForm.addEventListener(
        'submit',
        submitRegistration
      );
    }

    const teamType =
      document.getElementById(
        'regTeamType'
      );

    if (teamType) {
      teamType.addEventListener(
        'change',
        event => {
          generateTeamFields(
            event.target.value
          );
        }
      );
    }

    const printButton =
      document.getElementById(
        'printRegistrationBtn'
      );

    if (printButton) {
      printButton.addEventListener(
        'click',
        printRegistration
      );
    }

    const adminSearch =
      document.getElementById(
        'adminSearchInput'
      );

    if (adminSearch) {
      adminSearch.addEventListener(
        'input',
        debounceSearch
      );
    }

    const adminSection =
      document.getElementById(
        'adminFilterSection'
      );

    if (adminSection) {
      adminSection.addEventListener(
        'change',
        filterRegistrations
      );
    }

    const adminSubject =
      document.getElementById(
        'adminFilterSubject'
      );

    if (adminSubject) {
      adminSubject.addEventListener(
        'input',
        debounceSearch
      );
    }

    const adminTeamType =
      document.getElementById(
        'adminFilterTeamType'
      );

    if (adminTeamType) {
      adminTeamType.addEventListener(
        'change',
        filterRegistrations
      );
    }

    const adminStatus =
      document.getElementById(
        'adminFilterStatus'
      );

    if (adminStatus) {
      adminStatus.addEventListener(
        'change',
        filterRegistrations
      );
    }

    const adminDate =
      document.getElementById(
        'adminFilterDate'
      );

    if (adminDate) {
      adminDate.addEventListener(
        'change',
        filterRegistrations
      );
    }

    const adminSort =
      document.getElementById(
        'adminSortBy'
      );

    if (adminSort) {
      adminSort.addEventListener(
        'change',
        filterRegistrations
      );
    }

    await checkAuthentication();

    const initialView =
      currentUser
        ? (
            currentUser.role ===
            'admin'
              ? 'admin-dashboard'
              : 'student-dashboard'
          )
        : 'home';

    await showView(
      initialView
    );
  }
);
