(() => {
  "use strict";

  const page = document.querySelector(".about-page");
  if (!page) return;

  const wheel = document.querySelector(".timeline-wheel");
  const navWall = document.querySelector(".nav-wall");
  const chapters = [...document.querySelectorAll("[data-wheel-anchor]")];
  const screens = [...document.querySelectorAll(".screen")];
  const hint = document.querySelector(".scroll-hint");
  const title = document.querySelector(".title-letters");
  const letters = [...document.querySelectorAll(".title-letter")];
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* 1. Staggered rainbow reveal. Each paragraph finishes in black. */
  const revealItems = [...document.querySelectorAll(".reveal-text, .reveal-image")];
  if ("IntersectionObserver" in window) {
    document.documentElement.classList.add("motion-ready");
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("show");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .1, rootMargin: "0px 0px -4% 0px" });
    revealItems.forEach(item => revealObserver.observe(item));
  }

  /* 2. A gap travels through the title, then returns:
     MOVING → M OVING → MO VING → MOV ING → MOVI NG → MOVIN G.
     Transforms move both groups without changing the layout width. */
  const splitSequence = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];
  let splitIndex = 0;
  let titleTimer = null;
  let titleInView = true;

  function paintTitle() {
    const split = motionPreference.matches ? 0 : splitSequence[splitIndex];
    if (title) title.dataset.split = String(split);
    letters.forEach((letter, index) => {
      letter.dataset.side = split === 0 ? "rest" : index < split ? "left" : "right";
    });
  }

  function syncTitleMotion() {
    window.clearTimeout(titleTimer);
    titleTimer = null;
    if (!title || motionPreference.matches || !titleInView || document.hidden) return;
    titleTimer = window.setTimeout(() => {
      splitIndex = (splitIndex + 1) % splitSequence.length;
      paintTitle();
      syncTitleMotion();
    }, splitSequence[splitIndex] === 0 ? 800 : 575);
  }

  if (title && "IntersectionObserver" in window) {
    const titleObserver = new IntersectionObserver(entries => {
      titleInView = entries[0].isIntersecting;
      syncTitleMotion();
    }, { threshold: 0 });
    titleObserver.observe(title);
  }
  document.addEventListener("visibilitychange", syncTitleMotion);
  paintTitle();
  syncTitleMotion();

  /* 3. Five chapter stops = 0°, 90°, 180°, 270°, 360°.
     The last stop is the START of the final screen, not the document bottom.
     No wheel or touch events are cancelled: scrolling remains native. */
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const smoothstep = t => t * t * (3 - 2 * t);
  /* Red → orange → yellow → green → cyan → blue → violet.
     Interpolation blends adjacent colors continuously, not one color per page. */
  const wallColors = [
    [237, 47, 50], [243, 111, 63], [246, 199, 68], [109, 187, 75],
    [57, 183, 223], [45, 93, 170], [155, 90, 165]
  ];
  let stops = [];
  let screenStops = [];
  let maxScroll = 0;
  let currentAngle = 0;
  let currentWallProgress = 0;
  let frame = null;
  let previousTime = 0;
  let measureFrame = null;

  function targetAngle() {
    if (motionPreference.matches || stops.length < 2) return 0;
    const y = Math.max(0, window.scrollY);
    if (y >= stops[stops.length - 1]) return 360;
    for (let i = 0; i < stops.length - 1; i += 1) {
      if (y > stops[i + 1]) continue;
      const span = stops[i + 1] - stops[i];
      const within = span > 0 ? clamp((y - stops[i]) / span, 0, 1) : 1;
      return ((i + smoothstep(within)) / (stops.length - 1)) * 360;
    }
    return 0;
  }

  function updateHint() {
    if (!hint || !screenStops.length) return;
    const nextIndex = screenStops.findIndex(top => top > window.scrollY + 8);
    const finished = nextIndex < 0;
    hint.classList.toggle("is-finished", finished);
    if (finished) {
      hint.setAttribute("tabindex", "-1");
      hint.setAttribute("aria-hidden", "true");
    } else {
      hint.href = `#${screens[nextIndex].id}`;
      hint.removeAttribute("tabindex");
      hint.removeAttribute("aria-hidden");
    }
  }

  function paintWall(progress) {
    if (!navWall) return;
    const position = clamp(progress, 0, 1) * (wallColors.length - 1);
    const index = Math.min(Math.floor(position), wallColors.length - 2);
    const mix = position - index;
    const rgb = wallColors[index].map((channel, i) =>
      Math.round(channel + (wallColors[index + 1][i] - channel) * mix)
    );
    navWall.style.setProperty("--nav-wall-color", `rgb(${rgb.join(", ")})`);
  }

  function animateWheel(time) {
    const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
    previousTime = time;
    const target = targetAngle();
    currentAngle += (target - currentAngle) * (1 - Math.exp(-elapsed / 105));
    if (Math.abs(target - currentAngle) < .025) currentAngle = target;
    if (wheel) wheel.style.setProperty("--wheel-angle", `${currentAngle.toFixed(4)}deg`);

    const wallTarget = maxScroll > 0 ? clamp(window.scrollY / maxScroll, 0, 1) : 0;
    currentWallProgress = motionPreference.matches
      ? wallTarget
      : currentWallProgress + (wallTarget - currentWallProgress) * (1 - Math.exp(-elapsed / 160));
    if (Math.abs(wallTarget - currentWallProgress) < .0001) currentWallProgress = wallTarget;
    paintWall(currentWallProgress);
    updateHint();

    if (currentAngle !== target || currentWallProgress !== wallTarget) {
      frame = window.requestAnimationFrame(animateWheel);
    } else {
      frame = null;
      previousTime = 0;
    }
  }

  function requestUpdate() {
    if (frame === null) frame = window.requestAnimationFrame(animateWheel);
  }

  function measure() {
    measureFrame = null;
    const y = window.scrollY;
    maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    stops = chapters.map(chapter => clamp(chapter.getBoundingClientRect().top + y, 0, maxScroll));
    if (stops.length) stops[0] = 0;
    screenStops = screens.map(screen => clamp(screen.getBoundingClientRect().top + y, 0, maxScroll));
    requestUpdate();
  }

  function requestMeasure() {
    if (measureFrame === null) measureFrame = window.requestAnimationFrame(measure);
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestMeasure, { passive: true });
  window.addEventListener("load", requestMeasure, { once: true });
  window.addEventListener("pageshow", requestMeasure);
  if (document.fonts) document.fonts.ready.then(requestMeasure);
  if ("ResizeObserver" in window) new ResizeObserver(requestMeasure).observe(page);

  if (hint) {
    hint.addEventListener("click", event => {
      const nextIndex = screenStops.findIndex(top => top > window.scrollY + 8);
      if (nextIndex < 0) return;
      event.preventDefault();
      window.scrollTo({ top: screenStops[nextIndex], behavior: motionPreference.matches ? "instant" : "smooth" });
    });
  }

  motionPreference.addEventListener("change", () => {
    paintTitle();
    syncTitleMotion();
    requestUpdate();
  });

  measure();
})();
