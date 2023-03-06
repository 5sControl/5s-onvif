const {Cam} = require("onvif");
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

module.exports = getScreenshotUrl