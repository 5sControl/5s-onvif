const getFilePath = async (time, camera_ip, db) => {
    const date = time;
    console.log(db, 1);
    
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
    try {
        console.log(`Received: time=${time}, camera_ip=${camera_ip}`);

        const query = `
            SELECT *
            FROM videos
            WHERE date_start < ?
              AND date_end > ?
              AND camera_ip = ?
        `;
        const rows = await db.all(query, [time, time, camera_ip]);

        console.log(`Query result: ${JSON.stringify(rows)}`);

        if (rows.length > 0) {
            const { date_start, date_end, file_name } = rows[0];
            return { date_start, date_end, file_name };
        } else {
            throw new Error('No matching video found');
        }
    } catch (err) {
        console.error('Error in getVideoTimings:', err.message);
        throw err;
    }
};

const removeLast500Videos = async (db) => {
    console.log(db, 3);
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
    console.log(db, 4);
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
    console.log(db, 5);
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
    try{
        const placeholders = ids.map(() => '?').join(',');
        return db.run(`DELETE
                FROM videos
                WHERE id IN (${placeholders});`, ids)
    }
    catch(e){
        console.log(e)
        throw new Error('Rows have not deleted')
    }
}

const removeVideosBeforeDate = async (db, date) => {
    console.log(db, 6);
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
    console.log(db, 7);
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