/**
 * SkillSwap Auth Controller
 * Manages mode switching (Log In vs Sign Up), validation, submission, and direct redirect to profile/dashboard.
 */

document.addEventListener('DOMContentLoaded', () => {
  const store = window.SkillSwapStore || window.SkillShareStore;

  // If user is already logged in, redirect straight to dashboard
  if (store) {
    const activeUser = store.getCurrentUser();
    if (activeUser && activeUser.accountStatus === 'approved') {
      const activeProfile = store.getCurrentProfile();
      if (activeProfile && activeProfile.teachSkills && activeProfile.teachSkills.length > 0) {
        window.location.replace('dashboard.html');
        return;
      }
    }
  }

  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  const nameGroup = document.getElementById('nameGroup');
  const fullNameInput = document.getElementById('fullNameInput');
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');
  const submitBtnText = document.getElementById('submitBtnText');
  const switchPrompt = document.getElementById('switchPrompt');
  const authErrorAlert = document.getElementById('authErrorAlert');
  const authErrorMsg = document.getElementById('authErrorMsg');
  const authForm = document.getElementById('authForm');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');

  let currentMode = 'login'; // 'login' or 'signup'

  // Check URL query parameter mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'signup') {
    setMode('signup');
  }

  function setMode(mode) {
    currentMode = mode;
    hideError();

    if (mode === 'login') {
      loginTab.classList.add('active');
      signupTab.classList.remove('active');
      authTitle.textContent = 'Welcome back';
      authSubtitle.textContent = 'Log in to your 1-to-1 skill exchange account';
      nameGroup.classList.add('hidden-field');
      fullNameInput.removeAttribute('required');
      submitBtnText.textContent = 'Log In';
      switchPrompt.innerHTML = 'Don\'t have an account? <a href="#" id="switchTabLink" class="auth-link-bold">Sign Up</a>';
    } else {
      signupTab.classList.add('active');
      loginTab.classList.remove('active');
      authTitle.textContent = 'Create an account';
      authSubtitle.textContent = 'Join SkillSwap to exchange skills 1-on-1';
      nameGroup.classList.remove('hidden-field');
      fullNameInput.setAttribute('required', 'true');
      submitBtnText.textContent = 'Sign Up';
      switchPrompt.innerHTML = 'Already have an account? <a href="#" id="switchTabLink" class="auth-link-bold">Log In</a>';
    }

    // Re-bind switch link listener
    const newSwitchLink = document.getElementById('switchTabLink');
    if (newSwitchLink) {
      newSwitchLink.addEventListener('click', (e) => {
        e.preventDefault();
        setMode(currentMode === 'login' ? 'signup' : 'login');
      });
    }
  }

  if (loginTab) loginTab.addEventListener('click', () => setMode('login'));
  if (signupTab) signupTab.addEventListener('click', () => setMode('signup'));

  function showError(msg) {
    authErrorMsg.textContent = msg;
    authErrorAlert.classList.remove('hidden-field');
  }

  function hideError() {
    authErrorAlert.classList.add('hidden-field');
  }

  // Toggle Password Visibility
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      const eyeIcon = document.getElementById('eyeIcon');
      if (eyeIcon) {
        if (type === 'text') {
          eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          `;
        } else {
          eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          `;
        }
      }
    });
  }

  // Handle Auth Form Submission
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        showError('Please fill in all required fields.');
        return;
      }

      const authSubmitBtn = document.getElementById('authSubmitBtn');
      const origBtnText = submitBtnText ? submitBtnText.textContent : 'Submit';
      if (authSubmitBtn) authSubmitBtn.disabled = true;
      if (submitBtnText) submitBtnText.textContent = 'Connecting...';

      try {
        if (currentMode === 'signup') {
          const name = fullNameInput.value.trim();
          if (!name) {
            showError('Please enter your full name.');
            if (authSubmitBtn) authSubmitBtn.disabled = false;
            if (submitBtnText) submitBtnText.textContent = origBtnText;
            return;
          }

          const result = await store.registerAccount(name, email, password);
          if (!result.success) {
            showError(result.message);
            if (authSubmitBtn) authSubmitBtn.disabled = false;
            if (submitBtnText) submitBtnText.textContent = origBtnText;
            return;
          }

          // Direct navigation to profile creation upon signup!
          window.location.href = 'profile.html';

        } else {
          const result = await store.authenticateUser(email, password);
          if (!result.success) {
            showError(result.message);
            if (authSubmitBtn) authSubmitBtn.disabled = false;
            if (submitBtnText) submitBtnText.textContent = origBtnText;
            return;
          }

          if (result.hasProfile) {
            window.location.href = 'dashboard.html';
          } else {
            window.location.href = 'profile.html';
          }
        }
      } catch (err) {
        showError(err.message || 'Authentication error occurred.');
      } finally {
        if (authSubmitBtn) authSubmitBtn.disabled = false;
        if (submitBtnText) submitBtnText.textContent = origBtnText;
      }
    });
  }
});
