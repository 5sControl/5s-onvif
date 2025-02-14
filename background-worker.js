// background-worker.js
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const { parentPort } = require('worker_threads');

parentPort.on('message', async (task) => {
  const { mp4Path, outTsPath, ss, t } = task;

  try {
    if (fs.existsSync(outTsPath)) {
      parentPort.postMessage({ done: true, outTsPath });
      return;
    }

    await runFfmpeg(mp4Path, outTsPath, ss, t);
    parentPort.postMessage({ done: true, outTsPath });
  } catch (error) {
    parentPort.postMessage({ done: false, error: error.message });
  }
});

function runFfmpeg(mp4Path, outTsPath, ss, t) {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(mp4Path);
    if (ss > 0) {
      command = command.inputOptions(['-ss', ss.toString()]);
    }
    if (t > 0) {
      command = command.outputOptions(['-t', t.toString()]);
    }
    command
      .outputOptions(['-c', 'copy'])
      .format('mpegts')
      .output(outTsPath)
      .on('end', () => resolve(true))
      .on('error', (err) => reject(err))
      .run();
  });
}