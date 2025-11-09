Bookmarklet + local proxy instructions

Goal

- Provide a bookmarklet that runs inside the Supabase SQL Editor page, fetches the SQL from a local server (`local-sql-proxy.js`), inserts the SQL into the editor (best-effort), and installs a MutationObserver that posts query results back to the local server.

Security notes

- This runs entirely in your browser and localhost. Do not run the local server on a public network. The server listens on localhost and writes results under `ai-roomchat/reports/sql-results.jsonl`.
- You must be logged into Supabase in the same browser tab for the bookmarklet to access the SQL editor DOM.
- If your browser blocks requests from an HTTPS page to `http://localhost:8765`, try `http://127.0.0.1:8765` or run the server with HTTPS. Chrome typically treats localhost as secure, but behaviour varies.

Setup

1. Install node deps and start the local proxy (in repo root):

```powershell
cd C:\Users\yujin\Documents\234423\starbase\ai-roomchat\scripts
npm install express cors body-parser minimist
node local-sql-proxy.js --port 8765 --sql "..\docs\sql\finalize-rank-session-outcome-channel-aware.sql"
```

You should see: "local-sql-proxy listening on http://localhost:8765"

2. Create a browser bookmark for the bookmarklet code (copy the minified line below as the bookmark URL).

Bookmarklet (minified)

Copy the entire one-line string below as the bookmark's URL:

javascript:(async()=>{const server='http://127.0.0.1:8765';try{const r=await fetch(server+'/sql');if(!r.ok){alert('Failed to fetch SQL from local server: '+r.status);return}const sql=await r.text();function insertIntoTextarea(t,val){t.focus();t.value=val; t.dispatchEvent(new Event('input',{bubbles:true})); return true}function insertIntoContentEditable(el,val){el.focus(); el.innerText=val; el.dispatchEvent(new Event('input',{bubbles:true})); return true}let done=false;const ta=document.querySelector('textarea'); if(ta&&insertIntoTextarea(ta,sql)){ done=true; alert('Inserted SQL into textarea — paste/run if needed'); } if(!done){ const ce=document.querySelector('[contenteditable="true"]'); if(ce&&insertIntoContentEditable(ce,sql)){ done=true; alert('Inserted SQL into a contenteditable element — paste/run if needed'); } } if(!done){ try{ await navigator.clipboard.writeText(sql); }catch(e){} alert('Could not auto-insert. SQL copied to clipboard — please paste (Ctrl+V) into the editor and run.'); } // observer to capture results
const serverPost=server+'/result';const observer=new MutationObserver((mutations)=>{ try{ // heuristics: look for pre, code, table, or a div with result text
const candidates=[...document.querySelectorAll('pre, code, .result, table, [role="region"], .monaco-editor')]; for(const c of candidates){ const text=c.innerText||c.textContent||''; if(text&&text.length>10){ fetch(serverPost,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:location.href, sql:sql, resultText:text})}).catch(()=>{}); } } }catch(e){} }); observer.observe(document.body,{childList:true,subtree:true,characterData:true}); alert('Observer installed. Run the query; results will be posted back to http://localhost:8765/result if detected.'); }catch(e){alert('Bookmarklet error: '+e.message);} })();

How it works

- The bookmarklet fetches the SQL from `http://127.0.0.1:8765/sql` and tries to insert it into the page's first textarea or contenteditable area. If it can't detect an editor, it copies SQL to clipboard and prompts you to paste.
- It installs a MutationObserver that watches the page for additions/changes and posts (to `/result`) any candidate result text it finds (pre/code/table elements, etc.). The local server appends received results to `ai-roomchat/reports/sql-results.jsonl`.

Limitations / reliability

- Editors like Monaco or complex single-page apps may not expose a plain textarea. The bookmarklet makes best-effort attempts; if it fails, paste manually.
- Detecting query results in the DOM is heuristic. It may capture large irrelevant text or miss result panels. You can inspect `reports/sql-results.jsonl` to see what was recorded.
- HTTPS pages fetching HTTP localhost: in many modern browsers this is allowed if the host is localhost/127.0.0.1; if blocked, try `https://127.0.0.1:8765` with a local TLS setup (advanced), or try a different browser.

If you want, I can:

- add an example `package.json` script to start the server easily, and a small helper page that displays captured results in the browser.
- try to craft a more editor-specific injector for Supabase SQL Editor if you provide a sample DOM snapshot of the editor area.

Troubleshooting

- If nothing shows up in `reports/sql-results.jsonl`, check server console for incoming requests.
- If the bookmarklet cannot fetch `/sql`, ensure the server is running and accessible at the given host/port and that your browser allows requests to localhost from the Supabase page.
