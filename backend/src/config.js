const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

module.exports = {
    PORT: process.env.PORT || 8004,
    DB_PATH: process.env.DB_PATH || path.join(DATA_DIR, 'taskforge.db'),
    STATIC_DIR: path.resolve(__dirname, '..', '..', 'frontend')
};
