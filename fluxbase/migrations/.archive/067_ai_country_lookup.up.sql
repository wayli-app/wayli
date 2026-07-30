-- Country name alias → ISO 3166-1 alpha-2 lookup for AI RPCs.
-- Replaces the 83-line TS file at fluxbase/mcp-tools/_shared/countries.ts.
-- Populated with the same aliases the TS map had.
CREATE TABLE IF NOT EXISTS country_name_aliases (
    name  TEXT PRIMARY KEY,
    iso2  CHAR(2) NOT NULL
);

-- Idempotent seed: insert-or-no-op. Run again safely when adding aliases.
INSERT INTO country_name_aliases (name, iso2) VALUES
    ('vietnam', 'VN'), ('viet nam', 'VN'),
    ('japan', 'JP'), ('nippon', 'JP'),
    ('netherlands', 'NL'), ('holland', 'NL'), ('the netherlands', 'NL'),
    ('france', 'FR'),
    ('germany', 'DE'), ('deutschland', 'DE'),
    ('united states', 'US'), ('usa', 'US'), ('america', 'US'),
    ('united kingdom', 'GB'), ('uk', 'GB'), ('england', 'GB'),
    ('italy', 'IT'), ('italia', 'IT'),
    ('spain', 'ES'), ('españa', 'ES'),
    ('thailand', 'TH'),
    ('indonesia', 'ID'),
    ('singapore', 'SG'),
    ('malaysia', 'MY'),
    ('australia', 'AU'),
    ('canada', 'CA'),
    ('china', 'CN'),
    ('south korea', 'KR'), ('korea', 'KR'),
    ('taiwan', 'TW'),
    ('hong kong', 'HK'),
    ('portugal', 'PT'),
    ('belgium', 'BE'),
    ('switzerland', 'CH'),
    ('austria', 'AT'),
    ('poland', 'PL'),
    ('czech', 'CZ'), ('czechia', 'CZ'),
    ('sweden', 'SE'),
    ('norway', 'NO'),
    ('denmark', 'DK'),
    ('finland', 'FI'),
    ('greece', 'GR'),
    ('ireland', 'IE'),
    ('hungary', 'HU'),
    ('romania', 'RO'),
    ('brazil', 'BR'),
    ('argentina', 'AR'),
    ('mexico', 'MX'),
    ('india', 'IN'),
    ('russia', 'RU'),
    ('south africa', 'ZA'),
    ('turkey', 'TR'),
    ('israel', 'IL'),
    ('uae', 'AE'), ('united arab emirates', 'AE'),
    ('philippines', 'PH'),
    ('new zealand', 'NZ')
ON CONFLICT (name) DO NOTHING;

-- Helper: resolve a country name (case-insensitive, supports aliases) to ISO2.
-- Falls back to uppercased input so callers can pass already-coded values (e.g. "VN").
-- Used by the AI RPCs (search-visits, aggregate-visits).
CREATE OR REPLACE FUNCTION resolve_country_code(input TEXT)
RETURNS CHAR(2) LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        (SELECT iso2 FROM country_name_aliases WHERE name = lower(input) LIMIT 1),
        upper(input)
    );
$$;

GRANT SELECT ON country_name_aliases TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_country_code(TEXT) TO authenticated;
