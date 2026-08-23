# Feature Matrix — Android vs Web

Status of the Android client relative to the Wayli web app, per feature area.
Legend: ✅ full parity · 🟡 partial (notes) · ⛔ web-only, not in the Android app ·
📱 Android-only capability.

| Feature | Android | Notes |
| --- | --- | --- |
| **Sign-in** | ✅ | OAuth (via system browser / Custom Tab) and e-mail + password. Android uses the `wayli://oauth/callback` redirect — add it to the provider's Redirect URIs in the Wayli server admin (the Fluxbase backend validates it before contacting the IdP). |
| **Instance setup** | 📱 | Enter only your Wayli URL; the app discovers the Fluxbase URL + anon key automatically (`wayli-app.json` manifest → `window.WAYLI_CONFIG` in the landing HTML → `/api/v1/auth/config`). Manual Fluxbase URL/anon-key entry remains as a fallback. |
| **Demo mode** | 📟 | Built-in realistic dataset (4 trips, 9 entries, wishlist, notifications, stats) — no server needed. Powers the Play Store screenshots. |
| **Home dashboard** | ✅ | Stats-at-a-glance cards with a timespan label, recent map + activity track, "Where I've Been" world map, recent activity, notification bell with unread badge. |
| **Location tracking** | ✅ | Foreground service; gplay flavor uses FusedLocationProvider + ActivityRecognition, foss flavor uses framework APIs. The tracking notification carries Pause/Resume/Stop actions — full toggle from the notification drawer (persistent while tracking or paused, OwnTracks-style). |
| **Community stories** | ✅ | "Community" segment on Travel: other users' published entries (public_trip_entries + public_profiles views, same visibility the web /stories feed rides on), with read-only detail sheet and web deep link. Gated by `wayli.community_enabled` — on unless explicitly false, matching the web. |
| **Permission status** | 📟 | Settings → Permissions card shows Location / Notifications / Activity recognition / Background location states with direct request paths — no web equivalent needed. |
| **Trips** | ✅ | Immersive-cover list with search, status/visibility filters, and a "with entries" filter; trip detail with hero cover, route map, distance travelled, and journal timeline. |
| **Trip create / edit / delete** | ✅ | Create and edit dialogs (title, dates, description, visibility private/friends/public); delete with confirm. |
| **Trip sharing** | ✅ | Android share sheet with the public web URL (`{webUrl}/u/{username}/trips/{tripId}`); offers to flip visibility to public first. |
| **Journal entries** | ✅ | Read view, rich editor with photo attachments, drafts with auto-save, and delete with confirm. |
| **Statistics** | ✅ | Distance/steps/time cards, transport-mode breakdown (sums to 100%), daily-activity heatmap with refresh, countries visited, world map. Date range is shared with Home when navigating between them. |
| **Wishlist** | ✅ | List + map views, favorites, ratings, marker types/colors; add-place sheet with Pelias place search (same as web). |
| **Notifications** | ✅ | Notification center with unread state, tap-to-read, mark-all-read, delete. |
| **Jobs monitor** | ✅ | List with status filter chips, live progress for running jobs, detail sheet with streamed logs (auto-polling), cancel and retry. Covers every job the server runs (maintenance, imports/exports, trip detection, activity rebuild). |
| **Import / Export** | ✅ | Launches server-side import/export jobs and monitors them in the Jobs screen. |
| **Offline support** | 📟 | Room write-through cache with serve-stale reads and an offline banner — all previously seen data is browsable with no connection; drafts and changes queue for sync. |
| **Quick capture** | 📟 | App shortcuts ("Start recording", "New trip") and system share-target: shared text prefills a journal draft, shared photos are copied and attached immediately. |
| **Server administration** | 🟡 | Read/monitor via Jobs; for provider/user/instance settings the app links out to the web admin. |
| **Public profile pages** | ⛔ | `/u/{username}` pages are web-only; the app links to them when sharing. |
| **Friends & social** | 🟡 | Notifications include friend requests/comments; friend management itself happens on the web. |
| **World languages** | 🟡 | English only for now; web has i18n infrastructure. |
