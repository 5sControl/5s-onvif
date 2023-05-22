const express = require('express');
const cors = require('cors');
const app = express();
const DigestFetch = require("./digest-fetch");
const bodyParser = require('body-parser');
const fs = require('fs')
const Cam = require('onvif').Cam;
const {spawn} = require("child_process");
const rtsp = require("rtsp-ffmpeg");
const fsPromise = require('fs').promises;

const init = require('./init')
const {
    getScreenshotUrl,
    pause,
    fetchCameras,
    screenshotUpdate,
    isItEmulatedCamera,
    videoRecord,
    returnUpdatedScreenshot
} = require('./fetch_cameras');
const {getFilePath, getVideoTimings, removeLast100Videos, getLast100Videos} = require('./db.js');
const {getFreeSpace, removeFile} = require('./storage');

let IP = process.env.IP;
let cameras = {};
const minskTime = 3 * 60 * 60 * 1000;
const db = init();
const uri = `rtsp://${IP}:8554/mystream`;
let screenshot = null

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(cors());


app.post('/add_camera', async function (req, res) {
    const {ip, username, password} = req.body;
    if (!ip || !username || !password) {
        res.send({"status": false, "message": "Required fields not found", "result": false});
        return
    }
    if (isItEmulatedCamera(IP, ip)) {
        res.send({
            "status": true,
            "message": "Image was found and saved successfully",
            "result": `images/${ip}/snapshot.jpg`
        });
        return
    }
    if (!fs.existsSync('images/' + ip)) {
        fs.mkdirSync('images/' + ip);
        console.log(`${'images/' + ip} created successfully!`);
    } else {
        console.log(`${'images/' + ip} already exists!`);
    }

    try {
        const screenshotUrlData = await getScreenshotUrl(username, password, ip)
        console.log(456, screenshotUrlData)
        if (screenshotUrlData.url) {
            const client = new DigestFetch(username, password)
            const screenshotUpdated = await screenshotUpdate(screenshotUrlData.url, client, ip)
            if (!screenshotUpdated.status) {
                res.send({"status": false, "message": "Screenshot wasn`t created", "result": false});
                return
            }
            await pause(1000)
            cameras[ip] = {url: screenshotUrlData.url, client}
        } else {
            res.send({"status": false, "message": "Screenshot url not found", "result": false});
            return
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

app.post('/check_camera', async function (req, res) {
    const {ip, username, password} = req.body;
    if (!ip || !username || !password) {
        res.send({"status": false, "message": "Required fields not found"});
        return
    }
    if (isItEmulatedCamera(IP, ip)) {
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Disposition', 'attachment; filename="snapshot.jpg"');
        res.send(screenshot);
        return
    }

    if (!fs.existsSync('images/' + ip)) {
        fs.mkdirSync('images/' + ip);
        console.log(`${'images/' + ip} created successfully!`);
    } else {
        console.log(`${'images/' + ip} already exists!`);
    }

    try {
        const screenshotUrlData = await getScreenshotUrl(username, password, ip)
        console.log(104, screenshotUrlData)
        if (screenshotUrlData.url) {
            const client = new DigestFetch(username, password)
            const screenshotUpdated = await returnUpdatedScreenshot(screenshotUrlData.url, client, ip)
            if (!screenshotUpdated.success) {
                res.send({"status": false, "message": "Camera not available"});
                return
            }

            if (screenshotUpdated.screenshot) {
                res.set('Content-Type', 'application/octet-stream');
                res.set('Content-Disposition', 'attachment; filename="snapshot.jpg"');
                res.send({"status": true, "image": screenshotUpdated.screenshot});
                return
            }

        } else {
            res.send({"status": false, "message": "Camera not found"});
            return
        }
        res.send({"status": false, "message": "Camera not found"});
        return
    } catch (e) {
        console.log(e, 'e')
        res.send({"status": false, "message": "Camera not found"});
        return
    }
    res.send({"status": false, "message": "Camera not found"});
});

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

app.post('/get_actual_screenshot', async function (req, res) {
    const {ip} = req.body;
    if (isItEmulatedCamera(IP, ip)) {
        res.send({
            "status": true,
            "message": "Image was found and saved successfully",
            "result": `images/${ip}/snapshot.jpg`
        });
        return
    }
    if (!ip) {
        res.send({"status": false, "message": "Required fields not found", "result": false});
        return
    }

    if (!cameras[ip]) {
        res.send({"status": false, "message": "Current camera not added", "result": false});
        return
    }

    try {
        const screenshotData = await returnUpdatedScreenshot(cameras[ip].url, cameras[ip].client, ip)
        if (screenshotData.screenshot) {
            res.set('Content-Type', 'application/octet-stream');
            res.set('Content-Disposition', 'attachment; filename="snapshot.jpg"');
            res.send(screenshotData.screenshot);
        } else {
            const data = await fsPromise.readFile(`images/${ip}/snapshot.jpg`);
            res.set('Content-Type', 'application/octet-stream');
            res.set('Content-Disposition', 'attachment; filename="snapshot.jpg"');
            res.send(data);
        }
    } catch (e) {
        console.log(e, 'e')
        res.send({"status": false, "message": "Error"});
        return
    }
});

app.get('/stream', (req, res) => {
    try {
        console.log(req.body, req.query)
        let {camera_ip} = req.query;
        if (!camera_ip) {
            res.status(400).send("Requires camera_ip field");
            return
        }

        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Transfer-Encoding': 'chunked'
        });

        const ffmpegProcess = spawn('ffmpeg', [
            '-i',
            `rtsp://admin:just4Taqtile@${camera_ip}:554/Streaming/Channels/101?transportmode=unicast&profile=Profile_1`,
            '-c:v',
            'copy',
            '-movflags',
            'frag_keyframe+empty_moov',
            '-an',
            '-f',
            'mp4',
            '-'
        ]);

        ffmpegProcess.stdout.pipe(res);

        req.on('close', () => {
            console.log('KILL')
            ffmpegProcess.kill();
        });
    } catch (e) {
        console.log(e, 'e')
        res.send({"status": false, "message": "Getting video stream error"});
        return
    }

});


app.use("/is_video_available", async function (req, res) {
    try {
        let {time, camera_ip} = req.body;
        if (!time) {
            time = req.query.time;
            camera_ip = req.query.camera_ip;
        }
        console.log(time, camera_ip, 'time and camera_ip')

        if (!time || !camera_ip) {
            res.status(400).send({status: false, message: "Requires time field"});
            return
        }

        let videoTimings;
        if (time === 'test') {
            videoTimings = 'videos/2023-03-24_16-12-16-14-192.168.1.166.mp4'
        } else {
            videoTimings = await getVideoTimings(time, camera_ip, db, minskTime)
        }

        console.log(videoTimings, 'videoP323233ath dsdasadcasd222adasd')
        const videoSize = fs.statSync(videoTimings.file_name).size;
        if (!!videoSize) {
            res.send({
                "status": true,
                date_start: videoTimings.date_start,
                date_end: videoTimings.date_end,
                file_name: videoTimings.file_name
            });
            return
        }
        res.send({"status": false});

        return
    } catch (e) {
        console.log(e, 'e')
        res.send({"status": false});
        return
    }
});
app.post("/get_video_start_time", async function (req, res) {
    try {
        let {time, camera_ip} = req.body;

        if (!time || !camera_ip) {
            res.status(400).send("Requires time field");
            return
        }

        const videoTimings = await getVideoTimings(time, camera_ip, db, minskTime)
        const date = new Date(time).valueOf();
        let videoStartTime = date - videoTimings.date_start;
        const rollBackTime = 5
        if (!!videoStartTime) {
            videoStartTime = videoStartTime / 1000; //to seconds
            videoStartTime = Math.round(videoStartTime)
            if (videoStartTime >= rollBackTime) {
                videoStartTime = videoStartTime - rollBackTime;
            }
            res.send({"status": true, result: videoStartTime});
            return
        } else {
            res.send({"status": false});
            return
        }

    } catch (e) {
        console.log(e, 'e')
        res.send({"status": false});
        return
    }
});
app.get("/video", async function (req, res) {
    try {
        // Ensure there is a range given for the video
        const range = req.headers.range;

        let {time, camera_ip} = req.query;
        if (!range) {
            res.status(400).send("Requires Range header");
            return
        }

        if (!time || !camera_ip) {
            res.status(400).send("Requires time field");
            return
        }


        let videoPath;
        if (time === 'test') {
            videoPath = 'videos/2023-03-24_16-12-16-14-192.168.1.166.mp4'
        } else {
            videoPath = await getFilePath(time, camera_ip, db, minskTime)
        }
        const videoSize = fs.statSync(videoPath).size;

        const CHUNK_SIZE = 10 ** 6; // 1MB
        const start = Number(range.replace(/\D/g, ""));
        const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

        // Create headers
        const contentLength = end - start + 1;
        const headers = {
            "Content-Range": `bytes ${start}-${end}/${videoSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": contentLength,
            "Content-Type": "video/mp4",
        };
        // HTTP Status 206 for Partial Content s
        res.writeHead(206, headers);

        // create video read stream for this particular chunk
        const videoStream = fs.createReadStream(videoPath, {start, end});

        videoStream.pipe(res);
    } catch (e) {
        console.log(e, 'e')
        res.send({"status": false, "message": "Getting video stream error"});
        return
    }
});


// 'ffmpeg -stream_loop -1 -re -i videos/test.mp4 -c copy -f rtsp rtsp://192.168.1.110:8554/mystream'

setTimeout(() => {
    try {
        const stream = new rtsp.FFMpeg({input: uri, rate: 2});
        console.log('stream of ', IP)
        stream.on('data', function (data) {
            if (!screenshot) {
                console.log(`save screenshot from ${IP}`)
                fs.writeFile(`images/${IP}/snapshot.jpg`, data, function (err) {
                    console.log(err, 'err')
                    screenshot = data;
                })
            } else {
                screenshot = data;
            }
        });
    } catch (e) {
        console.log(e, 'setTimeout start error')
    }
}, 500)

setTimeout(() => {
    videoRecord(uri, IP, db)
}, 1000)

app.use('/onvif-http/snapshot', async function (req, res) {
    res.send(screenshot);
});

setInterval(async () => {
    const freeSpace = await getFreeSpace();
    if (freeSpace < 0.2) {
        const videos = await getLast100Videos(db)
        for (video of videos) {
            await removeFile(video.file_name)
        }
        await removeLast100Videos(db)
    }
}, 1000)

app.listen(3456)
fetchCameras(IP, cameras, db)


const rtspUrl = 'rtsp://admin:just4Taqtile@192.168.1.64:554/Streaming/Channels/101?transportmode=unicast&profile=Profile_1';


