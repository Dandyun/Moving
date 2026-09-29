/* MOVING Landing
   All visual motion lives in style.css; navigation uses real page links.
   Pause animations while the tab is hidden to avoid unnecessary work.
*/
(() => {
  const landing = document.querySelector('.landing');
  if (!landing) return;

  const syncVisibility = () => {
    landing.classList.toggle('is-paused', document.hidden);
  };

  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pageshow', syncVisibility);
  syncVisibility();
})();
