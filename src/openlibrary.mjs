const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Open Library often stores "Sapiens" where the cover says "Sapiens: A Brief
// History of Humankind", so titles are compared without their subtitles.
const mainTitle = (text) => normalize(text.split(/[:(]/)[0]);

/**
 * Looks a suggested book up in Open Library and returns the real record, or
 * null when no book with a matching title and author exists. Models invent
 * plausible books, so nothing reaches the page without passing this.
 */
export async function verifyBook({ title, author }) {
  const params = new URLSearchParams({
    title: title.split(/[:(]/)[0].trim(),
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
    const wantedTitle = mainTitle(title);
    const wantedSurname = normalize(author).split(' ').pop();
    const match = docs.find(
      (doc) =>
        mainTitle(doc.title) === wantedTitle &&
        (doc.author_name ?? []).some((name) => normalize(name).includes(wantedSurname)),
    );
    if (!match) return null;
    // The model's spelling of title and author reads better than Open
    // Library's, which is often all lowercase; the record only proves it exists.
    return {
      title,
      author,
      year: match.first_publish_year ?? null,
      url: `https://openlibrary.org${match.key}`,
      cover: match.cover_i ? `https://covers.openlibrary.org/b/id/${match.cover_i}-M.jpg` : null,
    };
  } catch {
    return null;
  }
}
