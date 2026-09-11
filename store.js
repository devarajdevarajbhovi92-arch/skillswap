function trackEvent(eventName, parameters = {}) {
  if (typeof gtag === "function") {
    gtag("event", eventName, {
      ...parameters,
      debug_mode: true
    });
  }
}
/**
 * SkillSwap Data Store & Realtime Cloud Engine (Firebase + Local Cache)
 * Connects directly to Cloud Firestore, Firebase Authentication, and Firebase Storage
 * with optimistic real-time caching, peer matching, mutual connection handshake,
 * meeting link detection, and mutual session completion.
 */

(function() {
  const USERS_KEY = 'skillswap_users';
  const PROFILES_KEY = 'skillswap_profiles';
  const SESSION_KEY = 'skillswap_session';
  const REQUESTS_KEY = 'skillswap_requests';
  const MESSAGES_KEY = 'skillswap_messages';
  const NOTIFICATIONS_KEY = 'skillswap_notifications';
  const SESSIONS_KEY = 'skillswap_sessions';
  const CONNECTIONS_KEY = 'skillswap_connections';
  const SESSION_REQUESTS_KEY = 'skillswap_session_requests';
  const DELETED_USERS_KEY = 'skillswap_deleted_users';

  const ADMINS_KEY = 'skillswap_admins';
  const ADMIN_SESSION_KEY = 'skillswap_admin_session';

  // Master Admin definition
  const DEFAULT_ADMINS = {
    'master.admin@skillswap.io': {
      name: 'System Administrator',
      email: 'master.admin@skillswap.io',
      password: 'SkillSwapMaster#2026',
      role: 'Master Admin',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  };

  // Helper getters/setters for fast synchronous local cache
  function getCachedUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCachedUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getCachedDeletedUsers() {
    try {
      return JSON.parse(localStorage.getItem(DELETED_USERS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCachedDeletedUsers(deletedMap) {
    try {
      localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(deletedMap));
    } catch (e) {}
  }

  function isUserDeleted(email) {
    if (!email) return false;
    const cleanEmail = email.trim().toLowerCase();
    const deletedMap = getCachedDeletedUsers();
    return !!deletedMap[cleanEmail];
  }

  function getCachedProfiles() {
    try {
      return JSON.parse(localStorage.getItem(PROFILES_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCachedProfiles(profiles) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }

  function getCachedAdmins() {
    return DEFAULT_ADMINS;
  }

  function getCachedRequests() {
    try {
      return JSON.parse(localStorage.getItem(REQUESTS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCachedRequests(reqs) {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(reqs));
  }

  function getCachedMessages() {
    try {
      return JSON.parse(localStorage.getItem(MESSAGES_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCachedMessages(msgs) {
    try {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs));
    } catch (e) {
      console.warn('localStorage messages cache quota notice:', e);
      try {
        const trimmed = {};
        Object.keys(msgs).forEach(k => {
          trimmed[k] = (msgs[k] || []).slice(-25).map(m => {
            if (m.fileData && m.fileData.length > 5000 && m.fileData.startsWith('data:')) {
              return { ...m, fileData: '' };
            }
            return m;
          });
        });
        localStorage.setItem(MESSAGES_KEY, JSON.stringify(trimmed));
      } catch (err) {}
    }
  }

  function getCachedNotifications() {
    try {
      return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCachedNotifications(notifs) {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifs));
  }

  function getCachedSessions() {
    try {
      return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCachedSessions(sessions) {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }

  function getCachedConnections() {
    try {
      return JSON.parse(localStorage.getItem(CONNECTIONS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCachedConnections(conns) {
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(conns));
  }

  function getCachedSessionRequests() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_REQUESTS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCachedSessionRequests(reqs) {
    localStorage.setItem(SESSION_REQUESTS_KEY, JSON.stringify(reqs));
  }

  function getPairKey(email1, email2) {
    return [email1.trim().toLowerCase(), email2.trim().toLowerCase()].sort().join('__');
  }

  // Firebase references
  function getDb() {
    return (typeof window !== 'undefined' && window.firebaseDb) ? window.firebaseDb : null;
  }

  function getAuth() {
    return (typeof window !== 'undefined' && window.firebaseAuth) ? window.firebaseAuth : null;
  }

  function getStorage() {
    return (typeof window !== 'undefined' && window.firebaseStorage) ? window.firebaseStorage : null;
  }

  // Realtime Firestore Subscriptions
  let firestoreListenersAttached = false;
  function attachFirestoreListeners() {
    const db = getDb();
    if (!db || firestoreListenersAttached) return;
    firestoreListenersAttached = true;

    // 0. Listen to Deleted Users Collection
    db.collection('deleted_users').onSnapshot((snapshot) => {
      const deletedMap = getCachedDeletedUsers();
      snapshot.forEach(doc => {
        const email = doc.id.toLowerCase();
        deletedMap[email] = true;
      });
      saveCachedDeletedUsers(deletedMap);

      const users = getCachedUsers();
      const profiles = getCachedProfiles();
      let changed = false;
      Object.keys(deletedMap).forEach(email => {
        if (users[email]) { delete users[email]; changed = true; }
        if (profiles[email]) { delete profiles[email]; changed = true; }
      });
      if (changed) {
        saveCachedUsers(users);
        saveCachedProfiles(profiles);
      }

      const currentSess = SkillSwapStore.getCurrentSession();
      if (currentSess && (deletedMap[currentSess] || isUserDeleted(currentSess))) {
        const auth = getAuth();
        if (auth && auth.currentUser) auth.signOut().catch(() => {});
        alert('Your account has been permanently deleted by an administrator.');
        SkillSwapStore.logout();
      }

      window.dispatchEvent(new CustomEvent('skillshare_user_deleted', { detail: {} }));
      window.dispatchEvent(new CustomEvent('skillshare_user_status_changed', { detail: {} }));
    }, err => {
      console.warn('Deleted users listener notice:', err.message);
    });

    // 1. Listen to Users Collection (Reconciles Local Cache from Live Firestore State)
    db.collection('users').onSnapshot((snapshot) => {
      const activeUsersInFirestore = new Set();
      const users = getCachedUsers();
      const profiles = getCachedProfiles();

      snapshot.forEach(doc => {
        const data = doc.data();
        const email = (data.email || (doc.id.includes('@') ? doc.id : '')).toLowerCase();
        const uid = data.uid || doc.id;
        if (!email || data.accountStatus === 'deleted' || isUserDeleted(email)) return;

        activeUsersInFirestore.add(email);

        const existingProf = profiles[email] || {};
        const hasDataSkills = (data.teachSkills && data.teachSkills.length > 0) || (data.learnSkills && data.learnSkills.length > 0) || (data.availability && data.availability.length > 0);
        const hasExistingSkills = (existingProf.teachSkills && existingProf.teachSkills.length > 0) || (existingProf.learnSkills && existingProf.learnSkills.length > 0) || (existingProf.availability && existingProf.availability.length > 0);

        users[email] = {
          uid: uid || existingProf.uid || email,
          userId: uid || existingProf.uid || email,
          name: data.name || (users[email] && users[email].name) || email.split('@')[0],
          email: email,
          password: data.password || (users[email] && users[email].password) || '',
          isVerified: data.isVerified !== false,
          accountStatus: data.accountStatus || (users[email] && users[email].accountStatus) || 'approved',
          createdAt: data.createdAt || (users[email] && users[email].createdAt) || new Date().toISOString()
        };

        const teachSkills = hasDataSkills ? (data.teachSkills || []) : (hasExistingSkills ? existingProf.teachSkills : (data.teachSkills || []));
        const learnSkills = hasDataSkills ? (data.learnSkills || []) : (hasExistingSkills ? existingProf.learnSkills : (data.learnSkills || []));
        const availability = hasDataSkills ? (data.availability || []) : (hasExistingSkills ? existingProf.availability : (data.availability || []));

        profiles[email] = {
          uid: uid || existingProf.uid || email,
          email: email,
          name: data.name || existingProf.name || email.split('@')[0],
          role: data.role || existingProf.role || 'Skill Explorer',
          bio: (data.bio !== undefined && data.bio !== '') ? data.bio : (existingProf.bio || ''),
          teachSkills: teachSkills,
          learnSkills: learnSkills,
          availability: availability,
          updatedAt: data.updatedAt || existingProf.updatedAt || new Date().toISOString()
        };
      });

      // Purge any cached user no longer present in Firestore snapshot
      Object.keys(users).forEach(email => {
        if (!activeUsersInFirestore.has(email)) {
          delete users[email];
          delete profiles[email];
        }
      });

      // Reconcile local cache from live Firestore state
      saveCachedUsers(users);
      saveCachedProfiles(profiles);

      const currentSess = SkillSwapStore.getCurrentSession();
      if (currentSess) {
        const currentUserObj = users[currentSess];
        if (!currentUserObj || isUserDeleted(currentSess)) {
          const auth = getAuth();
          if (auth && auth.currentUser) auth.signOut().catch(() => {});
          alert('Your account has been permanently deleted by an administrator.');
          SkillSwapStore.logout();
        } else if (currentUserObj.accountStatus === 'blocked') {
          const auth = getAuth();
          if (auth && auth.currentUser) auth.signOut().catch(() => {});
          alert('Your account is currently blocked by an administrator.');
          SkillSwapStore.logout();
        }
      }

      window.dispatchEvent(new CustomEvent('skillshare_user_status_changed', { detail: {} }));
    }, err => {
      console.warn('Users listener notice:', err.message);
    });

    // 2. Listen to Connections Collection
    db.collection('connections').onSnapshot((snapshot) => {
      const conns = getCachedConnections();
      snapshot.forEach(doc => {
        conns[doc.id] = doc.data();
      });
      saveCachedConnections(conns);
      window.dispatchEvent(new CustomEvent('skillshare_connection_updated', { detail: {} }));
    }, err => {
      console.warn('Connections listener notice:', err.message);
    });

    // 3. Listen to Sessions Collection
    db.collection('sessions').onSnapshot((snapshot) => {
      const currentSessions = [];
      const currentRequests = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.status === 'pending') {
          currentRequests.push(data);
        } else {
          currentSessions.push(data);
        }
      });

      saveCachedSessions(currentSessions);
      saveCachedSessionRequests(currentRequests);
      window.dispatchEvent(new CustomEvent('skillshare_session_updated', { detail: {} }));
    }, err => {
      console.warn('Sessions listener notice:', err.message);
    });

    // 4. Listen to Notifications Collection
    db.collection('notifications').onSnapshot((snapshot) => {
      const notifsStore = getCachedNotifications();
      snapshot.forEach(doc => {
        const data = doc.data();
        const toEmail = (data.toEmail || '').toLowerCase();
        if (!toEmail) return;
        if (!notifsStore[toEmail]) notifsStore[toEmail] = [];

        const existingIdx = notifsStore[toEmail].findIndex(n => n.id === data.id);
        if (existingIdx !== -1) {
          notifsStore[toEmail][existingIdx] = data;
        } else {
          notifsStore[toEmail].unshift(data);
        }
      });
      saveCachedNotifications(notifsStore);
      window.dispatchEvent(new CustomEvent('skillshare_notifications_read', { detail: {} }));
    }, err => {
      console.warn('Notifications listener notice:', err.message);
    });

    // 5. Listen to Chat Messages (Active Pair)
    const currentSession = SkillSwapStore.getCurrentSession();
    if (currentSession) {
      db.collectionGroup('messages').orderBy('timestamp', 'asc').onSnapshot((snapshot) => {
        const msgs = getCachedMessages();
        snapshot.forEach(doc => {
          const data = doc.data();
          const pairKey = data.pairKey;
          if (!pairKey) return;
          if (!msgs[pairKey]) msgs[pairKey] = [];

          if (!msgs[pairKey].some(m => m.id === data.id)) {
            msgs[pairKey].push(data);
          }
        });
        saveCachedMessages(msgs);
        window.dispatchEvent(new CustomEvent('skillshare_new_msg', { detail: {} }));
      }, err => {
        // Group query fallback or collection fallback
        console.warn('Messages listener notice:', err.message);
      });
    }
  }

  // Attempt to attach listeners once DOM is ready
  function initListeners() {
    setTimeout(attachFirestoreListeners, 50);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initListeners);
    } else {
      initListeners();
    }
  }

  // Public Store API
  const SkillSwapStore = {
    // Current Active User Session
    getCurrentSession: function() {
      try {
        const sess = sessionStorage.getItem(SESSION_KEY);
        if (sess) {
          const clean = sess.trim().toLowerCase();
          if (isUserDeleted(clean)) return null;
          return clean;
        }
      } catch (e) {}

      const auth = getAuth();
      if (auth && auth.currentUser && auth.currentUser.email) {
        const authEmail = auth.currentUser.email.toLowerCase();
        if (isUserDeleted(authEmail)) return null;
        return authEmail;
      }

      try {
        const local = localStorage.getItem(SESSION_KEY);
        if (local) {
          const cleanLocal = local.trim().toLowerCase();
          if (isUserDeleted(cleanLocal)) return null;
          return cleanLocal;
        }
      } catch (e) {}

      return null;
    },

    getCurrentUser: function(callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || isUserDeleted(email)) return null;
      const users = getCachedUsers();
      if (users[email]) {
        if (users[email].accountStatus === 'deleted') return null;
        return users[email];
      }

      // Fallback if Firebase Auth user is signed in but user doc wasn't loaded in cache yet
      const auth = getAuth();
      if (auth && auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === email) {
        const fallbackUser = {
          name: auth.currentUser.displayName || email.split('@')[0],
          email: email,
          password: '',
          isVerified: true,
          accountStatus: 'approved',
          createdAt: new Date().toISOString()
        };
        users[email] = fallbackUser;
        saveCachedUsers(users);
        return fallbackUser;
      }

      return null;
    },

    getCurrentProfile: function(callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || isUserDeleted(email)) return null;
      const user = this.getCurrentUser(email);
      if (!user) return null;

      const profiles = getCachedProfiles();
      if (profiles[email]) return profiles[email];

      const fallbackProfile = {
        email: email,
        name: user.name || email.split('@')[0],
        role: 'Skill Explorer',
        bio: '',
        teachSkills: [],
        learnSkills: [],
        availability: []
      };
      profiles[email] = fallbackProfile;
      saveCachedProfiles(profiles);
      return fallbackProfile;
    },

    // Current Active Admin Session
    getCurrentAdminSession: function() {
      return localStorage.getItem(ADMIN_SESSION_KEY) || null;
    },

    getCurrentAdmin: function() {
      const email = this.getCurrentAdminSession();
      if (!email) return null;
      const admins = getCachedAdmins();
      return admins[email] || null;
    },

    authenticateAdmin: function(email, password) {
      const cleanEmail = email.trim().toLowerCase();
      const admins = getCachedAdmins();

      if (!admins[cleanEmail]) {
        return { success: false, message: 'Admin account not found.' };
      }

      if (admins[cleanEmail].password !== password) {
        return { success: false, message: 'Invalid admin credentials.' };
      }

      localStorage.setItem(ADMIN_SESSION_KEY, cleanEmail);

      // Also authenticate to Firebase if possible
      const auth = getAuth();
      if (auth) {
        auth.signInWithEmailAndPassword(cleanEmail, password).catch(() => {
          auth.createUserWithEmailAndPassword(cleanEmail, password).catch(() => {});
        });
      }

      return { success: true, admin: admins[cleanEmail] };
    },

    registerAdmin: function() {
      return { success: false, message: 'New admin creation is disabled. Only one fixed admin account is allowed.' };
    },

    logoutAdmin: function() {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      const auth = getAuth();
      if (auth) auth.signOut().catch(() => {});
      window.location.href = 'admin-auth.html';
    },

    requireAdminAuth: function() {
      const admin = this.getCurrentAdmin();
      if (!admin) {
        window.location.href = 'admin-auth.html';
        return null;
      }
      return admin;
    },

    // User Authentication
    registerAccount: async function(name, email, password) {
      const cleanEmail = email.trim().toLowerCase();
      const db = getDb();
      const auth = getAuth();

      // Single Source of Truth: Check Cloud Firestore for existing active user with this email
      if (db) {
        try {
          const snap = await db.collection('users').where('email', '==', cleanEmail).get();
          let activeFound = false;
          snap.forEach(doc => {
            if (doc.data().accountStatus !== 'deleted') activeFound = true;
          });
          if (activeFound) {
            return { success: false, message: 'An account with this email already exists. Please Log In.' };
          }
        } catch (e) {}
      }

      // Create new user in Firebase Auth
      let authUser = null;
      if (auth) {
        try {
          const cred = await auth.createUserWithEmailAndPassword(cleanEmail, password);
          authUser = cred ? cred.user : null;
          if (authUser) {
            await authUser.updateProfile({ displayName: name.trim() }).catch(() => {});
            trackEvent("account_created");
          }
        } catch (err) {
          if (err.code === 'auth/email-already-in-use') {
            let reclaimedUser = null;
            try {
              const loginCred = await auth.signInWithEmailAndPassword(cleanEmail, password);
              reclaimedUser = loginCred ? loginCred.user : auth.currentUser;
            } catch (e) {
              const users = getCachedUsers();
              const cachedPass = (users[cleanEmail] && users[cleanEmail].password) || '';
              if (cachedPass) {
                try {
                  const loginCred = await auth.signInWithEmailAndPassword(cleanEmail, cachedPass);
                  reclaimedUser = loginCred ? loginCred.user : auth.currentUser;
                } catch (err2) {}
              }
            }

            if (reclaimedUser) {
              try {
                // Delete old orphaned Auth user so a brand new UID can be generated
                await reclaimedUser.delete();
                const freshCred = await auth.createUserWithEmailAndPassword(cleanEmail, password);
                authUser = freshCred ? freshCred.user : null;
              } catch (delErr) {
                authUser = reclaimedUser;
                if (password) await authUser.updatePassword(password).catch(() => {});
                await authUser.updateProfile({ displayName: name.trim() }).catch(() => {});
              }
            } else {
              return { success: false, message: 'An account with this email already exists. Please Log In.' };
            }
          } else {
            return { success: false, message: err.message || 'Error creating account.' };
          }
        }
      }

      const uid = authUser ? authUser.uid : ('user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));

      const freshUser = {
        uid: uid,
        userId: uid,
        name: name.trim(),
        email: cleanEmail,
        password: password,
        isVerified: true,
        accountStatus: 'approved',
        totalSessionsCompleted: 0,
        createdAt: new Date().toISOString()
      };

      // Write user document to Cloud Firestore keyed by UID
      if (db) {
        try {
          await db.collection('users').doc(uid).set({
            uid: uid,
            name: name.trim(),
            email: cleanEmail,
            role: 'Skill Explorer',
            bio: '',
            teachSkills: [],
            learnSkills: [],
            availability: [],
            accountStatus: 'approved',
            isVerified: true,
            totalSessionsCompleted: 0,
            createdAt: freshUser.createdAt
          });

          // Clean up legacy email-keyed doc if any
          await db.collection('users').doc(cleanEmail).delete().catch(() => {});
          await db.collection('deleted_users').doc(cleanEmail).delete().catch(() => {});
        } catch (dbErr) {
          console.warn('Firestore write notice:', dbErr);
        }
      }

      // Update local cache
      const users = getCachedUsers();
      const profiles = getCachedProfiles();
      users[cleanEmail] = freshUser;
      profiles[cleanEmail] = {
        uid: uid,
        email: cleanEmail,
        name: name.trim(),
        role: 'Skill Explorer',
        bio: '',
        teachSkills: [],
        learnSkills: [],
        availability: [],
        updatedAt: freshUser.createdAt
      };

      const deletedMap = getCachedDeletedUsers();
      delete deletedMap[cleanEmail];
      saveCachedDeletedUsers(deletedMap);
      saveCachedUsers(users);
      saveCachedProfiles(profiles);

      localStorage.setItem(SESSION_KEY, cleanEmail);
      try { sessionStorage.setItem(SESSION_KEY, cleanEmail); } catch (e) {}

      return { success: true, requiresVerification: false, user: freshUser, hasProfile: false };
    },

    authenticateUser: async function(email, password) {
      const cleanEmail = email.trim().toLowerCase();
      const auth = getAuth();
      const db = getDb();

      // 1. Authenticate with Firebase Auth
      let authUser = null;
      if (auth) {
        try {
          const cred = await auth.signInWithEmailAndPassword(cleanEmail, password);
          authUser = cred ? cred.user : auth.currentUser;
          trackEvent("login");
        } catch (err) {
          return { success: false, message: err.message || 'Invalid email or password.' };
        }
      }

      const uid = authUser ? authUser.uid : null;

      // 2. Single Source of Truth: Read Cloud Firestore user document by UID or email query
      let userDoc = null;
      if (db) {
        if (uid) {
          try {
            const doc = await db.collection('users').doc(uid).get();
            if (doc.exists) userDoc = doc.data();
          } catch (e) {}
        }
        try {
          const docEmail = await db.collection('users').doc(cleanEmail).get();
          if (docEmail.exists) {
            const emailData = docEmail.data();
            if (emailData) {
              if (!userDoc) {
                userDoc = emailData;
              } else {
                if ((emailData.teachSkills && emailData.teachSkills.length > 0) || !userDoc.teachSkills || userDoc.teachSkills.length === 0) {
                  userDoc.teachSkills = emailData.teachSkills || userDoc.teachSkills || [];
                }
                if ((emailData.learnSkills && emailData.learnSkills.length > 0) || !userDoc.learnSkills || userDoc.learnSkills.length === 0) {
                  userDoc.learnSkills = emailData.learnSkills || userDoc.learnSkills || [];
                }
                if ((emailData.availability && emailData.availability.length > 0) || !userDoc.availability || userDoc.availability.length === 0) {
                  userDoc.availability = emailData.availability || userDoc.availability || [];
                }
                if (emailData.name) userDoc.name = emailData.name;
                if (emailData.role) userDoc.role = emailData.role;
                if (emailData.bio) userDoc.bio = emailData.bio;
              }
            }
          }
        } catch (e) {}

        if (!userDoc) {
          try {
            const snap = await db.collection('users').where('email', '==', cleanEmail).get();
            snap.forEach(doc => {
              if (doc.exists) userDoc = doc.data();
            });
          } catch (e) {}
        }
      }

      const cachedUsers = getCachedUsers();
      const cachedUser = cachedUsers[cleanEmail];

      if (!userDoc && !cachedUser) {
        if (auth) auth.signOut().catch(() => {});
        return { success: false, message: 'Account not found. Please sign up for a new account.' };
      }

      const status = (userDoc && userDoc.accountStatus) || (cachedUser && cachedUser.accountStatus) || 'approved';

      if (status === 'blocked') {
        if (auth) auth.signOut().catch(() => {});
        return { success: false, message: 'Your account has been blocked by the administrator. Please contact support.' };
      }

      if (status === 'deleted') {
        if (auth) auth.signOut().catch(() => {});
        return { success: false, message: 'This account has been deleted by an administrator. Please sign up for a new account.' };
      }

      const user = {
        uid: (userDoc && (userDoc.uid || userDoc.userId)) || uid || (cachedUser && (cachedUser.uid || cachedUser.userId)) || cleanEmail,
        name: (userDoc && userDoc.name) || (cachedUser && cachedUser.name) || (authUser && authUser.displayName) || cleanEmail.split('@')[0],
        email: cleanEmail,
        password: password,
        isVerified: true,
        accountStatus: 'approved',
        createdAt: (userDoc && userDoc.createdAt) || (cachedUser && cachedUser.createdAt) || new Date().toISOString()
      };

      const users = getCachedUsers();
      const profiles = getCachedProfiles();
      const existingProfile = profiles[cleanEmail] || {};

      const teachSkills = (userDoc && Array.isArray(userDoc.teachSkills) && userDoc.teachSkills.length > 0)
        ? userDoc.teachSkills
        : (existingProfile.teachSkills || []);

      const learnSkills = (userDoc && Array.isArray(userDoc.learnSkills) && userDoc.learnSkills.length > 0)
        ? userDoc.learnSkills
        : (existingProfile.learnSkills || []);

      const availability = (userDoc && Array.isArray(userDoc.availability) && userDoc.availability.length > 0)
        ? userDoc.availability
        : (existingProfile.availability || []);

      users[cleanEmail] = user;
      profiles[cleanEmail] = {
        uid: user.uid,
        email: cleanEmail,
        name: user.name,
        role: (userDoc && userDoc.role) || existingProfile.role || 'Skill Explorer',
        bio: (userDoc && userDoc.bio !== undefined && userDoc.bio !== '') ? userDoc.bio : (existingProfile.bio || ''),
        teachSkills: teachSkills,
        learnSkills: learnSkills,
        availability: availability,
        updatedAt: (userDoc && userDoc.updatedAt) || existingProfile.updatedAt || new Date().toISOString()
      };
      saveCachedUsers(users);
      saveCachedProfiles(profiles);

      localStorage.setItem(SESSION_KEY, cleanEmail);
      try { sessionStorage.setItem(SESSION_KEY, cleanEmail); } catch (e) {}

      const hasProfile = (profiles[cleanEmail].teachSkills && profiles[cleanEmail].teachSkills.length > 0);

      return { success: true, user, hasProfile, isVerified: true };
    },

    // Profile Management
    saveProfile: async function(profileData) {
      const user = this.getCurrentUser();
      if (!user) return { success: false, message: 'Account not found.' };
      if (user.accountStatus === 'blocked') return { success: false, message: 'Your account is blocked.' };

      const email = user.email.toLowerCase();
      const profiles = getCachedProfiles();
      const users = getCachedUsers();

      const teachSkills = (profileData.teachSkills || []).slice(0, 2);
      const learnSkills = (profileData.learnSkills || []).slice(0, 2);

      const updatedProfile = {
        uid: user.uid || email,
        email: email,
        name: profileData.name.trim(),
        role: profileData.role ? profileData.role.trim() : 'Skill Explorer',
        bio: profileData.bio ? profileData.bio.trim() : '',
        teachSkills: teachSkills,
        learnSkills: learnSkills,
        availability: profileData.availability || [],
        updatedAt: new Date().toISOString()
      };

      // Optimistic local update
      profiles[email] = updatedProfile;
      saveCachedProfiles(profiles);

      if (users[email]) {
        users[email].name = updatedProfile.name;
        saveCachedUsers(users);
      }

      // Cloud Firestore sync to both doc(uid) and doc(email)
      const db = getDb();
      if (db) {
        const payload = {
          uid: updatedProfile.uid,
          email: email,
          name: updatedProfile.name,
          role: updatedProfile.role,
          bio: updatedProfile.bio,
          teachSkills: updatedProfile.teachSkills,
          learnSkills: updatedProfile.learnSkills,
          availability: updatedProfile.availability,
          updatedAt: updatedProfile.updatedAt
        };

        try {
          if (user.uid) {
            await db.collection('users').doc(user.uid).set(payload, { merge: true });
          }
          await db.collection('users').doc(email).set(payload, { merge: true });
        } catch (err) {
          console.error('Firestore saveProfile Error:', err);
        }
      }

      return { success: true, profile: updatedProfile };
    },

    // Logout
    logout: function() {
      trackEvent("logout");
      try {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.clear();
      } catch (e) {}

      const auth = getAuth();
      if (auth) auth.signOut().catch(() => {});
      window.location.replace('auth.html');
    },

    // Route Guard
    requireAuth: function() {
      const user = this.getCurrentUser();
      if (!user) {
        if (typeof window !== 'undefined' && window.location.pathname.indexOf('auth.html') === -1) {
          window.location.replace('auth.html');
        }
        return null;
      }
      if (user.accountStatus === 'blocked') {
        alert('Your account is currently blocked by an administrator.');
        this.logout();
        return null;
      }
      if (user.accountStatus === 'deleted' || isUserDeleted(user.email)) {
        alert('Your account has been permanently deleted by an administrator.');
        this.logout();
        return null;
      }
      return user;
    },

    // Matching Engine
    findMatches: function(filterType = 'all', searchQuery = '', availFilter = 'all') {
      const currentProfile = this.getCurrentProfile();
      if (!currentProfile) return [];

      const allProfiles = getCachedProfiles();
      const allUsers = getCachedUsers();
      const matches = [];

      const myTeach = currentProfile.teachSkills || [];
      const myLearn = currentProfile.learnSkills || [];
      const myAvail = currentProfile.availability || [];

      function isSkillMatch(s1, s2) {
        if (!s1 || !s2) return false;
        const a = s1.trim().toLowerCase();
        const b = s2.trim().toLowerCase();
        if (a === b) return true;
        if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;

        const tokensA = a.split(/[\s,/-]+/).filter(t => t.length >= 3);
        const tokensB = b.split(/[\s,/-]+/).filter(t => t.length >= 3);
        return tokensA.some(tA => tokensB.some(tB => tA === tB || tA.includes(tB) || tB.includes(tA)));
      }

      Object.values(allProfiles).forEach(peer => {
        if (peer.email.toLowerCase() === currentProfile.email.toLowerCase()) return;

        const peerUser = allUsers[peer.email.toLowerCase()];
        if (peerUser && peerUser.accountStatus === 'blocked') return;

        const peerAvail = peer.availability || [];

        // Direction 1: Peer teaches what I want to learn
        const peerTeachesWhatIWant = (peer.teachSkills || []).filter(peerSkill =>
          myLearn.some(myLearnSkill => isSkillMatch(peerSkill, myLearnSkill))
        );

        // Direction 2: Peer wants to learn what I teach
        const peerWantsWhatITeach = (peer.learnSkills || []).filter(peerSkill =>
          myTeach.some(myTeachSkill => isSkillMatch(peerSkill, myTeachSkill))
        );

        const sharedAvail = peerAvail.filter(slot => myAvail.includes(slot));

        // NO MATCH: If neither direction matches, exclude
        if (peerTeachesWhatIWant.length === 0 && peerWantsWhatITeach.length === 0) return;

        let score = 0;
        const matchReasons = [];
        let isTwoWay = false;
        let matchTypeLabel = '1-Way Match';
        const peerFirstName = (peer.name || 'Peer').split(' ')[0];

        if (peerTeachesWhatIWant.length > 0 && peerWantsWhatITeach.length > 0) {
          isTwoWay = true;
          matchTypeLabel = '2-Way Swap';
          score += 70;
          matchReasons.push(`2-Way Swap: ${peerFirstName} teaches ${peerTeachesWhatIWant.join(', ')} and wants to learn ${peerWantsWhatITeach.join(', ')}.`);
        } else if (peerTeachesWhatIWant.length > 0) {
          isTwoWay = false;
          matchTypeLabel = '1-Way Match';
          score += 45;
          matchReasons.push(`1-Way Match: ${peerFirstName} can teach you ${peerTeachesWhatIWant.join(', ')}.`);
        } else if (peerWantsWhatITeach.length > 0) {
          isTwoWay = false;
          matchTypeLabel = '1-Way Match';
          score += 40;
          matchReasons.push(`1-Way Match: ${peerFirstName} wants to learn ${peerWantsWhatITeach.join(', ')}.`);
        }

        if (sharedAvail.length > 0) {
          const availBonus = Math.min(25, sharedAvail.length * 12);
          score += availBonus;
          matchReasons.push(`Matching schedule: ${sharedAvail.join(', ')}.`);
        }

        const matchPercentage = Math.min(99, Math.max(50, score));

        if (filterType === 'twoway' && !isTwoWay) return;
        if (filterType === 'oneway' && isTwoWay) return;
        if (availFilter !== 'all' && !peerAvail.includes(availFilter)) return;

        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          const matchesName = (peer.name || '').toLowerCase().includes(q);
          const matchesRole = (peer.role || '').toLowerCase().includes(q);
          const matchesTeach = (peer.teachSkills || []).some(s => s.toLowerCase().includes(q));
          const matchesLearn = (peer.learnSkills || []).some(s => s.toLowerCase().includes(q));
          if (!matchesName && !matchesRole && !matchesTeach && !matchesLearn) return;
        }

        matches.push({
          peer,
          matchPercentage,
          isTwoWay,
          matchTypeLabel,
          peerTeachesWhatIWant,
          peerWantsWhatITeach,
          sharedAvail,
          matchReasons
        });
      });

      matches.sort((a, b) => b.matchPercentage - a.matchPercentage);
      return matches;
    },

    // Connection Agreement Handshake (Rules 1-4)
    getConnection: function(peerEmail, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || !peerEmail) return null;

      const pairKey = getPairKey(email, peerEmail);
      const connections = getCachedConnections();
      return connections[pairKey] || null;
    },

    getConnectionStatus: function(peerEmail, callerEmail) {
      const conn = this.getConnection(peerEmail, callerEmail);
      if (!conn) return 'none';
      return conn.status || 'none';
    },

    initiateConnection: function(peerEmail, callerEmail) {
      const currentUser = this.getCurrentUser(callerEmail);
      if (!currentUser || currentUser.accountStatus === 'blocked') {
        return { success: false, message: 'Account not authorized.' };
      }

      const myEmail = currentUser.email.toLowerCase();
      const targetEmail = peerEmail.trim().toLowerCase();
      const pairKey = getPairKey(myEmail, targetEmail);
      const connections = getCachedConnections();

      let conn = connections[pairKey];
let requestCreated = false;

if (!conn) {
        conn = {
          pairKey: pairKey,
          user1: myEmail,
          user2: targetEmail,
          status: 'pending',
          agreedBy: [myEmail],
          rejectedBy: null,
          createdAt: new Date().toISOString(),
          connectedAt: null
        };
        connections[pairKey] = conn;
        saveCachedConnections(connections);
        requestCreated = true;

        const myProf = this.getCurrentProfile(myEmail);
        this.addNotification(
          targetEmail,
          'New Connection Request!',
          `${myProf ? myProf.name : 'A peer'} requested to connect and share skills with you!`,
          'connection',
          { peerEmail: myEmail }
        );
      } else if (conn.status === 'rejected') {
        conn.status = 'pending';
        conn.agreedBy = [myEmail];
        conn.rejectedBy = null;
        conn.createdAt = new Date().toISOString();
        connections[pairKey] = conn;
        saveCachedConnections(connections);
        requestCreated = true;
      }
      // GA4: Track successful connection request
      if (requestCreated && typeof gtag === 'function') {
  gtag('event', 'connection_request_sent');
}

      // Firestore sync
      const db = getDb();
      if (db) {
        db.collection('connections').doc(pairKey).set(conn, { merge: true }).catch(console.error);
      }

      window.dispatchEvent(new CustomEvent('skillshare_connection_updated', { detail: { peerEmail: targetEmail, connection: conn } }));
      return { success: true, connection: conn };
    },

    respondToConnection: function(peerEmail, response, callerEmail) {
      const currentUser = this.getCurrentUser(callerEmail);
      if (!currentUser) return { success: false, message: 'Not logged in.' };

      const myEmail = currentUser.email.toLowerCase();
      const targetEmail = peerEmail.trim().toLowerCase();
      const pairKey = getPairKey(myEmail, targetEmail);
      const connections = getCachedConnections();

      let conn = connections[pairKey] || {
        pairKey: pairKey,
        user1: myEmail,
        user2: targetEmail,
        status: 'pending',
        agreedBy: [],
        rejectedBy: null,
        createdAt: new Date().toISOString(),
        connectedAt: null
      };

      const myProf = this.getCurrentProfile();

      if (response === 'YES') {
        if (!conn.agreedBy.includes(myEmail)) {
          conn.agreedBy.push(myEmail);
        }

        if (conn.agreedBy.length >= 2) {
          conn.status = 'connected';
          conn.connectedAt = new Date().toISOString();
          trackEvent('connection_accepted');

          this.addNotification(
            targetEmail,
            'Connection Confirmed!',
            `Both you and ${myProf ? myProf.name : 'your peer'} agreed to connect! Shared chat is now unlocked.`,
            'success',
            { peerEmail: myEmail }
          );
        } else {
          conn.status = 'pending';
          this.addNotification(
            targetEmail,
            'Connection Agreement',
            `${myProf ? myProf.name : 'Your peer'} selected YES to connect! Waiting for your confirmation.`,
            'connection',
            { peerEmail: myEmail }
          );
        }
      } else if (response === 'NO') {
        conn.status = 'rejected';
        conn.rejectedBy = myEmail;

        trackEvent("connection_declined", {
    peer_email: peerEmail
  });

        this.addNotification(
          targetEmail,
          'Connection Request Declined',
          `${myProf ? myProf.name : 'Your peer'} declined the connection request.`,
          'info',
          { peerEmail: myEmail }
        );
      }

      connections[pairKey] = conn;
      saveCachedConnections(connections);

      const db = getDb();
      if (db) {
        db.collection('connections').doc(pairKey).set(conn, { merge: true }).catch(console.error);
      }

      window.dispatchEvent(new CustomEvent('skillshare_connection_updated', { detail: { peerEmail: targetEmail, connection: conn } }));
      return { success: true, connection: conn, isConnected: conn.status === 'connected', isRejected: conn.status === 'rejected' };
    },

    // Session Lifecycle (Rules 5-10)
    getActiveSession: function(peerEmail, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || !peerEmail) return null;

      const pairKey = getPairKey(email, peerEmail);
      const sessions = getCachedSessions();
      return sessions.find(s => s.pairKey === pairKey && (s.status || '').toLowerCase() === 'active') || null;
    },

    getPendingSessionRequest: function(peerEmail, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || !peerEmail) return null;

      const pairKey = getPairKey(email, peerEmail);
      const requests = getCachedSessionRequests();
      return requests.find(r => r.pairKey === pairKey && (r.status || '').toLowerCase() === 'pending') || null;
    },

    isMeetingLink: function(text) {
      if (!text || typeof text !== 'string') return false;
      const meetingDomains = [
        'meet.google.com', 'zoom.us', 'teams.microsoft.com', 'teams.live.com',
        'webex.com', 'meet.jit.si', 'whereby.com', 'discord.gg', 'discord.com',
        'join.skype.com', 'chime.aws', 'around.co'
      ];
      const lower = text.toLowerCase();
      const hasDomain = meetingDomains.some(domain => lower.includes(domain));
      if (hasDomain) return true;
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const matches = text.match(urlRegex);
      if (matches) {
        for (const u of matches) {
          const lu = u.toLowerCase();
          if (lu.includes('/j/') || lu.includes('/join/') || lu.includes('/meet/') || lu.includes('/meeting/') || lu.includes('/room/') || lu.includes('/call/')) {
            return true;
          }
        }
      }
      return false;
    },

    extractMeetingLink: function(text) {
      if (!text || typeof text !== 'string') return text;
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const matches = text.match(urlRegex);
      if (matches && matches.length > 0) {
        return matches[0];
      }
      return text.trim();
    },

    proposeMeetingSession: function(peerEmail, meetingUrl, fullText = '') {
      const currentUser = this.getCurrentUser();
      if (!currentUser) return { success: false, message: 'Not logged in.' };

      const myEmail = currentUser.email.toLowerCase();
      const targetEmail = peerEmail.trim().toLowerCase();

      if (this.getConnectionStatus(targetEmail) !== 'connected') {
        return { success: false, message: 'You must both agree to connect before starting a session.' };
      }

      if (this.getActiveSession(targetEmail)) {
        return { success: false, message: 'An active session is already in progress with this peer.' };
      }

      if (this.getPendingSessionRequest(targetEmail)) {
        return { success: false, message: 'A session request is already pending response.' };
      }

      const pairKey = getPairKey(myEmail, targetEmail);
      const reqs = getCachedSessionRequests();

      const newReq = {
        id: 'sessreq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        pairKey: pairKey,
        from: myEmail,
        to: targetEmail,
        meetingUrl: meetingUrl,
        fullText: fullText || meetingUrl,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      reqs.push(newReq);
      saveCachedSessionRequests(reqs);
      trackEvent("session_link_shared", {
  peer_email: targetEmail
});

      const db = getDb();
      if (db) {
        db.collection('sessions').doc(newReq.id).set(newReq).catch(console.error);
      }

      const myProf = this.getCurrentProfile();
      const senderName = myProf ? myProf.name : 'Your peer';
      this.addNotification(
        targetEmail,
        'SkillSwap Session Invite',
        `${senderName} started a SkillSwap session through this link. Do you want to accept this session?`,
        'connection',
        { peerEmail: myEmail }
      );

      window.dispatchEvent(new CustomEvent('skillshare_session_updated', { detail: { peerEmail: targetEmail, request: newReq } }));
      return { success: true, request: newReq };
    },

    respondToSessionRequest: function(requestId, response) {
      const currentUser = this.getCurrentUser();
      if (!currentUser) return { success: false, message: 'Not logged in.' };

      const myEmail = currentUser.email.toLowerCase();
      const reqs = getCachedSessionRequests();
      const reqIdx = reqs.findIndex(r => r.id === requestId);

      if (reqIdx === -1) return { success: false, message: 'Session request not found.' };
      const req = reqs[reqIdx];
      const peerEmail = req.from === myEmail ? req.to : req.from;

      const db = getDb();

      if (response === 'accepted' || response === 'ACCEPT') {
        req.status = 'accepted';
        trackEvent("session_accepted", {
    peer_email: peerEmail
  });
        saveCachedSessionRequests(reqs);

        const sessions = getCachedSessions();
        const newSess = {
          id: 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          pairKey: req.pairKey,
          user1: req.from,
          user2: req.to,
          meetingUrl: req.meetingUrl,
          status: 'active',
          completedBy: [],
          user1Completed: false,
          user2Completed: false,
          createdAt: new Date().toISOString(),
          completedAt: null
        };

        sessions.push(newSess);
        saveCachedSessions(sessions);

        if (db) {
          db.collection('sessions').doc(req.id).update({ status: 'accepted' }).catch(() => {});
          db.collection('sessions').doc(newSess.id).set(newSess).catch(console.error);
        }

        // Send meeting link as message
        this.sendChatMessage(peerEmail, {
          type: 'link',
          linkUrl: req.meetingUrl,
          text: req.fullText || req.meetingUrl,
          sessionId: newSess.id
        });

        const myProf = this.getCurrentProfile();
        this.addNotification(
          peerEmail,
          'Session Accepted!',
          `${myProf ? myProf.name : 'Your peer'} accepted your SkillSwap session!`,
          'success',
          { peerEmail: myEmail }
        );

        window.dispatchEvent(new CustomEvent('skillshare_session_updated', { detail: { peerEmail, session: newSess } }));
        return { success: true, session: newSess };

      } else {
        req.status = 'declined';
          trackEvent("session_declined", {
    peer_email: peerEmail
  });
        saveCachedSessionRequests(reqs);

        if (db) {
          db.collection('sessions').doc(req.id).update({ status: 'declined' }).catch(() => {});
        }

        this.sendChatMessage(peerEmail, {
          type: 'link',
          linkUrl: req.meetingUrl,
          text: req.fullText || req.meetingUrl,
          sessionId: null
        });

        const myProf = this.getCurrentProfile();
        this.addNotification(
          peerEmail,
          'Session Declined',
          `${myProf ? myProf.name : 'Your peer'} declined the session invitation. Link sent as normal message.`,
          'info',
          { peerEmail: myEmail }
        );

        window.dispatchEvent(new CustomEvent('skillshare_session_updated', { detail: { peerEmail } }));
        return { success: true };
      }
    },

    getCompletedSessionsForPair: function(peerEmail, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || !peerEmail) return [];

      const pairKey = getPairKey(email, peerEmail);
      const sessions = getCachedSessions();

      const completed = sessions.filter(s => {
        if (s.pairKey !== pairKey) return false;
        const statusUpper = (s.status || '').toUpperCase();
        const completedBy = (s.completedBy || []).map(e => (e || '').toLowerCase());
        const isBothCompleted = completedBy.length >= 2 && completedBy.includes(email.toLowerCase()) && completedBy.includes(peerEmail.trim().toLowerCase());
        return statusUpper === 'COMPLETED' || isBothCompleted;
      });

      // Sort strictly by completedAt or createdAt timestamp ascending
      completed.sort((a, b) => {
        const t1 = new Date(a.completedAt || a.createdAt || 0).getTime();
        const t2 = new Date(b.completedAt || b.createdAt || 0).getTime();
        return t1 - t2;
      });

      return completed;
    },

    getPeerSessionNumber: function(sessionId, peerEmail, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || !peerEmail) return 1;

      const completedSessions = this.getCompletedSessionsForPair(peerEmail, email);

      if (sessionId) {
        const idx = completedSessions.findIndex(s => s.id === sessionId);
        if (idx !== -1) {
          return idx + 1;
        }
      }

      // Active or new session serial number equals (completed sessions count + 1)
      return completedSessions.length + 1;
    },

    markSessionCompleted: async function(peerEmail, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      const currentUser = this.getCurrentUser(email);
      if (!currentUser) return { success: false, message: 'Not logged in.' };

      const myEmail = currentUser.email.toLowerCase();
      const targetEmail = peerEmail.trim().toLowerCase();
      let activeSess = this.getActiveSession(targetEmail, myEmail);

      const db = getDb();

      // If activeSess is missing in local cache, query Cloud Firestore by pairKey
      if (!activeSess && db) {
        try {
          const pairKey = getPairKey(myEmail, targetEmail);
          const snap = await db.collection('sessions').where('pairKey', '==', pairKey).get();
          snap.forEach(doc => {
            const data = doc.data();
            if (data && (data.status || '').toLowerCase() === 'active') {
              activeSess = data;
            }
          });
        } catch (e) {}
      }

      if (!activeSess) {
        return { success: false, message: 'No active session found. Send a meeting link to start a session.' };
      }

      if (!activeSess.completedBy) activeSess.completedBy = [];
      const completedLower = activeSess.completedBy.map(e => (e || '').toLowerCase());
      if (!completedLower.includes(myEmail)) {
        activeSess.completedBy.push(myEmail);
        trackEvent("session_completion_clicked", {
    peer_email: targetEmail
  });
      }

      const u1 = (activeSess.user1 || '').toLowerCase();
      const u2 = (activeSess.user2 || '').toLowerCase();

      if (myEmail === u1) activeSess.user1Completed = true;
      if (myEmail === u2) activeSess.user2Completed = true;
      activeSess[myEmail + '_completed'] = true;

      const completedSet = new Set((activeSess.completedBy || []).map(e => (e || '').toLowerCase()));
      if (activeSess.user1Completed || activeSess[u1 + '_completed']) completedSet.add(u1);
      if (activeSess.user2Completed || activeSess[u2 + '_completed']) completedSet.add(u2);

      const hasBothCompleted = completedSet.size >= 2 || (u1 && u2 && completedSet.has(u1) && completedSet.has(u2));

      let isFullyCompleted = false;

      if (hasBothCompleted) {
        activeSess.status = 'COMPLETED';
        trackEvent("session_completed", {
    peer_email: targetEmail
  });
        activeSess.completedAt = new Date().toISOString();
        isFullyCompleted = true;

        const sessNum = this.getPeerSessionNumber(activeSess.id, targetEmail, myEmail);
        const myProf = this.getCurrentProfile(myEmail);
        this.addNotification(
          targetEmail,
          'Exchange Completed Successfully!',
          `Both you and ${myProf ? myProf.name : 'your peer'} marked Session #${sessNum} as completed!`,
          'success',
          { peerEmail: myEmail }
        );

        // Increment total completed count in cache & Firestore
        const users = getCachedUsers();
        if (users[myEmail]) users[myEmail].totalSessionsCompleted = (users[myEmail].totalSessionsCompleted || 0) + 1;
        if (users[targetEmail]) users[targetEmail].totalSessionsCompleted = (users[targetEmail].totalSessionsCompleted || 0) + 1;
        saveCachedUsers(users);

        if (db) {
          try {
            await db.collection('users').doc(myEmail).set({ totalSessionsCompleted: (users[myEmail] ? users[myEmail].totalSessionsCompleted : 1) }, { merge: true });
            await db.collection('users').doc(targetEmail).set({ totalSessionsCompleted: (users[targetEmail] ? users[targetEmail].totalSessionsCompleted : 1) }, { merge: true });
            if (currentUser.uid) {
              await db.collection('users').doc(currentUser.uid).set({ totalSessionsCompleted: (users[myEmail] ? users[myEmail].totalSessionsCompleted : 1) }, { merge: true });
            }
          } catch (e) {}
        }
      } else {
        const sessNum = this.getPeerSessionNumber(activeSess.id, targetEmail, myEmail);
        const myProf = this.getCurrentProfile(myEmail);
        this.addNotification(
          targetEmail,
          'Session Marked Completed',
          `${myProf ? myProf.name : 'Your peer'} marked Session #${sessNum} as completed! Click complete to finalize.`,
          'info',
          { peerEmail: myEmail }
        );
      }

      const sessions = getCachedSessions();
      const idx = sessions.findIndex(s => s.id === activeSess.id);
      if (idx !== -1) {
        sessions[idx] = activeSess;
      } else {
        sessions.push(activeSess);
      }
      saveCachedSessions(sessions);

      if (db) {
        try {
          await db.collection('sessions').doc(activeSess.id).set(activeSess, { merge: true });
        } catch (err) {
          console.error('Firestore markSessionCompleted error:', err);
        }
      }

      window.dispatchEvent(new CustomEvent('skillshare_session_updated', { detail: { peerEmail: targetEmail, session: activeSess } }));
      return { success: true, session: activeSess, isFullyCompleted };
    },

    // Chat Messages
    getChatMessages: function(peerEmail, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || !peerEmail) return [];
      const chatKey = getPairKey(email, peerEmail);
      const messages = getCachedMessages();
      return messages[chatKey] || [];
    },

    // Real-time Chat Subscription for Active Pair
    subscribeToChat: function(peerEmail, onUpdate, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || !peerEmail) return () => {};
      const targetEmail = peerEmail.trim().toLowerCase();
      const chatKey = getPairKey(email, targetEmail);
      const db = getDb();
      if (!db) return () => {};

      let isUnsubscribed = false;

      const firestoreUnsubscribe = db.collection('chats').doc(chatKey).collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
          if (isUnsubscribed) return;
          const msgs = getCachedMessages();
          const pairMsgs = [];
          snapshot.forEach(doc => {
            pairMsgs.push(doc.data());
          });
          msgs[chatKey] = pairMsgs;
          saveCachedMessages(msgs);
          if (typeof onUpdate === 'function') onUpdate(pairMsgs);
          window.dispatchEvent(new CustomEvent('skillshare_new_msg', { detail: { chatKey, peerEmail: targetEmail, messages: pairMsgs } }));
        }, err => {
          console.warn('Direct chat subcollection listener notice:', err);
        });

      // 3-second heartbeat backup query to ensure 100% real-time reliability even if WebSocket packets stall
      const heartbeatInterval = setInterval(() => {
        if (isUnsubscribed) {
          clearInterval(heartbeatInterval);
          return;
        }
        db.collection('chats').doc(chatKey).collection('messages')
          .orderBy('timestamp', 'asc').get()
          .then(snap => {
            if (isUnsubscribed) return;
            const pairMsgs = [];
            snap.forEach(doc => pairMsgs.push(doc.data()));
            const msgs = getCachedMessages();
            const existingCount = (msgs[chatKey] || []).length;
            if (existingCount !== pairMsgs.length) {
              msgs[chatKey] = pairMsgs;
              saveCachedMessages(msgs);
              if (typeof onUpdate === 'function') onUpdate(pairMsgs);
            }
          }).catch(() => {});
      }, 3000);

      return function unsubscribe() {
        isUnsubscribed = true;
        clearInterval(heartbeatInterval);
        if (typeof firestoreUnsubscribe === 'function') {
          try { firestoreUnsubscribe(); } catch (e) {}
        }
      };
    },

    // Real-time Connection Subscription for Active Pair
    subscribeToConnection: function(peerEmail, onUpdate, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || !peerEmail) return () => {};
      const targetEmail = peerEmail.trim().toLowerCase();
      const pairKey = getPairKey(email, targetEmail);
      const db = getDb();
      if (!db) return () => {};

      return db.collection('connections').doc(pairKey).onSnapshot((doc) => {
        if (doc.exists) {
          const conns = getCachedConnections();
          conns[pairKey] = doc.data();
          saveCachedConnections(conns);
          if (typeof onUpdate === 'function') onUpdate(conns[pairKey]);
          window.dispatchEvent(new CustomEvent('skillshare_connection_updated', { detail: { peerEmail: targetEmail, connection: conns[pairKey] } }));
        }
      }, err => {
        console.warn('Connection listener notice:', err);
      });
    },

    sendChatMessage: async function(peerEmail, contentData, callerEmail) {
      const currentUser = this.getCurrentUser(callerEmail);
      if (!currentUser || currentUser.accountStatus === 'blocked') return { success: false, message: 'Account blocked or logged out.' };

      const email = currentUser.email.toLowerCase();
      const targetEmail = peerEmail.trim().toLowerCase();
      const connStatus = this.getConnectionStatus(peerEmail, email);
      if (connStatus !== 'connected') {
        return { success: false, message: 'Chat is locked. Both users must agree YES to connect.' };
      }

      const chatKey = getPairKey(email, targetEmail);
      const messages = getCachedMessages();
      if (!messages[chatKey]) messages[chatKey] = [];

      const activeSess = this.getActiveSession(targetEmail, email);

      let newMsg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        pairKey: chatKey,
        sessionId: activeSess ? activeSess.id : null,
        sender: email,
        timestamp: new Date().toISOString()
      };

      if (typeof contentData === 'string') {
        if (!contentData.trim()) return { success: true, messages: messages[chatKey] };
        newMsg.type = 'text';
        newMsg.text = contentData.trim();
      } else if (typeof contentData === 'object') {
        newMsg = { ...newMsg, ...contentData };
      }

      // If fileData is present, handle upload or size check
      const storage = getStorage();
      if (newMsg.fileData && typeof newMsg.fileData === 'string' && newMsg.fileData.startsWith('data:')) {
        let uploaded = false;
        if (storage) {
          try {
            const storageRef = storage.ref(`chat_attachments/${chatKey}/${Date.now()}_${newMsg.fileName || 'attachment'}`);
            const uploadSnapshot = await storageRef.putString(newMsg.fileData, 'data_url');
            const downloadUrl = await uploadSnapshot.ref.getDownloadURL();
            newMsg.fileData = downloadUrl; // Replace base64 with public cloud storage URL!
            uploaded = true;
          } catch (storageErr) {
            console.warn('Firebase Storage upload notice:', storageErr.message);
          }
        }
        
        if (!uploaded) {
          // If storage bucket is not enabled and fileData is too large for Firestore (>700KB)
          if (newMsg.fileData.length > 700000) {
            return {
              success: false,
              message: 'Firebase Storage is required for files larger than 700KB. Please click "Get Started" in Firebase Console -> Storage.'
            };
          }
        }
      }

      // Optimistic save
      messages[chatKey].push(newMsg);
      trackEvent("message_sent", {
  peer_email: peerEmail
});
      saveCachedMessages(messages);

      // Cloud Firestore save
      const db = getDb();
      if (db) {
        try {
          await db.collection('chats').doc(chatKey).collection('messages').doc(newMsg.id).set(newMsg);
        } catch (dbErr) {
          console.error('Firestore chat message write error:', dbErr);
        }
      }

      // Add Notification
      const myProfile = this.getCurrentProfile(email);
      let rawSnippet = newMsg.text || (newMsg.type === 'image' ? 'Image shared' : newMsg.type === 'file' ? 'Attachment shared' : 'Link shared');
      this.addNotification(
        targetEmail,
        `${myProfile ? myProfile.name : 'Peer'}`,
        rawSnippet.length > 60 ? rawSnippet.substring(0, 60) + '…' : rawSnippet,
        'message',
        { peerEmail: email }
      );

      window.dispatchEvent(new CustomEvent('skillshare_new_msg', { detail: { chatKey, peerEmail: targetEmail, messages: messages[chatKey] } }));
      return { success: true, messages: messages[chatKey] };
    },

    clearChat: async function(peerEmail, callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email || !peerEmail) return { success: false, message: 'Invalid user or peer' };
      const targetEmail = peerEmail.trim().toLowerCase();
      const chatKey = getPairKey(email, targetEmail);

      // 1. Clear local cache
      const messages = getCachedMessages();
      messages[chatKey] = [];
      saveCachedMessages(messages);

      // 2. Clear from Cloud Firestore subcollection
      const db = getDb();
      if (db) {
        try {
          const snapshot = await db.collection('chats').doc(chatKey).collection('messages').get();
          const batch = db.batch();
          snapshot.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();

          // Also clean up parent doc if exists
          try {
            await db.collection('chats').doc(chatKey).delete();
          } catch (e) {}
        } catch (err) {
          console.error('Firestore clear chat error:', err);
        }
      }

      // 3. Dispatch real-time update event
      window.dispatchEvent(new CustomEvent('skillshare_new_msg', {
        detail: { chatKey, peerEmail: targetEmail, messages: [] }
      }));

      return { success: true };
    },

    // Grouped Per-Peer Notifications
    getNotifications: function() {
      const email = this.getCurrentSession();
      if (!email) return [];
      const store = getCachedNotifications();
      return store[email.toLowerCase()] || [];
    },

    addNotification: function(toEmail, title, text, type = 'info', metaData = {}) {
      const cleanToEmail = toEmail.trim().toLowerCase();
      const store = getCachedNotifications();
      if (!store[cleanToEmail]) store[cleanToEmail] = [];

      const peerEmail = (metaData.peerEmail || 'system').toLowerCase();
      const existingIdx = store[cleanToEmail].findIndex(n => n.metaData && n.metaData.peerEmail === peerEmail);

      let notif;
      if (existingIdx !== -1) {
        notif = store[cleanToEmail][existingIdx];
        notif.title = title;
        notif.text = text;
        notif.type = type;
        notif.read = false;
        notif.unreadCount = (notif.unreadCount || 0) + 1;
        notif.timestamp = new Date().toISOString();

        store[cleanToEmail].splice(existingIdx, 1);
        store[cleanToEmail].unshift(notif);
      } else {
        notif = {
          id: 'notif_' + peerEmail + '_' + Date.now(),
          toEmail: cleanToEmail,
          title,
          text,
          type,
          unreadCount: 1,
          metaData,
          read: false,
          timestamp: new Date().toISOString()
        };
        store[cleanToEmail].unshift(notif);
      }

      saveCachedNotifications(store);

      const db = getDb();
      if (db) {
        const notifDocId = cleanToEmail + '__' + peerEmail;
        db.collection('notifications').doc(notifDocId).set(notif, { merge: true }).catch(() => {});
      }

      window.dispatchEvent(new CustomEvent('skillshare_notification_added', { detail: { toEmail: cleanToEmail, notif } }));
      return notif;
    },

    markPeerNotificationsAsRead: function(peerEmail) {
      const email = this.getCurrentSession();
      if (!email || !peerEmail) return;

      const store = getCachedNotifications();
      const cleanEmail = email.toLowerCase();
      const cleanPeer = peerEmail.toLowerCase();

      if (store[cleanEmail]) {
        let changed = false;
        store[cleanEmail].forEach(n => {
          if (n.metaData && n.metaData.peerEmail === cleanPeer && (!n.read || n.unreadCount > 0)) {
            n.read = true;
            n.unreadCount = 0;
            changed = true;
          }
        });
        if (changed) {
          saveCachedNotifications(store);
          const db = getDb();
          if (db) {
            db.collection('notifications').doc(cleanEmail + '__' + cleanPeer).update({ read: true, unreadCount: 0 }).catch(() => {});
          }
          window.dispatchEvent(new CustomEvent('skillshare_notifications_read', { detail: { email: cleanEmail, peerEmail: cleanPeer } }));
        }
      }
    },

    markNotificationsAsRead: function() {
      const email = this.getCurrentSession();
      if (!email) return;
      const store = getCachedNotifications();
      const cleanEmail = email.toLowerCase();

      if (store[cleanEmail]) {
        store[cleanEmail].forEach(n => {
          n.read = true;
          n.unreadCount = 0;
        });
        saveCachedNotifications(store);
      }
      window.dispatchEvent(new CustomEvent('skillshare_notifications_read', { detail: { email: cleanEmail } }));
    },

    getUnreadNotificationCount: function() {
      const email = this.getCurrentSession();
      if (!email) return 0;
      const notifs = this.getNotifications();
      let count = 0;
      notifs.forEach(n => {
        if (!n.read) count += (n.unreadCount || 1);
      });
      return count;
    },

    getCompletedSessionsCount: function(userEmail) {
      const currentUser = this.getCurrentUser();
      const email = (userEmail || (currentUser ? currentUser.email : '')).trim().toLowerCase();
      if (!email) return 0;

      const sessions = getCachedSessions();
      return sessions.filter(s => {
        const u1 = (s.user1 || '').trim().toLowerCase();
        const u2 = (s.user2 || '').trim().toLowerCase();
        const isUserInSession = (u1 === email || u2 === email);
        const statusUpper = (s.status || '').trim().toUpperCase();
        const isCompletedStatus = (statusUpper === 'COMPLETED' || statusUpper === 'SUCCESSFUL');

        const completedSet = new Set((s.completedBy || []).map(e => (e || '').trim().toLowerCase()));
        if (s.user1Completed || s[u1 + '_completed']) completedSet.add(u1);
        if (s.user2Completed || s[u2 + '_completed']) completedSet.add(u2);

        const bothCompleted = completedSet.size >= 2 || (u1 && u2 && completedSet.has(u1) && completedSet.has(u2));

        return isUserInSession && (isCompletedStatus || bothCompleted);
      }).length;
    },

    // Admin APIs
    getAllUsersForAdmin: function() {
      this.requireAdminAuth();
      const users = getCachedUsers();
      const profiles = getCachedProfiles();

      const list = Object.values(users)
        .filter(u => u && u.email && u.accountStatus !== 'deleted')
        .map(u => {
          const email = u.email.toLowerCase();
          const prof = profiles[email] || {};
          return {
            name: u.name || email.split('@')[0],
            email: email,
            userId: u.userId || u.uid || email,
            isVerified: !!u.isVerified,
            accountStatus: u.accountStatus || 'approved',
            createdAt: u.createdAt || new Date().toISOString(),
            teachSkills: prof.teachSkills || [],
            learnSkills: prof.learnSkills || [],
            role: prof.role || 'Skill Share Member',
            hasProfile: !!profiles[email],
            totalSessionsCompleted: this.getCompletedSessionsCount(email)
          };
        });

      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return list;
    },

    updateUserAccountStatus: async function(email, newStatus) {
      this.requireAdminAuth();
      const cleanEmail = email.trim().toLowerCase();
      const users = getCachedUsers();
      const userObj = users[cleanEmail] || {};
      const uid = userObj.uid || userObj.userId;

      if (users[cleanEmail]) {
        users[cleanEmail].accountStatus = newStatus;
        saveCachedUsers(users);
      }

      const db = getDb();
      if (db) {
        try {
          // 1. Update doc by cleanEmail
          await db.collection('users').doc(cleanEmail).set({ accountStatus: newStatus }, { merge: true }).catch(() => {});

          // 2. Update doc by UID if different
          if (uid && uid !== cleanEmail) {
            await db.collection('users').doc(uid).set({ accountStatus: newStatus }, { merge: true }).catch(() => {});
          }

          // 3. Query all docs matching email field to ensure complete sync
          const snap = await db.collection('users').where('email', '==', cleanEmail).get().catch(() => null);
          if (snap && !snap.empty) {
            snap.forEach(doc => {
              doc.ref.set({ accountStatus: newStatus }, { merge: true }).catch(() => {});
            });
          }
        } catch (err) {
          console.warn('updateUserAccountStatus Firestore error:', err);
        }
      }

      window.dispatchEvent(new CustomEvent('skillshare_user_status_changed', { detail: { email: cleanEmail, status: newStatus } }));
      return { success: true };
    },

    deleteUserAccount: async function(email, targetUid) {
      this.requireAdminAuth();
      const cleanEmail = email.trim().toLowerCase();
      const uid = targetUid || null;

      // 1. Invoke Server-side Backend API to permanently delete user from Firebase Auth & Firestore
      try {
        await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, uid: uid })
        });
      } catch (err) {
        console.warn('Backend delete-user call notice:', err);
      }

      // 2. Client-side Cloud Firestore cleanup fallback
      const db = getDb();
      if (db) {
        try {
          // Record tombstone doc in deleted_users collection for real-time sync across all browsers
          await db.collection('deleted_users').doc(cleanEmail).set({
            email: cleanEmail,
            uid: uid || '',
            deletedAt: new Date().toISOString()
          }).catch(() => {});

          if (uid) {
            await db.collection('users').doc(uid).delete().catch(() => {});
          }
          await db.collection('users').doc(cleanEmail).delete().catch(() => {});

          const emailSnap = await db.collection('users').where('email', '==', cleanEmail).get();
          emailSnap.forEach(doc => doc.ref.delete().catch(() => {}));

          const connsSnap = await db.collection('connections').get();
          connsSnap.forEach(doc => {
            if (doc.id.includes(cleanEmail)) {
              doc.ref.delete().catch(() => {});
            }
          });

          const sessSnap = await db.collection('sessions').get();
          sessSnap.forEach(doc => {
            const data = doc.data();
            const u1 = (data.user1 || data.user1Email || data.from || '').toLowerCase();
            const u2 = (data.user2 || data.user2Email || data.to || '').toLowerCase();
            if (u1 === cleanEmail || u2 === cleanEmail) {
              doc.ref.delete().catch(() => {});
            }
          });

          const notifSnap = await db.collection('notifications').get();
          notifSnap.forEach(doc => {
            if (doc.id.includes(cleanEmail)) {
              doc.ref.delete().catch(() => {});
            }
          });

          const chatsSnap = await db.collection('chats').get();
          chatsSnap.forEach(doc => {
            if (doc.id.includes(cleanEmail)) {
              doc.ref.delete().catch(() => {});
            }
          });
        } catch (err) {
          console.warn('Firestore user deletion notice:', err);
        }
      }

      // 3. Purge local cache
      const users = getCachedUsers();
      const profiles = getCachedProfiles();
      delete users[cleanEmail];
      delete profiles[cleanEmail];
      saveCachedUsers(users);
      saveCachedProfiles(profiles);

      const deleted = getCachedDeletedUsers();
      delete deleted[cleanEmail];
      saveCachedDeletedUsers(deleted);

      const activeSess = this.getCurrentSession();
      if (activeSess === cleanEmail) {
        localStorage.removeItem(SESSION_KEY);
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
      }

      window.dispatchEvent(new CustomEvent('skillshare_user_deleted', { detail: { email: cleanEmail } }));
      window.dispatchEvent(new CustomEvent('skillshare_user_status_changed', { detail: {} }));
      window.dispatchEvent(new CustomEvent('skillshare_session_updated', { detail: {} }));

      return { success: true };
    },

    isDefinedSession: function(s) {
      if (!s || typeof s !== 'object') return false;
      const u1 = (s.user1 || s.user1Email || '').toString().trim().toLowerCase();
      const u2 = (s.user2 || s.user2Email || '').toString().trim().toLowerCase();

      if (!u1 || u1 === 'undefined' || u1 === 'null') return false;
      if (!u2 || u2 === 'undefined' || u2 === 'null') return false;

      return true;
    },

    purgeUndefinedSessions: function() {
      const sessions = getCachedSessions();
      const cleanSessions = sessions.filter(s => this.isDefinedSession(s));
      if (cleanSessions.length !== sessions.length) {
        saveCachedSessions(cleanSessions);
      }
      return cleanSessions;
    },

    deleteSession: function(sessionId) {
      this.requireAdminAuth();
      if (!sessionId) return { success: false };
      const sessions = getCachedSessions().filter(s => s.id !== sessionId);
      saveCachedSessions(sessions);
      const db = getDb();
      if (db) {
        db.collection('sessions').doc(sessionId).delete().catch(console.error);
      }
      window.dispatchEvent(new CustomEvent('skillshare_session_updated', { detail: { sessionId } }));
      return { success: true };
    },

    getAllSessionsForAdmin: function() {
      this.requireAdminAuth();
      const sessions = this.purgeUndefinedSessions();
      const profiles = getCachedProfiles();
      const users = getCachedUsers();

      const list = [];
      for (const s of sessions) {
        if (!this.isDefinedSession(s)) continue;

        const u1Email = (s.user1 || s.user1Email || '').toLowerCase();
        const u2Email = (s.user2 || s.user2Email || '').toLowerCase();

        const u1Prof = profiles[u1Email] || (users[u1Email] ? { name: users[u1Email].name } : null);
        const u2Prof = profiles[u2Email] || (users[u2Email] ? { name: users[u2Email].name } : null);
        
        const u1Name = (u1Prof && u1Prof.name && u1Prof.name !== 'undefined') ? u1Prof.name : (u1Email && u1Email !== 'undefined' ? u1Email.split('@')[0] : '');
        const u2Name = (u2Prof && u2Prof.name && u2Prof.name !== 'undefined') ? u2Prof.name : (u2Email && u2Email !== 'undefined' ? u2Email.split('@')[0] : '');

        if (!u1Email || u1Email === 'undefined' || !u2Email || u2Email === 'undefined') continue;

        const completedSet = new Set((s.completedBy || []).map(e => (e || '').toLowerCase()));
        if (s.user1Completed || s[u1Email + '_completed']) completedSet.add(u1Email);
        if (s.user2Completed || s[u2Email + '_completed']) completedSet.add(u2Email);

        const statusUpper = (s.status || '').toUpperCase();
        const isCompleted = statusUpper === 'COMPLETED' || completedSet.size >= 2;
        const completedCount = isCompleted ? 2 : completedSet.size;

        list.push({
          id: s.id,
          user1Email: u1Email,
          user1Name: u1Name || u1Email.split('@')[0],
          user2Email: u2Email,
          user2Name: u2Name || u2Email.split('@')[0],
          proposedSlot: s.proposedSlot || 'Flexible',
          status: isCompleted ? 'COMPLETED' : 'active',
          completedCount: completedCount,
          completedBy: Array.from(completedSet),
          createdAt: s.createdAt || new Date().toISOString(),
          completedAt: isCompleted ? (s.completedAt || new Date().toISOString()) : null
        });
      }

      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return list;
    },

    getAdminMetrics: function() {
      this.requireAdminAuth();
      const users = getCachedUsers();
      const userList = Object.values(users);

      const totalUsers = userList.length;
      const verifiedUsers = userList.filter(u => u.isVerified).length;
      const pendingUsers = userList.filter(u => !u.isVerified).length;
      const blockedUsers = userList.filter(u => u.accountStatus === 'blocked').length;

      const sessions = this.purgeUndefinedSessions();
      const totalSessions = sessions.length;
      const successfulSessions = sessions.filter(s => {
        const statusUpper = (s.status || '').toUpperCase();
        return (statusUpper === 'COMPLETED' || statusUpper === 'SUCCESSFUL') || (s.completedBy || []).length >= 2;
      }).length;
      const activeSessions = totalSessions - successfulSessions;
      const conversionRate = totalSessions > 0 ? ((successfulSessions / totalSessions) * 100).toFixed(1) + '%' : '0.0%';

      return {
        totalUsers,
        verifiedUsers,
        pendingUsers,
        blockedUsers,
        totalSessions,
        activeSessions,
        successfulSessions,
        conversionRate
      };
    },

    // Cache Helpers
    getCachedUsers: getCachedUsers,
    saveCachedUsers: saveCachedUsers,
    getCachedProfiles: getCachedProfiles,
    saveCachedProfiles: saveCachedProfiles,
    getCachedSessions: getCachedSessions,
    saveCachedSessions: saveCachedSessions,

    // Cloud Firestore Force Sync (Reconciles Local Storage Cache with Firestore)
    syncWithFirestore: async function() {
      const db = getDb();
      if (!db) return;
      try {
        const usersSnap = await db.collection('users').get();
        const users = getCachedUsers();
        const profiles = getCachedProfiles();

        usersSnap.forEach(doc => {
          const data = doc.data();
          const email = (data.email || (doc.id.includes('@') ? doc.id : '')).toLowerCase();
          const uid = data.uid || doc.id;
          if (!email || data.accountStatus === 'deleted') return;

          const existingProf = profiles[email] || {};
          const hasDataSkills = (data.teachSkills && data.teachSkills.length > 0) || (data.learnSkills && data.learnSkills.length > 0) || (data.availability && data.availability.length > 0);
          const hasExistingSkills = (existingProf.teachSkills && existingProf.teachSkills.length > 0) || (existingProf.learnSkills && existingProf.learnSkills.length > 0) || (existingProf.availability && existingProf.availability.length > 0);

          users[email] = {
            uid: uid || existingProf.uid || email,
            userId: uid || existingProf.uid || email,
            name: data.name || (users[email] && users[email].name) || email.split('@')[0],
            email: email,
            password: data.password || (users[email] && users[email].password) || '',
            isVerified: data.isVerified !== false,
            accountStatus: data.accountStatus || (users[email] && users[email].accountStatus) || 'approved',
            createdAt: data.createdAt || (users[email] && users[email].createdAt) || new Date().toISOString()
          };

          const teachSkills = hasDataSkills ? (data.teachSkills || []) : (hasExistingSkills ? existingProf.teachSkills : (data.teachSkills || []));
          const learnSkills = hasDataSkills ? (data.learnSkills || []) : (hasExistingSkills ? existingProf.learnSkills : (data.learnSkills || []));
          const availability = hasDataSkills ? (data.availability || []) : (hasExistingSkills ? existingProf.availability : (data.availability || []));

          profiles[email] = {
            uid: uid || existingProf.uid || email,
            email: email,
            name: data.name || existingProf.name || email.split('@')[0],
            role: data.role || existingProf.role || 'Skill Explorer',
            bio: (data.bio !== undefined && data.bio !== '') ? data.bio : (existingProf.bio || ''),
            teachSkills: teachSkills,
            learnSkills: learnSkills,
            availability: availability,
            updatedAt: data.updatedAt || existingProf.updatedAt || new Date().toISOString()
          };
        });

        saveCachedUsers(users);
        saveCachedProfiles(profiles);

        // Sync sessions
        const sessSnap = await db.collection('sessions').get();
        const currentSessions = [];
        const currentRequests = [];
        sessSnap.forEach(doc => {
          const data = doc.data();
          if (!this.isDefinedSession(data)) return;
          if ((data.status || '').toLowerCase() === 'pending') {
            currentRequests.push(data);
          } else {
            currentSessions.push(data);
          }
        });
        saveCachedSessions(currentSessions);
        saveCachedSessionRequests(currentRequests);

        window.dispatchEvent(new CustomEvent('skillshare_user_status_changed', { detail: {} }));
        window.dispatchEvent(new CustomEvent('skillshare_session_updated', { detail: {} }));
      } catch (err) {
        console.warn('syncWithFirestore notice:', err);
      }
    },

    isUserDeleted: isUserDeleted
  };

  window.SkillSwapStore = SkillSwapStore;
  window.SkillShareStore = SkillSwapStore;
})();
