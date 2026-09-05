/**
 * SkillSwap Profile Form Controller
 * Handles profile creation and editing, tag management (max 2 skills each), and availability selection.
 */

document.addEventListener('DOMContentLoaded', () => {
  const store = window.SkillSwapStore || window.SkillShareStore;

  // Guard Auth
  const currentUser = store.requireAuth();
  if (!currentUser) return;

  const existingProfile = store.getCurrentProfile();

  // Header & Title Elements
  const userGreeting = document.getElementById('userGreeting');
  const logoutBtn = document.getElementById('logoutBtn');
  const stepBadge = document.getElementById('stepBadge');
  const profileHeaderTitle = document.getElementById('profileHeaderTitle');

  if (userGreeting) userGreeting.textContent = `Logged in as ${currentUser.name}`;
  if (logoutBtn) logoutBtn.addEventListener('click', () => store.logout());

  // Update headers if editing
  if (existingProfile) {
    if (stepBadge) stepBadge.textContent = 'EDIT PROFILE';
    if (profileHeaderTitle) profileHeaderTitle.textContent = 'Edit Your Skill Profile';
  }

  // Form Field Elements
  const profileNameInput = document.getElementById('profileNameInput');
  const profileRoleInput = document.getElementById('profileRoleInput');
  const profileBioInput = document.getElementById('profileBioInput');
  
  const customTeachInput = document.getElementById('customTeachInput');
  const addTeachBtn = document.getElementById('addTeachBtn');
  const teachSelectedDisplay = document.getElementById('teachSelectedDisplay');

  const customLearnInput = document.getElementById('customLearnInput');
  const addLearnBtn = document.getElementById('addLearnBtn');
  const learnSelectedDisplay = document.getElementById('learnSelectedDisplay');

  const availabilityContainer = document.getElementById('availabilityContainer');
  const profileForm = document.getElementById('profileForm');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // State Management (Enforcing Max 2 skills each)
  let teachSkills = new Set();
  let learnSkills = new Set();
  let availability = new Set();

  function showToast(msg, isError = false) {
    if (!toastNotification || !toastMessage) return;
    toastMessage.textContent = msg;
    if (isError) {
      toastNotification.style.background = 'var(--danger, #dc2626)';
    } else {
      toastNotification.style.background = '';
    }
    toastNotification.classList.add('active');
    setTimeout(() => {
      toastNotification.classList.remove('active');
      toastNotification.style.background = '';
    }, 3500);
  }

  // Populate form if existing profile exists
  if (existingProfile) {
    if (profileNameInput) profileNameInput.value = existingProfile.name || currentUser.name;
    if (profileRoleInput) profileRoleInput.value = existingProfile.role || '';
    if (profileBioInput) profileBioInput.value = existingProfile.bio || '';
    (existingProfile.teachSkills || []).slice(0, 1).forEach(s => teachSkills.add(s));
    (existingProfile.learnSkills || []).slice(0, 1).forEach(s => learnSkills.add(s));
    (existingProfile.availability || []).forEach(a => availability.add(a));
  } else {
    if (profileNameInput) profileNameInput.value = currentUser.name;
  }

  // Render Tags Functions
  function renderTeachTags() {
    if (!teachSelectedDisplay) return;
    teachSelectedDisplay.innerHTML = '';
    teachSkills.forEach(skill => {
      const badge = document.createElement('span');
      badge.className = 'active-tag-badge teach';
      badge.innerHTML = `
        ${skill}
        <button type="button" class="remove-tag-btn" data-skill="${skill}">&times;</button>
      `;
      badge.querySelector('.remove-tag-btn').addEventListener('click', () => {
        teachSkills.delete(skill);
        renderTeachTags();
      });
      teachSelectedDisplay.appendChild(badge);
    });
  }

  function renderLearnTags() {
    if (!learnSelectedDisplay) return;
    learnSelectedDisplay.innerHTML = '';
    learnSkills.forEach(skill => {
      const badge = document.createElement('span');
      badge.className = 'active-tag-badge learn';
      badge.innerHTML = `
        ${skill}
        <button type="button" class="remove-tag-btn" data-skill="${skill}">&times;</button>
      `;
      badge.querySelector('.remove-tag-btn').addEventListener('click', () => {
        learnSkills.delete(skill);
        renderLearnTags();
      });
      learnSelectedDisplay.appendChild(badge);
    });
  }

  // Custom Tag Input Add Buttons
  function addCustomTeach() {
    if (!customTeachInput) return;
    const val = customTeachInput.value.trim();
    if (!val) return;

    if (teachSkills.size >= 1) {
      showToast('You can select a maximum of 1 skill to teach at once.', true);
      return;
    }

    teachSkills.add(val);
    customTeachInput.value = '';
    renderTeachTags();
  }

  function addCustomLearn() {
    if (!customLearnInput) return;
    const val = customLearnInput.value.trim();
    if (!val) return;

    if (learnSkills.size >= 1) {
      showToast('You can select a maximum of 1 skill to learn at once.', true);
      return;
    }

    learnSkills.add(val);
    customLearnInput.value = '';
    renderLearnTags();
  }

  if (addTeachBtn) addTeachBtn.addEventListener('click', addCustomTeach);
  if (customTeachInput) customTeachInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomTeach(); }
  });

  if (addLearnBtn) addLearnBtn.addEventListener('click', addCustomLearn);
  if (customLearnInput) customLearnInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomLearn(); }
  });

  // Availability Chips Selection
  if (availabilityContainer) {
    availabilityContainer.querySelectorAll('.avail-chip').forEach(chip => {
      const slot = chip.dataset.avail;
      if (availability.has(slot)) chip.classList.add('active');

      chip.addEventListener('click', () => {
        if (availability.has(slot)) {
          availability.delete(slot);
          chip.classList.remove('active');
        } else {
          availability.add(slot);
          chip.classList.add('active');
        }
      });
    });
  }

  // Initialize display
  renderTeachTags();
  renderLearnTags();

  // Handle Form Submission
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = profileNameInput ? profileNameInput.value.trim() : '';
      if (!name) {
        alert('Please enter your name.');
        return;
      }

      if (teachSkills.size === 0) {
        showToast('Please add 1 skill you can teach.', true);
        return;
      }

      if (teachSkills.size > 1) {
        showToast('Please select a maximum of 1 skill to teach.', true);
        return;
      }

      if (learnSkills.size === 0) {
        showToast('Please add 1 skill you want to learn.', true);
        return;
      }

      if (learnSkills.size > 1) {
        showToast('Please select a maximum of 1 skill to learn.', true);
        return;
      }

      if (availability.size === 0) {
        showToast('Please select at least one available time slot.', true);
        return;
      }

      const profileData = {
        name,
        role: profileRoleInput ? profileRoleInput.value.trim() : '',
        bio: profileBioInput ? profileBioInput.value.trim() : '',
        teachSkills: Array.from(teachSkills),
        learnSkills: Array.from(learnSkills),
        availability: Array.from(availability)
      };

      const saveProfileBtn = document.getElementById('saveProfileBtn');
      if (saveProfileBtn) saveProfileBtn.disabled = true;

      try {
        const res = await store.saveProfile(profileData);
        if (res.success) {
          showToast('Profile saved successfully!');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 800);
        } else {
          alert(res.message || 'Failed to save profile.');
          if (saveProfileBtn) saveProfileBtn.disabled = false;
        }
      } catch (err) {
        alert(err.message || 'Failed to save profile.');
        if (saveProfileBtn) saveProfileBtn.disabled = false;
      }
    });
  }
});
