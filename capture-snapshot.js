const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');

/**
 * Captures a snapshot from a camera via RTSP and returns the snapshot URL.
 * @param {string} username - The username for the camera.
 * @param {string} password - The password for the camera.
 * @param {string} cameraIp - The IP address of the camera.
 * @returns {Promise<{url?: string, error?: string}>} - An object containing the snapshot URL or an error message.
 */
const captureSnapshot = async (username, password, cameraIp) => {
    try {
        const rtspUrl = `rtsp://${username}:${password}@${cameraIp}/Streaming/Channels/101?transportmode=unicast&profile=Profile_1`;
        const outputDir = path.join(process.env.IMAGES_DIR, cameraIp);
        const outputPath = path.join(outputDir, 'snapshot.jpg');

        await fs.mkdir(outputDir, { recursive: true });

        return new Promise((resolve, reject) => {
            ffmpeg(rtspUrl)
                .inputOptions('-rtsp_transport tcp')
                .outputOptions(['-vframes 1', '-f image2'])
                .save(outputPath)
                .on('end', () => {
                    const snapshotUrl = `http://localhost:3456/var/www/5scontrol/images/${cameraIp}/screenshot.jpg`;
                    resolve({ url: snapshotUrl });
                })
                .on('error', (err, stdout, stderr) => {
                    console.error(`FFmpeg error for camera ${cameraIp}:`, err.message);
                    reject({ error: err.message });
                });
        });
    } catch (error) {
        console.error(`Error capturing snapshot for camera ${cameraIp}:`, error.message);
        return { error: "Failed to capture snapshot." };
    }
};

module.exports = captureSnapshot;