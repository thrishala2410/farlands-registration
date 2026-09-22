
function initHeroCountdown() {
  const days = document.getElementById('hero-cd-days');
  const hours = document.getElementById('hero-cd-hours');
  const mins = document.getElementById('hero-cd-mins');
  const secs = document.getElementById('hero-cd-secs');
  if (!days || !hours || !mins || !secs) return;

  // 14 October 2026, 09:00 IST
  const TARGET = new Date('2026-10-14T09:00:00+05:30');
  const pad = (n) => String(Math.max(0, n)).padStart(2, '0');

  function tick() {
    const diff = TARGET.getTime() - Date.now();
    if (diff <= 0) {
      days.textContent = '00';
      hours.textContent = '00';
      mins.textContent = '00';
      secs.textContent = '00';
      const label = document.querySelector('.hero-countdown-label');
      if (label) label.textContent = 'HACKATHON IS LIVE';
      return;
    }
    const total = Math.floor(diff / 1000);
    days.textContent = pad(Math.floor(total / 86400));
    hours.textContent = pad(Math.floor((total % 86400) / 3600));
    mins.textContent = pad(Math.floor((total % 3600) / 60));
    secs.textContent = pad(total % 60);
  }
  tick();
  setInterval(tick, 1000);
}

/**
 * Farlands Hackathon 2026 — Interactive JS
 * Covers: Countdown, FAQ accordion, Registration form, Nav state, Scroll animations.
 * The registration form POSTs to the Farlands backend at /api/registration.
 */

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Update this date to set the official hackathon kickoff time.
const HACKATHON_DATE = new Date('2026-10-25T09:00:00+05:30');

// ─── COUNTDOWN ────────────────────────────────────────────────────────────────
function initCountdown() {
  const days = document.getElementById('cd-days');
  const hours = document.getElementById('cd-hours');
  const mins = document.getElementById('cd-mins');
  const secs = document.getElementById('cd-secs');
  if (!days) return;

  function pad(n) { return String(Math.max(0, n)).padStart(2, '0'); }

  function tick() {
    const now = Date.now();
    const diff = HACKATHON_DATE.getTime() - now;

    if (diff <= 0) {
      days.textContent = '00'; hours.textContent = '00';
      mins.textContent = '00'; secs.textContent = '00';
      const label = document.querySelector('.countdown-label');
      if (label) label.textContent = 'HACKATHON IS LIVE!';
      return;
    }

    const totalSecs = Math.floor(diff / 1000);
    const d = Math.floor(totalSecs / 86400);
    const h = Math.floor((totalSecs % 86400) / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;

    days.textContent = pad(d);
    hours.textContent = pad(h);
    mins.textContent = pad(m);
    secs.textContent = pad(s);
  }

  tick();
  setInterval(tick, 1000);
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function initNav() {
  const nav = document.getElementById('hackathon-nav');
  const hackathonContent = document.getElementById('hackathon-content');
  if (!nav || !hackathonContent) return;

  // Show nav with solid bg only when hackathon content is visible
  const observer = new IntersectionObserver(
    (entries) => {
      const isVisible = entries[0].isIntersecting;
      nav.classList.toggle('nav-visible', isVisible);
    },
    { threshold: 0, rootMargin: '-64px 0px 0px 0px' }
  );
  observer.observe(hackathonContent);

  // Hamburger menu
  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('nav-mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open);
    });
    // Close on link click
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Smooth-scroll nav links
  nav.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ─── SCROLL ANIMATIONS ────────────────────────────────────────────────────────
function initScrollAnimations() {
  const elements = document.querySelectorAll('.fl-animate');
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  elements.forEach(el => observer.observe(el));
}

// ─── REGISTRATION FORM ────────────────────────────────────────────────────────
const MAX_TEAMMATES = 4;

function buildTeammateHTML(index) {
  const isLeader = index === 0;
  const label = isLeader ? 'TEAM LEADER' : `MEMBER ${index + 1}`;
  const canRemove = !isLeader;
  return `
    <div class="teammate-section fl-animate visible" id="teammate-${index}" data-index="${index}">
      <div class="teammate-header">
        <span class="teammate-title">${label}</span>
        ${canRemove ? `<button class="btn-remove" type="button" data-remove="${index}" aria-label="Remove teammate ${index + 1}">× Remove</button>` : ''}
      </div>
      <div class="teammate-fields">
        <div class="field-group">
          <label class="field-label" for="tm-name-${index}">FULL NAME${isLeader ? ' *' : ''}</label>
          <input class="field-input" id="tm-name-${index}" name="tm-name-${index}" type="text"
            placeholder="Enter full name" ${isLeader ? 'required' : ''} autocomplete="name">
        </div>
        <div class="field-group">
          <label class="field-label" for="tm-email-${index}">EMAIL${isLeader ? ' *' : ''}</label>
          <input class="field-input" id="tm-email-${index}" name="tm-email-${index}" type="email"
            placeholder="your@email.com" ${isLeader ? 'required' : ''} autocomplete="email">
        </div>
        <div class="field-group">
          <label class="field-label" for="tm-phone-${index}">PHONE *</label>
          <input class="field-input" id="tm-phone-${index}" name="tm-phone-${index}" type="tel"
            placeholder="+91 00000 00000" required autocomplete="tel">
        </div>
      </div>
    </div>
  `;
}

function initRegistration() {
  const formEl = document.getElementById('reg-form');
  const teammatesContainer = document.getElementById('teammates-container');
  const btnAdd = document.getElementById('btn-add-teammate');
  const btnSubmit = document.getElementById('btn-submit-reg');
  const countEl = document.getElementById('reg-count');
  const successEl = document.getElementById('reg-success');

  if (!formEl || !teammatesContainer) return;

  let count = 2;

  function updateCount() {
    if (countEl) countEl.textContent = `${count} of ${MAX_TEAMMATES} members`;
    if (btnAdd) btnAdd.disabled = count >= MAX_TEAMMATES;
  }

  function rebuildTeammates() {
    teammatesContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
      teammatesContainer.insertAdjacentHTML('beforeend', buildTeammateHTML(i));
    }
    // Re-attach remove listeners
    teammatesContainer.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.remove, 10);
        // Shift: remove this index, renumber
        count = Math.max(2, count - 1);
        rebuildTeammates();
        updateCount();
      });
    });
    updateCount();
  }

  // Initial render
  rebuildTeammates();

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      if (count < MAX_TEAMMATES) {
        count++;
        rebuildTeammates();
        // Smooth scroll to new section
        setTimeout(() => {
          const newSection = document.getElementById(`teammate-${count - 1}`);
          if (newSection) newSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }
    });
  }

  formEl.addEventListener('submit', async e => {
    e.preventDefault();
    // Clear previous errors
    formEl.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    formEl.querySelectorAll('.field-error-msg').forEach(el => el.remove());
    removeFormMessage();

    let valid = true;

    const teamName = document.getElementById('team-name')?.value?.trim();
    if (!teamName) {
      const inp = document.getElementById('team-name');
      if (inp) { inp.classList.add('field-error'); markError(inp, 'Team name is required.'); }
      valid = false;
    }

    if (count < 2) {
      valid = false;
      alert('Teams need at least 2 members: 1 team lead + at least 1 member.');
    }

    // Validate every teammate slot (index 0 is the team leader)
    for (let i = 0; i < count; i++) {
      const nameInp = document.getElementById(`tm-name-${i}`);
      const emailInp = document.getElementById(`tm-email-${i}`);
      if (nameInp && !nameInp.value.trim()) {
        nameInp.classList.add('field-error'); markError(nameInp, 'Full name is required.');
        valid = false;
      }
      if (emailInp) {
        const value = emailInp.value.trim();
        if (!value) {
          emailInp.classList.add('field-error'); markError(emailInp, 'Email is required.');
          valid = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          emailInp.classList.add('field-error'); markError(emailInp, 'Enter a valid email address.');
          valid = false;
        }
      }
      const phoneInp = document.getElementById(`tm-phone-${i}`);
      if (phoneInp) {
        const phone = phoneInp.value.trim().replace(/[\s-]/g, '');
        if (!phone) {
          phoneInp.classList.add('field-error'); markError(phoneInp, 'Phone number is required.');
          valid = false;
        } else if (!/^\+?[0-9]{10,15}$/.test(phone)) {
          phoneInp.classList.add('field-error'); markError(phoneInp, 'Enter a valid phone (10–15 digits).');
          valid = false;
        }
      }
    }

    if (!valid) {
      formEl.querySelector('.field-error')?.focus();
      return;
    }

    // Collect data
    const payload = {
      teamName,
      teammates: Array.from({ length: count }, (_, i) => ({
        name: document.getElementById(`tm-name-${i}`)?.value?.trim() || '',
        email: document.getElementById(`tm-email-${i}`)?.value?.trim() || '',
        phone: document.getElementById(`tm-phone-${i}`)?.value?.trim() || '',
      })),
      submittedAt: new Date().toISOString(),
    };

    // ── SUBMIT TO BACKEND ──────────────────────────────────────────────────────
    setSubmitting(true);
    try {
      const response = await fetch('/api/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = 'Registration could not be completed. Please try again.';
        if (response.status === 429) {
          message = 'Too many attempts from this device. Please wait a few minutes before trying again.';
        } else {
          try {
            const data = await response.json();
            if (data && typeof data.error === 'string') message = data.error;
          } catch { /* keep default message */ }
        }
        showFormMessage(message);
        setSubmitting(false);
        return;
      }

      let result = null;
      try {
        result = await response.json();
      } catch { /* optional body */ }

      const teamId =
        result?.team?.teamId ||
        result?.registration?.teamId ||
        result?.registration?.registrationNumber ||
        null;

      // Show success state with Team ID + payment CTA
      if (successEl) {
        formEl.style.display = 'none';
        const teamIdEl = document.getElementById('reg-team-id-value');
        if (teamIdEl && teamId) teamIdEl.textContent = teamId;
        if (teamId) {
          try {
            sessionStorage.setItem('farlands_team_id', teamId);
          } catch { /* ignore */ }
        }
        successEl.classList.add('visible');
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) {
      showFormMessage('Network error. Please check your connection and try again. Is the API server running on port 3000?');
      setSubmitting(false);
    }
  });
}

function setSubmitting(submitting) {
  const btnSubmit = document.getElementById('btn-submit-reg');
  if (!btnSubmit) return;
  btnSubmit.disabled = submitting;
  btnSubmit.textContent = submitting ? 'Registering Squad…' : 'Register Squad Now →';
}

function showFormMessage(message) {
  removeFormMessage();
  const msg = document.createElement('p');
  msg.className = 'reg-error';
  msg.setAttribute('role', 'alert');
  msg.textContent = message;
  document.querySelector('.reg-actions')?.after(msg);
}

function removeFormMessage() {
  document.querySelectorAll('.reg-error').forEach(el => el.remove());
}

function markError(input, message) {
  const msg = document.createElement('span');
  msg.className = 'field-error-msg';
  msg.textContent = message;
  input.parentNode?.appendChild(msg);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCountdown();
  initNav();
  initScrollAnimations();
  initHeroCountdown();
  initRegistration();
});
