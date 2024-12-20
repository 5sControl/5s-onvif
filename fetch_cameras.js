const DigestFetch = require("./digest-fetch");
const fs = require("fs");
const fsPromise = require("fs").promises;
const moment = require("moment/moment");
const {spawn} = require("child_process");
const {CameraErrorHandler} = require("./camera_error_handler")
const cameraErrorHandler = new CameraErrorHandler()
const {sendSystemMessage} = require('./system-messages')
const path = require('path');
const captureSnapshot = require('./capture-snapshot')
const isItEmulatedCamera = (serverIp, cameraIp) => {
    return cameraIp.indexOf(serverIp) !== -1;
}
let IP = process.env.DJANGO_SERVICE_URL
if (!IP) {
    IP = '192.168.1.150'
}

const cameraErrors = {}
setInterval(() => {
    console.log(cameraErrors, 'cameraErrors')
}, 10000)
function arrayBufferToBuffer(arrayBuffer) {
    if (arrayBuffer?.byteLength == 0) {
        console.log(arrayBuffer?.byteLength, 'arrayBuffer.byteLength')
    }
    const buffer = Buffer.alloc(arrayBuffer.byteLength)
    const view = new Uint8Array(arrayBuffer)
    for (let i = 0; i < buffer.length; ++i) buffer[i] = view[i]
    return buffer
}

async function pause(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

const screenshotUpdate = async (username, password, ip) => {
    try {
        console.log(`Updating snaphpot for camera IP: ${ip}`);
        const snapshotUrlData = await captureSnapshot(username, password, ip);

        if (snapshotUrlData.url) {
            console.log(`snaphpot is updated for camera ${ip}: ${snapshotUrlData.url}`);
            const snapshotPath = path.join('images', ip, 'snapshot.jpg');
            const buffer = await fsPromise.readFile(snapshotPath);

            return { success: true, buffer };
        } else {
            console.error(`snaphpot is not updated for camera ${ip}: ${snapshotUrlData.error}`);
            if (!cameraErrors[ip]) {
                cameraErrors[ip] = 1;
            }
            cameraErrors[ip] += 1;
            return { success: false, error: snapshotUrlData.error };
        }
    } catch (e) {
        console.error(`camera ip: ${ip}`, 'screenshotUpdate error:', e);
        if (!cameraErrors[ip]) {
            cameraErrors[ip] = 1;
        }
        cameraErrors[ip] += 1;
        return { success: false, error: "Error" };
    }
}

const returnUpdatedScreenshot = async (url, client) => {
    try {
        const response = await client.fetch(url)
        const arrayBuffer = await response.arrayBuffer()
        const b = arrayBufferToBuffer(arrayBuffer)
        return {success: true, screenshot: b}
    } catch (e) {
        console.log(e, 'returnUpdatedScreenshot error')
        return {success: false, error: "Error"}
    }
}

const runScreenshotMaker = async (cameras, io, IP) => { 
    setInterval(async () => {
        for (const camera in cameras) {
            const res = await screenshotUpdate(cameras[camera].client.user, cameras[camera].client.password, camera)
            const message = cameraErrorHandler.add(camera, !res.success)

            if (!res.success) {
                if (message) {
                    await sendSystemMessage(IP, {
                        title: "Camera error",
                        content: message
                    })
                    io.emit('notification', {"message": message, "type": "error"});
                }
            } else {
                if (cameras[camera].screenshotBuffer != res.buffer ) {
                    io.emit('snapshot_updated', {"camera_ip": camera, 'screenshot': res.buffer});
                }
                cameras[camera].screenshotBuffer = res.buffer;
            }
        }
    }, 1000)
}

const runVideoRecorder = (cameras, db) => {
    for (const camera in cameras) {
        videoRecord(cameras[camera].stream_url, camera, db)
    }
}

const videoRecord = (rtspUrl, camera_ip, db) => {
    try {
        const durationInMinutes = 2;
        const startTime = moment.utc();
        const endTime = moment(startTime).add(durationInMinutes, 'minutes');
        const fileName = `${startTime.format('YYYY-MM-DD_HH-mm')}-${endTime.format('HH-mm')}-${camera_ip}.mp4`;
        const filePath = `videos/${camera_ip}/${fileName}`
        if (!fs.existsSync('videos/' + camera_ip)) {
            fs.mkdirSync('videos/' + camera_ip);
            console.log(`${'videos/' + camera_ip} created successfully!`);
        } else {
            console.log(`${'videos/' + camera_ip} already exists!`);
        }

        const ffmpeg = spawn('ffmpeg', [
            '-i', rtspUrl,
            '-c', 'copy',
            '-t', `${durationInMinutes * 60}`,
            filePath
        ]);

        let isProcessKilled = false;

        setTimeout(async () => {
            if (!isProcessKilled) {
                ffmpeg.kill()
                isProcessKilled = true;
                if (!cameraErrors[camera_ip]) {
                cameraErrors[camera_ip] = 1;
                }
                cameraErrors[camera_ip] += 1
                console.log(`Video not recorded, please check connection to ${camera_ip} camera, timeout`)
                videoRecord(rtspUrl, camera_ip, db)
            }

        }, 1000 * 60 * durationInMinutes * 2)

        const now = Date.now()

        ffmpeg.on('exit', async () => {
            if (isProcessKilled) {
                console.log(`Video not recorded, please check connection to ${camera_ip} camera, killed`)
                if (!cameraErrors[camera_ip]) {
                cameraErrors[camera_ip] = 1;
                }
                cameraErrors[camera_ip] += 1
                return
            }
            console.log('<<<EXIT>>>')
            isProcessKilled = true
            if ((Date.now() - now) < 1000 * 60) {
                if (!cameraErrors[camera_ip]) {
                cameraErrors[camera_ip] = 1;
                }
                cameraErrors[camera_ip] += 1
                console.log(`Video not recorded, please check connection to ${camera_ip} camera`)
                await pause(30000)
                videoRecord(rtspUrl, camera_ip, db)
            } else {
                console.log(`Recorded video: ${fileName}`);
                db.run(`INSERT INTO videos (file_name, date_start, date_end, camera_ip)
                        VALUES (?, ?, ?,
                                ?)`, [filePath, startTime.valueOf(), endTime.valueOf(), camera_ip]);
                videoRecord(rtspUrl, camera_ip, db)
            }

        });

        ffmpeg.stdout.on('data', (data) => {
        });

        ffmpeg.stderr.on('data', (data) => {
        });
    } catch (e) {
        console.log(e, 'videoRecord error')
    }

}


const fetchCameras = async (IP, cameras, db, io) => {
    let isDjangoEnable = false;
    try {
        await pause(1000)
        let fetchedToken = await fetch(`http://${IP}:8000/api/auth/jwt/create/`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: JSON.stringify({
                "username": "admin",
                "password": "admin"
            })
        })
        fetchedToken = await fetchedToken.json()
        if (fetchedToken?.access) {
            isDjangoEnable = true
        }
        let fetchedCameras = await fetch(`http://${IP}:8000/api/camera-algorithms/camera-for-onvif/`, {
            method: "GET",
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                'Authorization': 'JWT ' + fetchedToken.access
            }
        })
        fetchedCameras = await fetchedCameras.json()
        for (const camera of fetchedCameras) {
            const {username, password, id} = camera
            if (isItEmulatedCamera(IP, id)) {
                continue
            }
            if (!cameras[id]) {
                const snapshotUrlData = await captureSnapshot(username, password, id)
                if (snapshotUrlData.url) {
                    const stream_url = `rtsp://${username}:${password}@${id}/Streaming/Channels/101?transportmode=unicast&profile=Profile_1`
                    cameras[camera.id] = {
                        url: snapshotUrlData.url,
                        client: new DigestFetch(username, password),
                        stream_url,
                        screenshotBuffer: null
                    }
                } else {
                    const message = `Camera ${id} lost connection, check the camera`
                    await sendSystemMessage(IP, {
                        title: "Camera error",
                        content: message
                    })
                    io.emit('notification', {"message": message, "type": "error"});
                }
            }
        }
        await runScreenshotMaker(cameras, io, IP)
        runVideoRecorder(cameras, db)
    } catch (e) {
        if (!isDjangoEnable) {
            console.log(`Attempt to connect to django failed, server ip: ${IP}`)
        } else {
            console.log(e, 'fetchCameras error')
        }

    }

    if (!isDjangoEnable) {
        fetchCameras(IP, cameras, db, io)
    }
}

module.exports = {
    pause,
    fetchCameras,
    screenshotUpdate,
    isItEmulatedCamera,
    videoRecord,
    returnUpdatedScreenshot
}
