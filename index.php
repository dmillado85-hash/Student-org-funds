<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#16a34a">
  <title>Class Attendance</title>
  <link rel="stylesheet" href="style.css">
</head>
<body data-page="student" class="student-bg">
  <main class="wrap">
    <header class="brand">
      <span class="logo">✓</span>
      <div>
        <h1>Class Attendance</h1>
        <p>Scan the class QR code to check in</p>
      </div>
    </header>

    <!-- Loading -->
    <section id="screen-loading" class="screen card center">
      <div class="spinner"></div>
      <p class="muted">Checking your attendance…</p>
    </section>

    <!-- Home (opened without a session link) -->
    <section id="screen-home" class="screen card center hidden">
      <div class="icon-circle info">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/></svg>
      </div>
      <h2>Ready to scan</h2>
      <p class="muted">Open your phone camera and scan the QR code your teacher is showing. You'll be marked present automatically.</p>
      <div id="home-profile" class="profile-chip hidden"></div>
      <div class="stack">
        <button id="btn-edit-profile" class="btn secondary" type="button">Edit my details</button>
        <button id="btn-forget" class="link" type="button">Not you? Remove saved details</button>
      </div>
    </section>

    <!-- Register (first time only) -->
    <section id="screen-register" class="screen card hidden">
      <h2 id="reg-title">Welcome! Tell us who you are</h2>
      <p class="muted" id="reg-sub">You only need to do this once. Your details are saved on this phone.</p>
      <form id="reg-form" novalidate autocomplete="on">
        <label>Full Name
          <input id="reg-name" name="name" type="text" placeholder="e.g. Juan Dela Cruz" autocomplete="name" maxlength="80" required>
        </label>
        <label>Section
          <input id="reg-section" name="section" type="text" placeholder="e.g. BSIT 1A" maxlength="30" required>
        </label>
        <label>Student Number <span class="optional">(optional)</span>
          <input id="reg-no" name="studentNo" type="text" placeholder="e.g. 2026-00123" maxlength="30" inputmode="text">
        </label>
        <p id="reg-error" class="form-error hidden"></p>
        <button id="reg-submit" class="btn primary" type="submit">Save &amp; Mark Present</button>
        <button id="reg-cancel" class="link hidden" type="button">Cancel</button>
      </form>
    </section>

    <!-- Success -->
    <section id="screen-success" class="screen card result center hidden">
      <div id="ok-icon" class="icon-circle present">
        <svg id="ok-svg" viewBox="0 0 52 52" class="check" aria-hidden="true">
          <circle class="check-circle" cx="26" cy="26" r="24" fill="none"/>
          <path class="check-mark" fill="none" d="M14 27l8 8 16-17"/>
        </svg>
      </div>
      <p class="hi" id="ok-greeting"></p>
      <h2 id="ok-status" class="status-text"></h2>
      <dl class="facts">
        <div><dt>Time</dt><dd id="ok-time"></dd></div>
        <div><dt>Section</dt><dd id="ok-section"></dd></div>
        <div><dt>Class</dt><dd id="ok-session"></dd></div>
      </dl>
      <button class="link btn-notyou" type="button">Not you? Use different details</button>
    </section>

    <!-- Already marked -->
    <section id="screen-already" class="screen card result center hidden">
      <div class="icon-circle info">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7.5v.01"/></svg>
      </div>
      <p class="hi" id="al-greeting"></p>
      <h2>Already marked present</h2>
      <p class="muted" id="al-detail"></p>
      <p class="muted small">No need to scan again — you're all set.</p>
      <button class="link btn-notyou" type="button">Not you? Use different details</button>
    </section>

    <!-- Expired -->
    <section id="screen-expired" class="screen card result center hidden">
      <div class="icon-circle absent">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </div>
      <h2>QR code expired</h2>
      <p class="muted" id="ex-msg"></p>
      <p class="muted small">Ask your teacher to show a new or active QR code.</p>
    </section>

    <!-- Error -->
    <section id="screen-error" class="screen card result center hidden">
      <div class="icon-circle late">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17v.01"/></svg>
      </div>
      <h2>Something went wrong</h2>
      <p class="muted" id="er-msg"></p>
      <button id="er-retry" class="btn secondary" type="button">Try again</button>
    </section>
  </main>

  <div id="toasts"></div>

  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
  <script src="app.js"></script>
</body>
</html>