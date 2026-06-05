document.addEventListener('DOMContentLoaded', function () {
  const video = document.querySelector('[data-promo-video]');
  if (!video) return;

  video.defaultMuted = true;
  video.muted = true;
  video.volume = 1;

  video.addEventListener('volumechange', function () {
    if (!video.muted && video.volume === 0) {
      video.volume = 1;
    }
  });

  video.play().catch(function () {
    video.muted = true;
    video.volume = 1;
    video.play().catch(function () {});
  });
});
