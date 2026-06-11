function initPromoVideo() {
  const player = document.querySelector('[data-video-player]');
  const video = player && player.querySelector('[data-promo-video]');
  if (!player || !video) return;

  const toggles = player.querySelectorAll('[data-video-toggle]');
  const muteButton = player.querySelector('[data-video-mute]');
  const fullscreenButton = player.querySelector('[data-video-fullscreen]');
  const progress = player.querySelector('[data-video-progress]');
  const volume = player.querySelector('[data-video-volume]');
  const currentTime = player.querySelector('[data-video-current]');
  const duration = player.querySelector('[data-video-duration]');
  let controlsTimer;
  let userPaused = false;

  video.defaultMuted = true;
  video.muted = true;
  video.volume = 1;
  video.setAttribute('controlsList', 'nodownload noremoteplayback');
  video.disablePictureInPicture = true;

  player.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  });
  video.addEventListener('dragstart', function (event) {
    event.preventDefault();
  });

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return minutes + ':' + String(remainder).padStart(2, '0');
  }

  function updatePlayState() {
    const paused = video.paused;
    player.classList.toggle('is-paused', paused);
    toggles.forEach(function (button) {
      button.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    });
  }

  function updateVolumeState() {
    const muted = video.muted || video.volume === 0;
    const displayedVolume = muted ? 0 : video.volume;
    player.classList.toggle('is-muted', muted);
    muteButton.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
    volume.value = displayedVolume;
    volume.style.setProperty('--range-progress', (displayedVolume * 100) + '%');
  }

  function updateProgress() {
    const ratio = video.duration ? video.currentTime / video.duration : 0;
    progress.value = Math.round(ratio * 1000);
    progress.style.setProperty('--range-progress', (ratio * 100) + '%');
    currentTime.textContent = formatTime(video.currentTime);
    duration.textContent = formatTime(video.duration);
  }

  function showControls() {
    clearTimeout(controlsTimer);
    player.classList.add('controls-visible');
    if (!video.paused) {
      controlsTimer = setTimeout(function () {
        player.classList.remove('controls-visible');
      }, 2200);
    }
  }

  function togglePlayback() {
    if (video.paused) {
      userPaused = false;
      video.play().then(updatePlayState).catch(function () {});
    } else {
      userPaused = true;
      video.pause();
      updatePlayState();
    }
    showControls();
  }

  function startVideo() {
    if (userPaused || !video.paused) return;
    video.play().catch(function () {
      video.muted = true;
      video.play().catch(function () {});
    });
  }

  toggles.forEach(function (button) {
    button.addEventListener('click', togglePlayback);
  });
  video.addEventListener('click', togglePlayback);

  muteButton.addEventListener('click', function () {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      if (video.volume === 0) video.volume = 1;
    } else {
      video.muted = true;
    }
    showControls();
  });

  volume.addEventListener('input', function () {
    video.volume = Number(volume.value);
    video.muted = video.volume === 0;
    showControls();
  });

  progress.addEventListener('input', function () {
    if (video.duration) {
      video.currentTime = (Number(progress.value) / 1000) * video.duration;
    }
    showControls();
  });

  fullscreenButton.addEventListener('click', function () {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (player.requestFullscreen) {
      player.requestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', function () {
    const fullscreen = document.fullscreenElement === player;
    player.classList.toggle('is-fullscreen', fullscreen);
    fullscreenButton.setAttribute('aria-label', fullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
  });

  player.addEventListener('mousemove', showControls);
  player.addEventListener('touchstart', showControls, { passive: true });
  player.addEventListener('mouseleave', function () {
    if (!video.paused) player.classList.remove('controls-visible');
  });

  player.addEventListener('keydown', function (event) {
    if (event.target.matches('input')) return;
    if (event.code === 'Space' || event.code === 'KeyK') {
      event.preventDefault();
      togglePlayback();
    } else if (event.code === 'KeyM') {
      muteButton.click();
    } else if (event.code === 'KeyF') {
      fullscreenButton.click();
    }
  });
  player.tabIndex = 0;

  video.addEventListener('play', updatePlayState);
  video.addEventListener('pause', updatePlayState);
  video.addEventListener('timeupdate', updateProgress);
  video.addEventListener('durationchange', updateProgress);
  video.addEventListener('volumechange', updateVolumeState);
  video.addEventListener('loadeddata', startVideo);
  video.addEventListener('canplay', startVideo);
  window.addEventListener('pageshow', startVideo);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) startVideo();
  });

  updatePlayState();
  updateVolumeState();
  updateProgress();
  video.load();
  startVideo();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPromoVideo, { once: true });
} else {
  initPromoVideo();
}
