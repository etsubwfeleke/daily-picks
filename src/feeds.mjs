const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decode(match[1]) : '';
}

// Atom links carry the URL in an attribute rather than as text.
function link(block) {
  const rss = tag(block, 'link');
  if (rss) return rss;
  const atom = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) ?? block.match(/<link[^>]*href="([^"]+)"/i);
  return atom ? atom[1] : '';
}

export function parseFeed(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return blocks
    .map((block) => ({
      title: tag(block, 'title'),
      url: link(block),
      summary: (tag(block, 'description') || tag(block, 'summary')).slice(0, 280),
    }))
    .filter((item) => item.title && /^https?:\/\//.test(item.url));
}

export async function fetchHeadlines(feeds, perFeed) {
  const results = await Promise.all(
    feeds.map(async ({ source, url }) => {
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': 'daily-picks (+https://github.com)' },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseFeed(await response.text())
          .slice(0, perFeed)
          .map((item) => ({ ...item, source }));
      } catch (error) {
        console.warn(`Skipping ${source}: ${error.message}`);
        return [];
      }
    }),
  );
  return results.flat();
}
