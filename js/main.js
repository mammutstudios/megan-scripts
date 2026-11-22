/* =========================================================
   main.js  ·  Megan
   Plain ES, geen bundler — draait straks via ODE als los
   bestand in Webflow. Verwacht dat lenis.min.js, gsap.min.js
   en SplitText.min.js er vóór geladen zijn.
   ========================================================= */

(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var app = (window.megan = window.megan || {});

  /* Hoe lang de kop wacht nadat het woordmerk omhoog begint
     te schuiven. Even geduld leest rustiger: de kop komt op
     de plek die het woordmerk net vrijmaakt.             */
  var HEADING_DELAY = 0.45; /* seconden */

  /* -------------------------------------------------------
     Lenis — vloeiend scrollen
     ------------------------------------------------------- */
  function initLenis() {
    if (reduced || typeof window.Lenis !== 'function') return;

    app.lenis = new window.Lenis({
      autoRaf: true,
      duration: 1.1,
      smoothWheel: true,
    });

    /* ScrollTrigger meelaten lopen met Lenis, zodat de
       parallax exact op de gesmoothde scrollpositie zit en
       niet op die van de browser. */
    if (window.ScrollTrigger) {
      app.lenis.on('scroll', window.ScrollTrigger.update);
    }
  }

  /* -------------------------------------------------------
     Labels op de fotokaarten

     Het label moet twee dingen tegelijk: onderaan zijn eigen
     foto blijven staan, en nooit uit beeld zakken.

     Die twee vechten met elkaar, want de browser rekent
     `position: sticky` uit op de layout-positie en past pas
     daarna transforms toe. Een label dat met de parallax
     meeschuift plakt dus wel aan de onderrand, maar staat
     daar net zoveel pixels ónder als de parallax verschoven
     heeft.

     De oplossing is die verschuiving twee keer gebruiken:
     als transform omlaag, en als sticky-drempel omhoog. De
     drempel tilt het klempunt evenveel op als de transform
     het laat zakken, dus het label landt precies op de
     onderrand. Zolang de kaart helemaal in beeld is klemt
     er niets en staat het label gewoon onderaan zijn foto.

     De verplaatsing komt uit `data-parallax-end` op de
     kaart zelf, zodat dit niet uit de pas kan lopen met de
     beweging van de foto.
     ------------------------------------------------------- */
  function initCardLabels() {
    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) return;

    var cards = document.querySelectorAll('.hero_card[data-parallax="trigger"]');

    Array.prototype.forEach.call(cards, function (card) {
      var label = card.querySelector('.photo-card_sticky');
      var endPct = parseFloat(card.getAttribute('data-parallax-end'));
      if (!label || !endPct) return;

      var height = card.offsetHeight;

      ScrollTrigger.create({
        trigger: card,
        start: 'clamp(top bottom)',
        end: 'clamp(bottom top)',
        onRefresh: function () {
          height = card.offsetHeight;
        },
        onUpdate: function (self) {
          var travel = height * (endPct / 100) * self.progress;
          gsap.set(label, { y: travel });
          label.style.bottom = travel + 'px';
        },
      });
    });
  }

  /* -------------------------------------------------------
     Collage: horizontaal doorschuiven

     Overgenomen van het mwg_effect001-patroon. De sectie
     wordt vastgezet en de baan schuift precies zover naar
     links als hij breder is dan het scherm. Elke tegel
     krijgt daarbovenop een eigen drift die niet aan de
     paginascroll hangt maar aan de baanbeweging — dat is
     wat `containerAnimation` doet.

     De Lenis-init en registerPlugin uit die snippet zijn
     hier weggelaten: die draaien al elders, en twee
     Lenis-instanties vechten om dezelfde scroll.
     ------------------------------------------------------- */
  /* Het pad dat de tegels afleggen, als twee cubic beziers.
     Overgenomen uit de SVG; in SVG loopt y omlaag, dus de
     uitslag wordt hieronder omgekeerd.                    */
  var PATH = [
    [[7.25, 213.412], [153.083, 59.9122], [536.85, -154.988], [905.25, 213.412]],
    [[905.25, 213.412], [1273.65, 581.812], [1670.75, 238.579], [1823.25, 20.9121]],
  ];
  var PATH_X0 = 7.25;
  var PATH_X1 = 1823.25;
  var PATH_Y_MIN = 10;   /* hoogste punt van de curve */
  var PATH_Y_MAX = 376;  /* laagste punt */

  function bezier(a, b, c, d, t) {
    var u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }

  /* x is monotoon op dit pad, dus de t die bij een x hoort
     valt met een simpele halvering te vinden.            */
  function pathYAt(x) {
    for (var i = 0; i < PATH.length; i++) {
      var s = PATH[i];
      if (x >= s[0][0] - 0.01 && x <= s[3][0] + 0.01) {
        var lo = 0;
        var hi = 1;
        for (var j = 0; j < 24; j++) {
          var m = (lo + hi) / 2;
          if (bezier(s[0][0], s[1][0], s[2][0], s[3][0], m) < x) lo = m;
          else hi = m;
        }
        return bezier(s[0][1], s[1][1], s[2][1], s[3][1], (lo + hi) / 2);
      }
    }
    return PATH[0][0][1];
  }

  /* u is de horizontale positie op het scherm, 0 links en
     1 rechts. Terug komt de afwijking in pixels ten
     opzichte van het midden van de baan.                 */
  function pathOffset(u, amplitude) {
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    var raw = pathYAt(PATH_X0 + u * (PATH_X1 - PATH_X0));
    var norm = (raw - PATH_Y_MIN) / (PATH_Y_MAX - PATH_Y_MIN);
    return (0.5 - norm) * amplitude;
  }

  /* -------------------------------------------------------
     Collage: doorlopende marquee langs een pad

     De rij loopt uit zichzelf, ook als je stilstaat of de
     sectie alweer voorbij bent. Scrollen geeft er een duw
     bovenop, maar is niet de motor — vandaar geen pin en
     geen scrub: die zouden de beweging aan de scrollpositie
     vastklinken.

     De rij staat er meerdere keren achter elkaar en de
     verschuiving wordt modulo één set genomen. Daardoor is
     er geen begin en geen einde en loopt de lus oneindig
     door zonder zichtbare naad.

     De hoogte van elke tegel komt uit het pad. De golf ligt
     stil op het scherm; elke tegel kijkt waar hij
     horizontaal staat en gaat op die hoogte staan.
     ------------------------------------------------------- */
  var MARQUEE_SPEED = 55;  /* px per seconde, uit zichzelf */
  var MARQUEE_SCROLL = 0.6; /* extra sets per keer dat de sectie voorbijkomt */

  /* Elke collage op de pagina draait los: de homepage heeft er
     één in de vision-sectie, Contact één tussen de twee
     blokken. De sectie eromheen is de trigger.            */
  function initCollage() {
    if (!window.gsap) return;
    Array.prototype.forEach.call(document.querySelectorAll('.vision_collage'), initOneCollage);
  }

  function initOneCollage(collage) {
    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var stage = collage.closest('.vision_stage, section') || collage;
    var track = collage.querySelector('.vision_collage-track');
    if (!track) return;

    var copies = parseInt(track.getAttribute('data-copies'), 10) || 1;
    var segment = track.scrollWidth / copies;
    if (segment <= 0) return;

    var tiles = [];
    var amplitude = 0;
    var auto = 0;
    var trigger = null;

    function measure() {
      segment = track.scrollWidth / copies;
      /* De golf krijgt de ruimte die er is, maar nooit minder
         dan 60% van een tegel: op een laag scherm bleef er
         anders zo weinig over dat de tegels bijna op een rij
         stonden en het rommelig oogde (feedback 13 nov 2026).
         Wat erbij komt valt boven en onder evenveel buiten
         het vak. */
      var tileHeight = track.querySelector('.vision_tile').offsetHeight;
      amplitude = Math.max(collage.offsetHeight - tileHeight, tileHeight * 0.6);
      tiles = Array.prototype.map.call(
        track.querySelectorAll('.vision_tile'),
        function (el) {
          return { el: el, left: el.offsetLeft, width: el.offsetWidth };
        }
      );
    }

    /* Eén rect-uitlezing per frame voor de hele baan; de
       posities van de tegels daarbinnen staan vast.       */
    function place() {
      var base = track.getBoundingClientRect().left;
      var vw = window.innerWidth;

      for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        var center = base + t.left + t.width / 2;
        gsap.set(t.el, { y: pathOffset(center / vw, amplitude) });
      }
    }

    function update(time, deltaTime) {
      if (!reduced) auto += (deltaTime / 1000) * MARQUEE_SPEED;

      var pushed = trigger ? trigger.progress * segment * MARQUEE_SCROLL : 0;
      var offset = (auto + pushed) % segment;

      gsap.set(track, { x: -offset });
      place();
    }

    measure();

    if (ScrollTrigger) {
      trigger = ScrollTrigger.create({
        trigger: stage,
        start: 'top bottom',
        end: 'bottom top',
        onRefresh: measure,
        /* Alleen laten draaien als er iets te zien is. */
        onToggle: function (self) {
          if (self.isActive) gsap.ticker.add(update);
          else gsap.ticker.remove(update);
        },
      });
    } else {
      gsap.ticker.add(update);
    }

    place();
  }

  /* -------------------------------------------------------
     Slider

     De actieve dia staat groot in het midden; de wachtende
     dia's staan rechts en worden steeds kleiner. Die drie
     posities komen uit het ontwerp en zijn omgerekend naar
     schaal plus verschuiving, zodat er alleen transforms
     bewegen en geen layout.

     De kop rolt om: onder elk regelvenster staat de stapel
     met alle varianten, en die schuift per dia precies één
     regelhoogte omhoog.
     ------------------------------------------------------- */
  /* Hoeveel schermhoogte je per dia scrollt. Samen bepalen
     ze hoe lang de slider vast in beeld blijft: bij vier
     dia's is 0,3 iets meer dan één scherm in totaal, dus
     een korte veeg wisselt al.                          */
  var SLIDE_SCROLL = 0.3;

  /* schaal en verschuiving per plek in de rij, afgeleid van
     802 / 527 / 367 breed op x 720 / 1526 / 1958 */
  var SLIDE_POS = [
    { scale: 1, xPercent: -50, opacity: 1 },
    { scale: 0.657, xPercent: 50.6, opacity: 1 },
    { scale: 0.458, xPercent: 104.4, opacity: 1 },
    { scale: 0.458, xPercent: 160, opacity: 0 },
  ];

  /* Mobiel staat de actieve dia links op de marge (327 breed)
     en piept de volgende rechts in beeld: 283 breed, 16px
     ernaast, verticaal gecentreerd. Dat is schaal 283/327, en
     het midden schuift 343 + 141,5 - 163,5 = 321px op. De
     derde staat er even ver achter, net buiten beeld.     */
  var SLIDE_POS_MOBILE = [
    { scale: 1, xPercent: 0, opacity: 1 },
    { scale: 0.865, xPercent: 98.2, opacity: 1 },
    { scale: 0.865, xPercent: 189.6, opacity: 1 },
    { scale: 0.865, xPercent: 281, opacity: 0 },
  ];
  var mobileQuery = window.matchMedia('(max-width: 767px)');

  function initSlider() {
    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var section = document.querySelector('.section_slider');
    var el = document.querySelector('[data-slider]');
    if (!gsap || !section || !el) return;

    var slides = el.querySelectorAll('[data-slide]');
    var stacks = el.querySelectorAll('[data-headline]');
    var tabs = el.querySelectorAll('[data-slider-tab]');
    var body = el.querySelector('[data-slider-body]');
    var cta = el.querySelector('[data-slider-cta]');
    var progress = el.querySelector('[data-slider-progress]');
    var count = slides.length;
    if (!count) return;

    /* De copy van alle dia's staat als data-attribuut op de
       tabs; alleen die van de eerste staat al in de HTML. */
    var copy = Array.prototype.map.call(tabs, function (tab) {
      return {
        body: tab.getAttribute('data-body') || '',
        cta: tab.getAttribute('data-cta') || '',
        href: tab.getAttribute('data-href') || '',
        theme: tab.getAttribute('data-slide-theme') || 'light',
      };
    });

    var index = -1;
    var duration = reduced ? 0 : 0.9;   /* was 0.55: te snel (feedback 13 nov 2026) */

    function layout(animate) {
      var table = mobileQuery.matches ? SLIDE_POS_MOBILE : SLIDE_POS;

      Array.prototype.forEach.call(slides, function (slide, i) {
        var offset = (i - index + count) % count;
        var pos = table[Math.min(offset, table.length - 1)];
        var active = offset === 0;

        slide.style.zIndex = String(count - offset);

        gsap.to(slide, {
          scale: pos.scale,
          xPercent: pos.xPercent,
          yPercent: -50,
          opacity: pos.opacity,
          duration: animate ? duration : 0,
          ease: EASE_SMOOTH,
          overwrite: true,
        });

        gsap.to(slide.querySelector('.slider_slide_veil'), {
          opacity: active ? 0 : 1,
          duration: animate ? duration : 0,
          ease: EASE_SMOOTH,
        });

        /* De waas is er om een donkere kop leesbaar te
           houden; bij een botergele kop op bruin zou hij
           juist in de weg zitten.                        */
        gsap.to(slide.querySelector('.slider_slide_glow'), {
          opacity: active && copy[index].theme !== 'dark' ? 1 : 0,
          duration: animate ? duration : 0,
          ease: EASE_SMOOTH,
        });
      });

      /* Beide regels rollen in hun eigen masker omhoog, met
         een tel ertussen — dezelfde beweging als de kop in
         de hero. */
      var step = stacks[0].querySelector('.slider_headline-line').offsetHeight;

      gsap.to(stacks, {
        y: -index * step,
        duration: animate ? 0.8 : 0,
        ease: 'power3.out',
        stagger: animate ? 0.08 : 0,
      });

      Array.prototype.forEach.call(tabs, function (tab, i) {
        tab.classList.toggle('is-active', i === index);
      });
    }

    /* Tekst wisselt met een korte fade, want die past niet
       in dezelfde rolbeweging als de kop.                 */
    function swapCopy(animate) {
      var next = copy[index];
      if (!next) return;

      var link = cta.querySelector('.button');

      var apply = function () {
        if (next.body) body.textContent = next.body;
        if (next.cta && link) link.textContent = next.cta;
        if (next.href && link) link.setAttribute('href', next.href);
      };

      if (!animate) {
        apply();
        return;
      }

      gsap.to([body, cta], {
        opacity: 0,
        duration: 0.2,
        ease: 'power2.out',
        onComplete: function () {
          apply();
          gsap.to([body, cta], { opacity: 1, duration: 0.35, ease: 'power2.out' });
        },
      });
    }

    function goTo(i, animate) {
      var next = (i + count) % count;
      if (next === index) return;

      index = next;
      if (pinned) {
        themeOverride = copy[index].theme;
        syncTheme();
      }
      layout(animate !== false);
      swapCopy(animate !== false);

      /* De streep telt de dia's af in stappen. Meelopen met
         de scroll zou suggereren dat je ergens middenin kunt
         staan, en dat kan niet meer: er wordt gesnapt.   */
      if (progress) {
        gsap.to(progress, {
          scaleX: (index + 1) / count,
          duration: animate === false ? 0 : 0.4,
          ease: EASE_SMOOTH,
          overwrite: true,
        });
      }
    }

    /* Alleen zolang hij vastgepind staat bepaalt de slider
       het thema; daarbuiten doen de secties dat. */
    var pinned = false;

    goTo(0, false);

    /* Over 767px heen draaien en de dia's op de andere tabel
       zetten, zonder animatie. */
    mobileQuery.addEventListener('change', function () {
      layout(false);
    });

    if (!ScrollTrigger) return;

    var st;
    var snapTimer;
    var snapping = false;

    function centerOf(i) {
      return st.start + ((i + 0.5) / count) * (st.end - st.start);
    }

    function scrollToSlide(i) {
      snapping = true;
      var target = centerOf(i);
      var done = function () {
        snapping = false;
      };

      if (app.lenis) app.lenis.scrollTo(target, { duration: 0.4, onComplete: done });
      else {
        window.scrollTo({ top: target, behavior: 'smooth' });
        window.setTimeout(done, 500);
      }
    }

    /* Snappen zodra je stopt met scrollen, zodat één veeg
       precies één dia opschuift in plaats van ergens
       halverwege te blijven staan.

       Bewust niet ScrollTrigger's eigen `snap`: die schrijft
       rechtstreeks naar de scrollpositie, en Lenis doet dat
       elk frame ook. Die twee gaan dan vechten. Lenis mag
       het hier dus zelf uitvoeren.                       */
    function queueSnap(self) {
      if (snapping) return;
      window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(function () {
        if (!self.isActive || snapping) return;
        scrollToSlide(index);
      }, 120);
    }

    /* De slider blijft in beeld staan terwijl je erdoorheen
       scrollt; de scrollpositie bepaalt welke dia er staat.
       Vandaar een pin met een lengte van een aantal
       schermhoogtes per dia, in plaats van een timer.    */
    st = ScrollTrigger.create({
      trigger: section,
      pin: true,
      start: 'top top',
      end: function () {
        return '+=' + count * SLIDE_SCROLL * window.innerHeight;
      },
      invalidateOnRefresh: true,
      onUpdate: function (self) {
        var i = Math.floor(self.progress * count);
        if (i > count - 1) i = count - 1;
        if (i < 0) i = 0;
        goTo(i);

        if (!reduced) queueSnap(self);
      },
      onToggle: function (self) {
        pinned = self.isActive;
        themeOverride = pinned ? copy[index].theme : null;
        syncTheme();
      },
    });

    /* Op een tab klikken scrollt naar het midden van die
       dia, zodat de pin op de goede plek uitkomt.        */
    Array.prototype.forEach.call(tabs, function (tab, i) {
      tab.addEventListener('click', function () {
        scrollToSlide(i);
      });
    });
  }

  /* -------------------------------------------------------
     Grab & Go: momenten van de dag

     Volgens het Figma-prototype van 30 okt 2026. De vier
     momenten staan op elkaar in één vastgepind scherm; de
     scroll bepaalt welk moment er staat. Bij een wissel
     schuift de nieuwe foto van onder in beeld en de oude
     naar boven weg, de kop vervaagt naar de nieuwe, en de
     hele pagina krijgt de kleur van dat moment.

     Alleen vanaf 768px. Mobiel blijft het een rij om door
     te vegen, zonder pin.
     ------------------------------------------------------- */
  var MOMENT_SCROLL = 0.6;   /* schermhoogtes per moment */

  function initMoments() {
    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var section = document.querySelector('[data-moments]');
    if (!gsap || !ScrollTrigger || !section) return;

    var items = section.querySelectorAll('[data-moment]');
    var count = items.length;
    if (!count) return;

    var themes = Array.prototype.map.call(items, function (item) {
      return item.getAttribute('data-moment-theme') || 'light';
    });

    var mm = gsap.matchMedia();

    mm.add('(min-width: 768px)', function () {
      section.classList.add('is-pinned');

      var index = -1;
      var pinned = false;
      var duration = reduced ? 0 : 0.7;

      function parts(item) {
        return {
          media: item.querySelector('.grab-moment_media'),
          heading: item.querySelector('.grab-moment_heading'),
          aside: item.querySelector('.grab-moment_aside'),
        };
      }

      /* Elke foto staat op zijn plek ten opzichte van het
         actieve moment: die in het midden, de vorige en de
         volgende half doorzichtig erboven en eronder, zoals
         in het prototype, de rest uit beeld. */
      function layout(animate) {
        Array.prototype.forEach.call(items, function (item, i) {
          var p = parts(item);
          var offset = Math.max(-2, Math.min(2, i - index));
          var active = offset === 0;

          item.style.zIndex = active ? '2' : '1';
          item.style.pointerEvents = active ? '' : 'none';

          gsap.to(p.media, {
            yPercent: offset * 130,
            opacity: active ? 1 : Math.abs(offset) === 1 ? 0.25 : 0,
            duration: animate ? duration : 0,
            ease: EASE_SMOOTH,
            overwrite: true,
          });
          gsap.to([p.heading, p.aside], {
            opacity: active ? 1 : 0,
            duration: animate ? duration * (active ? 0.7 : 0.5) : 0,
            delay: animate && active ? duration * 0.2 : 0,
            ease: 'power2.out',
            overwrite: true,
          });
        });
      }

      index = 0;
      layout(false);

      function goTo(next) {
        if (next === index) return;
        index = next;
        layout(true);
        if (pinned) {
          themeOverride = themes[index];
          syncTheme();
        }
      }

      var st = ScrollTrigger.create({
        trigger: section,
        pin: true,
        start: 'top top',
        end: function () {
          return '+=' + count * MOMENT_SCROLL * window.innerHeight;
        },
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          var i = Math.floor(self.progress * count);
          goTo(Math.max(0, Math.min(count - 1, i)));
        },
      });

      /* De kleur gaat al om voordat de pin vastzit, zodra de
         sectie half in beeld is, en blijft tot de pin loslaat.
         Daarna nemen de secties het weer over. Bewust geen
         data-theme op de sectie zelf: die bleef na de pin nog
         even boter tonen, na het crème van het laatste moment. */
      var themeSt = ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: function () {
          return st.end;
        },
        invalidateOnRefresh: true,
        onToggle: function (self) {
          pinned = self.isActive;
          themeOverride = pinned ? themes[index] : null;
          syncTheme();
        },
      });

      return function () {
        st.kill();
        themeSt.kill();
        section.classList.remove('is-pinned');
        if (pinned) {
          themeOverride = null;
          syncTheme();
        }
        Array.prototype.forEach.call(items, function (item) {
          var p = parts(item);
          gsap.set([p.media, p.heading, p.aside], { clearProps: 'all' });
          item.style.zIndex = '';
          item.style.pointerEvents = '';
        });
      };
    });
  }

  /* -------------------------------------------------------
     Stay a while: momenten naast de vaste foto

     Volgens het Figma-prototype van 5 nov 2026. Rechts
     scrollen de momenten gewoon langs; links staat de foto
     vast. Komt een moment halverwege het scherm, dan vloeit
     de foto over in die van dat moment (met zijn eigen
     favoriet) en krijgt de pagina de kleur van het moment:
     crème, boter, bruin. Buiten de sectie nemen de gewone
     secties het thema weer over.

     Alleen vanaf 768px; mobiel heeft elk moment zijn eigen
     beeld in de kolom en geen vaste foto.
     ------------------------------------------------------- */
  function initStayMoments() {
    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var section = document.querySelector('[data-stay-moments]');
    if (!gsap || !ScrollTrigger || !section) return;

    var layers = section.querySelectorAll('[data-stay-visual]');
    var items = section.querySelectorAll('[data-stay-moment]');
    if (!items.length) return;

    var mm = gsap.matchMedia();

    mm.add('(min-width: 768px)', function () {
      var index = 0;
      var inside = false;
      var triggers = [];

      function show(next, animate) {
        index = next;
        Array.prototype.forEach.call(layers, function (layer, i) {
          gsap.to(layer, {
            opacity: i === index ? 1 : 0,
            duration: animate && !reduced ? 0.6 : 0,
            ease: EASE_SMOOTH,
            overwrite: true,
          });
        });
        if (inside) {
          themeOverride = items[index].getAttribute('data-moment-theme') || 'light';
          syncTheme();
        }
      }

      /* Welk moment er staat volgt uit welk moment het laatst
         over het midden van het scherm ging. */
      Array.prototype.forEach.call(items, function (item, i) {
        triggers.push(ScrollTrigger.create({
          trigger: item,
          start: 'top 55%',
          onEnter: function () { show(i, true); },
          onLeaveBack: function () { show(Math.max(0, i - 1), true); },
        }));
      });

      /* Het thema geldt zolang de sectie het scherm vult. */
      triggers.push(ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: function (self) {
          inside = self.isActive;
          themeOverride = inside ? items[index].getAttribute('data-moment-theme') || 'light' : null;
          syncTheme();
        },
      }));

      show(0, false);

      return function () {
        triggers.forEach(function (t) { t.kill(); });
        if (inside) {
          themeOverride = null;
          syncTheme();
        }
        gsap.set(layers, { clearProps: 'opacity' });
      };
    });
  }

  /* -------------------------------------------------------
     Grab & Go: fotorij die uit de koelkast groeit

     Ook uit het prototype. Eerst staat alleen de foto van de
     koelkast in beeld, iets groter; de andere foto's liggen
     erachter. Tijdens het scrollen schuiven ze ernaast en
     krimpt de koelkast naar de maat van de rest. Daarna
     loopt de rij gewoon door als marquee.

     De beweging zit op de kaarten zelf, de marquee op de
     collectie eromheen; die twee zitten elkaar niet in de
     weg. Alleen vanaf 768px.
     ------------------------------------------------------- */
  function initPhotoGather() {
    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var section = document.querySelector('[data-photo-gather]');
    if (!gsap || !ScrollTrigger || !section) return;

    var mm = gsap.matchMedia();

    mm.add('(min-width: 768px)', function () {
      if (reduced) return;

      var cards = section.querySelectorAll('.menu-card');
      var collections = section.querySelectorAll('[data-marquee-collection-target]');
      var perSet = section.querySelector('[data-marquee-collection-target]').children.length;
      var key = parseInt(section.getAttribute('data-photo-gather'), 10) || 0;

      /* De marquee schuift de rij voortdurend op, dus een
         eenmalige meting klopt na een paar seconden niet meer.
         Elke update wordt daarom opnieuw gemeten: waar zou de
         kaart staan zonder onze verschuiving, en hoe ver is
         dat van het midden van het scherm. De koelkast die
         daar het dichtst bij staat ligt bovenop. */
      function render(p) {
        var mid = window.innerWidth / 2;
        var rest = 1 - p;
        var centres = [];
        var anchor = null;
        var best = Infinity;

        Array.prototype.forEach.call(cards, function (card, i) {
          var r = card.getBoundingClientRect();
          var c = r.left + r.width / 2 - (gsap.getProperty(card, 'x') || 0);
          centres.push(c);
          if (i % perSet === key && Math.abs(c - mid) < best) {
            best = Math.abs(c - mid);
            anchor = card;
          }
        });

        /* Elke kopie van de rij is door de marquee een eigen
           laag; de kopie met de koelkast moet als geheel
           bovenop, anders schuiven de kaarten van de volgende
           kopie er toch overheen. */
        Array.prototype.forEach.call(collections, function (col) {
          col.style.position = 'relative';
          col.style.zIndex = anchor && col.contains(anchor) ? '2' : '1';
        });

        Array.prototype.forEach.call(cards, function (card, i) {
          var top = card === anchor;
          gsap.set(card, {
            x: (mid - centres[i]) * rest,
            scale: top ? 1 + 0.25 * rest : 1,
            zIndex: top ? 2 : 1,
            position: 'relative',
          });
        });
      }

      /* De marquee (met data-marquee-hold) staat stil tot het
         uitwaaieren klaar is en loopt pas dan; scrol je terug,
         dan staat hij weer stil. */
      var marquee = section.querySelector('[data-marquee-hold]');
      var running = false;

      function release(done) {
        if (!marquee || done === running) return;
        running = done;
        marquee.dataset.marqueeRunning = done ? 'true' : 'false';
        marquee.dispatchEvent(new CustomEvent(done ? 'marquee:release' : 'marquee:hold'));
      }

      function step(self) {
        render(gsap.parseEase('power2.inOut')(self.progress));
        release(self.progress >= 1);
      }

      var st = ScrollTrigger.create({
        trigger: section,
        start: 'top 65%',
        end: 'top 30%',
        onUpdate: step,
        onRefresh: step,
      });

      return function () {
        st.kill();
        gsap.set(cards, { clearProps: 'transform,zIndex,position' });
        Array.prototype.forEach.call(collections, function (col) {
          col.style.position = '';
          col.style.zIndex = '';
        });
      };
    });
  }

  /* -------------------------------------------------------
     Thema per sectie

     Secties met `data-theme` bepalen de kleuren van de hele
     pagina zodra ze in beeld komen. De sectie zelf krijgt
     geen kleur; er wordt een class op <html> gezet die de
     variabelen omzet, waardoor achtergrond, tekst, randen
     en de rail-CTA in één keer meedraaien.

     Het omslagpunt ligt op de helft van het scherm: zodra
     de bovenkant van de sectie daar voorbij komt, is het de
     sectie die het beeld bepaalt.
     ------------------------------------------------------- */
  var THEME_SWITCH = 'top 50%';

  /* `dark` is de standaard en heeft geen class: bruin vlak
     met botergele tekst. De andere twee draaien dat om. */
  function applyTheme(name) {
    root.classList.toggle('is-light', name === 'light');
    root.classList.toggle('is-butter', name === 'butter');
    root.classList.toggle('is-wine', name === 'wine');
  }

  /* Het thema volgt uit de scrollpositie, niet uit welke
     trigger het laatst afging. Springt de pagina in één keer
     over meerdere secties heen — een anker, een herstelde
     scrollpositie bij herladen, de loader die terug naar
     boven gaat — dan vuren al die triggers tegelijk, en wint
     wie toevallig als laatste aan de beurt is. Dat liet de
     hero crème achter. Nu rekent elke trigger hetzelfde
     antwoord uit, dus de volgorde maakt niet meer uit.

     De slider zet zolang hij vastgepind staat zijn eigen
     thema per dia; dat gaat voor.                         */
  var themeTriggers = [];
  var themeOverride = null;

  function syncTheme() {
    if (themeOverride) {
      applyTheme(themeOverride);
      return;
    }

    var name = 'dark';
    for (var i = 0; i < themeTriggers.length; i++) {
      var t = themeTriggers[i];
      if (t.st.scroll() >= t.st.start) name = t.theme;
    }
    applyTheme(name);
  }

  function initTheme() {
    var sections = document.querySelectorAll('[data-theme]');
    var ScrollTrigger = window.ScrollTrigger;
    if (!sections.length || !ScrollTrigger) return;

    Array.prototype.forEach.call(sections, function (section) {
      themeTriggers.push({
        theme: section.dataset.theme,
        st: ScrollTrigger.create({
          trigger: section,
          start: THEME_SWITCH,
          onToggle: syncTheme,
          onRefresh: syncTheme,
        }),
      });
    });

    syncTheme();
    initThemeBlend();
  }

  /* -------------------------------------------------------
     Thema zacht laten overlopen

     De gewone wissel is een class die in 600ms omslaat. Op
     de homepage, van de bruine hero naar de crème visie-
     sectie, voelde dat als een klap: het vlak sprong ineens
     naar wit. Daar loopt de kleur nu mee met de scroll, van
     het moment dat de sectie binnenkomt tot het omslagpunt.

     Tijdens het overlopen staan de kleuren als inline
     variabelen op <html>; die gaan voor de themaclass. Aan
     het begin en eind worden ze weer weggehaald, zodat de
     class het daarna gewoon overneemt. De CSS-transitie
     staat zolang uit, anders loopt die achter de scroll aan.

     Geldt voor `.section_vision` en voor elke sectie met
     `data-theme-blend`, zonder dat Webflow iets hoeft.    */
  var THEME_COLORS = {
    dark: { bg: '--color--brown', text: '--color--butter', border: 'rgba(255, 229, 161, 0.35)' },
    light: { bg: '--color--cream', text: '--color--brown', border: 'rgba(68, 40, 34, 0.4)' },
    butter: { bg: '--color--butter', text: '--color--brown', border: 'rgba(68, 40, 34, 0.4)' },
  };

  function themeColor(name, key) {
    var value = (THEME_COLORS[name] || THEME_COLORS.dark)[key];
    if (value.indexOf('--') !== 0) return value;
    return getComputedStyle(root).getPropertyValue(value).trim();
  }

  function initThemeBlend() {
    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) return;

    var sections = document.querySelectorAll('.section_vision[data-theme], [data-theme-blend]');
    var props = ['--color--background', '--color--text-main', '--color--border'];

    Array.prototype.forEach.call(sections, function (section) {
      var to = section.dataset.theme || 'light';
      var from = section.dataset.themeBlendFrom || 'dark';
      var mix = {
        bg: gsap.utils.interpolate(themeColor(from, 'bg'), themeColor(to, 'bg')),
        text: gsap.utils.interpolate(themeColor(from, 'text'), themeColor(to, 'text')),
        border: gsap.utils.interpolate(themeColor(from, 'border'), themeColor(to, 'border')),
      };
      var painted = [document.body, section];

      /* In Webflow schildert niet de body maar de page-wrapper
         het vlak, en die heeft daar een vaste kleur. Zonder
         dit liep alleen de sectie over en bleef er een harde
         bruine rand boven staan. Hier volgt hij het thema,
         net als de body in de Astro-build.                  */
      var wrapper = section.closest('.page-wrapper');
      if (wrapper) {
        wrapper.style.backgroundColor = 'var(--color--background)';
        painted.push(wrapper);
      }
      var active = false;

      function release() {
        if (!active) return;
        active = false;
        /* Eerst de class goedzetten, dan pas de inline kleuren
           weghalen, en de transitie pas een frame later terug.
           Anders flitst het bruin nog even terug op het
           omslagpunt. */
        syncTheme();
        props.forEach(function (p) { root.style.removeProperty(p); });
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (active) return;
            painted.forEach(function (el) { el.style.transition = ''; });
          });
        });
      }

      ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: THEME_SWITCH,
        onUpdate: function (self) {
          var p = self.progress;
          if (themeOverride || p <= 0 || p >= 1) return release();
          if (!active) {
            active = true;
            painted.forEach(function (el) { el.style.transition = 'none'; });
          }
          /* Iets trager aan het begin, zodat het bruin nog even
             blijft hangen en de crème pas echt komt als de kop
             in beeld is. */
          var e = p * p * (3 - 2 * p);
          root.style.setProperty('--color--background', mix.bg(e));
          root.style.setProperty('--color--text-main', mix.text(e));
          root.style.setProperty('--color--border', mix.border(e));
        },
        onLeave: release,
        onLeaveBack: release,
      });
    });
  }

  /* -------------------------------------------------------
     Statement-koppen: schuiven op de scroll

     De kop heeft geen eigen tempo. De scrollpositie is de
     tijdlijn, dus naar beneden schuift hij naar links en
     naar boven weer terug — de richting keert vanzelf om,
     zonder dat er iets omgezet hoeft te worden.

     De baan draagt de zin COPIES keer. Er schuift precies
     één kopie voorbij, oftewel 1/COPIES van de baan, dus het
     eindbeeld is gelijk aan het beginbeeld en de tekst kan
     onderweg niet opraken.

     Alle koppen gaan dezelfde kant op, naar links, zoals in
     het Figma-prototype. Tegen elkaar in oogde het te
     chaotisch (feedback 13 nov 2026). Zet STATEMENT_ALTERNATE
     op true om weer om en om te laten lopen.

     De reis loopt van een
     halve kopie tot anderhalve kopie: nooit voorbij de rand
     van de baan, en altijd met tekst die aan beide kanten van
     het scherm afloopt in plaats van netjes bij het eerste
     woord te beginnen.

     Gemeten aan de sectie en niet aan de baan zelf: de
     sectie blijft plakken, dus hij staat veel langer in
     beeld dan zijn eigen hoogte. Meet je aan de regel, dan
     is het bereik op — en de beweging voorbij — nog voordat
     de sectie uit beeld is.
     ------------------------------------------------------- */
  var STATEMENT_ALTERNATE = false;

  function initStatementHeadings() {
    var ScrollTrigger = window.ScrollTrigger;
    if (!ScrollTrigger) return;

    var COPIES = 3;
    var step = 100 / COPIES;

    /* De twee uiteinden van de reis. Naar links is `near` →
       `far`, naar rechts precies andersom. */
    var near = -step / 2;
    var far = -step * 1.5;

    var tracks = document.querySelectorAll('[data-statement-track]');

    Array.prototype.forEach.call(tracks, function (track, i) {
      var section = track.closest('.section_statement');
      if (!section) return;

      var toLeft = STATEMENT_ALTERNATE ? i % 2 === 0 : true;
      var from = toLeft ? near : far;
      var to = toLeft ? far : near;

      if (reduced) {
        gsap.set(track, { xPercent: from });
        return;
      }

      gsap.fromTo(
        track,
        { xPercent: from },
        {
          xPercent: to,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'clamp(top bottom)',
            end: 'clamp(bottom top)',
            scrub: true,
          },
        }
      );
    });
  }

  /* -------------------------------------------------------
     Statement-stapel: de onderliggende sectie dimmen

     De secties liggen op elkaar: de bovenste blijft plakken
     terwijl de volgende eroverheen schuift. Zonder meer
     lijken ze dan even dichtbij. Door de sectie die bedekt
     wordt te laten wegzakken in het bruin krijgt de stapel
     diepte — en het is dezelfde beweging als de footer over
     de menu-sectie maakt.

     Elke sectie stuurt zijn eigen sluier aan via de sectie
     die erná komt: die is de aanleiding, dus ook de trigger.
     Van `top bottom` tot `top top` — van het moment dat de
     volgende in beeld komt tot hij de vorige helemaal
     bedekt. De laatste van de stapel heeft niets na zich en
     dimt dus nooit.
     ------------------------------------------------------- */
  function initStatementStack() {
    var ScrollTrigger = window.ScrollTrigger;
    if (!ScrollTrigger) return;

    var sections = document.querySelectorAll('.section_statement');

    Array.prototype.forEach.call(sections, function (section, i) {
      var next = sections[i + 1];
      var dim = section.querySelector('[data-statement-dim]');
      if (!next || !dim) return;

      gsap.fromTo(
        dim,
        { opacity: 0 },
        {
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: next,
            start: 'clamp(top bottom)',
            end: 'clamp(top top)',
            scrub: true,
          },
        }
      );
    });
  }

  /* -------------------------------------------------------
     Datum van vandaag

     De menupagina zet de datum boven de kaart. Wat er in de
     opmaak staat is de dag waarop de site is gebouwd; hier
     komt de echte dag eroverheen. Engels, want de rest van
     de site is dat ook.
     ------------------------------------------------------- */
  function initToday() {
    var els = document.querySelectorAll('[data-today]');
    if (!els.length) return;

    var now = new Date();
    var day = now.getDate();
    var suffix =
      day % 10 === 1 && day !== 11 ? 'st' :
      day % 10 === 2 && day !== 12 ? 'nd' :
      day % 10 === 3 && day !== 13 ? 'rd' : 'th';

    var weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    var month = now.toLocaleDateString('en-US', { month: 'long' });
    var text = weekday + ', ' + month + ' ' + day + suffix;

    Array.prototype.forEach.call(els, function (el) {
      el.textContent = text;
    });
  }

  /* -------------------------------------------------------
     Dagbalk (Work)

     Hoe ver de dag is tussen opening en sluiting, in
     Amsterdamse tijd en niet die van de bezoeker. Voor de
     opening leeg, na sluiting vol. Eens per minuut bij.
     ------------------------------------------------------- */
  function initDayBar() {
    var bar = document.querySelector('[data-day-bar]');
    if (!bar) return;

    var fill = bar.querySelector('[data-day-bar-progress]');
    var open = parseFloat(bar.getAttribute('data-open')) || 0;
    var close = parseFloat(bar.getAttribute('data-close')) || 24;

    function update() {
      var hour = amsterdamNow().hour;
      var done = Math.min(1, Math.max(0, (hour - open) / (close - open)));
      fill.style.width = 'calc(' + done * 100 + '% + 1px)';
    }

    update();
    window.setInterval(update, 60000);
  }

  /* Uur van nu in Amsterdam als kommagetal, plus de weekdag
     (1 = maandag, 7 = zondag). Los van de tijdzone van de
     bezoeker: de openingstijden zijn die van de zaak. */
  function amsterdamNow() {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    var get = function (type) {
      var p = parts.filter(function (x) { return x.type === type; })[0];
      return p ? p.value : '';
    };
    var days = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return {
      hour: parseInt(get('hour'), 10) + parseInt(get('minute'), 10) / 60,
      day: days[get('weekday')] || 1,
    };
  }

  /* -------------------------------------------------------
     Open of dicht (Contact)

     Het label zegt "Now open" of "Closed now", op basis van
     de dagen en uren op het element. Eens per minuut bij.
     ------------------------------------------------------- */
  function initOpenStatus() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-open-status]'), function (el) {
      var label = el.querySelector('[data-open-status-label]');
      var range = (el.getAttribute('data-days') || '1-7').split('-');
      var from = parseInt(range[0], 10);
      var to = parseInt(range[1], 10);
      var open = parseFloat(el.getAttribute('data-open'));
      var close = parseFloat(el.getAttribute('data-close'));

      function update() {
        var now = amsterdamNow();
        var isOpen = now.day >= from && now.day <= to && now.hour >= open && now.hour < close;
        el.classList.toggle('is-closed', !isOpen);
        if (label) label.textContent = isOpen ? 'Now open' : 'Closed now';
      }

      update();
      window.setInterval(update, 60000);
    });
  }

  /* -------------------------------------------------------
     Uitklapvragen (Contact)

     Eén vraag tegelijk open. De hoogte loopt via CSS (een
     grid-rij van 0fr naar 1fr); hier staat alleen de class.
     ------------------------------------------------------- */
  function initAccordion() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-accordion]'), function (list) {
      var items = list.querySelectorAll('[data-accordion-item]');

      Array.prototype.forEach.call(items, function (item) {
        var toggle = item.querySelector('[data-accordion-toggle]');
        if (!toggle) return;

        toggle.addEventListener('click', function () {
          var opening = !item.classList.contains('is-open');
          Array.prototype.forEach.call(items, function (other) {
            var isThis = other === item;
            other.classList.toggle('is-open', isThis && opening);
            var t = other.querySelector('[data-accordion-toggle]');
            if (t) t.setAttribute('aria-expanded', isThis && opening ? 'true' : 'false');
          });
          /* De pagina wordt langer of korter; laat de
             scrolltriggers verderop dat weten zodra de
             overgang klaar is. */
          if (window.ScrollTrigger) window.setTimeout(window.ScrollTrigger.refresh, 350);
        });

        /* In Webflow is de vraag een div met role="button" en
           geen echte knop; Enter en spatie werken dan niet
           vanzelf. */
        if (toggle.tagName !== 'BUTTON') {
          toggle.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle.click();
            }
          });
        }
      });
    });
  }

  /* -------------------------------------------------------
     Lijst die meeloopt met de scroll (Work, Our story)

     Eén regel tegelijk staat vol, de rest op 40%. Welke het
     is volgt uit hoe ver je door de sectie bent, zodat ze
     één voor één oplichten terwijl je erlangs scrolt.
     ------------------------------------------------------- */
  function initFeatureList() {
    var ScrollTrigger = window.ScrollTrigger;
    if (!ScrollTrigger) return;

    Array.prototype.forEach.call(document.querySelectorAll('[data-feature-list]'), function (section) {
      var items = section.querySelectorAll('[data-feature]');
      var count = items.length;
      if (!count) return;

      ScrollTrigger.create({
        trigger: section,
        start: 'top center',
        end: 'bottom center',
        onUpdate: function (self) {
          var active = Math.min(count - 1, Math.floor(self.progress * count));
          Array.prototype.forEach.call(items, function (item, i) {
            item.classList.toggle('is-active', i === active);
          });
        },
      });
    });
  }

  /* -------------------------------------------------------
     Tabs

     Een `[data-tabs]`-rij met `[data-tab]`-knoppen, elk met
     `aria-controls` naar het paneel dat hij toont. Klikken,
     Enter of spatie kiest een tab; pijltjes links en rechts
     springen naar de volgende.

     Enter en spatie staan er ook in omdat de tabs in Webflow
     geen <button> zijn maar een div met role="tab" — daar
     doet de browser dat niet vanzelf.

     Na het wisselen wordt ScrollTrigger opnieuw gemeten: het
     andere paneel is anders hoog, en alles eronder — de
     parallax van de collage, de footer — schuift mee.
     ------------------------------------------------------- */
  function initTabs() {
    var lists = document.querySelectorAll('[data-tabs]');

    Array.prototype.forEach.call(lists, function (list) {
      var tabs = list.querySelectorAll('[data-tab]');
      if (!tabs.length) return;

      /* Het eigen paneel, plus wat er in `data-tab-also` staat:
         op de menupagina wisselt de rij favorieten mee met de
         kaart, en die staat in een andere sectie.          */
      function panelsOf(tab) {
        var ids = [tab.getAttribute('aria-controls')].concat(
          (tab.getAttribute('data-tab-also') || '').split(' ')
        );
        return ids
          .filter(Boolean)
          .map(function (id) { return document.getElementById(id); })
          .filter(Boolean);
      }

      function show(tab, on) {
        panelsOf(tab).forEach(function (panel) {
          panel.hidden = !on;
          panel.classList.toggle('is-hidden', !on);
        });
      }

      function select(tab, focus) {
        Array.prototype.forEach.call(tabs, function (t) {
          var on = t === tab;

          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.setAttribute('tabindex', on ? '0' : '-1');
          show(t, on);
        });

        var shown = panelsOf(tab);
        if (shown.length && window.gsap && !reduced) {
          window.gsap.fromTo(
            shown,
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', overwrite: true }
          );
        }

        if (focus) tab.focus();
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      }

      Array.prototype.forEach.call(tabs, function (tab, i) {
        tab.addEventListener('click', function () {
          select(tab, false);
        });

        tab.addEventListener('keydown', function (e) {
          var next = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
          if (next) {
            e.preventDefault();
            select(next, true);
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            select(tab, false);
          }
        });
      });

      /* Beginstand: de tab waarvan `data-tab-hash` in de URL
         staat (zodat /menu#drinks meteen op dranken opent), en
         anders de tab met `is-active`. Zo hoeven de panelen in
         Webflow geen `hidden`-attribuut te dragen. */
      var hash = window.location.hash.replace('#', '');
      var fromHash = hash
        ? list.querySelector('[data-tab][data-tab-hash="' + hash + '"]')
        : null;
      var start = fromHash || list.querySelector('[data-tab].is-active') || tabs[0];
      if (fromHash) select(start, false);
      else {
        Array.prototype.forEach.call(tabs, function (t) {
          show(t, t === start);
        });
      }
    });
  }

  /* -------------------------------------------------------
     Mobiel menu

     Het paneel staat in de opmaak met `hidden`, zodat er
     zonder JS geen schermvullend vlak over de pagina ligt.
     Dit script haalt dat eraf en doet het openen en sluiten.

     Lenis wordt stilgezet zolang het open staat, anders
     scrollt de pagina eronder door terwijl je in het menu
     kijkt.
     ------------------------------------------------------- */
  function initMenu() {
    var panel = document.querySelector('[data-menu]');
    var open = document.querySelector('[data-menu-open]');
    var close = document.querySelector('[data-menu-close]');
    if (!panel || !open) return;

    panel.hidden = false;
    panel.style.display = 'none';

    /* Allebei de standen expliciet zetten en niet de inline
       stijl wissen: in Webflow staat het paneel in de CSS op
       `display: none` — anders ligt er een schermvullend vlak
       over het Designer-canvas — en dan zou wissen hem juist
       weer verbergen. */
    function show() {
      panel.style.display = 'flex';
      open.setAttribute('aria-expanded', 'true');
      if (app.lenis) app.lenis.stop();
      if (close) close.focus();
    }

    function hide() {
      panel.style.display = 'none';
      open.setAttribute('aria-expanded', 'false');
      if (app.lenis) app.lenis.start();
      open.focus();
    }

    open.addEventListener('click', show);
    if (close) close.addEventListener('click', hide);

    /* Een link aantikken sluit het menu: gaat hij naar een
       anker op deze pagina, dan blijft het paneel er anders
       overheen staan. */
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) hide();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.style.display !== 'none') hide();
    });
  }
  /* -------------------------------------------------------
     Menu-sectie: pas plakken als hij helemaal in beeld is

     De sectie onder "Daily fresh food" blijft plakken terwijl
     de footer eroverheen schuift. Met `top: 0` plakt hij aan
     de bovenkant, maar hij is hoger dan een laptopscherm: de
     onderste strook met de productfoto's kwam dan nooit
     helemaal in beeld voordat de footer erover viel
     (feedback 13 nov 2026). Daarom zet dit script `top` op
     schermhoogte min sectiehoogte, als dat negatief is: dan
     scrolt hij eerst tot zijn onderkant op de onderkant van
     het scherm staat, en blijft hij pas dan staan.
     ------------------------------------------------------- */
  function initStickyFit() {
    var sections = document.querySelectorAll('.section_menu');
    if (!sections.length) return;

    function fit() {
      Array.prototype.forEach.call(sections, function (section) {
        var gap = window.innerHeight - section.offsetHeight;
        section.style.top = gap < 0 ? gap + 'px' : '';
      });
    }

    fit();
    window.addEventListener('resize', fit);
  }

  /* -------------------------------------------------------
     Navigatie: een streepje per item dat volloopt

     Was een streep die tussen de items meegleed; dat voelde
     te gimmicky voor Megan (feedback 13 nov 2026). Nu krijgt
     elk item zijn eigen dunne streepje op de streep van de
     header, onder de tekst. Bij hover schuift het subtiel
     van onder in, bij weggaan zakt het weer weg. Het actieve
     item heeft het altijd. Die beweging zelf is CSS
     (exceptions.css); dit script maakt alleen de streepjes
     aan en zoekt het actieve item.

     De oude meeglijdende streep wordt weggehaald als hij in
     de opmaak staat (Webflow).
     ------------------------------------------------------- */
  function initNavLines() {
    var wrap = document.querySelector('.header_nav-wrap');
    if (!wrap) return;

    var marker = wrap.querySelector('[data-nav-marker]');
    if (marker) marker.parentNode.removeChild(marker);

    var items = wrap.querySelectorAll('.header_nav-item');

    /* Staat er niets als actief gemarkeerd, kijk dan of een
       link naar de pagina wijst waar je bent. De homepage
       telt niet mee: daar is geen item de pagina zelf.    */
    if (!wrap.querySelector('.header_nav-item.is-active') && location.pathname !== '/') {
      Array.prototype.some.call(items, function (item) {
        if (item.pathname !== location.pathname) return false;
        item.classList.add('is-active');
        return true;
      });
    }

    Array.prototype.forEach.call(items, function (item) {
      if (item.querySelector('.header_nav-line')) return;
      var line = document.createElement('span');
      line.className = 'header_nav-line';
      line.setAttribute('aria-hidden', 'true');
      item.appendChild(line);
    });
  }

  /* -------------------------------------------------------
     Rail-CTA: uittrekken bij hover

     De knop staat 90 graden gedraaid. GSAP stelt transforms
     samen als translate -> rotate, dus `x` is gewoon links/
     rechts op het scherm. De hoogte blijft wel gedraaid:
     die is op het scherm de breedte. Omdat de tekst tegen de
     lokale onderkant staat — de linkerkant op het scherm —
     groeit het vlak alleen naar rechts, en trekt de
     verschuiving het geheel weer tegen de rand.
     ------------------------------------------------------- */
  var RAIL_SIZE = 38;  /* px — gelijk aan --rail--size */
  var RAIL_PULL = 8;   /* px die de knop naar links komt */
  var CARD_ZOOM = 1.03;

  /* Twee curves, één keer aangemaakt en gedeeld.

     `elastic` is Osmo's veercurve, voor de rail-CTA.
     `smooth` is cubic-bezier(0.625, 0.05, 0, 1) — dezelfde
     als de nav-links gebruiken. Een cubic-bezier is exact
     het pad `M0,0 C x1,y1 x2,y2 1,1`, dus die kan zo aan
     CustomEase gegeven worden.

     Allebei vallen terug op een gewone ease als CustomEase
     ontbreekt of als de bezoeker beweging heeft uitgezet. */
  var EASE = 'power2.out';
  var EASE_SMOOTH = 'power2.out';

  function initEase() {
    if (reduced || !window.gsap || !window.CustomEase) return;
    window.gsap.registerPlugin(window.CustomEase);
    window.CustomEase.create('smooth', 'M0,0 C0.625,0.05 0,1 1,1');
    EASE_SMOOTH = 'smooth';
    window.CustomEase.create(
      'elastic',
      'M0,0 C0.0127,0.0956 0.0562,0.434 0.076,0.5737 C0.0958,0.7134 0.1077,0.7761 0.1187,0.8382 C0.1297,0.9003 0.1341,0.9145 0.1419,0.9463 C0.1497,0.9781 0.1574,1.0055 0.1654,1.0292 C0.1734,1.0529 0.1814,1.0725 0.1897,1.0886 C0.198,1.1047 0.2086,1.1177 0.2153,1.1258 C0.222,1.1339 0.2248,1.1342 0.2297,1.137 C0.2346,1.1398 0.2396,1.1415 0.2448,1.1424 C0.25,1.1433 0.2554,1.1433 0.261,1.1423 C0.2666,1.1413 0.2704,1.1409 0.2786,1.1366 C0.2868,1.1323 0.2922,1.1308 0.3101,1.1165 C0.328,1.1022 0.3669,1.0665 0.3862,1.0507 C0.4055,1.0349 0.4118,1.0304 0.4257,1.0219 C0.4397,1.0134 0.4548,1.0053 0.4699,0.9995 C0.485,0.9937 0.4967,0.9898 0.5163,0.9872 C0.5359,0.9846 0.5383,0.9819 0.5877,0.9842 C0.6371,0.9865 0.7439,0.9985 0.8126,1.0011 C0.8813,1.0037 0.9688,1.0002 1,1'
    );
    EASE = 'elastic';
  }

  /* -------------------------------------------------------
     Fotokaarten: subtiel inzoomen bij hover

     De schaal zit op de <img>, niet op het kader eromheen —
     dat kader wordt door de parallax verschoven, en twee
     dingen op dezelfde transform laten vechten levert
     alleen maar gedoe op.
     ------------------------------------------------------- */
  function initCardHover() {
    var gsap = window.gsap;
    if (!gsap) return;

    var cards = document.querySelectorAll('.hero_card');

    Array.prototype.forEach.call(cards, function (card) {
      var img = card.querySelector('.photo-card_image');
      if (!img) return;

      card.addEventListener('mouseenter', function () {
        gsap.to(img, {
          scale: CARD_ZOOM,
          duration: reduced ? 0.2 : 0.6,
          ease: EASE_SMOOTH,
          overwrite: true,
        });
      });

      card.addEventListener('mouseleave', function () {
        gsap.to(img, {
          scale: 1,
          duration: reduced ? 0.2 : 0.6,
          ease: EASE_SMOOTH,
          overwrite: true,
        });
      });
    });
  }

  function initRail() {
    var btn = document.querySelector('.button.is-rail');
    var gsap = window.gsap;
    if (!btn || !gsap) return;

    /* De ruststand van de padding waar de hover vanaf rekent.
       Uitgelezen en niet als getal hier: hij komt uit
       `.button` in de CSS, en een kopie zou stilletjes gaan
       afwijken zodra die verandert. */
    var RAIL_PAD = parseFloat(window.getComputedStyle(btn).paddingTop) || 0;

    btn.addEventListener('mouseenter', function () {
      gsap.to(btn, {
        paddingTop: RAIL_PAD + RAIL_PULL,
        x: -RAIL_PULL,
        duration: reduced ? 0.2 : 0.65,
        ease: EASE,
        overwrite: true,
      });
    });

    btn.addEventListener('mouseleave', function () {
      gsap.to(btn, {
        paddingTop: RAIL_PAD,
        x: 0,
        duration: reduced ? 0.2 : 0.25,
        ease: 'power2.out',
        overwrite: true,
      });
    });
  }

  /* -------------------------------------------------------
     Kop: per regel omhoog uit een masker

     SplitText knipt de kop in regels en zet om elke regel
     een wrapper met overflow hidden (`mask: 'lines'`). De
     regels staan een volle regelhoogte lager en schuiven
     omhoog het masker in.

     Splitsen gebeurt pas als de fonts geladen zijn — anders
     valt de regelafbreking in het fallback-font en klopt de
     verdeling niet.
     ------------------------------------------------------- */
  function initHeading() {
    var el = document.querySelector('[data-split-lines]');
    if (!el) return null;

    var gsap = window.gsap;
    var SplitText = window.SplitText;
    if (!gsap || !SplitText) return null;

    var split = SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'heading_line',
    });

    gsap.set(split.lines, { yPercent: 100 });

    return function play() {
      gsap.to(split.lines, {
        yPercent: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.12,
        delay: HEADING_DELAY,
      });
    };
  }

  /* -------------------------------------------------------
     Loader

     De pagina begint als leeg bruin vlak. Elke stap zet een
     class erbij; de beweging zit in css/ode/hero-loader.css.
     Bij de laatste stap gaat `is-loading` eraf en lopen alle
     elementen terug naar hun rustwaardes uit de Designer —
     dat is de beweging van het woordmerk naar de balk. De
     kop wordt op datzelfde moment door GSAP ingeschoven.
     ------------------------------------------------------- */
  var STEPS = [
    { at: 300, add: 'step-logo' },    /* woordmerk verschijnt */
    { at: 1200, add: 'step-images' }, /* foto's, gestagger'd  */
    { at: 2100, add: 'step-menu' },   /* balk van boven       */
    { at: 2700, done: true },         /* woordmerk naar balk  */
  ];

  function initLoader(playHeading) {
    if (!root.classList.contains('is-loading')) return;

    function finish() {
      root.classList.remove('is-loading', 'step-logo', 'step-images', 'step-menu');
      if (app.lenis) app.lenis.start();
      if (playHeading) playHeading();

      /* De loader heeft de indeling veranderd; ScrollTrigger
         moet zijn posities opnieuw meten, anders rekent de
         parallax met de maten van vóór de intro. */
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    }

    if (reduced) {
      finish();
      return;
    }

    if (app.lenis) app.lenis.stop();

    STEPS.forEach(function (step) {
      window.setTimeout(function () {
        if (step.done) finish();
        else root.classList.add(step.add);
      }, step.at);
    });
  }

  function start() {
    initEase();
    initLenis();
    initCardHover();
    initCardLabels();
    initCollage();
    initSlider();
    initMoments();
    initPhotoGather();
    initStayMoments();
    initTheme();
    initRail();
    initNavLines();
    initStickyFit();
    initMenu();
    initToday();
    initDayBar();
    initOpenStatus();
    initAccordion();
    initFeatureList();
    initTabs();
    initStatementHeadings();
    initStatementStack();

    var fonts = document.fonts && document.fonts.ready
      ? document.fonts.ready
      : Promise.resolve();

    fonts.then(function () {
      initLoader(initHeading());
    });
  }

  /* Wachten op `load`, zodat het logo en de foto's er staan
     voordat de reeks begint. */
  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start);
  }
})();
