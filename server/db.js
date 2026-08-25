const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database', 'billing.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database ' + dbPath + ': ' + err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Banks table
        db.run(`CREATE TABLE IF NOT EXISTS banks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            template_path TEXT
        )`);

        // Pricing table: Maps Bank + Category -> Price & Column Key
        db.run(`CREATE TABLE IF NOT EXISTS pricing (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            column_key TEXT,
            FOREIGN KEY (bank_id) REFERENCES banks (id),
            UNIQUE(bank_id, category)
        )`);
        db.run(`ALTER TABLE pricing ADD COLUMN column_key TEXT`, (err) => {
            // Ignore error if column already exists
        });

        // Bills history table
        db.run(`CREATE TABLE IF NOT EXISTS bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (bank_id) REFERENCES banks (id)
        )`);
    });
}

module.exports = db;
