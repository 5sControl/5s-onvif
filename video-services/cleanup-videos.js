const { getSettings, fetchVideosBeforeDate, deleteVideosAndFiles } = require('../db');
const { getFreeSpace } = require('../storage');

const MS_IN_A_DAY = 86_400_000;

const cleanupVideos = async (db) => {
    try {
        const currentTimestamp = Date.now();
        const settings = await getSettings(db);
        const minimumDaysLimit =  settings.daysLimit - 1;
        let daysLimit = settings.daysLimit;
        
        while (daysLimit >= minimumDaysLimit) {
            const deletionCutoffTimestamp = currentTimestamp - daysLimit * MS_IN_A_DAY;
            const videos = await fetchVideosBeforeDate(db, deletionCutoffTimestamp);
            
            await deleteVideosAndFiles(db, videos);

            const freeSpace = await getFreeSpace();

            console.log(`Current free space: ${freeSpace} GB`);
            console.log(`Current days limit: ${daysLimit}`);
            console.log(`Videos to delete: ${videos.length}`);

            if (freeSpace >= settings.gigabyteLimit) {
                console.log("Sufficient free space available. Cleanup completed.");
                break;
            }
            
            daysLimit -= 1;
        }
    } catch (error) {
        console.error("Error during cleanup:", error);
    }
};

module.exports = cleanupVideos;

