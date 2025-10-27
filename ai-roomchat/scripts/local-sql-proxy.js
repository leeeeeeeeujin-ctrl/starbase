/*
local-sql-proxy.js

Simple local Express server to serve a SQL file to a browser bookmarklet and receive results posted back from the page.

Usage:
  npm install express cors body-parser
  node local-sql-proxy.js --port 8765 --sql ./docs/sql/finalize-rank-session-outcome-channel-aware.sql

Endpoints:
  GET /sql            -> returns the SQL text (Content-Type: text/plain)
  POST /result        -> accepts JSON { sessionId, sql, resultHtml, resultText } and appends to reports/sql-results.json

Security: This runs only on localhost. Do not expose this server to public networks.
*/

const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const argv = require('minimist')(process.argv.slice(2));
const port = argv.port || 8765;
const sqlPath = argv.sql || path.join(__dirname, '..', 'docs', 'sql', 'finalize-rank-session-outcome-channel-aware.sql');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));

app.get('/sql', (req, res) => {
  fs.readFile(sqlPath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Unable to read SQL file: ' + err.message);
    res.type('text/plain').send(data);
  });
});

app.post('/result', (req, res) => {
  const payload = {
    received_at: new Date().toISOString(),
    origin: req.ip,
    body: req.body
  };

  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const outFile = path.join(reportsDir, 'sql-results.jsonl');
  fs.appendFile(outFile, JSON.stringify(payload) + '\n', err => {
    if (err) console.error('Failed to write report:', err);
  });

  console.log('Received result:', payload.body && payload.body.sessionId ? payload.body.sessionId : '(no sessionId)');
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`local-sql-proxy listening on http://localhost:${port}`);
  console.log(`Serving SQL from: ${sqlPath}`);
});
