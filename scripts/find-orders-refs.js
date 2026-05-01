const fs = require('fs');
const lines = fs.readFileSync('server.js', 'utf8').split('\n');
lines.forEach((line, i) => {
  if (line.includes('orders') && line.indexOf('sol_orders') < 0 && line.indexOf('recent_orders') < 0 && line.trim() !== '') {
    console.log((i+1) + ': ' + line);
  }
});
