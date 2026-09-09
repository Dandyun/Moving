(() => {
  const track = document.querySelector(".horizontal-track");
  const revealItems = [...document.querySelectorAll(".reveal-up, .reveal-down")];
  const rainbowLines = [...document.querySelectorAll(".rainbow-line")];
  const hint = document.querySelector(".scroll-hint");

  let currentX = 0;
  let targetX = 0;
  let maxScroll = 0;
  let rafId = null;

  function measure() {
    maxScroll = Math.max(0, track.scrollWidth - window.innerWidth);
    currentX = Math.max(0, Math.min(maxScroll, currentX));
    targetX = Math.max(0, Math.min(maxScroll, targetX));

    rainbowLines.forEach(line => {
      line.style.width = `${track.scrollWidth}px`;
    });

    update();
  }

  function update() {
    track.style.transform = `translate3d(${-currentX}px,0,0)`;
    hint.classList.toggle("hidden", currentX > 40);
  }

  function animate() {
    currentX += (targetX - currentX) * .095;
    if (Math.abs(targetX - currentX) < .1) currentX = targetX;

    update();

    if (currentX !== targetX) {
      rafId = requestAnimationFrame(animate);
    } else {
      rafId = null;
    }
  }

  function requestAnimation() {
    if (!rafId) rafId = requestAnimationFrame(animate);
  }

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      entry.target.classList.add("show");
      revealObserver.unobserve(entry.target);
    });
  }, {
    root:null,
    threshold:.18,
    rootMargin:"0px -8% 0px -8%"
  });

  revealItems.forEach(item => revealObserver.observe(item));

  window.addEventListener("wheel", event => {
    event.preventDefault();

    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;

    targetX = Math.max(0, Math.min(maxScroll, targetX + delta * 1.08));
    requestAnimation();
  }, { passive: false });

  let touchStartX = 0;
  let touchStartTarget = 0;

  window.addEventListener("touchstart", event => {
    touchStartX = event.touches[0].clientX;
    touchStartTarget = targetX;
  }, { passive: true });

  window.addEventListener("touchmove", event => {
    const dx = touchStartX - event.touches[0].clientX;
    targetX = Math.max(0, Math.min(maxScroll, touchStartTarget + dx));
    requestAnimation();
  }, { passive: true });

  window.addEventListener("keydown", event => {
    if (event.key === "ArrowRight") {
      targetX = Math.min(maxScroll, targetX + window.innerWidth * .5);
      requestAnimation();
    }
    if (event.key === "ArrowLeft") {
      targetX = Math.max(0, targetX - window.innerWidth * .5);
      requestAnimation();
    }
  });

  window.addEventListener("resize", measure);

  measure();
})();
