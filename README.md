# Salipäiväkirja

Kuntosalitreenien kirjaus- ja analytiikkasovellus. Toimii puhelimessa asennettavana web-sovelluksena (PWA), offline, ilman palvelinta tai tekoälyä taustalla.

## Ominaisuudet

**Kirjaa**: liike (automaattitäydennys + pikavalinnat), paino, toistot. Paino ja toistot esitäytetään edellisestä sarjasta, ja edellisen kerran sarjat näkyvät vertailuna. Ennätyssarjasta tulee ilmoitus ja PR-merkki.

**Liikkeet** (liikekohtainen kehitys):
- Arvioitu 1RM (Epley: `paino × (1 + toistot/30)`) ajan yli, trendiviivan kanssa
- Muutos % viimeiset 4 vk vs. sitä edeltävät 4 vk
- Kehitysvauhti kg/viikko (lineaarinen regressio 12 viimeisestä kerrasta)
- Ennätykset: paras e1RM, raskain paino, suurin volyymi
- Volyymi per kerta, viimeisimmät kerrat taulukkona
- Kehonpainoliikkeet (paino 0) mitataan toistoilla

**Aktiivisuus**: käynnit tällä viikolla vs. viikkotavoite, viikkoputki, käynnit 30 pv, keskiarvo/viikko, päiviä edellisestä käynnistä, viikkokaavio, 6 kk:n kalenterinäkymä, kuukausitilastot, treenatuimmat liikkeet.

**Historia**: kaikki kirjaukset päivittäin, poisto (kumottavissa), vienti JSON/CSV ja tuonti.

## Kaaviot ja värinäpalaute

Kaavioita luetaan liu'uttamalla sormea niiden yli: arvo, päivä ja paras sarja päivittyvät otsikkolukuun, viiva värittyy kosketuskohtaan asti ja jokainen datapiste antaa kevyen haptisen napsahduksen. Viivan väri kertoo suunnan valitulla aikavälillä (vihreä nousu, punainen lasku).

- **Android (Chrome):** Vibration API.
- **iPhone:** Safari ei tue Vibration API:a. iOS 18+ antaa haptisen palautteen natiivin switch-kytkimen painalluksesta, ja sovellus käyttää tätä kiertotietä. Se ei ole virallinen rajapinta, joten Apple voi muuttaa sitä.
- Voit kytkeä palautteen pois Historia-välilehdeltä.

## Käyttöönotto

1. Ota GitHub Pages käyttöön: *Settings → Pages → Source: GitHub Actions*.
2. Yhdistä koodi `main`-haaraan. Workflow ajaa testit ja julkaisee osoitteeseen `https://<käyttäjä>.github.io/<repo>/`.
3. Avaa osoite puhelimessa ja lisää kotinäytölle (iPhone: Safari → Jaa → Lisää Koti-valikkoon; Android: Chrome → Asenna sovellus).

Paikallisesti: `npm start` (tai `python3 -m http.server`) ja avaa `http://localhost:8080`. ES-moduulit ja service worker eivät toimi `file://`-osoitteesta.

## Data

Data tallentuu vain laitteen selaimeen (localStorage). Siitä seuraa:
- Selaimen datan tyhjennys poistaa treenit. **Vie JSON-varmuuskopio säännöllisesti** (sovellus muistuttaa, jos vienti on yli 2 vk vanha).
- iPhonella Safari voi poistaa datan sivustoilta, joita ei ole käytetty 7 päivään, **ellei sovellusta ole lisätty kotinäytölle**. Asenna se siis kotinäytölle.
- Data ei synkronoidu laitteiden välillä. Siirto: vie JSON → tuo toisella laitteella (duplikaatit ohitetaan).

CSV-muoto (`date,exercise,weight,reps`) sopii myös vanhan Excel-datan tuontiin.

## Kehitys

- `analytics.js`: kaikki laskenta puhtaina funktioina
- `app.js`: käyttöliittymä ja omat SVG-kaaviot (ei riippuvuuksia)
- `sw.js`: offline-välimuisti. **Nosta `VERSION` jokaisen julkaisun yhteydessä.**
- `npm test`: analytiikan yksikkötestit (Node 22+)
