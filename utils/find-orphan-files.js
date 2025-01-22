const path = require('path');
const { getAllVideosFromDb } = require('../db');
const { VIDEOS_DIRECTORY, BASE_DIRECTORY } = require('../config');
const fs = require('fs').promises;

const readFilesRecursively = async (directory) => {
    let files = [];

    try {
        const items = await fs.readdir(directory, { withFileTypes: true });
        const fileStats = [];

        for (const item of items) {
            const fullPath = path.join(directory, item.name);

            if (item.name === '.DS_Store') {
                continue;
            }

            if (item.isDirectory()) {
                const nestedFiles = await readFilesRecursively(fullPath);
                files = files.concat(nestedFiles);
            } else {
                const stat = await fs.stat(fullPath);
                fileStats.push({ path: fullPath, mtime: stat.mtime });
            }
        }

        // delete and the result of the last file that is currently being written.
        if (fileStats.length > 0) {
            fileStats.sort((a, b) => b.mtime - a.mtime);
            fileStats.shift();
            files = files.concat(fileStats.map(file => file.path));
        }
    } catch (error) {
        console.error(`Error reading directory ${directory}:`, error.message);
        throw error;
    }

    return files;
};

const findOrphanFiles = async (db) => {
    try {
        const videoFilesInDb = await getAllVideosFromDb(db);
        console.log(videoFilesInDb.length, 'videoFilesInDb.length');
        
        const allFiles = await readFilesRecursively(VIDEOS_DIRECTORY);
        console.log(allFiles.length, 'allFiles.length');
        const orphanFiles = allFiles
        .map(file => {
            const fileName = path.relative(BASE_DIRECTORY, file);
            
            if (!videoFilesInDb.includes(fileName)) {
                return fileName;
            };
        })
        .filter(Boolean);

        return orphanFiles;
    } catch (error) {
        console.error('Error comparing files:', error.message);
        throw error;
    }
};

module.exports = findOrphanFiles;