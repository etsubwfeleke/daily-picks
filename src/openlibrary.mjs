const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Looks a suggested book up in Open Library and returns the real record, or
 * null when no book with a matching title and author exists. Models invent
 * plausible books, so nothing reaches the page without passing this.
 */
export async function verifyBook({ title, author }) {
  const params = new URLSearchParams({
    title,
    author,
    limit: '5',
    fields: 'key,title,author_name,first_publish_year,cover_i',
  });
  try {
    const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
      headers: { 'user-agent': 'daily-picks (+https://github.com)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const { docs = [] } = await response.json();
    const wantedTitle = normalize(title);
    const wantedSurname = normalize(author).split(' ').pop();
    const match = docs.find(
      (doc) =>
        normalize(doc.title).startsWith(wantedTitle.split(' ').slice(0, 3).join(' ')) &&
        (doc.author_name ?? []).some((name) => normalize(name).includes(wantedSurname)),
    );
    if (!match) return null;
    return {
      title: match.title,
      author: match.author_name[0],
      year: match.first_publish_year ?? null,
      url: `https://openlibrary.org${match.key}`,
      cover: match.cover_i ? `https://covers.openlibrary.org/b/id/${match.cover_i}-M.jpg` : null,
    };
  } catch {
    return null;
  }
}
