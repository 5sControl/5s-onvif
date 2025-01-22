const {deleteFile} = require('./storage');

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

const fetchTotalCountVideos = async (db) => {
    const queryTotalCount = `
        SELECT COUNT(*) AS total
        FROM videos
    `;

    const totalCountResult = await db.get(queryTotalCount);
    const totalVideosCount = totalCountResult?.total || 0;
    console.log(`Total videos in the database: ${totalVideosCount}`);
    return totalVideosCount
}

const fetchVideosBeforeDate = async (db, timestamp) => { 
    console.log(timestamp, 'timestamp');
    await fetchTotalCountVideos(db);
    
    try {
        const queryVideos = `
            SELECT *
            FROM videos
            WHERE date_start < ?
        `;
        const outdatedVideos = await db.all(queryVideos, timestamp); 
    
        if (!outdatedVideos || outdatedVideos.length === 0) {
            throw new Error('No videos found before the specified date.');
        }
        console.log('Outdated videos to remove:', outdatedVideos.length);
        return outdatedVideos;
  
    } catch (error) {
      console.error('Error fetching videos:', error);
      throw error;
    }
  };

const deleteVideosAndFiles = async (db, videos) => {
    if (!videos || videos.length === 0) {
        console.log('No video IDs provided for deletion.');
        return;
    }

    const MAX_IDS_PER_QUERY = 60;
    const idChunks = [];

    for (let i = 0; i < videos.length; i += MAX_IDS_PER_QUERY) {
        idChunks.push(videos.slice(i, i + MAX_IDS_PER_QUERY));
    }

    for (const chunk of idChunks) {
        const videoIds = chunk.map((video) => video.id);

        try {
            // await db.run('BEGIN TRANSACTION');

            const placeholders = videoIds.map(() => '?').join(',');
            const deleteQuery = `DELETE FROM videos WHERE id IN (${placeholders});`;
            const result = await db.run(deleteQuery, videoIds);
            console.log(`Successfully deleted ${result.changes || 0} video(s) for IDs:`, videoIds);

            for (const video of chunk) {
                await deleteFile(video.file_name);
            }

            // await db.run('COMMIT');
        } catch (error) {
            console.error(`Error during transaction for chunk:`, error.message, error.stack);
            // await db.run('ROLLBACK');
            throw new Error('Transaction failed.');
        }
    }
};

const getSettings = async (db) => {
    try {
      const result = await db.get(`SELECT * FROM SETTINGS`);
      if (!result) {
        throw new Error('Settings not found'); 
      }
      return { daysLimit: result.daysLimit, gigabyteLimit: result.gigabyteLimit };
    } catch (error) {
      console.error('Error getting settings:', error);
      throw error;
    }
  };

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




module.exports = {
    getFilePath,
    getVideoTimings,
    getSettings,
    editSettings,
    fetchVideosBeforeDate,
    removeVideosBeforeDate,
    deleteVideosAndFiles,
    fetchTotalCountVideos
}