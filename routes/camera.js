const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const validateRequestBody = require('../middleware/validate-request-body');
const { isItEmulatedCamera } = require('../fetch_cameras');
const captureSnapshot = require('../capture-snapshot');

const router = express.Router();

let IP = process.env.DJANGO_SERVICE_URL;

router.post('/check_camera', validateRequestBody, async (req, res) => {
    const { ip, username, password } = req.body;

    try {
        if (isItEmulatedCamera(IP, ip)) {
            res.set({
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': 'attachment; filename="snapshot.jpg"',
            });
            
            return res.send(screenshot);
        }

        const snapshotUrlData = await captureSnapshot(username, password, ip);
        if (snapshotUrlData.url) {
            const snapshotPath = path.resolve(__dirname, '../images', ip, 'snapshot.jpg');
            const snapshotBuffer = await fs.readFile(snapshotPath);

            res.set({
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': 'attachment; filename="snapshot.jpg"',
            });
            
            return res.send({"status": true, "image": snapshotBuffer});
        }

        return res.send({"status": false, "message": "Camera not found"});
    } catch (error) {
        console.error("Error in /check_camera:", error.message);

        if (error.code === 'ENOENT') {
            res.send({"status": false, "message": "Snapshot file not found"});
        }
        res.send({"status": false, "message": "Internal server error"});
    }
});

module.exports = router;