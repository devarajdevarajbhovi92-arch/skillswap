/**
 * SkillSwap Admin Dashboard Controller
 * Manages user management table rendering, metrics calculation, status filters,
 * user search, account status controls (Block, Unblock), deletion, and User Behavior session tracking.
 */

document.addEventListener('DOMContentLoaded', () => {
  const store = window.SkillSwapStore || window.SkillShareStore;

  // 1. Guard Admin Authentication
  const currentAdmin = store.requireAdminAuth();
  if (!currentAdmin) return;

  // Header & Greeting
  const adminGreeting = document.getElementById('adminGreeting');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const adminWelcomeTitle = document.getElementById('adminWelcomeTitle');

  if (adminGreeting) adminGreeting.textContent = `Logged in as ${currentAdmin.name}`;
  if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', () => store.logoutAdmin());
  if (adminWelcomeTitle) adminWelcomeTitle.textContent = `Welcome, ${currentAdmin.name.split(' ')[0]}`;

  // Metrics Elements
  const metricTotal = document.getElementById('metricTotal');
  const metricBlocked = document.getElementById('metricBlocked');
  const metricSessionsCreated = document.getElementById('metricSessionsCreated');
  const metricSessionsCompleted = document.getElementById('metricSessionsCompleted');
  const metricConversionRate = document.getElementById('metricConversionRate');
  const userCountHint = document.getElementById('userCountHint');
  const sessionCountHint = document.getElementById('sessionCountHint');

  // Table Elements
  const userTableBody = document.getElementById('userTableBody');
  const sessionTableBody = document.getElementById('sessionTableBody');
  const adminSearchInput = document.getElementById('adminSearchInput');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // Modal Elements
  const deleteUserModal = document.getElementById('deleteUserModal');
  const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const deleteModalTargetName = document.getElementById('deleteModalTargetName');

  let currentFilter = 'all';
  let searchQuery = '';
  let pendingDeleteEmail = null;

  function showToast(msg) {
    if (!toastNotification || !toastMessage) return;
    toastMessage.textContent = msg;
    toastNotification.classList.add('active');
    setTimeout(() => toastNotification.classList.remove('active'), 3500);
  }

  function updateMetricsUI() {
    const metrics = store.getAdminMetrics();
    if (metricTotal) metricTotal.textContent = metrics.totalUsers;
    if (metricBlocked) metricBlocked.textContent = metrics.blockedUsers;
    if (metricSessionsCreated) metricSessionsCreated.textContent = metrics.totalSessions;
    if (metricSessionsCompleted) metricSessionsCompleted.textContent = metrics.successfulSessions;
    if (metricConversionRate) metricConversionRate.textContent = metrics.conversionRate;
    if (sessionCountHint) sessionCountHint.textContent = `${metrics.totalSessions} total session activities (${metrics.successfulSessions} completed, ${metrics.activeSessions} active, ${metrics.conversionRate} conversion rate)`;
  }

  // Filter Buttons Handler
  document.querySelectorAll('.admin-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderUserDirectory();
    });
  });

  if (adminSearchInput) {
    adminSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderUserDirectory();
    });
  }

  // Render Admin User Directory Table
  function renderUserDirectory() {
    if (!userTableBody) return;
    userTableBody.innerHTML = '';

    const allUsers = store.getAllUsersForAdmin();
    updateMetricsUI();
    renderSessionDirectory();

    // Filter Logic
    const filtered = allUsers.filter(u => {
      if (currentFilter === 'blocked' && u.accountStatus !== 'blocked') return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchName = u.name.toLowerCase().includes(q);
        const matchEmail = u.email.toLowerCase().includes(q);
        const matchTeach = u.teachSkills.some(s => s.toLowerCase().includes(q));
        const matchLearn = u.learnSkills.some(s => s.toLowerCase().includes(q));
        if (!matchName && !matchEmail && !matchTeach && !matchLearn) return false;
      }

      return true;
    });

    if (userCountHint) {
      userCountHint.textContent = `Showing ${filtered.length} of ${allUsers.length} total users`;
    }

    if (filtered.length === 0) {
      userTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <div style="font-weight: 700; color: var(--text-main);">No matching user accounts found</div>
            <div style="font-size: 0.85rem; margin-top: 0.25rem;">Try updating your search query or filter criteria.</div>
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(u => {
      const tr = document.createElement('tr');
      const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const isBlocked = u.accountStatus === 'blocked';
      const completedSessionsCount = u.totalSessionsCompleted !== undefined ? u.totalSessionsCompleted : store.getCompletedSessionsCount(u.email);

      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="peer-avatar">${initials}</div>
            <div>
              <div style="font-weight: 700; color: var(--text-main);">${u.name}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;">${u.email}</div>
            </div>
          </div>
        </td>

        <td style="font-size: 0.85rem; color: var(--text-muted);">
          ${new Date(u.createdAt).toLocaleDateString()}
        </td>

        <td style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">
          ${completedSessionsCount}
        </td>

        <td>
          <div class="action-buttons-cell">
            ${isBlocked 
              ? `<button type="button" class="btn-action unblock-btn" data-email="${u.email}">Unblock</button>`
              : `<button type="button" class="btn-action block-btn" data-email="${u.email}">Block</button>`
            }
            <button type="button" class="btn-action delete-btn" data-email="${u.email}" data-name="${u.name}">Delete</button>
          </div>
        </td>
      `;

      const blockBtn = tr.querySelector('.block-btn');
      const unblockBtn = tr.querySelector('.unblock-btn');
      const deleteBtn = tr.querySelector('.delete-btn');

      if (blockBtn) {
        blockBtn.addEventListener('click', () => {
          store.updateUserAccountStatus(u.email, 'blocked');
          showToast(`Account for ${u.name} has been blocked.`);
          renderUserDirectory();
        });
      }

      if (unblockBtn) {
        unblockBtn.addEventListener('click', () => {
          store.updateUserAccountStatus(u.email, 'approved');
          showToast(`Account for ${u.name} has been unblocked.`);
          renderUserDirectory();
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          pendingDeleteEmail = u.email;
          if (deleteModalTargetName) deleteModalTargetName.textContent = u.name;
          deleteUserModal.classList.add('active');
        });
      }

      userTableBody.appendChild(tr);
    });
  }

  // Render User Behavior Session Table
  function renderSessionDirectory() {
    if (!sessionTableBody) return;
    sessionTableBody.innerHTML = '';

    const sessions = store.getAllSessionsForAdmin();

    if (sessions.length === 0) {
      sessionTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
            <div style="font-weight: 700; color: var(--text-main);">No exchange sessions recorded yet</div>
            <div style="font-size: 0.85rem; margin-top: 0.25rem;">Sessions will appear here as users connect and complete skill swaps.</div>
          </td>
        </tr>
      `;
      return;
    }

    sessions.forEach(s => {
      const tr = document.createElement('tr');
      const isSuccessful = (s.status || '').toUpperCase() === 'COMPLETED' || (s.status || '').toUpperCase() === 'SUCCESSFUL' || s.completedCount >= 2;

      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; font-size: 0.85rem;">${s.user1Name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${s.user1Email}</div>
        </td>

        <td>
          <div style="font-weight: 700; font-size: 0.85rem;">${s.user2Name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${s.user2Email}</div>
        </td>

        <td>
          <span style="font-weight: 700; font-size: 0.85rem;">${s.completedCount}/2 Completed</span>
        </td>

        <td>
          ${isSuccessful 
            ? `<span class="status-badge verified">Completed (2/2)</span>`
            : `<span class="status-badge pending">Active (${s.completedCount}/2)</span>`
          }
        </td>

        <td style="font-size: 0.8rem; color: var(--text-muted);">
          ${new Date(s.createdAt).toLocaleDateString()} ${new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </td>

        <td style="font-size: 0.8rem; color: var(--text-muted);">
          ${s.completedAt ? `${new Date(s.completedAt).toLocaleDateString()} ${new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—'}
        </td>
      `;

      sessionTableBody.appendChild(tr);
    });
  }

  // Delete Modal Handlers
  function closeDeleteModal() {
    deleteUserModal.classList.remove('active');
    pendingDeleteEmail = null;
  }

  if (closeDeleteModalBtn) closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      if (!pendingDeleteEmail) return;

      const res = store.deleteUserAccount(pendingDeleteEmail);
      if (res.success) {
        showToast('User account deleted permanently.');
        closeDeleteModal();
        renderUserDirectory();
      }
    });
  }

  // Initial render
  renderUserDirectory();

  // Fetch all Cloud Firestore users and sessions
  if (store.syncWithFirestore) {
    store.syncWithFirestore().then(() => {
      renderUserDirectory();
    });
  }

  // Real-time event updates
  window.addEventListener('skillshare_user_status_changed', () => renderUserDirectory());
  window.addEventListener('skillshare_user_deleted', () => renderUserDirectory());
  window.addEventListener('skillshare_session_updated', () => renderUserDirectory());
  window.addEventListener('storage', () => renderUserDirectory());
});
