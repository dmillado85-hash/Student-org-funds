# QR Class Attendance System

One QR code per class session. Students scan it and are marked present — no accounts, no passwords.
Built with plain HTML, CSS and JavaScript, with **Firebase Firestore** as the real-time database.

```
index.html     student page (opened by scanning the QR)
teacher.html   teacher dashboard (PIN protected)
style.css      shared styles
app.js         all logic + your Firebase config
```

---

## 1. Set up Firebase (free, ~5 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** (turn Google Analytics off, it's not needed).
2. In the project: **Build → Firestore Database → Create database**. Choose **Production mode** and a region near you.
3. Open the **Rules** tab, paste the rules below, and **Publish**.
4. Go to **Project settings (gear icon) → General → Your apps → Web (`</>`)**. Register an app (skip Hosting). Copy the `firebaseConfig` values.
5. Open `app.js` and paste them into `firebaseConfig` at the top of the file.

### Firestore rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sid} {
      allow read, write: if true;
      match /attendance/{aid} {
        allow read, write: if true;
      }
    }
    match /classes/{cid}  { allow read, write: if true; }
    match /settings/{doc} { allow read, write: if true; }
  }
}
```

> **Security note (please read):** students have no login, so the database cannot tell a student from the teacher. The teacher PIN keeps students out of the *dashboard*, but someone technical could still talk to the database directly. That is fine for a normal classroom, not for high-stakes attendance (graded exams, payroll). To lock it down properly, add Firebase Authentication (email/password) for the teacher, replace the PIN screen with that login, and change the rules so `classes`, `settings` and session writes require `request.auth != null`, while `attendance` allows only `create` and `get` for everyone.

---

## 2. Deploy for free

Students need a public **https** address. Any of these works, all free:

**Option A – Netlify Drop (fastest, no account setup)**
1. Put the four files in one folder.
2. Open <https://app.netlify.com/drop> and drag the folder onto the page.
3. You get an address like `https://random-name.netlify.app`. Your pages are `/index.html` and `/teacher.html`.

**Option B – GitHub Pages**
1. Create a GitHub repository and upload the four files.
2. **Settings → Pages → Deploy from a branch → main / (root) → Save**.
3. After a minute: `https://YOURNAME.github.io/REPO/` (student) and `.../teacher.html` (teacher).

**Option C – Firebase Hosting**
```
npm install -g firebase-tools
firebase login
firebase init hosting     # public directory: your folder, single-page app: No
firebase deploy
```

**Option D – Cloudflare Pages / Vercel:** connect a repo or upload the folder; no build command needed.

---

## 3. How to use

**Teacher**
1. Open `teacher.html`, enter the PIN (default **1234**) and change it right away in **Settings**.
2. **+ New** to create a class (e.g. "IT 101"). Optionally paste your class list, one name per line — students not in the scan list will show as **Absent** (red).
3. Set the date and the **Late after** time, then **Create Session & Generate QR**.
4. Click **Show on Screen** to project the QR, or **Download QR** to print it. All students scan the same code.
5. Watch the list fill in live. Use search, **+ Add Student**, the status dropdown (Auto / Present / Late), **Delete** for duplicates, and **CSV / Excel / Print** to export.
6. **End Session** expires the QR instantly (students see "QR code expired"). **Reopen Session** turns it back on. **Clear Entries** wipes the list.
7. **History** lists every past session by date and class. Open one to view or export it.

**Student**
1. Scan the QR with the phone camera and tap the link.
2. First time only: enter full name, section and (optional) student number.
3. They see "Hi *Name*, You are marked PRESENT!". Next time, scanning marks them instantly with no typing.

---

## 4. Good to know

- **Late/Present is decided by the server timestamp** of the scan versus the cutoff, so editing the cutoff recalculates everyone.
- **Duplicates:** one entry per phone, and one per name (matching ignores case, punctuation and word order, so "Dela Cruz, Juan" equals "Juan Dela Cruz"). A second scan shows "Already marked present".
- **Typing a friend's name:** with no login, a student could check in for someone else. The teacher can spot and delete entries; the list shows time and section for each.
- **Testing on your own computer:** if you open `teacher.html` from `localhost`, set your public student address in **Settings → Student page address** so phones can open the QR link.
- **Free limits:** Firestore's free tier (about 50,000 reads and 20,000 writes per day) comfortably covers many classes per day.
- **Supabase instead of Firebase?** The data model is simple (`classes`, `sessions`, `attendance`, `settings`), so it ports easily to Supabase tables; only the database calls in `app.js` would change.