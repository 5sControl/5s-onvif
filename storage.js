const disk = require("diskusage");
const fs = require("fs/promises");
const path = require("path");
const { VIDEOS_DIRECTORY, BASE_DIRECTORY } = require('./config');

const getFreeSpace = async () => {
    try {
        const { available } = await disk.check(VIDEOS_DIRECTORY);
        const freeSpaceInGb = available / (1024 ** 3);
        console.log(`Free disk space for ${VIDEOS_DIRECTORY}: ${freeSpaceInGb.toFixed(2)} GB`);
        return freeSpaceInGb.toFixed(2);
    } catch (error) {
        throw new Error(`Unable to retrieve disk space for directory: ${VIDEOS_DIRECTORY}, ${error.message}`);
    }
}

const deleteFile = async (fileName) => {
    const filePath = path.join(BASE_DIRECTORY, fileName);
    try {
        await fs.unlink(filePath);
        console.log(`${filePath} was deleted successfully`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`File not found: ${filePath}, skipping...`);
        } else {
            throw new Error(`Error deleting file: ${fileName}, ${error.message}`);
        }
    }
};

module.exports = {getFreeSpace, deleteFile}