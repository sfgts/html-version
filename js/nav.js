// Hamburger nav toggle — shared across all pages
document.addEventListener('DOMContentLoaded', function () {
  const btn = document.getElementById('hamburger');
  const nav = document.querySelector('nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', function () {
    btn.classList.toggle('open');
    nav.classList.toggle('open');
  });

  // Close nav when a link is clicked
  nav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      btn.classList.remove('open');
      nav.classList.remove('open');
    });
  });

  // Close nav on outside click
  document.addEventListener('click', function (e) {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      btn.classList.remove('open');
      nav.classList.remove('open');
    }
  });
});
