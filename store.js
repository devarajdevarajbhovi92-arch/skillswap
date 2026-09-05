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

    // 1. Listen to Users Collection
    db.collection('users').onSnapshot((snapshot) => {
      const users = getCachedUsers();
      const profiles = getCachedProfiles();

      snapshot.forEach(doc => {
        const data = doc.data();
        const email = (data.email || doc.id).toLowerCase();
        users[email] = {
          name: data.name || email.split('@')[0],
          email: email,
          password: data.password || '',
          isVerified: data.isVerified !== false,
          accountStatus: data.accountStatus || 'approved',
          createdAt: data.createdAt || new Date().toISOString()
        };

        profiles[email] = {
          email: email,
          name: data.name || email.split('@')[0],
          role: data.role || 'Skill Explorer',
          bio: data.bio || '',
          teachSkills: data.teachSkills || [],
          learnSkills: data.learnSkills || [],
          availability: data.availability || [],
          updatedAt: data.updatedAt || new Date().toISOString()
        };
      });

      saveCachedUsers(users);
      saveCachedProfiles(profiles);
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
        if (sess) return sess.trim().toLowerCase();
      } catch (e) {}

      const auth = getAuth();
      if (auth && auth.currentUser && auth.currentUser.email) {
        return auth.currentUser.email.toLowerCase();
      }

      try {
        const local = localStorage.getItem(SESSION_KEY);
        if (local) return local.trim().toLowerCase();
      } catch (e) {}

      return null;
    },

    getCurrentUser: function(callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email) return null;
      const users = getCachedUsers();
      if (users[email]) return users[email];
      const profiles = getCachedProfiles();
      if (profiles[email]) {
        return {
          email: email,
          name: profiles[email].name || email.split('@')[0],
          accountStatus: 'approved',
          isVerified: true
        };
      }
      return {
        email: email,
        name: email.split('@')[0],
        accountStatus: 'approved',
        isVerified: true
      };
    },

    getCurrentProfile: function(callerEmail) {
      const email = (callerEmail || this.getCurrentSession() || '').toLowerCase();
      if (!email) return null;
      const profiles = getCachedProfiles();
      if (profiles[email]) return profiles[email];
      return {
        email: email,
        name: email.split('@')[0],
        role: 'Skill Explorer',
        bio: '',
        teachSkills: [],
        learnSkills: [],
        availability: []
      };
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
      const users = getCachedUsers();

      if (users[cleanEmail]) {
        return { success: false, message: 'An account with this email already exists. Please Log In.' };
      }

      const newUser = {
        name: name.trim(),
        email: cleanEmail,
        password: password,
        isVerified: true,
        accountStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      // Optimistic save
      users[cleanEmail] = newUser;
      saveCachedUsers(users);
      localStorage.setItem(SESSION_KEY, cleanEmail);
      try { sessionStorage.setItem(SESSION_KEY, cleanEmail); } catch (e) {}

      // Cloud Firebase Register
      const auth = getAuth();
      const db = getDb();
      if (auth) {
        try {
          const cred = await auth.createUserWithEmailAndPassword(cleanEmail, password);
          if (cred && cred.user) {
            await cred.user.updateProfile({ displayName: name.trim() });
            newUser.uid = cred.user.uid;
          }
        } catch (err) {
          if (err.code === 'auth/email-already-in-use') {
            try {
              await auth.signInWithEmailAndPassword(cleanEmail, password);
            } catch (e) {
              return { success: false, message: 'This email is already registered in Firebase. Please log in.' };
            }
          } else {
            console.error('Firebase Auth Register Error:', err);
            return { success: false, message: err.message || 'Could not register account.' };
          }
        }
      }

      if (db) {
        try {
          await db.collection('users').doc(cleanEmail).set({
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
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (dbErr) {
          console.warn('Firestore write notice:', dbErr);
        }
      }

      return { success: true, requiresVerification: false, user: newUser, hasProfile: false };
    },

    authenticateUser: async function(email, password) {
      const cleanEmail = email.trim().toLowerCase();
      const users = getCachedUsers();

      // Cloud Firebase Login
      const auth = getAuth();
      const db = getDb();

      if (auth) {
        try {
          await auth.signInWithEmailAndPassword(cleanEmail, password);
        } catch (err) {
          // If user exists in local cache with matching password, fallback or report error
          if (users[cleanEmail] && users[cleanEmail].password === password) {
            // Attempt to create user in Firebase Auth
            try {
              await auth.createUserWithEmailAndPassword(cleanEmail, password);
            } catch (e) {}
          } else {
            return { success: false, message: err.message || 'Invalid email or password.' };
          }
        }
      }

      // Check account status in Firestore or cache
      let userDoc = null;
      if (db) {
        try {
          const doc = await db.collection('users').doc(cleanEmail).get();
          if (doc.exists) {
            userDoc = doc.data();
          }
        } catch (e) {}
      }

      if (userDoc && userDoc.accountStatus === 'blocked') {
        return { success: false, message: 'Your account has been blocked by the administrator. Please contact support.' };
      }

      const user = users[cleanEmail] || {
        name: (userDoc && userDoc.name) || cleanEmail.split('@')[0],
        email: cleanEmail,
        isVerified: true,
        accountStatus: (userDoc && userDoc.accountStatus) || 'approved',
        createdAt: (userDoc && userDoc.createdAt) || new Date().toISOString()
      };

      if (user.accountStatus === 'blocked') {
        return { success: false, message: 'Your account has been blocked by the administrator. Please contact support.' };
      }

      users[cleanEmail] = user;
      saveCachedUsers(users);
      localStorage.setItem(SESSION_KEY, cleanEmail);
      try { sessionStorage.setItem(SESSION_KEY, cleanEmail); } catch (e) {}

      const profiles = getCachedProfiles();
      const hasProfile = !!profiles[cleanEmail] || (userDoc && userDoc.teachSkills && userDoc.teachSkills.length > 0);

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

      // Cloud Firestore sync
      const db = getDb();
      if (db) {
        try {
          await db.collection('users').doc(email).set({
            name: updatedProfile.name,
            role: updatedProfile.role,
            bio: updatedProfile.bio,
            teachSkills: updatedProfile.teachSkills,
            learnSkills: updatedProfile.learnSkills,
            availability: updatedProfile.availability,
            updatedAt: updatedProfile.updatedAt
          }, { merge: true });
        } catch (err) {
          console.error('Firestore saveProfile Error:', err);
        }
      }

      return { success: true, profile: updatedProfile };
    },

    // Logout
    logout: function() {
      localStorage.removeItem(SESSION_KEY);
      const auth = getAuth();
      if (auth) auth.signOut().catch(() => {});
      window.location.href = 'auth.html';
    },

    // Route Guard
    requireAuth: function() {
      const user = this.getCurrentUser();
      if (!user) {
        window.location.href = 'auth.html';
        return null;
      }
      if (user.accountStatus === 'blocked') {
        alert('Your account is currently blocked by an administrator.');
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
    getActiveSession: function(peerEmail) {
      const currentUser = this.getCurrentUser();
      if (!currentUser || !peerEmail) return null;

      const pairKey = getPairKey(currentUser.email, peerEmail);
      const sessions = getCachedSessions();
      return sessions.find(s => s.pairKey === pairKey && s.status === 'active') || null;
    },

    getPendingSessionRequest: function(peerEmail) {
      const currentUser = this.getCurrentUser();
      if (!currentUser || !peerEmail) return null;

      const pairKey = getPairKey(currentUser.email, peerEmail);
      const requests = getCachedSessionRequests();
      return requests.find(r => r.pairKey === pairKey && r.status === 'pending') || null;
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

    getPeerSessionNumber: function(sessionId, peerEmail) {
      const email = this.getCurrentSession();
      if (!email || !sessionId || !peerEmail) return 1;
      const pairKey = getPairKey(email, peerEmail);
      const sessions = getCachedSessions();
      
      const pairSessions = sessions.filter(s => s.pairKey === pairKey);
      pairSessions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      const idx = pairSessions.findIndex(s => s.id === sessionId);
      return idx !== -1 ? (idx + 1) : 1;
    },

    markSessionCompleted: function(peerEmail) {
      const currentUser = this.getCurrentUser();
      if (!currentUser) return { success: false, message: 'Not logged in.' };

      const myEmail = currentUser.email.toLowerCase();
      const activeSess = this.getActiveSession(peerEmail);
      if (!activeSess) return { success: false, message: 'No active session found.' };

      if (!activeSess.completedBy) activeSess.completedBy = [];

      if (!activeSess.completedBy.includes(myEmail)) {
        activeSess.completedBy.push(myEmail);
      }

      const sessNum = this.getPeerSessionNumber(activeSess.id, peerEmail);
      let isFullyCompleted = false;

      const db = getDb();

      if (activeSess.completedBy.length >= 2) {
        activeSess.status = 'COMPLETED';
        activeSess.completedAt = new Date().toISOString();
        isFullyCompleted = true;

        const myProf = this.getCurrentProfile();
        this.addNotification(
          peerEmail,
          'Exchange Completed Successfully!',
          `Both you and ${myProf ? myProf.name : 'your peer'} marked session #${sessNum} as completed!`,
          'success',
          { peerEmail: myEmail }
        );

        // Increment total completed count in Firestore
        if (db && firebase.firestore && firebase.firestore.FieldValue) {
          db.collection('users').doc(myEmail).update({
            totalSessionsCompleted: firebase.firestore.FieldValue.increment(1)
          }).catch(() => {});
          db.collection('users').doc(peerEmail.toLowerCase()).update({
            totalSessionsCompleted: firebase.firestore.FieldValue.increment(1)
          }).catch(() => {});
        }
      } else {
        const myProf = this.getCurrentProfile();
        this.addNotification(
          peerEmail,
          'Session Marked Completed',
          `${myProf ? myProf.name : 'Your peer'} marked session #${sessNum} as completed! Click complete to finalize.`,
          'info',
          { peerEmail: myEmail }
        );
      }

      const sessions = getCachedSessions();
      const idx = sessions.findIndex(s => s.id === activeSess.id);
      if (idx !== -1) {
        sessions[idx] = activeSess;
        saveCachedSessions(sessions);
      }

      if (db) {
        db.collection('sessions').doc(activeSess.id).set(activeSess, { merge: true }).catch(console.error);
      }

      window.dispatchEvent(new CustomEvent('skillshare_session_updated', { detail: { peerEmail, session: activeSess } }));
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
        const completedBy = (s.completedBy || []).map(e => e.trim().toLowerCase());
        const bothClickedComplete = completedBy.length >= 2 && completedBy.includes(u1) && completedBy.includes(u2);
        
        return isUserInSession && isCompletedStatus && bothClickedComplete;
      }).length;
    },

    // Admin APIs
    getAllUsersForAdmin: function() {
      this.requireAdminAuth();
      const users = getCachedUsers();
      const profiles = getCachedProfiles();

      const list = Object.values(users).map(u => {
        const email = u.email.toLowerCase();
        const prof = profiles[email] || {};
        return {
          name: u.name,
          email: email,
          userId: email,
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

    updateUserAccountStatus: function(email, newStatus) {
      this.requireAdminAuth();
      const cleanEmail = email.trim().toLowerCase();
      const users = getCachedUsers();

      if (users[cleanEmail]) {
        users[cleanEmail].accountStatus = newStatus;
        saveCachedUsers(users);
      }

      const db = getDb();
      if (db) {
        db.collection('users').doc(cleanEmail).update({ accountStatus: newStatus }).catch(console.error);
      }

      window.dispatchEvent(new CustomEvent('skillshare_user_status_changed', { detail: { email: cleanEmail, status: newStatus } }));
      return { success: true };
    },

    deleteUserAccount: function(email) {
      this.requireAdminAuth();
      const cleanEmail = email.trim().toLowerCase();
      const users = getCachedUsers();
      const profiles = getCachedProfiles();

      delete users[cleanEmail];
      saveCachedUsers(users);

      delete profiles[cleanEmail];
      saveCachedProfiles(profiles);

      const db = getDb();
      if (db) {
        db.collection('users').doc(cleanEmail).delete().catch(console.error);
      }

      window.dispatchEvent(new CustomEvent('skillshare_user_deleted', { detail: { email: cleanEmail } }));
      return { success: true };
    },

    getAllSessionsForAdmin: function() {
      this.requireAdminAuth();
      const sessions = getCachedSessions();
      const profiles = getCachedProfiles();
      const users = getCachedUsers();

      const list = sessions.map(s => {
        const u1Prof = profiles[s.user1] || { name: users[s.user1] ? users[s.user1].name : s.user1 };
        const u2Prof = profiles[s.user2] || { name: users[s.user2] ? users[s.user2].name : s.user2 };
        
        const completedBy = s.completedBy || [];
        const completedCount = completedBy.length;
        const isCompleted = completedCount >= 2 || (s.status || '').toUpperCase() === 'COMPLETED';

        return {
          id: s.id,
          user1Email: s.user1,
          user1Name: u1Prof.name,
          user2Email: s.user2,
          user2Name: u2Prof.name,
          proposedSlot: s.proposedSlot || 'Flexible',
          status: isCompleted ? 'COMPLETED' : 'active',
          completedCount: completedCount,
          completedBy: completedBy,
          createdAt: s.createdAt,
          completedAt: isCompleted ? (s.completedAt || new Date().toISOString()) : null
        };
      });

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

      const sessions = getCachedSessions();
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

    // Cloud Firestore Force Sync
    syncWithFirestore: async function() {
      const db = getDb();
      if (!db) return;
      try {
        const usersSnap = await db.collection('users').get();
        const users = getCachedUsers();
        const profiles = getCachedProfiles();

        usersSnap.forEach(doc => {
          const data = doc.data();
          const email = (data.email || doc.id).toLowerCase();
          users[email] = {
            name: data.name || email.split('@')[0],
            email: email,
            password: data.password || '',
            isVerified: data.isVerified !== false,
            accountStatus: data.accountStatus || 'approved',
            createdAt: data.createdAt || new Date().toISOString()
          };

          profiles[email] = {
            email: email,
            name: data.name || email.split('@')[0],
            role: data.role || 'Skill Explorer',
            bio: data.bio || '',
            teachSkills: data.teachSkills || [],
            learnSkills: data.learnSkills || [],
            availability: data.availability || [],
            updatedAt: data.updatedAt || new Date().toISOString()
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
          if (data.status === 'pending') {
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
    }
  };

  window.SkillSwapStore = SkillSwapStore;
  window.SkillShareStore = SkillSwapStore;
})();
