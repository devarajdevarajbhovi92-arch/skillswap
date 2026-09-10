function trackEvent(eventName, parameters = {}) {
    if (typeof gtag === "function") {
        gtag("event", eventName, parameters);
    }
}

/**
 * SkillSwap Landing Page Controller
 * Handles session auto-redirect if user is logged in.
 */

document.addEventListener('DOMContentLoaded', () => {

  // GA4: onboarding page viewed
  trackEvent("onboarding_viewed");

  const store = window.SkillSwapStore || window.SkillShareStore;
  const currentUser = store ? store.getCurrentUser() : null;

  if (currentUser) {
    const heroBtn = document.getElementById('heroGetStartedBtn');
    if (heroBtn) {
      heroBtn.href = 'dashboard.html';
      heroBtn.querySelector('span').textContent = 'Go to Your Dashboard';
    }
  }
});