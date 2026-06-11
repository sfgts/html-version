// Shared navigation and scroll controls across all pages.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('img').forEach(function (image) {
    image.draggable = false;
  });

  document.addEventListener('contextmenu', function (event) {
    if (event.target.closest('img')) event.preventDefault();
  });

  document.addEventListener('dragstart', function (event) {
    if (event.target.closest('img')) event.preventDefault();
  });

  const btn = document.getElementById('hamburger');
  const nav = document.querySelector('nav');

  if (btn && nav) {
    function closeMenu() {
      btn.classList.remove('open');
      nav.classList.remove('open');
      document.body.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () {
      const willOpen = !nav.classList.contains('open');
      btn.classList.toggle('open', willOpen);
      nav.classList.toggle('open', willOpen);
      document.body.classList.toggle('nav-open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    });

    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', function (e) {
      if (!btn.contains(e.target) && !nav.contains(e.target)) {
        closeMenu();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 768) closeMenu();
    });
  }

  const scrollBtn = document.getElementById('scrollTopBtn');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', function () {
      scrollBtn.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });
  }

  document.querySelectorAll('[data-scroll-top]').forEach(function (control) {
    control.addEventListener('click', function (event) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  const storageConsentKey = 'esb_storage_consent_v1';
  let hasStorageConsent = false;
  try {
    hasStorageConsent = localStorage.getItem(storageConsentKey) === 'accepted';
  } catch (e) {}

  if (!hasStorageConsent) {
    const banner = document.createElement('div');
    banner.className = 'storage-consent';
    banner.innerHTML = `
      <p><strong>Local storage notice.</strong> We use local browser storage to cache tournament data and improve loading speed. See our <a href="https://football.esportsbattle.com/en/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
      <button type="button">Got it</button>
    `;
    banner.querySelector('button').addEventListener('click', function () {
      try { localStorage.setItem(storageConsentKey, 'accepted'); } catch (e) {}
      banner.remove();
    });
    document.body.appendChild(banner);
  }
});
