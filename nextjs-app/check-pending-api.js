const http = require('http');

const options = {
  hostname: '150.109.158.191',
  port: 3000,
  path: '/api/pending-errors',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Pending items:', json.items?.length || 0);
      if (json.items?.length > 0) {
        json.items.forEach(item => {
          console.log('File:', item.filename);
          console.log('Type:', item.type);
          console.log('Date:', item.date);
          console.log('Error:', item.error);
          console.log('Records:', item.recordCount);
          console.log('---');
        });
      }
    } catch (e) {
      console.log('Error:', e.message);
      console.log('Raw:', data);
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.end();
