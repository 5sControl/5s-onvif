const getFilePath = async (time, camera_ip, db) => {
    const date = time;
    return new Promise((resolve, reject) => {
        db.all(`SELECT *
                FROM videos
                where date_start < ${date}
                  and date_end > ${date}
                  and camera_ip = '${camera_ip}'`, (err, rows) => {
            if (err) {
                throw err;
            }
            if (rows[0]) {
                resolve(rows[0].file_name)
            } else {
                reject('Row not found')
            }

        });
    });
}

const getVideoTimings = async (time, camera_ip, db) => {
    const date = time;
    console.log(date, 'date')
    console.log(camera_ip, 'camera_ip')
    return new Promise((resolve, reject) => {
        db.all(`SELECT *
                FROM videos
                where date_start < ${date}
                  and date_end > ${date}
                  and camera_ip = '${camera_ip}'`, (err, rows) => {
            if (err) {
                throw err;
            }
            console.log(rows, 'rows')
            if (rows[0]) {
                resolve({date_start: rows[0].date_start, date_end: rows[0].date_end, file_name: rows[0].file_name})
            } else {
                reject('Row not found')
            }

        });
    });
}

const removeLast500Videos = async (db) => {
    return new Promise((resolve, reject) => {
        db.all(`DELETE
                FROM videos
                WHERE id IN (SELECT id
                             FROM videos
                             ORDER BY id
                    LIMIT 500
                    );`, (err, rows) => {
            if (err) {
                throw err;
            }
            if (rows) {
                resolve(true)
            } else {
                reject('Row not found')
            }

        });
    });
}

const getLast500Videos = async (db) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT *
                FROM videos
                ORDER BY id LIMIT 500`, (err, rows) => {
            if (err) {
                throw err;
            }
            console.log(rows, 'rows to remove')
            if (rows) {
                resolve(rows)
            } else {
                reject('Row not found')
            }

        });
    });
}

const getVideosBeforeDate = async (db, date) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT *
                FROM videos
                where date_start < ${date}`, (err, rows) => {
            if (err) {
                throw err;
            }
            console.log(rows, 'rows to remove')
            if (rows) {
                resolve(rows)
            } else {
                reject('Row not found')
            }

        });
    });
}

const removeVideosByIds = async (db, ids) =>{
    const videos = ids.join(', ');

    return new Promise((resolve, reject) => {
        db.all(`DELETE
                FROM videos
                WHERE id IN (?);`, videos, (err, rows) => {
            if (err) {
                throw err;
            }
            console.log(rows, 'rows to remove')
            if (rows) {
                resolve(rows)
            } else {
                reject('Row not found')
            }

        });
    });
}

const removeVideosBeforeDate = async (db, date) => {
    return new Promise((resolve, reject) => {
        db.all(`DELETE
                FROM videos
                where date_start < ${date}`, (err, rows) => {
            if (err) {
                throw err;
            }
            console.log(rows, 'rows to remove')
            if (rows) {
                resolve(rows)
            } else {
                reject('Row not found')
            }

        });
    });
}

const getSettings = async (db) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT *
                FROM SETTINGS`, (err, rows) => {
            if (err) {
                console.log(err,' eerrr')
                throw err;
            }
            if (rows[0]) {
                resolve({daysLimit: rows[0].daysLimit, gigabyteLimit: rows[0].gigabyteLimit})
            } else {
                reject('Row not found')
            }

        });
    });
}

const editSettings = async (db, settings) => {
    return new Promise((resolve, reject) => {

        const { daysLimit, gigabyteLimit } = settings;

        // Use an UPDATE statement to modify the existing row in the SETTINGS table
        db.run(`UPDATE SETTINGS
                SET daysLimit = ?,
                    gigabyteLimit = ?`, [daysLimit, gigabyteLimit], function(err) {
            if (err) {
                console.log(err.message, 'errr')
                reject(err.message);
            } else {
                if (this.changes > 0) {
                    resolve({ daysLimit, gigabyteLimit });
                } else {
                    reject('Row not found');
                }
            }
        });
    });
}




module.exports = {getFilePath, getVideoTimings, removeLast500Videos, getLast500Videos, getSettings, editSettings, getVideosBeforeDate, removeVideosBeforeDate, removeVideosByIds}