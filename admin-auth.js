/**
 * SkillSwap Admin Authentication Controller
 * Handles single fixed admin authentication and redirection to admin.html.
 */

document.addEventListener('DOMContentLoaded', () => {
  const adminEmailInput = document.getElementById('adminEmailInput');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const adminAuthErrorAlert = document.getElementById('adminAuthErrorAlert');
  const adminAuthErrorMsg = document.getElementById('adminAuthErrorMsg');
  const adminAuthForm = document.getElementById('adminAuthForm');

  const store = window.SkillSwapStore || window.SkillShareStore;

  // If already logged in as Admin, redirect to admin.html
  const currentAdmin = store.getCurrentAdmin();
  if (currentAdmin) {
    window.location.href = 'admin.html';
    return;
  }

  function showError(msg) {
    if (adminAuthErrorMsg) adminAuthErrorMsg.textContent = msg;
    if (adminAuthErrorAlert) adminAuthErrorAlert.classList.remove('hidden-field');
  }

  function hideError() {
    if (adminAuthErrorAlert) adminAuthErrorAlert.classList.add('hidden-field');
  }

  // Toggle Admin Password Visibility
  const toggleAdminPasswordBtn = document.getElementById('toggleAdminPasswordBtn');
  if (toggleAdminPasswordBtn && adminPasswordInput) {
    toggleAdminPasswordBtn.addEventListener('click', () => {
      const type = adminPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      adminPasswordInput.setAttribute('type', type);

      const adminEyeIcon = document.getElementById('adminEyeIcon');
      if (adminEyeIcon) {
        if (type === 'text') {
          adminEyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          `;
        } else {
          adminEyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          `;
        }
      }
    });
  }

  // Handle Form Submit
  if (adminAuthForm) {
    adminAuthForm.addEventListener('submit', (e) => {
      e.preventDefault();
      hideError();

      const email = adminEmailInput ? adminEmailInput.value.trim() : '';
      const password = adminPasswordInput ? adminPasswordInput.value : '';

      if (!email || !password) {
        showError('Please fill in all required fields.');
        return;
      }

      const res = store.authenticateAdmin(email, password);
      if (res.success) {
        window.location.href = 'admin.html';
      } else {
        showError(res.message || 'Invalid admin credentials.');
      }
    });
  }
});
