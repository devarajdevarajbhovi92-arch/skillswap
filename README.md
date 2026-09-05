# SkillSwap 🤝

A decentralized peer-to-peer skill-sharing web platform where individuals swap knowledge, connect via real-time chat, conduct collaborative sessions, and track verified skill exchanges.

🌐 **Live Web Application:** [https://skillswap-app-8105.web.app](https://skillswap-app-8105.web.app)

---

## 🚀 Key Features

- **Personalized Skill Profiles**: Showcase what you can teach and what you want to learn, along with your bio and availability schedule.
- **Smart Matching Engine**: Automatically calculates compatibility scores and identifies high-priority **2-Way Direct Swaps** (where User A teaches what User B wants, and User B teaches what User A wants).
- **Two-Way Agreement Lock**: Strict mutual consent protocol—both peers must explicitly select **YES** before chat, session requests, and attachment sharing are unlocked.
- **Real-Time Synchronized Chat**: Direct subcollection synchronization powered by Google Cloud Firestore with zero lag and automatic multi-tab session isolation.
- **Smart Meeting Link Detection**: Paste any Google Meet, Zoom, Microsoft Teams, or Calendly link and SkillSwap automatically detects it to propose an interactive **SkillSwap Session**.
- **Double-Blind Session Completion**: Both members confirm session completion to verify the exchange and permanently update public session counters.
- **Rich Attachments**: Share images with built-in lightbox preview, documents/PDFs, and formatted hyperlinks.
- **Clear Chat History**: Integrated 1-click chat clearing that permanently cleans up conversations across both users' screens and cloud database records.
- **Master Admin Portal**: Secure administration dashboard (`/admin-auth.html`) with real-time user management, platform-wide metrics, and moderation controls.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), Semantic HTML5, Custom Responsive CSS3
- **Design System**: Warm Sand Linen & Charcoal Olive theme with fluid micro-interactions
- **Backend & Database**: Google Cloud Firestore (NoSQL Real-Time Database)
- **Authentication**: Firebase Authentication (Email/Password)
- **Storage**: Firebase Cloud Storage
- **Hosting**: Firebase Hosting (Global CDN, SSL/TLS enabled)

---

## 📂 Project Structure

```
skillswap/
├── index.html            # Landing page with feature highlights & call to action
├── auth.html             # Login, account registration & verification
├── auth.js               # Authentication controller & validation logic
├── profile.html          # Profile builder & skill preference settings
├── profile.js            # Profile setup and editing logic
├── dashboard.html        # Main dashboard, matchmaking feed & chat modal
├── dashboard.js          # Dashboard controller, match algorithm, chat UI
├── admin-auth.html       # Master admin login portal
├── admin-auth.js         # Admin authorization & credential checking
├── admin.html            # Admin dashboard with user moderation & stats
├── admin.js              # Admin controller & real-time Firestore sync
├── store.js              # Centralized data store, Firestore subscriptions & local cache
├── styles.css            # Complete design system tokens & styling
├── firebase-config.js    # Firebase SDK initialization
├── firestore.rules       # Cloud Firestore security rules
├── storage.rules         # Cloud Storage security rules
├── firebase.json         # Firebase hosting & service configurations
└── .firebaserc           # Firebase project target definition
```

---

## 💻 Local Setup & Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Megharajvsaka/skillswap.git
   cd skillswap
   ```

2. **Serve locally:**
   You can use any local HTTP server (such as Live Server in VS Code, `npx serve`, or Python's HTTP server):
   ```bash
   python -m http.server 8000
   ```
   Open your browser at `http://localhost:8000`.

3. **Deploy changes:**
   ```bash
   npx firebase-tools deploy --only hosting
   ```

---

## 🛡️ License

This project is licensed under the MIT License - feel free to use and adapt for your skill-sharing communities!
