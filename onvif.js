const express = require('express');
const app = express();
const fs = require('fs')
const
    Cam = require('onvif').Cam;
const bodyParser = require('body-parser');

const DigestFetch = require("./digest-fetch");
const {getScreenshotUrl, pause, fetchCameras, screenshotUpdate} = require('./fetch_cameras');
const {spawn} = require("child_process");
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())
let IP = process.env.IP
if (!IP) {
    IP = '192.168.1.150'
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

app.get("/video", async function (req, res) {
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
        videoPath = 'images/192.168.1.160/2023-03-10/14-20.mp4'
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

    // HTTP Status 206 for Partial Content
    res.writeHead(206, headers);

    // create video read stream for this particular chunk
    const videoStream = fs.createReadStream(videoPath, {start, end});

    videoStream.pipe(res);
});

app.get("/t1", async function (req, res) {

// RTSP stream URL
    const rtspUrl = 'rtsp://192.168.1.150:8554/stream';

// Output file path
    const outputFile = 'snapshot.jpg';
    const now = Date.now()
// Spawn an FFmpeg process to capture a single frame from the RTSP stream
    const ffmpeg = spawn('ffmpeg', [
        '-i', rtspUrl,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputFile
    ]);

// Listen for output and error events from the FFmpeg process
    ffmpeg.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout:\n${data}`);
    });

    ffmpeg.stderr.on('data', (data) => {
        console.error(`FFmpeg stderr:\n${data}`);
    });

// Listen for the exit event from the FFmpeg process
    ffmpeg.on('exit', (code) => {
        if (code === 0) {
            console.log(Date.now() - now)
            console.log(`Snapshot saved to ${outputFile}`);
        } else {
            console.error(`FFmpeg process exited with code ${code}`);
        }
    });

});

app.get("/ss", async function (req, res) {

// RTSP stream URL
    const rtspUrl = 'rtsp://192.168.1.150:8554/stream';

// Output file path
    const outputFile = 'snapshot.jpg';
    const now = Date.now()
// Spawn an FFmpeg process to capture a single frame from the RTSP stream
    const ffmpeg = spawn('ffmpeg', [
    '-stream_loop',
    `-1`,
    '-re',
    '-i',
    'videos/test.mp4',
    '-c',
    'copy',
    '-f',
    'rtsp',
    `rtsp://${IP}:8554/stream`
]);
// Listen for output and error events from the FFmpeg process
    ffmpeg.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout:\n${data}`);
    });

    ffmpeg.stderr.on('data', (data) => {
        console.error(`FFmpeg stderr:\n${data}`);
    });

// Listen for the exit event from the FFmpeg process
    ffmpeg.on('exit', (code) => {
        if (code === 0) {
            console.log(Date.now() - now)
            console.log(`Snapshot saved to ${outputFile}`);
        } else {
            console.error(`FFmpeg process exited with code ${code}`);
        }
    });

});

app.listen(3456)
fetchCameras(IP, cameras, db)



const rtspUrl = 'rtsp://admin:just4Taqtile@192.168.1.64:554/Streaming/Channels/101?transportmode=unicast&profile=Profile_1';


