const basePath = "/var/www/5scontrol/videos";
const pathVideos = "/var/www/5scontrol"+"videos";
module.exports = { basePath };

const path = require('path');

const BASE_DIRECTORY = '/var/www/5scontrol';
const VIDEOS_DIRECTORY = path.join(BASE_DIRECTORY, 'videos');

module.exports = { VIDEOS_DIRECTORY, BASE_DIRECTORY };