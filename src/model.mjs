const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const STYLE = `Write like a friend with good taste, not like an assistant.
Plain, short sentences. No hype, no exclamation marks, no emoji.
Do not use the words "delve", "dive into", "journey", "unlock", "elevate", or "game-changer".`;

export function buildPrompt({ today, weekday, interests, world, ai, history, needBook }) {
  const list = (items, offset) =>
    items.map((item, i) => `${i + offset}. [${item.source}] ${item.title}${item.summary ? ` - ${item.summary}` : ''}`).join('\n');

  return `Today is ${weekday}, ${today}. Pick today's recommendations for one person.

Their interests:
${interests.map((interest) => `- ${interest}`).join('\n')}

World headlines:
${list(world, 0)}

AI and tech headlines:
${list(ai, world.length)}

Already suggested recently, do not repeat these:
- Books: ${history.books.join('; ') || 'none yet'}
- Hobbies: ${history.hobbies.join('; ') || 'none yet'}
- Learning topics: ${history.learning.join('; ') || 'none yet'}

Return only JSON in exactly this shape:
{
  "articles": [{ "index": <number from the lists above>, "why": "<one sentence on why it is worth reading>" }],
${needBook ? `  "books": [{ "title": "<exact published title>", "author": "<author full name>", "why": "<one or two sentences>" }],\n` : ''}  "hobby": { "name": "<a craft or hobby>", "try": "<a concrete first step for this week, one or two sentences>", "time": "<rough time, like 1 hour>" },
  "learn": { "kind": "coding" | "AI", "topic": "<short name>", "do": "<one small thing to do in 30 to 45 minutes, concrete>" }
}

Rules:
- "articles": exactly 3. At least one world headline and at least one AI or tech headline, each from a different source. Pick substance over celebrity, gossip, or deals. Use only index numbers from the lists.
${needBook ? `- "books": 3 real, well-known books in order of preference, so a backup exists if the first cannot be found. This is the book for the next week or two, so pick something worth that time. Mix it up over time: novels, history, science, craft, AI, and books useful early in a new job.\n` : ''}- "hobby": mostly crafts, sometimes a different kind of hobby worth trying. Something possible at home with cheap supplies.
- "learn": alternate between coding and AI across days. Something to actually do, not just read.

${STYLE}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Model reply had no JSON object.');
    return JSON.parse(text.slice(start, end + 1));
  }
}

export async function askModel(prompt, { apiKey, models }) {
  let lastError;
  for (const model of models) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.9,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`${model}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
      const body = await response.json();
      return { model, picks: parseJson(body.choices[0].message.content) };
    } catch (error) {
      console.warn(`Model failed, trying the next one: ${error.message}`);
      lastError = error;
    }
  }
  throw lastError;
}
