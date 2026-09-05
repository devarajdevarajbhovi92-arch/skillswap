/**
 * Firebase SDK Configuration for SkillSwap
 * Connects directly to Google Firebase backend:
 * - Authentication (Email/Password)
 * - Cloud Firestore Realtime Database
 * - Firebase Cloud Storage
 */

const firebaseConfig = {
  projectId: "skillswap-app-8105",
  appId: "1:698760350704:web:74cacf651747ead8b66b35",
  storageBucket: "skillswap-app-8105.firebasestorage.app",
  apiKey: "AIzaSyCcleYg_e7oTkfW7IZpm6Ps0eSq0DyvrcY",
  authDomain: "skillswap-app-8105.firebaseapp.com",
  messagingSenderId: "698760350704"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  window.firebaseAuth = firebase.auth();
  window.firebaseDb = firebase.firestore();
  if (typeof firebase.storage === 'function') {
    window.firebaseStorage = firebase.storage();
  }
}
