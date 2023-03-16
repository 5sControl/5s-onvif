const {Cam} = require("onvif");
const DigestFetch = require("./digest-fetch");
const fs = require("fs");
const moment = require("moment/moment");
const {spawn} = require("child_process");

function arrayBufferToBuffer(arrayBuffer) {
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
                console.log(err, 'err')
                if (err) {
                    resolve({"error": 'Auth error'})
                } else {
                    this.getSnapshotUri({protocol: 'RTSP'}, function (err, stream) {
                    if (err) {
                        console.log(err, 'err')
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
        const b = arrayBufferToBuffer(arrayBuffer)
        fs.writeFile(`images/${ip}/snapshot.jpg`, b, err => {
            if (err) console.log(err)
        })
        return {success: true}
    } catch (e) {
        console.log(e, 'e')
        return {success: false, error: "Error"}
    }
}

const runScreenshotMaker = (cameras) => {
    for (const camera in cameras) {
        screenshotUpdate(cameras[camera].url, cameras[camera].client, camera)
    }

    setInterval(() => {
        for (const camera in cameras) {
            screenshotUpdate(cameras[camera].url, cameras[camera].client, camera)
        }
    }, 1000 * 60 * 15)
}

const runVideoRecorder = (cameras) => {
    for (const camera in cameras) {
        videoRecord(cameras[camera].stream_url, camera)
    }
}

const videoRecord = (rtspUrl, camera_ip) => {
    const durationInMinutes = 10;
    const startTime = moment();
    const endTime = moment(startTime).add(durationInMinutes, 'minutes');
    const fileName = `${startTime.format('YYYY-MM-DD_HH-mm')}-${endTime.format('HH-mm')}-${camera_ip}.mp4`;
    const filePath = `videos/${fileName}`

    const ffmpeg = spawn('ffmpeg', [
        '-i', rtspUrl,
        '-c', 'copy',
        '-t', `${durationInMinutes * 60}`,
        filePath
    ]);

    ffmpeg.on('exit', () => {
        console.log(`Recorded video: ${fileName}`);
        db.run(`INSERT INTO videos (file_name, date_start, date_end, camera_ip)
                VALUES (?, ?, ?, ?)`, [filePath, startTime.valueOf(), endTime.valueOf(), camera_ip]);
        videoRecord(rtspUrl, camera_ip)
    });
}



const fetchCameras = async (IP, cameras) => {
    await pause(120000)
    let fetchedToken = await fetch(`http://${IP}:80/auth/jwt/create/`, {
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
    let fetchedCameras = await fetch(`http://${IP}:80/api/cameras/`, {
        method: "GET",
        headers: {
            'Content-Type': 'application/json;charset=utf-8',
            'Authorization': 'JWT ' + fetchedToken.access
        }
    })
    fetchedCameras = await fetchedCameras.json()
    for (const camera of fetchedCameras) {
        const {username, password, id} = camera
        if (!cameras[id]) {
            const screenshot_url_data = await getScreenshotUrl(username, password, id)
            if (screenshot_url_data.url) {
                const stream_url = `rtsp://${username}:${password}@${id}/Streaming/Channels/101?transportmode=unicast&profile=Profile_1`
                cameras[camera.id] = {url: screenshot_url_data.url, client: new DigestFetch(username, password), stream_url}
            }
        }
    }
    runScreenshotMaker(cameras)
    runVideoRecorder(cameras)
}

module.exports = {getScreenshotUrl, pause, fetchCameras, screenshotUpdate}