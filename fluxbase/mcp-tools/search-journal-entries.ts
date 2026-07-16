// @fluxbase:name search_journal_entries
// @fluxbase:namespace wayli
// @fluxbase:description Search journal entries (blog posts) from the user's trips. Returns entry titles, dates, and full body text. Use for questions about what the user wrote, trip stories, or journal content.
// @fluxbase:timeout 30
// @fluxbase:memory 256

import { parseDateRange } from './_shared/date-range.ts';

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

interface SearchJournalEntriesArgs {
  tripTitle?: string;
  dateRange?: string;
  searchText?: string;
  limit?: number;
}

export default async function handler(
  args: SearchJournalEntriesArgs,
  fluxbase: any,
  _fluxbaseService: any,
  _utils: any
) {
  const { tripTitle, dateRange, searchText, limit = 5 } = args;
  const conditions: string[] = [];

  // Only return entries that have content
  conditions.push("body IS NOT NULL");
  conditions.push("length(body) > 0");

  if (tripTitle) {
    conditions.push(`trip_title ILIKE '%${escapeSql(tripTitle)}%'`);
  }

  if (searchText) {
    const escaped = escapeSql(searchText);
    conditions.push(`(title ILIKE '%${escaped}%' OR body ILIKE '%${escaped}%')`);
  }

  if (dateRange) {
    const dateCondition = parseDateRange(dateRange, 'entry_date');
    if (dateCondition) {
      conditions.push(dateCondition);
    }
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const safeLimit = Math.min(Math.max(1, limit), 20);

  const sql = `
    SELECT id, trip_id, trip_title, title, body, entry_date, end_date,
           trip_start, trip_end, trip_image_url
    FROM my_trip_entries
    ${whereClause}
    ORDER BY entry_date DESC
    LIMIT ${safeLimit}
  `;

  const { data, error } = await fluxbase.rpc('execute_sql', { query: sql });

  if (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }]
    };
  }

  const entries = (data || []).map((e: any) => ({
    trip_title: e.trip_title,
    entry_date: e.entry_date,
    title: e.title || '(untitled)',
    body: e.body,
    trip_image_url: e.trip_image_url || null
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            count: entries.length,
            entries
          },
          null,
          2
        )
      }
    ]
  };
}
