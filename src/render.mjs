const escape = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const capitalize = (text) => {
  const value = String(text ?? '').trim();
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const sentence = (text) => {
  const value = capitalize(text);
  return value && !/[.!?]$/.test(value) ? `${value}.` : value;
};

const safeUrl = (url) => (/^https?:\/\//.test(url ?? '') ? escape(url) : '#');

const STYLE = `
:root {
  --bg: #f6f3ee; --surface: #ffffff; --text: #1d2330; --text2: #4d5566; --text3: #7a8191;
  --accent: #8a6a3f; --border: #e4ded4;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0b0f17; --surface: #141a26; --text: #e8e4dc; --text2: #aab0bd; --text3: #7d8494;
    --accent: #c8a97e; --border: #232b3b; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
main { max-width: 640px; margin: 0 auto; padding: 32px 16px 64px; }
h1, h2 { font-family: "Newsreader", Georgia, serif; font-weight: 500; }
h1 { font-size: 34px; line-height: 1.15; margin: 0; }
.date { color: var(--accent); font-family: "Newsreader", Georgia, serif; font-size: 22px; margin: 2px 0 28px; }
h2 { font-size: 13px; font-family: inherit; text-transform: uppercase; letter-spacing: .08em;
  color: var(--text3); margin: 32px 0 10px; font-weight: 600; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 10px; }
.card a { color: var(--text); text-decoration: none; font-weight: 600; }
.card a:hover { text-decoration: underline; }
.meta { color: var(--text3); font-size: 14px; margin-top: 2px; }
.why { color: var(--text2); margin: 8px 0 0; }
.book { display: flex; gap: 14px; align-items: flex-start; }
.book img { width: 72px; border-radius: 6px; flex: none; }
.empty { color: var(--text3); }
nav ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
nav a { display: inline-block; padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px;
  color: var(--text2); text-decoration: none; font-size: 14px; }
nav a[aria-current] { color: var(--accent); border-color: var(--accent); }
footer { color: var(--text3); font-size: 13px; margin-top: 40px; }
`;

function articles(day) {
  if (day.articles.length === 0) return '<p class="empty">No articles today.</p>';
  return day.articles
    .map(
      (article) => `<div class="card">
  <a href="${safeUrl(article.url)}">${escape(article.title)}</a>
  <div class="meta">${escape(article.source)}</div>
  <p class="why">${escape(sentence(article.why))}</p>
</div>`,
    )
    .join('\n');
}

function book(day) {
  const pick = day.book;
  if (!pick) return '<p class="empty">No book today. None of the suggestions could be found in Open Library.</p>';
  return `<div class="card book">
  ${pick.cover ? `<img src="${safeUrl(pick.cover)}" alt="">` : ''}
  <div>
    <a href="${safeUrl(pick.url)}">${escape(pick.title)}</a>
    <div class="meta">${escape(pick.author)}${pick.year ? `, ${escape(pick.year)}` : ''}</div>
    ${pick.sinceLabel ? `<div class="meta">${pick.isNew ? 'New this week' : `Since ${escape(pick.sinceLabel)}`}</div>` : ''}
    <p class="why">${escape(sentence(pick.why))}</p>
  </div>
</div>`;
}

function hobby(day) {
  if (!day.hobby) return '<p class="empty">Nothing new today.</p>';
  return `<div class="card">
  <strong>${escape(capitalize(day.hobby.name))}</strong>
  <div class="meta">${escape(capitalize(day.hobby.time))}</div>
  <p class="why">${escape(sentence(day.hobby.try))}</p>
</div>`;
}

function learn(day) {
  if (!day.learn) return '<p class="empty">Nothing new today.</p>';
  return `<div class="card">
  <strong>${escape(capitalize(day.learn.topic))}</strong>
  <div class="meta">${escape(day.learn.kind === 'AI' ? 'AI' : capitalize(day.learn.kind))}</div>
  <p class="why">${escape(sentence(day.learn.do))}</p>
</div>`;
}

export function renderDay(day, recentDates, { linkPrefix }) {
  const nav = recentDates
    .map((date) => {
      const current = date === day.date ? ' aria-current="page"' : '';
      return `<li><a href="${linkPrefix}days/${escape(date)}.html"${current}>${escape(date.slice(5))}</a></li>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daily picks</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&display=swap">
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>${escape(day.weekday)}</h1>
  <div class="date">${escape(day.longDate)}</div>

  <h2>Read today</h2>
  ${articles(day)}

  <h2>Your book</h2>
  ${book(day)}

  <h2>Try this</h2>
  ${hobby(day)}

  <h2>Learn</h2>
  ${learn(day)}

  <h2>Earlier</h2>
  <nav><ul>${nav}</ul></nav>

  <footer>Picked by ${escape(day.model)} from the morning's headlines. Books checked against Open Library.</footer>
</main>
</body>
</html>
`;
}
