const fs = require("fs");
const init = () => {
    let IP = process.env.DJANGO_SERVICE_URL
    if (!IP) {
        IP = '192.168.1.110'
    }
    if (!fs.existsSync('images/' + IP)) {
        fs.mkdirSync('images/' + IP);
        console.log(`${'images/' + IP} created successfully! local`);
    } else {
        console.log(`${'images/' + IP} already exists! local`);
    }
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database('database/video.sqlite3');
    db.run(`
        CREATE TABLE IF NOT EXISTS videos
        (
            id
            INTEGER
            PRIMARY
            KEY,
            file_name
            TEXT,
            date_start
            int,
            date_end
            int,
            camera_ip
            TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS settings
        (
            id
            INTEGER
            PRIMARY
            KEY,
            daysLimit
            int,
            gigabyteLimit
            int
        )
    `);

    db.get("SELECT COUNT(*) AS count FROM settings", (err, row) => {
    if (err) {
        console.error(err.message);
    } else {
        if (row.count === 0) {
            // Table is empty, so we can insert a record
            db.run(`INSERT INTO settings (daysLimit, gigabyteLimit) VALUES (?, ?)`, [3, 100], function(err) {
                if (err) {
                    console.error(err.message);
                } else {
                    console.log(`A new record has been added with ID ${this.lastID}`);
                }
            });
        } else {
            console.log("Table is not empty. No record added.");
        }
    }
});

    return db;
}

module.exports = init;