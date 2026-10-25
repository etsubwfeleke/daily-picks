import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchHeadlines } from './feeds.mjs';
import { askModel, buildPrompt } from './model.mjs';
import { verifyBook } from './openlibrary.mjs';
import { renderDay } from './render.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const historyPath = join(root, 'data', 'history.json');
const mock = process.argv.includes('--mock');
const force = process.argv.includes('--force') || process.env.FORCE === 'true';
const newBook = process.argv.includes('--new-book') || process.env.NEW_BOOK === 'true';

const config = JSON.parse(await readFile(join(root, 'config.json'), 'utf8'));
const history = JSON.parse(await readFile(historyPath, 'utf8').catch(() => '[]'));

function todayIn(timeZone) {
  const now = new Date();
  const part = (options) => new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(now);
  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone }).format(now),
    weekday: part({ weekday: 'long' }),
    longDate: part({ day: 'numeric', month: 'long' }),
  };
}

const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

const dayLabel = (date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

/**
 * A book stays on the page until it has had `bookEveryDays` days, since nobody
 * finishes one a day. A new one comes early only when asked for (--new-book,
 * or "New book" when running the workflow by hand).
 */
function currentBook(today) {
  const earlier = history.filter((day) => day.date < today && day.book);
  const last = earlier.at(-1)?.book ?? null;
  if (!last) return { last: null, due: true };
  const since = last.since ?? earlier.at(-1).date;
  return { last: { ...last, since }, due: newBook || daysBetween(since, today) >= config.bookEveryDays };
}

function recentHistory(days) {
  const recent = history.slice(-days);
  return {
    books: [...new Set(recent.filter((day) => day.book).map((day) => `${day.book.title} by ${day.book.author}`))],
    hobbies: recent.filter((day) => day.hobby).map((day) => day.hobby.name),
    learning: recent.filter((day) => day.learn).map((day) => day.learn.topic),
    urls: new Set(history.flatMap((day) => day.articles.map((article) => article.url))),
    bookTitles: new Set(history.filter((day) => day.book).map((day) => normalize(day.book.title))),
  };
}

function mockPicks(world) {
  return {
    model: 'mock',
    picks: {
      articles: [
        { index: 0, why: 'A mock pick to check the layout.' },
        { index: world.length, why: 'A mock AI pick.' },
        { index: 1, why: 'Another mock world pick.' },
      ],
      books: [
        { title: 'The Invisible Garden of Quantum Bees', author: 'Nobody Smithfield', why: 'Does not exist, should be skipped.' },
        { title: 'The Pragmatic Programmer', author: 'Andrew Hunt', why: 'A mock book pick.' },
      ],
      hobby: { name: 'Linocut printing', try: 'Mock hobby text.', time: '1 hour' },
      learn: { kind: 'coding', topic: 'Mock topic', do: 'Mock learning task.' },
    },
  };
}

async function renderSite(entries, current) {
  const docs = join(root, mock ? 'preview' : 'docs');
  await mkdir(join(docs, 'days'), { recursive: true });
  await writeFile(join(docs, '.nojekyll'), '');
  const recent = entries.slice(-config.historyDaysShown).reverse();
  const recentDates = recent.map((entry) => entry.date);
  for (const entry of recent) {
    await writeFile(join(docs, 'days', `${entry.date}.html`), renderDay(entry, recentDates, { linkPrefix: '../' }));
  }
  await writeFile(join(docs, 'index.html'), renderDay(current, recentDates, { linkPrefix: '' }));
}

async function main() {
  const today = todayIn(config.timezone);
  const existing = history.find((day) => day.date === today.date);
  if (existing && !force && !newBook) {
    await renderSite(history, existing);
    console.log(`${today.date} is already picked, pages redrawn. Use --force to redo it.`);
    return;
  }
  // Asking for a new book on a day already picked swaps only the book.
  const keepRest = existing && newBook && !force;

  const past = recentHistory(60);
  const fresh = (items) => items.filter((item) => !past.urls.has(item.url));
  const world = fresh(await fetchHeadlines(config.feeds.world, config.headlinesPerFeed));
  const ai = fresh(await fetchHeadlines(config.feeds.ai, config.headlinesPerFeed));
  if (world.length + ai.length === 0) throw new Error('No headlines could be fetched.');
  const headlines = [...world, ...ai];
  const bookState = currentBook(today.date);

  let result;
  if (mock) {
    result = mockPicks(world);
  } else {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not set.');
    const prompt = buildPrompt({ ...today, interests: config.interests, world, ai, history: past, needBook: bookState.due });
    result = await askModel(prompt, { apiKey, models: config.models });
  }
  const { model, picks } = result;

  const seen = new Set();
  const valid = (picks.articles ?? [])
    .filter((pick) => Number.isInteger(pick.index) && headlines[pick.index] && !seen.has(pick.index) && seen.add(pick.index))
    .map((pick) => ({ ...headlines[pick.index], why: pick.why ?? '' }));
  // One per source where the model's picks allow it, then fill up to three.
  const sources = new Set();
  const spread = valid.filter((article) => !sources.has(article.source) && sources.add(article.source));
  const articles = [...spread, ...valid.filter((article) => !spread.includes(article))].slice(0, 3);

  let book = bookState.due ? null : bookState.last;
  for (const candidate of bookState.due ? picks.books ?? [] : []) {
    if (!candidate?.title || !candidate?.author) continue;
    const found = await verifyBook(candidate);
    if (found && !past.bookTitles.has(normalize(found.title))) {
      book = { ...found, why: candidate.why ?? '', since: today.date };
      break;
    }
    console.log(`Skipped book: ${candidate.title} by ${candidate.author} (${found ? 'already suggested' : 'not found'})`);
  }
  // Nothing new could be verified: keep the current book rather than show none.
  if (!book && bookState.last) book = bookState.last;
  if (book) book = { ...book, sinceLabel: dayLabel(book.since), isNew: book.since === today.date };

  const day = keepRest
    ? { ...existing, book }
    : {
        ...today,
        model,
        articles: articles.map(({ summary, ...article }) => article),
        book,
        hobby: picks.hobby?.name ? picks.hobby : null,
        learn: picks.learn?.topic ? picks.learn : null,
      };

  const kept = history.filter((entry) => entry.date !== day.date);
  kept.push(day);
  kept.sort((a, b) => a.date.localeCompare(b.date));

  if (!mock) {
    await mkdir(dirname(historyPath), { recursive: true });
    await writeFile(historyPath, `${JSON.stringify(kept, null, 2)}\n`);
  }

  await renderSite(kept, day);

  console.log(`Picked ${day.date} with ${day.model}: ${day.articles.length} articles, book: ${book ? `${book.title} (since ${book.since})` : 'none'}.`);
}

await main();
