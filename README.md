# Daily picks

A small page that refreshes every morning with:

- **3 articles** from the morning's world and AI headlines
- **A book**, checked against Open Library so it is always a real one
- **A craft or hobby** to try, with a first step
- **One coding or AI thing** to do in 30 to 45 minutes

Nothing repeats. Past days stay linked at the bottom of the page.

## How it works

1. Every morning a GitHub Action (`.github/workflows/daily.yml`) runs `src/build.mjs`.
2. It reads headlines from the news feeds listed in `config.json`.
3. It sends the headlines, the interests in `config.json`, and what was already suggested to an open model on [Groq](https://console.groq.com) (`openai/gpt-oss-120b`, with `llama-3.3-70b-versatile` as a fallback).
4. Articles can only be chosen from the real headlines it fetched. Each suggested book is looked up in Open Library and dropped if it cannot be found.
5. The result is saved to `data/history.json`, written to `docs/` as HTML, and committed. GitHub Pages serves `docs/`.

No packages to install. It uses plain Node.js (20 or newer).

## Setup

1. Create a free key at [console.groq.com](https://console.groq.com) (API Keys).
2. Store it in the repository. It is never written into any file:

   ```bash
   gh secret set GROQ_API_KEY --repo etsubwfeleke/daily-picks
   ```

3. Run it once by hand, or wait for the next morning:

   ```bash
   gh workflow run daily.yml --repo etsubwfeleke/daily-picks
   ```

## Changing things

- **Interests, feeds, time zone, models:** edit `config.json`.
- **What gets asked for and the writing style:** edit the prompt in `src/model.mjs`.
- **How the page looks:** edit `src/render.mjs`.
- **When it runs:** the `cron` line in `.github/workflows/daily.yml` (in UTC).
- **Redo today:** run the workflow from the Actions tab with "Redo today" ticked.

## Trying it locally

```bash
npm run preview                     # real headlines and book lookups, made-up picks, writes preview/
GROQ_API_KEY=... npm run build      # the real thing, writes data/ and docs/
```
