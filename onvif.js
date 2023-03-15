const express = require('express');
const app = express();
const fs = require('fs')
const
    http = require('http'),
    Cam = require('onvif').Cam;
const bodyParser = require('body-parser');

const DigestFetch = require("./digest-fetch");
const getScreenshotUrl = require('./get_screenshot_url');
const {spawn} = require("child_process");
const moment = require("moment");
const path = require("path");
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())
let IP = process.env.IP
if (!IP) {
    IP = '192.168.1.101'
}
let cameras = {}
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database/video.sqlite3');
db.run(`
    CREATE TABLE IF NOT EXISTS videos
    (
        id
        INTEGER
        PRIMARY
        KEY,
        file_name
        TEXT,
        date_start
        int,
        date_end
        int
    )
`);

function arrayBufferToBuffer(arrayBuffer) {
    const buffer = Buffer.alloc(arrayBuffer.byteLength)
    const view = new Uint8Array(arrayBuffer)
    for (let i = 0; i < buffer.length; ++i) buffer[i] = view[i]
    return buffer
}

async function pause(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}


app.post('/add_camera', async function (req, res) {
    const {ip, username, password} = req.body
    if (!ip || !username || !password) {
        res.send({"status": false, "message": "Required fields not found", "result": false});
        return
    }
    if (!fs.existsSync('images/' + ip)) {
        fs.mkdirSync('images/' + ip);
        console.log(`${'images/' + ip} created successfully!`);
    } else {
        console.log(`${'images/' + ip} already exists!`);
    }

    try {
        if (!cameras[ip]) {
            const screenshotUrlData = await getScreenshotUrl(username, password, ip)
            console.log(456, screenshotUrlData)
            if (screenshotUrlData.url) {
                const client = new DigestFetch(username, password)
                await screenshotUpdate(screenshotUrlData.url, client, ip)
                await pause(1000)
                cameras[ip] = {url: screenshotUrlData.url, client}
            } else {
                res.send({"status": false, "message": "Screenshot url not found", "result": false});
                return
            }

        }
        res.send({
            "status": true,
            "message": "Image was found and saved successfully",
            "result": `images/${ip}/snapshot.jpg`
        });
        return
    } catch (e) {
        console.log(e, 'e')
        res.send({"status": false, "message": "Screenshot url not found", "result": false});
        return
    }
    res.send({"status": true});
});


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

app.post('/get_stream_url', function (req, res) {
    try {
        const {username, password, camera_ip} = req.body
        if (username && password && camera_ip) {
            new Cam({
                hostname: camera_ip,
                username: username,
                password: password,
                port: 80
            }, function (err) {
                console.log(err, 'err')
                if (err) {
                    res.send({"error": 'Auth error'});
                    return
                }
                this.getStreamUri({protocol: 'RTSP'}, function (err, stream) {
                    const url_end = stream.uri.substring(7, stream.uri.length)
                    const url = 'rtsp://' + username + ':' + password + '@' + url_end;
                    res.send({"url": url});
                });
            });
        } else {
            res.send({"error": 'Required fields not found'});
        }
    } catch (err) {
        console.log(err, 'err')
        res.send({"error": 'Auth error'});
    }
});

app.listen(3457)


const fetchCameras = async () => {
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
    console.log('fetch cameras')
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
                cameras[camera.id] = {url: screenshot_url_data.url, client: new DigestFetch(username, password)}
            }
        }
    }
    runScreenshotMaker()
    // runVideoRecorder()
}
fetchCameras()

const runScreenshotMaker = () => {
    for (const camera in cameras) {
        screenshotUpdate(cameras[camera].url, cameras[camera].client, camera)
    }

    setInterval(() => {
        for (const camera in cameras) {
            screenshotUpdate(cameras[camera].url, cameras[camera].client, camera)
        }
    }, 1000 * 60 * 15)
}
const startTime = moment().startOf('minute');
const rtspUrl = 'rtsp://admin:just4Taqtile@192.168.1.167:554/Streaming/Channels/101?transportmode=unicast&profile=Profile_1';


const runVideoRecorder = (rtspUrl, camera_ip) => {
    const durationInMinutes = 1.5;
    const startTime = moment().startOf('minute');
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
        db.run(`INSERT INTO videos (file_name, date_start, date_end) VALUES (?, ?, ?)`, [filePath, startTime, endTime]);
        runVideoRecorder(rtspUrl, camera_ip)
    });
}

db.all('SELECT * FROM videos', (err, rows) => {
  if (err) {
    throw err;
  }
  rows.forEach(row => {
    console.log(row.id, row.name, '123421321321');
  });
});
// runVideoRecorder(rtspUrl, '192.168.1.167')