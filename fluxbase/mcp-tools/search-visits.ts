// @fluxbase:name search_visits
// @fluxbase:namespace wayli
// @fluxbase:description Search place visits with smart filtering. Converts country names to codes, uses fuzzy matching for cities/amenities, parses date ranges.
// @fluxbase:timeout 30
// @fluxbase:memory 256

import { countryCode } from './_shared/countries.ts';
import { parseDateRange } from './_shared/date-range.ts';

const DIETARY_KEYWORDS = ['vegan', 'vegetarian', 'halal', 'kosher', 'gluten-free', 'gluten free'];

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

interface SearchVisitsArgs {
  country?: string;
  city?: string;
  category?: string;
  amenity?: string;
  cuisine?: string;
  dateRange?: string;
  limit?: number;
}

export default async function handler(
  args: SearchVisitsArgs,
  fluxbase: any,
  _fluxbaseService: any,
  _utils: any
) {
  const { country, city, category, amenity, cuisine, dateRange, limit = 20 } = args;
  const conditions: string[] = [];

  if (country) {
    const code = countryCode(country);
    conditions.push(`country_code = '${escapeSql(code)}'`);
  }
  if (city) {
    conditions.push(`city ILIKE '%${escapeSql(city)}%'`);
  }
  if (category) {
    conditions.push(`poi_category = '${escapeSql(category)}'`);
  }
  if (amenity) {
    conditions.push(`poi_amenity ILIKE '%${escapeSql(amenity)}%'`);
  }
  if (cuisine) {
    const escapedCuisine = escapeSql(cuisine);
    const isDietary = DIETARY_KEYWORDS.some((kw) => cuisine.toLowerCase().includes(kw));

    if (isDietary) {
      // For dietary terms, check poi_cuisine, poi_tags (OSM dietary tags), and poi_name
      const dietKey = cuisine.toLowerCase().replace(/[ -]/g, ':');
      conditions.push(`(
        poi_cuisine ILIKE '%${escapedCuisine}%'
        OR poi_tags->'osm'->>'diet:${escapeSql(dietKey)}' = 'yes'
        OR poi_name ILIKE '%${escapedCuisine}%'
      )`);
    } else {
      // For regular cuisine types (japanese, italian, etc.), just check poi_cuisine
      conditions.push(`poi_cuisine ILIKE '%${escapedCuisine}%'`);
    }
  }
  if (dateRange) {
    const dateCondition = parseDateRange(dateRange);
    if (dateCondition) {
      conditions.push(dateCondition);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(1, limit), 50);

  const sql = `
    SELECT poi_name, poi_amenity, poi_cuisine, poi_category, city, country_code,
           started_at, duration_minutes, latitude, longitude
    FROM my_place_visits
    ${whereClause}
    ORDER BY started_at DESC
    LIMIT ${safeLimit}
  `;

  const { data, error } = await fluxbase.rpc('execute_sql', { query: sql });

  if (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }]
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ count: data?.length || 0, visits: data || [] }, null, 2)
      }
    ]
  };
}
