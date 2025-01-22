const disk = require("diskusage");
const fs = require("fs/promises");
const path = require("path");

const getFreeSpace = async () => {
    try {
        const directoryPath = '/var/www/5scontrol/videos';
        const { available } = await disk.check(directoryPath);
        const freeSpaceInGb = available / (1024 ** 3);
        console.log(`Free disk space for ${directoryPath}: ${freeSpaceInGb.toFixed(2)} GB`);
        return freeSpaceInGb.toFixed(2);
    } catch (error) {
        throw new Error(`Unable to retrieve disk space for directory: ${directoryPath}, ${error.message}`);
    }
}

const deleteFile = async (fileName) => {
    const basePath = "/var/www/5scontrol/videos";
    const filePath = path.join(basePath, fileName);
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