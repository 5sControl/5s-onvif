const { mkdir } = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const init = async () => {
    try {
    let IP = process.env.DJANGO_SERVICE_URL || '192.168.1.110';
    const dirPath = path.resolve('images', IP);

    await mkdir(dirPath, { recursive: true });
    console.log(`${dirPath} created successfully!`);

    const db = await open({
        filename: 'database/video.sqlite3',
        driver: sqlite3.Database,
      });

    console.log('Connected to SQLite database.');
    await db.exec(`
        CREATE TABLE IF NOT EXISTS videos (
          id INTEGER PRIMARY KEY,
          file_name TEXT,
          date_start INTEGER,
          date_end INTEGER,
          camera_ip TEXT
        );
      `);

      await db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY,
          daysLimit INTEGER,
          gigabyteLimit INTEGER
        );
      `);

    console.log('Tables created or already exist.');

    const { count } = await db.get('SELECT COUNT(*) AS count FROM settings');

    if (count === 0) {
        await db.run(
          `INSERT INTO settings (daysLimit, gigabyteLimit) VALUES (?, ?)`,
          [3, 100]
        );
        console.log('Default settings added.');
      } else {
        console.log('Settings table is not empty. No default values added.');
      }
  
      return db;
    } catch (err) {
      console.error('Error initializing database:', err.message);
      throw err;
    }
}

module.exports = init;