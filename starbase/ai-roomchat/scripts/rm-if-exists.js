const fs = require('fs')
const p = process.argv[2]
if (!p) { console.error('path required'); process.exit(2) }
try { if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('Removed', p) } else { console.log('Not found', p) } } catch (err) { console.error('Err', err) }
