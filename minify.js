const fs = require('fs');

const contents = fs.readFileSync('active_workflow_hc55q2zfas7gG1yu.json', 'utf8');
const data = JSON.parse(contents);
fs.writeFileSync('active_workflow_hc55q2zfas7gG1yu_min.json', JSON.stringify(data));
