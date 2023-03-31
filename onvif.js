const express = require('express');
const app = express();
const fs = require('fs')
const
    Cam = require('onvif').Cam;
const bodyParser = require('body-parser');
const DigestFetch = require("./digest-fetch");
const {
    getScreenshotUrl,
    pause,
    fetchCameras,
    screenshotUpdate,
    isItEmulatedCamera,
    videoRecord
} = require('./fetch_cameras');
const {spawn} = require("child_process");
const rtsp = require("rtsp-ffmpeg");
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())
let IP = process.env.IP
if (!IP) {
    IP = '192.168.1.110'
}
if (!fs.existsSync('images/' + IP)) {
    fs.mkdirSync('images/' + IP);
    console.log(`${'images/' + IP} created successfully!`);
} else {
    console.log(`${'images/' + IP} already exists!`);
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
        int,
        camera_ip
        TEXT
    )
`);


app.post('/add_camera', async function (req, res) {
    const {ip, username, password} = req.body;
    if (isItEmulatedCamera(IP, ip)) {
        res.send({
            "status": true,
            "message": "Image was found and saved successfully",
            "result": `images/${ip}/snapshot.jpg`
        });
        return
    }
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

const getFilePath = async (time, camera_ip) => {
    const date = new Date(time).valueOf();
    return new Promise((resolve, reject) => {
        db.all(`SELECT *
                FROM videos
                where date_start < ${date}
                  and date_end > ${date}
                  and camera_ip = '${camera_ip}'`, (err, rows) => {
            if (err) {
                throw err;
            }
            if (rows[0]) {
                resolve(rows[0].file_name)
            } else {
                reject('Row not found')
            }

        });
    });
}

const getVideoTimings = async (time, camera_ip) => {
    const date = new Date(time).valueOf();
    return new Promise((resolve, reject) => {
        db.all(`SELECT *
                FROM videos
                where date_start < ${date}
                  and date_end > ${date}
                  and camera_ip = '${camera_ip}'`, (err, rows) => {
            if (err) {
                throw err;
            }
            console.log(rows, 'rows')
            if (rows[0]) {
                resolve({date_start: rows[0].date_start, date_end: rows[0].date_end, file_name: rows[0].file_name})
            } else {
                reject('Row not found')
            }

        });
    });
}

app.post("/is_video_available", async function (req, res) {
    try {
        let {time, camera_ip} = req.body;

        if (!time || !camera_ip) {
            res.status(400).send({status: false, message: "Requires time field"});
            return
        }

        let videoTimings;
        if (time === 'test') {
            videoTimings = 'videos/2023-03-24_16-12-16-14-192.168.1.166.mp4'
        } else {
            videoTimings = await getVideoTimings(time, camera_ip)
        }

        console.log(videoTimings, 'videoP323233ath dsdasadcasd222adasd')
        const videoSize = fs.statSync(videoTimings.file_name).size;
        if (!!videoSize) {
           res.send({"status": true, date_start: videoTimings.date_start, date_end: videoTimings.date_end, file_name: videoTimings.file_name});
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

        const videoTimings = await getVideoTimings(time, camera_ip)
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
            videoPath = await getFilePath(time, camera_ip)
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

const uri = `rtsp://${IP}:8554/mystream`;
console.log(uri, 'uri')
// const streamEmulate = spawn('ffmpeg', [
//     '-stream_loop',
//     '-1',
//     '-re',
//     '-i',
//     'videos/test.mp4',
//     '-c',
//     'copy',
//     '-f',
//     'rtsp',
//     uri
// ]);
// 'ffmpeg -stream_loop -1 -re -i videos/test.mp4 -c copy -f rtsp rtsp://192.168.1.110:8554/mystream'
let screenshot = null
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
}, 15000)

app.use('/onvif-http/snapshot', async function (req, res) {
    res.send(screenshot);
});

app.listen(3456)
fetchCameras(IP, cameras, db)


const rtspUrl = 'rtsp://admin:just4Taqtile@192.168.1.64:554/Streaming/Channels/101?transportmode=unicast&profile=Profile_1';


