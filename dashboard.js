/**
 * SkillSwap Dashboard Controller
 * Manages profile display, real-time matching engine for verified users, grouped notifications, rich chat attachments, and Session-based exchange lifecycle & completion.
 */

// Handle Back-Forward Cache (bfcache) navigation
window.addEventListener('pageshow', (event) => {
  const store = window.SkillSwapStore || window.SkillShareStore;
  if (store) {
    const user = store.requireAuth();
    if (!user) {
      window.location.replace('auth.html');
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const store = window.SkillSwapStore || window.SkillShareStore;

  // 1. Guard Auth & Verified Profile
  const currentUser = store.requireAuth();
  if (!currentUser) return;
  const myEmail = (currentUser.email || '').toLowerCase();

  const currentProfile = store.getCurrentProfile(myEmail);
  if (!currentProfile) {
    window.location.replace('profile.html');
    return;
  }
  trackEvent("dashboard_viewed");
  // 2. Header & Profile Elements
  const dashUserGreeting = document.getElementById('dashUserGreeting');
  const dashLogoutBtn = document.getElementById('dashLogoutBtn');
  if (dashLogoutBtn) dashLogoutBtn.addEventListener('click', () => store.logout());

  const welcomeTitle = document.getElementById('welcomeTitle');
  const dashName = document.getElementById('dashName');
  const dashRole = document.getElementById('dashRole');
  const dashBio = document.getElementById('dashBio');
  const dashTeachSkills = document.getElementById('dashTeachSkills');
  const dashLearnSkills = document.getElementById('dashLearnSkills');
  const dashAvailability = document.getElementById('dashAvailability');
  const dashUserAvatar = document.getElementById('dashUserAvatar');

  function updateProfileUI() {
    const freshProfile = store.getCurrentProfile(myEmail) || currentProfile;
    if (!freshProfile) return;

    if (dashUserGreeting) dashUserGreeting.textContent = `Logged in as ${freshProfile.name}`;
    if (welcomeTitle) welcomeTitle.textContent = `Welcome back, ${freshProfile.name.split(' ')[0]}!`;
    if (dashName) dashName.textContent = freshProfile.name;
    if (dashRole) dashRole.textContent = freshProfile.role || 'Skill Explorer';
    if (dashBio) dashBio.textContent = freshProfile.bio || 'No bio added yet.';
    if (dashAvailability) dashAvailability.textContent = (freshProfile.availability || []).join(', ') || 'Flexible';

    if (dashUserAvatar) {
      const initials = (freshProfile.name || 'User').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      dashUserAvatar.textContent = initials;
    }

    if (dashTeachSkills) {
      dashTeachSkills.innerHTML = '';
      (freshProfile.teachSkills || []).forEach(skill => {
        const tag = document.createElement('span');
        tag.className = 'dash-tag teach-tag';
        tag.textContent = skill;
        dashTeachSkills.appendChild(tag);
      });
    }

    if (dashLearnSkills) {
      dashLearnSkills.innerHTML = '';
      (freshProfile.learnSkills || []).forEach(skill => {
        const tag = document.createElement('span');
        tag.className = 'dash-tag learn-tag';
        tag.textContent = skill;
        dashLearnSkills.appendChild(tag);
      });
    }
  }

  updateProfileUI();

  // 2b. Total Sessions Metric Counter System
  function updateTotalSessionsUI() {
    const totalSessions = store.getCompletedSessionsCount(currentProfile.email);
    
    const dashTotalSessionsCount = document.getElementById('dashTotalSessionsCount');
    const dashMetaTotalSessions = document.getElementById('dashMetaTotalSessions');
    const welcomeTotalSessionsBadge = document.getElementById('welcomeTotalSessionsBadge');

    if (dashTotalSessionsCount) {
      dashTotalSessionsCount.textContent = `Completed Sessions: ${totalSessions}`;
    }
    if (dashMetaTotalSessions) {
      dashMetaTotalSessions.textContent = `${totalSessions}`;
    }
    if (welcomeTotalSessionsBadge) {
      welcomeTotalSessionsBadge.textContent = `Completed Sessions: ${totalSessions}`;
    }
  }

  updateTotalSessionsUI();

  if (store.syncWithFirestore) {
    store.syncWithFirestore();
  }

  // 3. Grouped Per-Peer Notification Center System
  const notifBellBtn = document.getElementById('notifBellBtn');
  const notifBadge = document.getElementById('notifBadge');
  const notifDropdown = document.getElementById('notifDropdown');
  const notifList = document.getElementById('notifList');
  const markReadBtn = document.getElementById('markReadBtn');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  function showToast(msg) {
    if (!toastNotification || !toastMessage) return;
    toastMessage.textContent = msg;
    toastNotification.classList.add('active');
    setTimeout(() => toastNotification.classList.remove('active'), 3500);
  }

  function updateNotificationsUI() {
    if (!notifBadge || !notifList) return;

    const unreadCount = store.getUnreadNotificationCount();
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount;
      notifBadge.classList.remove('hidden-field');
    } else {
      notifBadge.classList.add('hidden-field');
    }

    const notifications = store.getNotifications();
    notifList.innerHTML = '';

    if (notifications.length === 0) {
      notifList.innerHTML = `<div class="notif-empty">No notifications yet</div>`;
      return;
    }

    notifications.forEach(n => {
      const item = document.createElement('div');
      const isUnread = !n.read || (n.unreadCount && n.unreadCount > 0);
      item.className = `notif-item ${isUnread ? 'unread' : 'read'}`;
      
      const countBadgeHTML = (n.unreadCount && n.unreadCount > 0)
        ? `<span class="notif-count-badge">${n.unreadCount} new</span>`
        : '';

      item.innerHTML = `
        <div class="notif-item-header">
          <span class="notif-item-title">${n.title} ${countBadgeHTML}</span>
          <span class="notif-time">${formatTimeAgo(n.timestamp)}</span>
        </div>
        <div class="notif-item-text">${n.text}</div>
      `;

      item.addEventListener('click', () => {
        if (n.metaData && n.metaData.peerEmail) {
          const peerEmail = n.metaData.peerEmail;
          store.markPeerNotificationsAsRead(peerEmail);
          updateNotificationsUI();

          const matches = store.findMatches('all', '');
          let matchItem = matches.find(m => m.peer.email === peerEmail);
          
          if (!matchItem) {
            const profiles = JSON.parse(localStorage.getItem('skillshare_profiles') || '{}');
            const peerProf = profiles[peerEmail];
            if (peerProf) {
              matchItem = {
                peer: peerProf,
                matchPercentage: 80,
                isTwoWay: true,
                matchReasons: ['Direct Peer Connection']
              };
            }
          }

          if (matchItem) {
            openConnectModal(matchItem, 'chat');
          }
        }
        notifDropdown.classList.add('hidden-field');
      });

      notifList.appendChild(item);
    });
  }

  if (notifBellBtn) {
    notifBellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle('hidden-field');
    });
  }

  document.addEventListener('click', (e) => {
    if (notifDropdown && !notifDropdown.contains(e.target) && e.target !== notifBellBtn) {
      notifDropdown.classList.add('hidden-field');
    }
  });

  if (markReadBtn) {
    markReadBtn.addEventListener('click', () => {
      store.markNotificationsAsRead();
      updateNotificationsUI();
    });
  }

  window.addEventListener('skillshare_notification_added', (e) => {
    updateNotificationsUI();
    const notif = e.detail.notif;
    if (notif && e.detail.toEmail === currentUser.email) {
      showToast(`${notif.title}: ${notif.text}`);
    }
  });

  window.addEventListener('skillshare_notifications_read', () => {
    updateNotificationsUI();
  });

  updateNotificationsUI();

  // Helper time formatting
  function formatTimeAgo(isoString) {
    const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // 4. Matching Engine for Real Verified Users
  let currentFilter = 'all';
  let searchQuery = '';

  const matchesList = document.getElementById('matchesList');
  const matchCountHint = document.getElementById('matchCountHint');
  const matchSearchInput = document.getElementById('matchSearchInput');

  document.querySelectorAll('.match-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.match-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderMatches();
    });
  });

  if (matchSearchInput) {
    matchSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderMatches();
    });
  }

  // Render Matches Grid
  function renderMatches() {
    if (!matchesList) return;
    matchesList.innerHTML = '';

    const matches = store.findMatches(currentFilter, searchQuery);

    if (matchCountHint) {
      matchCountHint.textContent = `${matches.length} verified peer ${matches.length === 1 ? 'match' : 'matches'} found`;
    }

    if (matches.length === 0) {
      matchesList.innerHTML = `
        <div style="text-align: center; padding: 3.5rem 1.5rem; color: var(--text-muted);">
          <div style="margin-bottom: 0.75rem;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <h3 style="font-family: var(--font-heading); color: var(--text-main); font-weight: 800; font-size: 1.25rem; margin-bottom: 0.5rem;">No Other Verified Members Yet</h3>
          <p style="font-size: 0.95rem; max-width: 440px; margin: 0 auto; line-height: 1.5;">
            You are all set! To test 1-to-1 skill matching and rich chat, register another verified account in a separate browser tab or invite peers to sign up!
          </p>
        </div>
      `;
      return;
    }

    matches.forEach(item => {
      const peer = item.peer;
      const card = document.createElement('div');
      card.className = 'match-peer-card';

      const initials = peer.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

      const reasonsHTML = (item.matchReasons || []).map(r => `
        <div class="reason-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          ${r}
        </div>
      `).join('');
      const connStatus = store.getConnectionStatus(peer.email);
      let connBtnText = 'Connect & Share Skills';
      let connBtnClass = 'connect-btn-initial';

      if (connStatus === 'connected') {
        connBtnText = 'Chat & Swap Skills';
        connBtnClass = 'connected-btn';
      } else if (connStatus === 'pending') {
        connBtnText = 'Respond to Agreement';
        connBtnClass = 'pending-btn';
      } else if (connStatus === 'rejected') {
        connBtnText = 'Connection Rejected';
        connBtnClass = 'rejected-btn';
      }

      card.innerHTML = `
        <div class="peer-header">
          <div class="peer-identity">
            <div class="peer-avatar">${initials}</div>
            <div>
              <div class="peer-name">${peer.name}</div>
              <div class="peer-role">${peer.role || 'Skill Share Member'}</div>
            </div>
          </div>
          <div class="match-badge-box">
            <span class="match-score-badge">${item.matchPercentage}% Match</span>
            <span class="match-type-label">${item.matchTypeLabel || (item.isTwoWay ? '2-Way Swap' : '1-Way Match')}</span>
          </div>
        </div>

        <div class="match-reasons-list">
          ${reasonsHTML}
        </div>

        <div class="peer-skills-exchange">
          <div class="peer-skill-box offers">
            <span class="box-label">TEACHES</span>
            <div class="box-tags">
              ${peer.teachSkills.map(s => `<span class="dash-tag teach-tag">${s}</span>`).join('')}
            </div>
          </div>
          <div class="peer-skill-box wants">
            <span class="box-label">WANTS TO LEARN</span>
            <div class="box-tags">
              ${peer.learnSkills.map(s => `<span class="dash-tag learn-tag">${s}</span>`).join('')}
            </div>
          </div>
        </div>

        <div class="peer-footer">
          <div class="avail-pills">
            ${(peer.availability || []).map(a => `<span class="dash-tag avail-tag">${a}</span>`).join('')}
          </div>
          <button type="button" class="btn-primary-sm connect-btn ${connBtnClass}" data-email="${peer.email}">
            ${connBtnText}
          </button>
        </div>
      `;

      card.querySelector('.connect-btn').addEventListener('click', () => {
        if (connStatus === 'none') {
          store.initiateConnection(peer.email);
        }
        openConnectModal(item);
      });

      matchesList.appendChild(card);
    });
  }

  renderMatches();

  // 5. Connection Modal, Restricted Agreement & Rich Chat System
  const connectModal = document.getElementById('connectModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalPeerAvatar = document.getElementById('modalPeerAvatar');
  const modalPeerName = document.getElementById('modalPeerName');
  const modalPeerRole = document.getElementById('modalPeerRole');
  const modalMatchBanner = document.getElementById('modalMatchBanner');

  // Restricted Connection Agreement Elements (Rules 1-4)
  const connectionAgreementCard = document.getElementById('connectionAgreementCard');
  const agreementStatusText = document.getElementById('agreementStatusText');
  const agreeYesBtn = document.getElementById('agreeYesBtn');
  const agreeNoBtn = document.getElementById('agreeNoBtn');

  const connectionRejectedCard = document.getElementById('connectionRejectedCard');
  const reConnectBtn = document.getElementById('reConnectBtn');

  // Unlocked Workspace Elements (Rules 5-10)
  const unlockedWorkspace = document.getElementById('unlockedWorkspace');
  const chatView = document.getElementById('chatView');

  // Session Control Elements
  const sessionHeaderBar = document.getElementById('sessionHeaderBar');
  const sessionTagBadge = document.getElementById('sessionTagBadge');
  const sessionProgressBadge = document.getElementById('sessionProgressBadge');
  const markCompletedBtn = document.getElementById('markCompletedBtn');

  const senderMeetingPrompt = document.getElementById('senderMeetingPrompt');
  const detectedMeetingUrlText = document.getElementById('detectedMeetingUrlText');
  const senderLinkYesBtn = document.getElementById('senderLinkYesBtn');
  const senderLinkNoBtn = document.getElementById('senderLinkNoBtn');

  const pendingSessionBanner = document.getElementById('pendingSessionBanner');
  const pendingSessionText = document.getElementById('pendingSessionText');
  const pendingSessionActions = document.getElementById('pendingSessionActions');
  const acceptSessionBtn = document.getElementById('acceptSessionBtn');
  const declineSessionBtn = document.getElementById('declineSessionBtn');

  const sessionCompletionBanner = document.getElementById('sessionCompletionBanner');

  // Chat Elements
  const chatMessagesContainer = document.getElementById('chatMessagesContainer');
  const chatMessageInput = document.getElementById('chatMessageInput');
  const sendChatBtn = document.getElementById('sendChatBtn');

  const attachLinkBtn = document.getElementById('attachLinkBtn');

  const linkInputRow = document.getElementById('linkInputRow');
  const linkUrlInput = document.getElementById('linkUrlInput');
  const confirmSendLinkBtn = document.getElementById('confirmSendLinkBtn');
  const cancelLinkBtn = document.getElementById('cancelLinkBtn');

  // Lightbox Elements
  const imageLightbox = document.getElementById('imageLightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const closeLightboxBtn = document.getElementById('closeLightboxBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');

  let activeMatchPeer = null;
  let pendingMeetingPayload = null;
  let activeChatUnsubscribe = null;
  let activeConnectionUnsubscribe = null;

  function openConnectModal(matchItem) {
    if (activeChatUnsubscribe) {
      activeChatUnsubscribe();
      activeChatUnsubscribe = null;
    }
    if (activeConnectionUnsubscribe) {
      activeConnectionUnsubscribe();
      activeConnectionUnsubscribe = null;
    }

    activeMatchPeer = matchItem.peer;
    const peer = matchItem.peer;

    const initials = peer.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    modalPeerAvatar.textContent = initials;
    modalPeerName.textContent = `Connect with ${peer.name}`;
    modalPeerRole.textContent = peer.role || 'Skill Share Member';

    // Populate Match Reasons
    modalMatchBanner.innerHTML = (matchItem.matchReasons || []).map(r => `
      <div class="reason-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        ${r}
      </div>
    `).join('');

    updateModalViewState();
    connectModal.classList.add('active');

    // Subscribe to direct subcollection real-time chat with heartbeat backup
    if (store.subscribeToChat) {
      activeChatUnsubscribe = store.subscribeToChat(peer.email, (updatedMsgs) => {
        renderChatMessages(updatedMsgs);
      }, myEmail);
    }

    // Subscribe to real-time connection status
    if (store.subscribeToConnection) {
      activeConnectionUnsubscribe = store.subscribeToConnection(peer.email, () => {
        updateModalViewState();
      }, myEmail);
    }

    renderChatMessages();
  }

  function closeConnectModal() {
    if (activeChatUnsubscribe) {
      activeChatUnsubscribe();
      activeChatUnsubscribe = null;
    }
    if (activeConnectionUnsubscribe) {
      activeConnectionUnsubscribe();
      activeConnectionUnsubscribe = null;
    }
    if (clearChatBtn) clearChatBtn.classList.add('hidden-field');
    connectModal.classList.remove('active');
  }

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeConnectModal);

  function updateModalViewState() {
    if (!activeMatchPeer) return;
    const connStatus = store.getConnectionStatus(activeMatchPeer.email);
    const conn = store.getConnection(activeMatchPeer.email);

    // Hide 2-Way Swap match banner section in chat modal
    if (modalMatchBanner) modalMatchBanner.classList.add('hidden-field');

    if (connStatus === 'connected') {
      connectionAgreementCard.classList.add('hidden-field');
      connectionRejectedCard.classList.add('hidden-field');
      unlockedWorkspace.classList.remove('hidden-field');
      if (clearChatBtn) clearChatBtn.classList.remove('hidden-field');

      if (chatView) chatView.classList.remove('hidden-field');
      store.markPeerNotificationsAsRead(activeMatchPeer.email);
      updateNotificationsUI();
      updateSessionUI();
      renderChatMessages();
    } else if (connStatus === 'rejected') {
      if (clearChatBtn) clearChatBtn.classList.add('hidden-field');
      connectionAgreementCard.classList.add('hidden-field');
      connectionRejectedCard.classList.remove('hidden-field');
      unlockedWorkspace.classList.add('hidden-field');
    } else {
      if (clearChatBtn) clearChatBtn.classList.add('hidden-field');
      connectionAgreementCard.classList.remove('hidden-field');
      connectionRejectedCard.classList.add('hidden-field');
      unlockedWorkspace.classList.add('hidden-field');

      const myEmail = currentUser.email;
      const agreedBy = conn ? (conn.agreedBy || []) : [];
      const iAgreed = agreedBy.includes(myEmail);
      const peerAgreed = agreedBy.includes(activeMatchPeer.email);

      if (iAgreed && !peerAgreed) {
        agreementStatusText.innerHTML = `You selected <strong>YES</strong>. Waiting for ${activeMatchPeer.name} to select YES.`;
        agreeYesBtn.disabled = true;
        agreeYesBtn.innerHTML = `<span>You Selected YES</span>`;
      } else if (!iAgreed && peerAgreed) {
        agreementStatusText.innerHTML = `<strong>${activeMatchPeer.name}</strong> agreed YES! Click YES to unlock chat and start exchanging skills.`;
        agreeYesBtn.disabled = false;
        agreeYesBtn.innerHTML = `<span>YES, I Agree</span>`;
      } else {
        agreementStatusText.innerHTML = `Both peers must agree YES to unlock chat.`;
        agreeYesBtn.disabled = false;
        agreeYesBtn.innerHTML = `<span>YES, I Agree</span>`;
      }
    }
  }

  if (agreeYesBtn) {
    agreeYesBtn.addEventListener('click', () => {
      if (!activeMatchPeer) return;
      const res = store.respondToConnection(activeMatchPeer.email, 'YES');
      if (res.isConnected) {
        showToast(`Connection Confirmed with ${activeMatchPeer.name}! Chat unlocked.`);
      } else {
        showToast('You selected YES! Waiting for peer confirmation.');
      }
      updateModalViewState();
      renderMatches();
    });
  }

  if (agreeNoBtn) {
    agreeNoBtn.addEventListener('click', () => {
      if (!activeMatchPeer) return;
      store.respondToConnection(activeMatchPeer.email, 'NO');
      showToast('Connection request declined.');
      updateModalViewState();
      renderMatches();
    });
  }

  if (reConnectBtn) {
    reConnectBtn.addEventListener('click', () => {
      if (!activeMatchPeer) return;
      store.initiateConnection(activeMatchPeer.email);
      showToast('Re-sent connection request.');
      updateModalViewState();
      renderMatches();
    });
  }

  function updateSessionUI() {
    if (!activeMatchPeer) return;

    const activeSess = store.getActiveSession(activeMatchPeer.email);
    const pendingReq = store.getPendingSessionRequest(activeMatchPeer.email);

    // Keep Session Header Bar ALWAYS visible for connected peers in chat
    if (sessionHeaderBar) sessionHeaderBar.classList.remove('hidden-field');

    if (activeSess) {
      if (pendingSessionBanner) pendingSessionBanner.classList.add('hidden-field');
      if (senderMeetingPrompt) senderMeetingPrompt.classList.add('hidden-field');
      if (sessionCompletionBanner) sessionCompletionBanner.classList.add('hidden-field');

      if (sessionTagBadge) {
        const sessNum = store.getPeerSessionNumber(activeSess.id, activeMatchPeer.email);
        sessionTagBadge.textContent = `Active SkillSwap Session #${sessNum}`;
        sessionTagBadge.className = 'session-tag active-session-tag';
      }

      const completedBy = (activeSess.completedBy || []).map(e => (e || '').toLowerCase());
      const myEmail = (currentProfile.email || '').toLowerCase();
      const mineClicked = completedBy.includes(myEmail) ||
                          (myEmail === (activeSess.user1 || '').toLowerCase() && activeSess.user1Completed) ||
                          (myEmail === (activeSess.user2 || '').toLowerCase() && activeSess.user2Completed);

      if (markCompletedBtn) {
        markCompletedBtn.classList.remove('hidden-field');
        if (mineClicked) {
          markCompletedBtn.textContent = 'Completed by You (Waiting for Peer)';
          markCompletedBtn.disabled = true;
          markCompletedBtn.classList.add('waiting');
        } else {
          markCompletedBtn.textContent = 'Complete';
          markCompletedBtn.disabled = false;
          markCompletedBtn.classList.remove('waiting');
        }
      }

      if (sessionProgressBadge) {
        sessionProgressBadge.textContent = `(${completedBy.length}/2 Complete)`;
      }

    } else if (pendingReq) {
      if (sessionTagBadge) {
        const sessNum = store.getPeerSessionNumber(null, activeMatchPeer.email);
        sessionTagBadge.textContent = `Pending Session Invite #${sessNum}`;
        sessionTagBadge.className = 'session-tag pending-session-tag';
      }

      if (markCompletedBtn) {
        markCompletedBtn.classList.add('hidden-field');
      }

      if (sessionProgressBadge) {
        sessionProgressBadge.textContent = `(Awaiting Link Acceptance)`;
      }

      if (pendingSessionBanner) pendingSessionBanner.classList.remove('hidden-field');

      if (pendingReq.from === currentProfile.email) {
        if (pendingSessionText) {
          pendingSessionText.innerHTML = `Waiting for <strong>${activeMatchPeer.name}</strong> to accept SkillSwap session through link: <span class="pending-link-url">${pendingReq.meetingUrl}</span>`;
        }
        if (pendingSessionActions) pendingSessionActions.classList.add('hidden-field');
      } else {
        if (pendingSessionText) {
          pendingSessionText.innerHTML = `<strong>${activeMatchPeer.name}</strong> started a SkillSwap session through this link. Do you want to accept this session?`;
        }
        if (pendingSessionActions) pendingSessionActions.classList.remove('hidden-field');
      }

    } else {
      // Connected mode (No active or pending session)
      const nextSessNum = store.getPeerSessionNumber(null, activeMatchPeer.email);

      if (sessionTagBadge) {
        sessionTagBadge.textContent = `Connected — Ready for Session #${nextSessNum}`;
        sessionTagBadge.className = 'session-tag idle-session-tag';
      }

      if (pendingSessionBanner) pendingSessionBanner.classList.add('hidden-field');

      if (markCompletedBtn) {
        markCompletedBtn.classList.add('hidden-field');
      }

      if (sessionProgressBadge) {
        sessionProgressBadge.textContent = `(Paste meeting link to start)`;
      }
    }
  }

  // Sender Meeting Prompt Handlers (YES / NO)
  if (senderLinkYesBtn) {
    senderLinkYesBtn.addEventListener('click', () => {
      if (!activeMatchPeer || !pendingMeetingPayload) return;
      const { peerEmail, meetingUrl, fullText } = pendingMeetingPayload;

      const res = store.proposeMeetingSession(peerEmail, meetingUrl, fullText);
      if (res.success) {
        showToast('SkillSwap session invite sent to peer!');
      } else {
        showToast(res.message || 'Could not send session request');
      }

      pendingMeetingPayload = null;
      if (senderMeetingPrompt) senderMeetingPrompt.classList.add('hidden-field');
      updateSessionUI();
      renderChatMessages();
    });
  }

  if (senderLinkNoBtn) {
    senderLinkNoBtn.addEventListener('click', () => {
      if (!activeMatchPeer || !pendingMeetingPayload) return;
      const { peerEmail, fullText } = pendingMeetingPayload;

      store.sendChatMessage(peerEmail, fullText);
      showToast('Link sent as normal chat message.');

      pendingMeetingPayload = null;
      if (senderMeetingPrompt) senderMeetingPrompt.classList.add('hidden-field');
      renderChatMessages();
    });
  }

  if (acceptSessionBtn) {
    acceptSessionBtn.addEventListener('click', () => {
      if (!activeMatchPeer) return;
      const pendingReq = store.getPendingSessionRequest(activeMatchPeer.email);
      if (!pendingReq) return;

      const res = store.respondToSessionRequest(pendingReq.id, 'ACCEPT');
      if (res.success) {
        showToast('SkillSwap Session Accepted!');
        updateSessionUI();
        renderChatMessages();
      }
    });
  }

  if (declineSessionBtn) {
    declineSessionBtn.addEventListener('click', () => {
      if (!activeMatchPeer) return;
      const pendingReq = store.getPendingSessionRequest(activeMatchPeer.email);
      if (!pendingReq) return;

      const res = store.respondToSessionRequest(pendingReq.id, 'REJECT');
      if (res.success) {
        showToast('Session invite declined. Link saved as normal chat message.');
        updateSessionUI();
        renderChatMessages();
      }
    });
  }

  if (markCompletedBtn) {
    markCompletedBtn.addEventListener('click', async () => {
      if (!activeMatchPeer) return;
      markCompletedBtn.disabled = true;
      try {
        const res = await store.markSessionCompleted(activeMatchPeer.email);
        if (res.success) {
          if (res.isFullyCompleted) {
            showToast('SkillSwap Session Completed! Both users marked exchange as complete.');
          } else {
            showToast('Marked completed by you! Waiting for peer confirmation.');
          }
          updateSessionUI();
          renderChatMessages();
          updateTotalSessionsUI();
        } else {
          showToast(res.message || 'Could not complete session.');
          markCompletedBtn.disabled = false;
        }
      } catch (err) {
        showToast('Error completing session.');
        markCompletedBtn.disabled = false;
      }
    });
  }

  // 6. Rich Chat Rendering with Session Dividers & Status Cards
  function renderChatMessages(explicitMsgs) {
    if (!activeMatchPeer || !chatMessagesContainer) return;
    const msgs = Array.isArray(explicitMsgs) ? explicitMsgs : store.getChatMessages(activeMatchPeer.email, myEmail);

    chatMessagesContainer.innerHTML = '';

    const completedSessions = store.getCompletedSessionsForPair(activeMatchPeer.email, myEmail);
    const activeSess = store.getActiveSession(activeMatchPeer.email, myEmail);

    if (msgs.length === 0 && completedSessions.length === 0 && !activeSess) {
      chatMessagesContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.85rem;">No chat messages yet. Send a message or paste a meeting link to start exchanging!</div>`;
      return;
    }

    const renderedStartDividers = new Set();
    const renderedCompletionDividers = new Set();
    let currentSessionId = null;

    function renderCompletedDividerFor(sessId) {
      if (renderedCompletionDividers.has(sessId)) return;
      const compIdx = completedSessions.findIndex(s => s.id === sessId);
      if (compIdx !== -1) {
        renderedCompletionDividers.add(sessId);
        const sessNum = compIdx + 1;
        const compDivider = document.createElement('div');
        compDivider.className = 'session-chat-divider completed-divider';
        compDivider.innerHTML = `<span>SkillSwap Session #${sessNum} Completed ✓</span>`;
        chatMessagesContainer.appendChild(compDivider);
      }
    }

    msgs.forEach(m => {
      // Ignore legacy chat message wrappers for session completion
      if (m.type === 'session_completion') return;

      if (m.sessionId && m.sessionId !== currentSessionId) {
        if (currentSessionId) {
          renderCompletedDividerFor(currentSessionId);
        }
        currentSessionId = m.sessionId;

        if (!renderedStartDividers.has(m.sessionId)) {
          renderedStartDividers.add(m.sessionId);
          const sessNum = store.getPeerSessionNumber(m.sessionId, activeMatchPeer.email, myEmail);
          const divider = document.createElement('div');
          divider.className = 'session-chat-divider';
          divider.innerHTML = `<span>SkillSwap Session #${sessNum}</span>`;
          chatMessagesContainer.appendChild(divider);
        }
      }

      const bubble = document.createElement('div');
      const sender = (m.sender || '').toLowerCase();
      const isMine = sender === myEmail;
      bubble.className = `chat-bubble ${isMine ? 'mine' : 'theirs'}`;

      if (m.type === 'image' && m.fileData) {
        const img = document.createElement('img');
        img.src = m.fileData;
        img.className = 'chat-img-attachment';
        img.alt = m.fileName || 'Shared image';
        img.addEventListener('click', () => openLightbox(m.fileData));

        bubble.appendChild(img);
        if (m.text) {
          const txt = document.createElement('div');
          txt.className = 'chat-caption';
          txt.textContent = m.text;
          bubble.appendChild(txt);
        }
      } else if (m.type === 'file' && m.fileData) {
        const card = document.createElement('div');
        card.className = 'chat-file-card';
        card.innerHTML = `
          <div class="file-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
          <div class="file-details">
            <div class="file-name">${m.fileName || 'Attachment.pdf'}</div>
            <div class="file-size">${m.fileSize || 'Document'}</div>
          </div>
          <a href="${m.fileData}" download="${m.fileName || 'Attachment'}" class="file-download-btn" title="Download file">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
        `;
        bubble.appendChild(card);
        if (m.text) {
          const txt = document.createElement('div');
          txt.className = 'chat-caption';
          txt.textContent = m.text;
          bubble.appendChild(txt);
        }
      } else {
        bubble.innerHTML = renderTextWithClickableLinks(m.text, m.linkUrl);
      }

      const timeSpan = document.createElement('span');
      timeSpan.className = 'chat-timestamp';
      timeSpan.textContent = formatTimeAgo(m.timestamp);
      bubble.appendChild(timeSpan);

      chatMessagesContainer.appendChild(bubble);
    });

    if (currentSessionId) {
      renderCompletedDividerFor(currentSessionId);
    }

    // Render completion dividers for any completed sessions not yet rendered
    completedSessions.forEach((s, index) => {
      if (!renderedCompletionDividers.has(s.id)) {
        renderedCompletionDividers.add(s.id);
        const sessNum = index + 1;
        const compDivider = document.createElement('div');
        compDivider.className = 'session-chat-divider completed-divider';
        compDivider.innerHTML = `<span>SkillSwap Session #${sessNum} Completed ✓</span>`;
        chatMessagesContainer.appendChild(compDivider);
      }
    });

    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  function renderTextWithClickableLinks(text, linkUrl) {
    let fullText = text || '';
    if (linkUrl && !fullText.includes(linkUrl)) {
      fullText = fullText ? `${fullText}\n${linkUrl}` : linkUrl;
    }

    if (!fullText) return '';

    const escaped = fullText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    // Comprehensive URL Regex capturing subdomains, domain, TLD, ports, paths, and queries as ONE contiguous element
    const urlRegex = /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s<]*)?/gi;

    const formattedHtml = escaped.replace(urlRegex, (match, offset, fullString) => {
      // Exclude email addresses (matches preceded by @)
      if (offset > 0 && fullString[offset - 1] === '@') {
        return match;
      }

      let cleanUrl = match;
      let trailingPunct = '';

      // Strip trailing punctuation like . , ! ? : ; ) ] so sentence punctuation stays plain text outside <a>
      const matchPunct = cleanUrl.match(/[.,!?:;)]+$/);
      if (matchPunct) {
        trailingPunct = matchPunct[0];
        cleanUrl = cleanUrl.slice(0, -trailingPunct.length);
      }

      if (!cleanUrl) return match;

      // Prepend https:// if no protocol is present
      let href = cleanUrl;
      if (!/^https?:\/\//i.test(href)) {
        href = `https://${href}`;
      }

      const linkIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:3px; flex-shrink:0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-inline-url" onclick="event.stopPropagation();">${linkIcon}${cleanUrl}</a>${trailingPunct}`;
    });

    return `<div class="chat-text-wrapper">${formattedHtml.replace(/\n/g, '<br>')}</div>`;
  }

  function openLightbox(src) {
    if (!lightboxImg || !imageLightbox) return;
    lightboxImg.src = src;
    imageLightbox.classList.add('active');
  }

  if (closeLightboxBtn) {
    closeLightboxBtn.addEventListener('click', () => {
      imageLightbox.classList.remove('active');
    });
  }

  // Attachment Popover Toggle
  const attachmentBtn = document.getElementById('attachmentBtn');
  const attachmentMenu = document.getElementById('attachmentMenu');

  if (attachmentBtn && attachmentMenu) {
    attachmentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      attachmentMenu.classList.toggle('hidden-field');
    });

    document.addEventListener('click', (e) => {
      if (!attachmentMenu.contains(e.target) && !attachmentBtn.contains(e.target)) {
        attachmentMenu.classList.add('hidden-field');
      }
    });
  }



  if (attachLinkBtn && linkInputRow) {
    attachLinkBtn.addEventListener('click', () => {
      if (attachmentMenu) attachmentMenu.classList.add('hidden-field');
      linkInputRow.classList.toggle('hidden-field');
      if (linkUrlInput) linkUrlInput.focus();
    });

    if (cancelLinkBtn) cancelLinkBtn.addEventListener('click', () => linkInputRow.classList.add('hidden-field'));

    if (confirmSendLinkBtn && linkUrlInput) {
      confirmSendLinkBtn.addEventListener('click', async () => {
        const url = linkUrlInput.value.trim();
        if (!url || !activeMatchPeer) return;

        const combinedText = (chatMessageInput ? chatMessageInput.value.trim() : '') || url;

        if (store.isMeetingLink(url) || store.isMeetingLink(combinedText)) {
          const meetingUrl = store.extractMeetingLink(url) || url;
          pendingMeetingPayload = {
            peerEmail: activeMatchPeer.email,
            meetingUrl: meetingUrl,
            fullText: combinedText
          };
          linkUrlInput.value = '';
          if (chatMessageInput) resetChatInput();
          linkInputRow.classList.add('hidden-field');
          if (detectedMeetingUrlText) detectedMeetingUrlText.textContent = meetingUrl;
          if (senderMeetingPrompt) senderMeetingPrompt.classList.remove('hidden-field');
          return;
        }

        const res = await store.sendChatMessage(activeMatchPeer.email, {
          type: 'link',
          linkUrl: url,
          text: combinedText
        }, myEmail);
        if (res && res.success === false && res.message) {
          showToast(res.message);
        }

        linkUrlInput.value = '';
        if (chatMessageInput) resetChatInput();
        linkInputRow.classList.add('hidden-field');
        renderChatMessages();
      });
    }
  }

  function autoResizeChatInput() {
    if (!chatMessageInput) return;
    chatMessageInput.style.height = 'auto';
    const newHeight = Math.min(Math.max(chatMessageInput.scrollHeight, 72), 200);
    chatMessageInput.style.height = newHeight + 'px';
  }

  function resetChatInput() {
    if (!chatMessageInput) return;
    chatMessageInput.value = '';
    chatMessageInput.style.height = '';
  }

  if (chatMessageInput) {
    chatMessageInput.addEventListener('input', autoResizeChatInput);
    chatMessageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendChat();
      }
    });
  }

  async function handleSendChat() {
    if (!activeMatchPeer || !chatMessageInput) return;
    const text = chatMessageInput.value.trim();
    if (!text) return;

    if (store.isMeetingLink(text)) {
      const meetingUrl = store.extractMeetingLink(text);
      pendingMeetingPayload = {
        peerEmail: activeMatchPeer.email,
        meetingUrl: meetingUrl,
        fullText: text
      };
      resetChatInput();
      if (detectedMeetingUrlText) detectedMeetingUrlText.textContent = meetingUrl;
      if (senderMeetingPrompt) senderMeetingPrompt.classList.remove('hidden-field');
      return;
    }

    const res = await store.sendChatMessage(activeMatchPeer.email, text, myEmail);
    if (res && res.success === false && res.message) {
      showToast(res.message);
      return;
    }
    resetChatInput();
    renderChatMessages();
  }

  if (sendChatBtn) sendChatBtn.addEventListener('click', handleSendChat);

  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', async () => {
      if (!activeMatchPeer) return;
      const peerName = activeMatchPeer.name || 'this member';
      const confirmed = window.confirm(`Are you sure you want to clear all chat messages with ${peerName}? This will permanently remove all chat history, documents, and meeting links from both users' screens.`);
      if (!confirmed) return;

      clearChatBtn.disabled = true;
      try {
        const res = await store.clearChat(activeMatchPeer.email, myEmail);
        if (res && res.success) {
          showToast(`Chat history with ${peerName} cleared.`);
          renderChatMessages([]);
        } else {
          showToast((res && res.message) || 'Failed to clear chat.');
        }
      } catch (err) {
        console.error('Clear chat error:', err);
        showToast('Error clearing chat history.');
      } finally {
        clearChatBtn.disabled = false;
      }
    });
  }

  window.addEventListener('skillshare_new_msg', (e) => {
    if (connectModal.classList.contains('active') && activeMatchPeer) {
      renderChatMessages();
      if (e.detail && e.detail.peerEmail === activeMatchPeer.email) {
        store.markPeerNotificationsAsRead(activeMatchPeer.email);
        updateNotificationsUI();
      }
    }
  });

  window.addEventListener('skillshare_session_updated', (e) => {
    updateTotalSessionsUI();
    if (connectModal.classList.contains('active') && activeMatchPeer) {
      if (e.detail && e.detail.peerEmail === activeMatchPeer.email) {
        updateSessionUI();
        renderChatMessages();
      }
    }
  });

  window.addEventListener('storage', () => {
    updateTotalSessionsUI();
  });

  window.addEventListener('skillshare_user_status_changed', () => {
    store.requireAuth();
    updateProfileUI();
    renderMatches();
    updateTotalSessionsUI();
  });

  window.addEventListener('skillshare_connection_updated', () => {
    renderMatches();
    updateTotalSessionsUI();
    if (connectModal.classList.contains('active') && activeMatchPeer) {
      updateModalViewState();
    }
  });

  window.addEventListener('skillshare_session_updated', () => {
    if (connectModal.classList.contains('active') && activeMatchPeer) {
      updateSessionUI();
      renderChatMessages();
    }
    updateTotalSessionsUI();
  });
});


