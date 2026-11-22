/* =========================================================
   marquee.js
   Marquee with Scroll Direction — Osmo Supply.
   Vereist gsap + ScrollTrigger.

   Eén toevoeging op het origineel: `data-marquee-lock-
   direction` op de wrapper. Dan slaat de rij het omkeren bij
   omhoog scrollen over en loopt hij altijd dezelfde kant op.
   De strook in de statement-secties gebruikt dat: die is een
   doorlopende regel tekst, en tekst die achteruit leest is
   geen effect maar een storing. De rest van het script is
   ongewijzigd, op de tweede toevoeging na (zie hieronder).
   ========================================================= */

function initMarqueeScrollDirection() {
  document.querySelectorAll('[data-marquee-scroll-direction-target]').forEach((marquee) => {
    /* Tweede toevoeging: een rij die bij het laden verborgen is
       (de favorieten bij dranken op de menupagina) is nul breed,
       en dan rekent het script een duur van nul uit en staat de
       rij stil. Zo'n rij start pas zodra hij breedte krijgt. */
    const content = marquee.querySelector('[data-marquee-collection-target]');
    if (content && content.offsetWidth === 0 && 'ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        if (content.offsetWidth === 0) return;
        observer.disconnect();
        setupMarquee(marquee);
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      });
      observer.observe(content);
      return;
    }
    setupMarquee(marquee);
  });
}

function setupMarquee(marquee) {
  {
    // Query marquee elements
    const marqueeContent = marquee.querySelector('[data-marquee-collection-target]');
    const marqueeScroll = marquee.querySelector('[data-marquee-scroll-target]');
    if (!marqueeContent || !marqueeScroll) return;

    // Get data attributes
    const { marqueeSpeed: speed, marqueeDirection: direction, marqueeDuplicate: duplicate, marqueeScrollSpeed: scrollSpeed } = marquee.dataset;

    // Convert data attributes to usable types
    const marqueeSpeedAttr = parseFloat(speed);
    const marqueeDirectionAttr = direction === 'right' ? 1 : -1; // 1 for right, -1 for left
    const duplicateAmount = parseInt(duplicate || 0);
    const scrollSpeedAttr = parseFloat(scrollSpeed);
    const speedMultiplier = window.innerWidth < 479 ? 0.25 : window.innerWidth < 991 ? 0.5 : 1;

    let marqueeSpeed = marqueeSpeedAttr * (marqueeContent.offsetWidth / window.innerWidth) * speedMultiplier;

    // Precompute styles for the scroll container
    marqueeScroll.style.marginLeft = `${scrollSpeedAttr * -1}%`;
    marqueeScroll.style.width = `${(scrollSpeedAttr * 2) + 100}%`;

    // Duplicate marquee content
    if (duplicateAmount > 0) {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < duplicateAmount; i++) {
        fragment.appendChild(marqueeContent.cloneNode(true));
      }
      marqueeScroll.appendChild(fragment);
    }

    // GSAP animation for marquee content
    const marqueeItems = marquee.querySelectorAll('[data-marquee-collection-target]');
    const animation = gsap.to(marqueeItems, {
      xPercent: -100, // Move completely out of view
      repeat: -1,
      duration: marqueeSpeed,
      ease: 'linear'
    }).totalProgress(0.5);

    // Initialize marquee in the correct direction
    gsap.set(marqueeItems, { xPercent: marqueeDirectionAttr === 1 ? 100 : -100 });
    animation.timeScale(marqueeDirectionAttr); // Set correct direction

    /* Tweede toevoeging: `data-marquee-hold`. De rij staat
       stil tot iemand hem vrijgeeft met het event
       `marquee:release` (en weer stilzet met `marquee:hold`).
       De fotorij op Grab & Go gebruikt dat: eerst stil, dan
       waaieren de foto's uit de koelkast, pas daarna loopt hij
       (feedback 13 nov 2026). Alleen vanaf 768px; daaronder
       is er geen uitwaaieren en loopt hij meteen. */
    const hold = marquee.hasAttribute('data-marquee-hold') &&
      window.matchMedia('(min-width: 768px)').matches;

    if (hold) {
      /* Kan al vrijgegeven zijn voordat dit script draaide;
         dat staat dan in data-marquee-running. */
      if (marquee.dataset.marqueeRunning === 'true') animation.play();
      else animation.pause();
      marquee.addEventListener('marquee:release', () => animation.play());
      marquee.addEventListener('marquee:hold', () => animation.pause());
    } else {
      animation.play(); // Start animation immediately
    }

    // Set initial marquee status
    marquee.setAttribute('data-marquee-status', 'normal');

    // ScrollTrigger logic for direction inversion
    const lockDirection = marquee.hasAttribute('data-marquee-lock-direction');

    /* Vaste richting: neem de stand die het script hieronder
       bij naar beneden scrollen kiest — `-direction`, want
       daar staat het omkeren van de omkering — en laat die
       staan. */
    if (lockDirection) animation.timeScale(-marqueeDirectionAttr);

    if (!lockDirection) ScrollTrigger.create({
      trigger: marquee,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const isInverted = self.direction === 1; // Scrolling down
        const currentDirection = isInverted ? -marqueeDirectionAttr : marqueeDirectionAttr;

        // Update animation direction and marquee status
        animation.timeScale(currentDirection);
        marquee.setAttribute('data-marquee-status', isInverted ? 'normal' : 'inverted');
      }
    });

    // Extra speed effect on scroll. Niet bij een rij die
    // wacht: die hoort stil te staan tot hij vrij is.
    if (hold) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: marquee,
        start: '0% 100%',
        end: '100% 0%',
        scrub: 0
      }
    });

    const scrollStart = marqueeDirectionAttr === -1 ? scrollSpeedAttr : -scrollSpeedAttr;
    const scrollEnd = -scrollStart;

    tl.fromTo(marqueeScroll, { x: `${scrollStart}vw` }, { x: `${scrollEnd}vw`, ease: 'none' });
  }
}

// Initialize Marquee with Scroll Direction
document.addEventListener('DOMContentLoaded', () => {
  initMarqueeScrollDirection();
});
