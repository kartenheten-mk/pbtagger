function initIntroVideoStartButton() {
  const video = document.querySelector('[data-intro-video]');
  const overlay = document.querySelector('[data-intro-video-overlay]');
  const startButton = document.querySelector('[data-intro-video-start]');

  if (!video || !overlay || !startButton) {
    return;
  }

  const hideOverlay = () => {
    overlay.classList.add('is-hidden');
  };

  const showOverlay = () => {
    overlay.classList.remove('is-hidden');
  };

  startButton.addEventListener('click', async () => {
    try {
      await video.play();
      hideOverlay();
    } catch (error) {
      showOverlay();
      // Keep the native controls visible so the user can try playback there too.
      video.controls = true;
      console.error('Intro video could not be started.', error);
    }
  });

  video.addEventListener('play', hideOverlay);
  video.addEventListener('ended', showOverlay);
}

if (typeof document$ !== 'undefined') {
  document$.subscribe(initIntroVideoStartButton);
} else {
  document.addEventListener('DOMContentLoaded', initIntroVideoStartButton);
}