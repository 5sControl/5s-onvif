const {Cam} = require("onvif");
const DigestFetch = require("./digest-fetch");
const fs = require("fs");
const moment = require("moment/moment");
const {spawn} = require("child_process");
const {CameraErrorHandler} = require("./camera_error_handler")
const cameraErrorHandler = new CameraErrorHandler()
const {sendSystemMessage} = require('./system-messages')
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

const getScreenshotUrl = async (username, password, camera_ip) => {
    if (username && password && camera_ip) {
        return new Promise((resolve, reject) => {
            new Cam({
                hostname: camera_ip,
                username: username,
                password: password,
                port: 80
            }, function (err) {
                console.log(err, 'new Cam err')
                if (err) {
                    resolve({"error": 'Auth error'})
                } else {
                    this.getSnapshotUri({protocol: 'RTSP'}, function (err, stream) {
                        if (err) {
                            console.log(err, 'getSnapshotUri err')
                            resolve({"error": err})
                            return
                        }
                        const url_end = stream.uri.substring(7, stream.uri.length)
                        const url = 'http://' + url_end;
                        resolve({"url": url})
                    });
                }
            });
        });
    }
}

async function pause(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

const screenshotUpdate = async (url, client, ip) => {
    try {
        const response = await client.fetch(url)
        const arrayBuffer = await response.arrayBuffer()
        const buffer = arrayBufferToBuffer(arrayBuffer)
        fs.writeFile(`images/${ip}/snapshot.jpg`, buffer, err => {
            if (err) console.log(err)
        })
        return {success: true, buffer}
    } catch (e) {
        console.log(`camera ip: ${ip}`, 'screenshotUpdate error')
        if (!cameraErrors[ip]) {
            cameraErrors[ip] = 1;
        }
        cameraErrors[ip] += 1
        return {success: false, error: "Error"}
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
    for (const camera in cameras) {
        await screenshotUpdate(cameras[camera].url, cameras[camera].client, camera)
    }

    setInterval(async () => {
        for (const camera in cameras) {
            const res = await screenshotUpdate(cameras[camera].url, cameras[camera].client, camera)
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
        let fetchedCameras = await fetch(`http://${IP}:8000/api/camera-algorithms/camera/`, {
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
                const screenshot_url_data = await getScreenshotUrl(username, password, id)
                console.log(screenshot_url_data, 'screenshot_url_data')
                if (screenshot_url_data.url) {
                    const stream_url = `rtsp://${username}:${password}@${id}/Streaming/Channels/101?transportmode=unicast&profile=Profile_1`
                    cameras[camera.id] = {
                        url: screenshot_url_data.url,
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
    getScreenshotUrl,
    pause,
    fetchCameras,
    screenshotUpdate,
    isItEmulatedCamera,
    videoRecord,
    returnUpdatedScreenshot
}