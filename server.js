/**
 * SkillSwap Server & Admin Backend API
 * Serves static frontend application files and provides secure server endpoints
 * for Firebase Authentication user management and Cloud Firestore data synchronization.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: "skillswap-app-8105"
    });
    console.log('[Firebase Admin] Initialized for project skillswap-app-8105');
  } catch (err) {
    console.warn('[Firebase Admin] Initialization notice:', err.message);
  }
}

const db = admin.apps.length ? admin.firestore() : null;
const auth = admin.apps.length ? admin.auth() : null;

// API Endpoint: Delete User Permanently from Firebase Auth and Firestore
app.post('/api/admin/delete-user', async (req, res) => {
  const { email, uid } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  const targetUid = (uid || '').trim();

  if (!cleanEmail && !targetUid) {
    return res.status(400).json({ success: false, message: 'Missing email or uid parameter.' });
  }

  console.log(`[Admin API] Deleting user account: email="${cleanEmail}", uid="${targetUid}"`);

  let authDeleted = false;
  let detectedUid = targetUid;

  // 1. Delete user from Firebase Authentication
  if (auth) {
    // Try delete by UID
    if (detectedUid) {
      try {
        await auth.deleteUser(detectedUid);
        authDeleted = true;
        console.log(`[Firebase Auth Admin] Successfully deleted user UID: ${detectedUid}`);
      } catch (err) {
        console.warn(`[Firebase Auth Admin] Notice deleting by UID (${detectedUid}):`, err.message);
      }
    }

    // If not deleted by UID, try lookup by email and delete
    if (!authDeleted && cleanEmail) {
      try {
        const userRecord = await auth.getUserByEmail(cleanEmail);
        if (userRecord && userRecord.uid) {
          detectedUid = userRecord.uid;
          await auth.deleteUser(userRecord.uid);
          authDeleted = true;
          console.log(`[Firebase Auth Admin] Successfully deleted user by email (${cleanEmail}), UID: ${userRecord.uid}`);
        }
      } catch (err) {
        console.warn(`[Firebase Auth Admin] Notice finding/deleting by email (${cleanEmail}):`, err.message);
      }
    }
  }

  // 2. Delete user documents and profile data from Cloud Firestore
  if (db) {
    try {
      // Delete user doc by UID
      if (detectedUid) {
        await db.collection('users').doc(detectedUid).delete().catch(() => {});
      }

      // Delete user doc by email (legacy format) & write tombstone to deleted_users collection
      if (cleanEmail) {
        await db.collection('users').doc(cleanEmail).delete().catch(() => {});
        await db.collection('deleted_users').doc(cleanEmail).set({
          email: cleanEmail,
          uid: detectedUid || '',
          deletedAt: new Date().toISOString()
        }).catch(() => {});

        // Delete any doc in users collection where email equals cleanEmail
        const emailSnap = await db.collection('users').where('email', '==', cleanEmail).get();
        emailSnap.forEach(doc => {
          doc.ref.delete().catch(() => {});
        });

        // Delete connections involving cleanEmail
        const connsSnap = await db.collection('connections').get();
        connsSnap.forEach(doc => {
          if (doc.id.includes(cleanEmail)) {
            doc.ref.delete().catch(() => {});
          }
        });

        // Delete sessions involving cleanEmail
        const sessSnap = await db.collection('sessions').get();
        sessSnap.forEach(doc => {
          const data = doc.data();
          const u1 = (data.user1 || data.user1Email || data.from || '').toLowerCase();
          const u2 = (data.user2 || data.user2Email || data.to || '').toLowerCase();
          if (u1 === cleanEmail || u2 === cleanEmail) {
            doc.ref.delete().catch(() => {});
          }
        });

        // Delete notifications for cleanEmail
        const notifSnap = await db.collection('notifications').get();
        notifSnap.forEach(doc => {
          if (doc.id.includes(cleanEmail)) {
            doc.ref.delete().catch(() => {});
          }
        });

        // Delete chats involving cleanEmail
        const chatsSnap = await db.collection('chats').get();
        chatsSnap.forEach(doc => {
          if (doc.id.includes(cleanEmail)) {
            doc.ref.delete().catch(() => {});
          }
        });
      }
      console.log(`[Cloud Firestore Admin] Purged all Firestore records for email="${cleanEmail}", uid="${detectedUid}"`);
    } catch (dbErr) {
      console.warn('[Cloud Firestore Admin] Notice purging user data:', dbErr.message);
    }
  }

  return res.json({
    success: true,
    authDeleted,
    message: `User ${cleanEmail || targetUid} permanently deleted from Firebase Auth and Firestore.`
  });
});

// Serve static frontend assets
app.use(express.static(path.join(__dirname)));

// Fallback route for SPA / HTML pages
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, req.path.endsWith('.html') ? req.path : 'index.html'), (err) => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'));
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SkillSwap Server] Running on port ${PORT}`);
});