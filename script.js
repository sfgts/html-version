const translations = {
  EN: {
    badge: "June 11 — July 19, 2026",
    heroTitle: "The greatest <span>football</span> tournament on Earth.",
    heroDesc: "48 nations. 16 host cities across three countries. One trophy. ESportsBattle brings you full coverage of the FIFA World Cup 2026 — the biggest, boldest and most united edition in the history of the game.",
    whoWeAreTitle: "Who we are",
    whoWeAreP1: "ESportsBattle is the largest esports platform offering 24/7 commercial tournaments, an esports academy, a national esports league, and a growing community of players and fans. We cover football, basketball, ice hockey, tennis and CS2.",
    whoWeAreP2: "10,000+ efootball events per month. 40+ top players. Live streams around the clock.",
    aboutTitle: "About the tournament",
    aboutP1: "The 2026 edition is the first World Cup hosted by three nations — Canada, Mexico and the United States — and the first to feature 48 teams. Across 39 days and 104 matches, the world's best players will compete for the most coveted trophy in sport.",
    aboutP2: "Twelve groups of four open the tournament, followed by a thirty-two-team knockout stage that crowns a champion at MetLife Stadium in New York on July 19.",
    pillarsTitle: "What makes 2026 different",
    nav: ["ABOUT", "TEAMS", "PLAYERS", "NEWS", "TERMS AND CONDITIONS"],
    stats: [
      { label: "Nations" },
      { label: "Matches" },
      { label: "Host Cities" },
      { label: "Days of Football" },
    ],
    pillars: [
      { title: "Three host nations", text: "For the first time ever, the World Cup spans Canada, Mexico and the USA — uniting an entire continent." },
      { title: "48 teams", text: "An expanded format gives more nations the chance to write their name into football history." },
      { title: "16 iconic stadiums", text: "From Azteca to MetLife, matches will be played in some of the most legendary venues on the planet." },
      { title: "39 days, 104 matches", text: "The biggest schedule ever — more games, more drama, more chances to witness history." },
      { title: "A new generation", text: "Today's superstars and tomorrow's prodigies share the same pitch under one summer sky." },
      { title: "One trophy", text: "Every story, every sprint, every save leads to one moment in New York on July 19." },
    ],
    footer: "© 2026 ESportsBattle. The largest esports platform. esportsbattle.com",
  },
  UA: {
    badge: "11 червня — 19 липня 2026",
    heroTitle: "Найбільший <span>футбольний</span> турнір на Землі.",
    heroDesc: "48 збірних. 16 міст-господарів у трьох країнах. Один трофей. ESportsBattle — твоє місце для стеження за Чемпіонатом світу з футболу 2026.",
    whoWeAreTitle: "Хто ми",
    whoWeAreP1: "ESportsBattle — найбільша кіберспортивна платформа, яка проводить комерційні турніри 24/7, керує академією кіберспорту, національною лігою та розвиває спільноту гравців і вболівальників. Напрямки: футбол, баскетбол, хокей, теніс та CS2.",
    whoWeAreP2: "10 000+ кіберфутбольних подій щомісяця. 40+ топових гравців. Прямі трансляції цілодобово.",
    aboutTitle: "Про турнір",
    aboutP1: "Видання 2026 року — перший Чемпіонат світу, що приймається трьома країнами — Канадою, Мексикою та США — і перший з 48 командами. За 39 днів і 104 матчі найкращі гравці світу змагатимуться за найбажаніший трофей у спорті.",
    aboutP2: "Дванадцять груп по чотири команди відкривають турнір, після яких слідує плей-офф з 32 командами, що визначить чемпіона на стадіоні MetLife у Нью-Йорку 19 липня.",
    pillarsTitle: "Чим 2026 відрізняється",
    nav: ["ПРО НАС", "КОМАНДИ", "ГРАВЦІ", "НОВИНИ", "УМОВИ"],
    stats: [
      { label: "Збірних" },
      { label: "Матчів" },
      { label: "Міст-господарів" },
      { label: "Днів футболу" },
    ],
    pillars: [
      { title: "Три країни-господарі", text: "Вперше в історії Чемпіонат світу охоплює Канаду, Мексику та США — об'єднуючи цілий континент." },
      { title: "48 команд", text: "Розширений формат дає більшій кількості збірних шанс увійти в футбольну історію." },
      { title: "16 легендарних стадіонів", text: "Від Ацтеки до MetLife — матчі пройдуть на найвидатніших аренах планети." },
      { title: "39 днів, 104 матчі", text: "Найбільший розклад в історії — більше ігор, більше драми, більше можливостей стати свідком історії." },
      { title: "Нове покоління", text: "Суперзірки сьогодення та таланти завтрашнього дня грають разом під одним літнім небом." },
      { title: "Один трофей", text: "Кожна історія, кожен ривок, кожен сейв веде до одного моменту в Нью-Йорку 19 липня." },
    ],
    footer: "© 2026 ESportsBattle. Найбільша кіберспортивна платформа. esportsbattle.com",
  },
};

let currentLang = "EN";

function applyLang(lang) {
  const t = translations[lang];

  document.getElementById("badge-text").textContent = t.badge;
  document.getElementById("hero-title").innerHTML = t.heroTitle;
  document.getElementById("hero-desc").textContent = t.heroDesc;
  document.getElementById("who-title").textContent = t.whoWeAreTitle;
  document.getElementById("who-p1").textContent = t.whoWeAreP1;
  document.getElementById("who-p2").textContent = t.whoWeAreP2;
  document.getElementById("about-title").textContent = t.aboutTitle;
  document.getElementById("about-p1").textContent = t.aboutP1;
  document.getElementById("about-p2").textContent = t.aboutP2;
  document.getElementById("pillars-title").textContent = t.pillarsTitle;
  document.getElementById("footer-text").textContent = t.footer;

  const statLabels = document.querySelectorAll(".stat-card .label");
  t.stats.forEach((s, i) => { if (statLabels[i]) statLabels[i].textContent = s.label; });

  const pillarCards = document.querySelectorAll(".pillar-card");
  t.pillars.forEach((p, i) => {
    if (pillarCards[i]) {
      pillarCards[i].querySelector("h3").textContent = p.title;
      pillarCards[i].querySelector("p").textContent = p.text;
    }
  });

  const navLinks = document.querySelectorAll("nav a");
  t.nav.forEach((label, i) => {
    if (navLinks[i]) {
      const svg = navLinks[i].querySelector("svg");
      navLinks[i].textContent = label;
      if (svg) navLinks[i].prepend(svg);
    }
  });

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  currentLang = lang;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => applyLang(btn.dataset.lang));
  });

  const scrollBtn = document.getElementById("scrollTopBtn");
  window.addEventListener("scroll", () => {
    scrollBtn.classList.toggle("visible", window.scrollY > 300);
  }, { passive: true });
});
