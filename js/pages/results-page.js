// Page-level bindings for the results view.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-results-view]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      switchView(link.dataset.resultsView);
    });
  });

  const refreshBtn = document.querySelector('[data-manual-refresh]');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      manualRefresh();
    });
  }

  document.querySelectorAll('[data-auto-refresh]').forEach(function (button) {
    button.addEventListener('click', function () {
      setAutoRefresh(Number(button.dataset.autoRefresh));
    });
  });
});