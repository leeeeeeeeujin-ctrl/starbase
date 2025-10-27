SQL helper utilities

This small helper collection helps you manually paste/execute SQL into a browser-based SQL editor (e.g. Supabase SQL Editor) while keeping control local.

Files:
- `sql-to-clipboard-and-open.ps1` — PowerShell script that copies the SQL file to your clipboard and opens a URL you provide (defaults to prompting). Use this when you want to review/paste/run SQL manually in the browser.

Why this approach
- I cannot and will not remotely control your browser or execute SQL on your DB.
- Copy-to-clipboard + open-editor approach ensures the SQL stays local and requires you to paste and hit Run.
- If you prefer a single-click bookmarklet that tries to inject content into the SQL editor page, you can create one — but cross-origin and site structure differences make it unreliable and potentially blocked by the site.

Usage (PowerShell)
#1. From repo root, run (example):
.

#2. Script will:
- copy `./docs/sql/finalize-rank-session-outcome-channel-aware.sql` into your Windows clipboard
- open the SQL editor URL you supply
- you manually paste (Ctrl+V) into the editor and run the SQL

Optional: Bookmarklet
- A bookmarklet can attempt to paste into a textarea on the current page by prompting for the SQL string. Because many SQL editors are built as complex web apps, the bookmarklet may not find the editor element or the editor may block programmatic changes. Here's a simple bookmarklet you can try (drag to bookmarks):

javascript:(function(){var sql=prompt('Paste SQL here (from clipboard)'); if(!sql) return; try{ var ta=document.querySelector('textarea'); if(ta){ ta.focus(); ta.value=sql; alert('Inserted into first textarea on page — now run the query'); } else { alert('No textarea found — please paste manually.'); } }catch(e){ alert('Error: '+e.message); }})();

Notes
- The bookmarklet is best-effort only and not guaranteed to work on the Supabase console; use the PowerShell helper instead.
- Keep your DB credentials secure. The helper does not attempt to read or send secrets.

If you want, I can also add a small Node script variant that writes the SQL to clipboard and opens the URL cross-platform. Tell me if you want that.
