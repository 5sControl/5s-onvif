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

const removeLast100Videos = async (db) => {
    return new Promise((resolve, reject) => {
        db.all(`DELETE
                FROM videos
                WHERE id IN (SELECT id
                             FROM videos
                             ORDER BY 'sort_field'
                    LIMIT 100
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

const getLast100Videos = async (db) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT *
                FROM videos
                ORDER BY 'sort_field' LIMIT 100`, (err, rows) => {
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



module.exports = {getFilePath, getVideoTimings, removeLast100Videos, getLast100Videos}