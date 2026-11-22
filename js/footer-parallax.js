/* =========================================================
   footer-parallax.js
   Al het gedrag van de footer. Vereist gsap + ScrollTrigger.

   Twee dingen, allebei van de footer zelf — vandaar dat ze
   hier staan en niet in main.js: dan reikt de pagina in de
   binnenkant van een component.

   1. De beweging. Footer Parallax Effect van Osmo Supply,
      met één afwijking: `yPercent` is +25 in plaats van -25.
      Bij hun waarde loopt de footer trager omhoog dan de
      pagina en komt hij er ondervandaan; positief laat hem
      sneller lopen, waardoor hij er juist overheen schuift.

      Niet hoger zetten om het effect te versterken — het
      omgekeerde gebeurt. Het bedekken komt van de sectie
      erboven die blijft plakken; deze waarde zet de footer
      tijdens het scrollen juist een stuk lager dan waar hij
      hoort, en trekt dus van die overlap af. Wie er meer
      wil, verhoogt `--footer--overlap`.

   2. De sluier. Van ons, niet van Osmo. Staat bewust niet op
      de tijdlijn hierboven: dat bereik begint zodra de
      WRAPPER onderaan het scherm komt, terwijl de footer
      zelf op dat moment nog tot een kwart van zijn hoogte
      lager staat door punt 1. De sluier kwam dan al op
      voordat er bruin te zien was.
   ========================================================= */

/* Valt deze footer over de pagina heen? Alleen als het
   markeerelement er is én zichtbaar is. Webflow laat een
   element dat aan een uitgezette prop hangt meestal weg, maar
   kan het ook alleen verbergen — beide tellen als "uit". */
const overlapOn = el => {
  const mark = el.querySelector('[data-footer-overlap]');
  return !!mark && window.getComputedStyle(mark).display !== 'none';
};

function initFooterParallax(){
  document.querySelectorAll('[data-footer-parallax]').forEach(el => {
    if (!overlapOn(el)) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'clamp(top bottom)',
        end: 'clamp(top top)',
        scrub: true
      }
    });

    const inner = el.querySelector('[data-footer-parallax-inner]');

    if (inner) {
      tl.from(inner, {
        yPercent: 25,
        ease: 'linear'
      });
    }
  });
}

/* ---------------------------------------------------------
   De sluier

   Een bruin verloop dat vastzit aan het scherm en ACHTER de
   footer ligt. Daardoor is het zichtbare deel altijd precies
   het stuk dat nog geen footer is — de footer maskeert
   zichzelf.

   De dekking volgt hoeveel scherm de footer werkelijk
   bedekt. Een meting en geen scrollpositie: de footer
   schuift niet alleen met de pagina mee maar staat door zijn
   eigen beweging ook nog tot een kwart van zijn hoogte
   lager. Wie op de scrollpositie afgaat, laat de sluier dus
   al opkomen terwijl er nog geen bruin in beeld is.

   Niets in beeld is dus ook niets te zien. En staat de footer
   er bij het laden al, dan blijft hij helemaal uit: op een
   korte pagina valt er niets over te nemen, en zonder die
   uitzondering ligt er een bruine waas over de hele pagina
   die nooit meer weggaat.

   Vol is hij al ruim voordat de footer het scherm vult — zie
   VEIL_FULL. Eén op één met de bedekking klinkt netter maar
   werkt averechts: de sluier is er om de overgang te dragen,
   en dan moet hij op sterkte zijn terwijl er nog wat naast
   de footer te zien is. Rekt hij mee tot het volle scherm,
   dan is hij precies in die fase nog nauwelijks aanwezig en
   op het moment dat hij vol staat allang onzichtbaar achter
   de footer.
   --------------------------------------------------------- */

/* Deel van het scherm dat de footer moet bedekken voordat de
   sluier op zijn sterkste staat. */
const VEIL_FULL = 0.4;

/* Hoe ver hij gaat. Staat hier en niet in de CSS, want in de
   CSS is 0 de waarheid: in rust is er niets te zien, en dat is
   precies wat de Designer moet tonen. Stond het eindpunt daar,
   dan lag er op het canvas permanent een bruin vlak over de
   hele pagina. */
const VEIL_MAX = 0.85;

/* Alleen waar de footer over een plakkende sectie schuift
   (de menu-sectie op home). Op de andere pagina's scrolt de
   inhoud gewoon mee en gaf de sluier alleen een vuile band
   tussen crème en bruin (feedback 13 nov 2026). Een pagina
   kan hem expliciet aanzetten met `data-footer-veil`. */
const veilWanted = () =>
  !!document.querySelector('.section_menu-spacer, [data-footer-veil]');

function initFooterVeil(){
  if (!veilWanted()) return;

  document.querySelectorAll('[data-footer-parallax]').forEach(el => {
    if (!overlapOn(el)) return;

    const footer = el.querySelector('[data-footer-parallax-inner]');
    const veil   = el.querySelector('[data-footer-parallax-dark]');
    if (!footer || !veil) return;

    const draw = () => {
      const screen = window.innerHeight;
      const top = footer.getBoundingClientRect().top;

      /* Waar de footer staat als je bovenaan de pagina bent.
         Ligt dat binnen het scherm, dan komt hij niet van
         onderen binnen maar staat hij er gewoon — en dan is
         er geen overgang om te verzachten. */
      if (top + window.scrollY < screen) {
        veil.style.opacity = 0;
        return;
      }

      let covered = screen - top;

      if (covered < 0) covered = 0;

      const reach = Math.min(1, covered / (screen * VEIL_FULL));
      veil.style.opacity = VEIL_MAX * reach;
    };

    ScrollTrigger.create({
      trigger: el,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: draw,
      onRefresh: draw
    });

    draw();
  });
}

// Initialize Footer with Parallax Effect
document.addEventListener('DOMContentLoaded', () => {
  initFooterParallax();
  initFooterVeil();
});
