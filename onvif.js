const express = require('express');
const cors = require('cors');
const app = express();
const DigestFetch = require("./digest-fetch");
const bodyParser = require('body-parser');
const fs = require('fs')
const morgan = require('morgan');
const Cam = require('onvif').Cam;
const {spawn} = require("child_process");
const rtsp = require("rtsp-ffmpeg");
const fsPromise = require('fs').promises;
const {Server} = require("socket.io");
const http = require('http');
const server = http.createServer(app);
const captureSnapshot = require('./capture-snapshot')
const path = require('path');
const io = require("socket.io")(server, {
    cors: {
        origin: "*",
    }
});

const init = require('./init')
const {
    pause,
    fetchCameras,
    screenshotUpdate,
    isItEmulatedCamera,
    videoRecord,
    returnUpdatedScreenshot
} = require('./fetch_cameras');
const { getFilePath, getVideoTimings, getSettings, editSettings, fetchTotalCountVideos } = require('./db.js');
const { getFreeSpace } = require('./storage');
const {sendSystemMessage} = require('./system-messages')
require('dotenv').config();
const cameraRoutes = require('./routes/camera');
const cron = require("node-cron");
const cleanupVideos = require("./video-services/cleanup-videos.js");
const { deleteFile } = require("./storage");
const findOrphanFiles = require("./utils/find-orphan-files.js");



app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(cors());
// app.use(morgan('dev'));

(async () => {
    let IP = process.env.DJANGO_SERVICE_URL;
    let cameras = {};

    const uri = `rtsp://${IP}:8554/mystream`;
    let screenshot = null
    const db = await init();

    app.use('', cameraRoutes);

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
    
        try {
            const screenshotUrlData = await captureSnapshot(username, password, ip)
            if (screenshotUrlData.url) {
                const client = new DigestFetch(username, password)
                const screenshotUpdated = await screenshotUpdate(username, password, ip)
                if (!screenshotUpdated.success) {
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
    
            let link = `rtsp://admin:just4Taqtile@${camera_ip}:554/Streaming/Channels/101?transportmode=unicast&profile=Profile_1`
            if (camera_ip === IP) {
                link = `rtsp://${IP}:8554/mystream`
            }
            const ffmpegProcess = spawn('ffmpeg', [
                "-loglevel",
                "0",
                '-i',
                link,
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
            const time = req.body.time || req.query.time;
            const camera_ip = req.body.camera_ip || req.query.camera_ip;
    
            if (!time || !camera_ip) {
                res.status(400).send({status: false, message: "Requires time field"});
                return
            }

            const videoTimings = await getVideoTimings(time, camera_ip, db);

            const videoStats = await fs.promises.stat(videoTimings.file_name);
            const videoSize = videoStats.size;
    
            const rollBackTime = 10 * 1000;
            let video_start_from = time - videoTimings.date_start;
            video_start_from = Math.max(0, video_start_from - rollBackTime);

            return res.json({
                status: true,
                ...videoTimings,
                video_start_from
            });
        } catch (error) {
            console.error('Error processing /is_video_available:', error);

            return res.status(500).json({
                status: false,
                message: 'An error occurred while processing the request',
                error: error.message
            });
        }
    });

    app.post("/get_video_start_time", async function (req, res) {
        try {
            let {time, camera_ip} = req.body;
    
            if (!time || !camera_ip) {
                res.status(400).send("Requires time field");
                return
            }
    
            const videoTimings = await getVideoTimings(time, camera_ip, db)
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
                videoPath = await getFilePath(time, camera_ip, db)
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
    
    app.get("/max_video_storage_time", async function (req, res) {
        try {
            const gbPerDayOnOneCamera = 36;
            const cameraCount = Object.keys(cameras).length;
            const gbToSaveOneDayForAllCameras = cameraCount * gbPerDayOnOneCamera;
            const freeSpace = await getFreeSpace();
    
            res.send({"status": true, result: {maxDays: cameraCount == 0 ? 999 : Math.floor(freeSpace / gbToSaveOneDayForAllCameras), freeSpace: `${Math.floor(freeSpace)}GB`}});
        } catch (e) {
            res.send({"status": false, "message": "Get settings error"});
            return
        }
    });
    
    app.get("/get_settings", async function (req, res) {
        try {
            const settings = await getSettings(db);
            res.send({"status": true, result: settings});
        } catch (e) {
            res.send({"status": false, "message": "Get settings error"});
            return
        }
    });
    
    app.post("/edit_settings", async function (req, res) {
        try {
            console.log(req.body, 'body')
            const status = await editSettings(db, req.body);
            res.send({"status": true, result: status});
        } catch (e) {
            res.send({"status": false, "message": "Get settings error"});
            return
        }
    });
    
    let tasks = {}
    io.on('connection', (socket) => {
        console.log('<<<<<<<<<<<<<<<user connection>>>>>>>>>>>>>>>>>>>')
        socket.emit('tasks', tasks)
        socket.on('tasks', (data) => { 
        tasks = data;     
        socket.broadcast.emit('tasks', data);
      });
        socket.on('disconnect', () => {
            console.log('user disconnected');
        });
    });
    
    // nohup  ffmpeg -stream_loop -1 -re -i express-test.mp4 -c copy -f rtsp rtsp://192.168.1.110:8554/mystream &
    let counter = 0;
    setTimeout(() => {
        try {
            const stream = new rtsp.FFMpeg({input: uri, rate: 2});
            console.log('stream of ', IP)
            stream.on('data', function (data) {
                counter++
                if (!screenshot) {
                    fs.writeFile(`images/${IP}/snapshot.jpg`, data, function (err) {
                        console.log(err, 'stream on data err')
                        screenshot = data;
                    })
                } else {
                    io.emit('snapshot_updated', {"camera_ip": IP, 'screenshot': data});
                    screenshot = data;
                }
                if (counter%5 === 0) {
                    fs.writeFile(`images/${IP}/snapshot.jpg`, data, function (err) {
                        console.log(err, 'stream on data err')
                    })
                }
            });
        } catch (e) {
            console.log(e, 'setTimeout start error')
        }
    }, 500)
    
    setTimeout(() => {
        // office server
        if (IP === '192.168.1.110') {
            videoRecord(uri, IP, db)
        }
    }, 1000)
    
    app.use('/onvif-http/snapshot', async function (req, res) {
        const queryParams = req.query;
        const cameraIp = queryParams?.camera_ip;
        if (!cameraIp) {
            res.send(screenshot);
            return
        }
        res.send(cameras[cameraIp]?.screenshotBuffer)
    });

    app.use('/video_count', async (req, res) => {
        try {
            const count = await fetchTotalCountVideos(db);
    
            res.status(200).send({
                status: true,
                count: count,
            });
        } catch (error) {
            console.error('Error in /video_count:', error.message);
            res.status(500).send({
                status: false,
                message: 'Internal server error',
            });
        }
    });

    app.use('/cleanup_orphan_files', async (req, res) => {
        try {
            const orphanFiles = await findOrphanFiles(db);

            for (const file of orphanFiles) {
                await deleteFile(file);
            }
    
            res.status(200).send({
                status: true,
                message: 'Orphan files cleanup completed.',
                deletedFiles: orphanFiles.length
            });
        } catch (error) {
            console.error('Error during orphan files cleanup:', error.message);
            res.status(500).send({
                status: false,
                message: 'Error during orphan files cleanup.',
                error: error.message
            });
        }
    });

app.post('/create_manifest', async (req, res) => {
    const { timeStart, timeEnd, cameraIp } = req.body;
  console.log(timeStart, timeEnd, cameraIp);
  
    if (!timeStart || !timeEnd || !cameraIp) {
      return res
        .status(400)
        .json({ status: false, message: "timeStart, timeEnd и cameraIp обязательны" });
    }
  
    const start = Number(timeStart);
    const end = Number(timeEnd);
  
    if (isNaN(start) || isNaN(end) || start >= end) {
      return res
        .status(400)
        .json({ status: false, message: "Некорректные значения timeStart/timeEnd" });
    }

    const SEGMENT_DURATION_MS = 2 * 60 * 1000;
    const segments = [];
    const fileName = await getFilePath(1738760981486, cameraIp, db)
console.log(fileName, 1);

    // for (let t = start; t < end; t += SEGMENT_DURATION_MS) {
    //     const segmentStart = new Date(t);
    //     console.log(2);
        
    //     const fileName = await getFilePath(t, cameraIp, db)
    //     console.log(fileName);
    //     segments.push({
    //       startTime: segmentStart,
    //       fileName: fileName
    //     });
    //   }
  
    // let manifest = "#EXTM3U\n";
    // manifest += "#EXT-X-VERSION:3\n";
    // manifest += "#EXT-X-TARGETDURATION:120\n";
    // manifest += "#EXT-X-MEDIA-SEQUENCE:0\n\n";
  
    // segments.forEach(segment => {
    //   manifest += `#EXT-X-PROGRAM-DATE-TIME:${segment.startTime.toISOString()}\n`;
    //   manifest += "#EXTINF:120.0,\n";
    //   manifest += `${segment.fileName}\n\n`;
    // });
  
    // manifest += "#EXT-X-ENDLIST\n";
  
    // res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    // res.send(manifest);
    res.send({"status": true, result: 'settings'});
  });

  app.get('/videos_1', async (req, res) => {
    try {
      const query = `SELECT * FROM videos`;
      console.log(db, 5);
      
      // Выполнение запроса к базе данных
      const rows = await new Promise((resolve, reject) => {
        db.all(query, [], (err, rows) => {
          if (err) {
            console.error('Database query error:', err.message);
            reject(new Error(`Database query error: ${err.message}`));
          } else {
            resolve(rows);
          }
        });
      });
  
      // Возвращаем все записи
      res.status(200).json({
        status: true,
        message: 'Retrieved all video records successfully',
        data: rows,
      });
    } catch (error) {
      console.error('Error retrieving video records:', error.message);
      res.status(500).json({
        status: false,
        message: 'Error retrieving video records',
        error: error.message,
      });
    }
  });

    cron.schedule("00 12 * * *", async () => {
        try {
            console.log("Starting scheduled cleanup task...");
            await cleanupVideos(db);
            console.log("Cleanup task completed successfully.");
        } catch (error) {
            console.error("Error in scheduled cleanup task:", error.message);
        }
    });
    
    server.listen(3456, () => {
        console.log('\x1b[32mServer run on 3456\x1b[0m')
        const startTime = new Date();
        console.log(`\x1b[33mServer started at: ${startTime.toLocaleString()} (local server time)\x1b[0m`);
    })
    fetchCameras(IP, cameras, db, io)
})();


