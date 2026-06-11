function initPromoVideo() {
  const video = document.querySelector('[data-promo-video]');
  if (!video) return;

  video.defaultMuted = true;
  video.muted = true;
  video.volume = 1;

  const startVideo = function () {
    if (!video.paused) return;
    video.play().catch(function () {
      video.muted = true;
      video.play().catch(function () {});
    });
  };

  video.addEventListener('volumechange', function () {
    if (!video.muted && video.volume === 0) {
      video.volume = 1;
    }
  });

  video.addEventListener('loadeddata', startVideo);
  video.addEventListener('canplay', startVideo);
  window.addEventListener('pageshow', startVideo);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) startVideo();
  });

  video.load();
  startVideo();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPromoVideo, { once: true });
} else {
  initPromoVideo();
}
