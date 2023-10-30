const disk = require("diskusage");
const {promises: fsPromise} = require("fs");
const getFreeSpace = async () => {
    const {available} = await disk.check("/var/www/5scontrol/videos");
    return available / 1024 / 1024 / 1024; // to gb
}

const removeFile = async (filePath) => {
    try {
        await fsPromise.unlink(filePath);
        console.log(filePath, 'File deleted successfully');
    } catch (err) {
        console.error(err, 'removeFile');
    }
}

module.exports = {getFreeSpace, removeFile}