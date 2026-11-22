# Megan scripts

Animatielaag van de Megan-website (Webflow). Webflow laadt deze bestanden via jsDelivr, vastgezet op een versietag:

```html
<script defer src="https://cdn.jsdelivr.net/gh/mammutstudios/megan-scripts@1.0.0/js/parallax.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/mammutstudios/megan-scripts@1.0.0/js/marquee.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/mammutstudios/megan-scripts@1.0.0/js/footer-parallax.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/mammutstudios/megan-scripts@1.0.0/js/main.js"></script>
```

Vereist vooraf als globals: Lenis 1.3.26 en GSAP 3.15.0 met ScrollTrigger, CustomEase en SplitText.

## Een wijziging uitrollen

1. Pas het bestand aan in `js/` en commit.
2. Tag een nieuwe versie: `git tag 1.0.1 && git push --tags`.
3. Zet in Webflow (Site settings, Custom code, footer) het versienummer in de vier URL's op de nieuwe tag en publiceer.

Een tag verandert nooit meer, dus de live site wijzigt pas als de URL in Webflow omgaat.
