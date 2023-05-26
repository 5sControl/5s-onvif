class CameraErrorHandler {
  constructor() {
    this.checks = {}
  }

  add(camera, error) {
    if (!this.checks[camera]) {
      this.checks[camera] = {errors: [], date: Date.now()}
    }

    this.checks[camera].errors.push(error)

    if (this.checks[camera].errors.length > 100) {
      const isEveryError = this.checks[camera].errors.every((elem) => elem)
      this.checks[camera].errors = []
      const now = Date.now();
      const period = 10 * 60 * 1000; // 10 minutes
      const isTimeEnough = (now - this.checks[camera].date) > period
      if (isEveryError && isTimeEnough) {
        this.checks[camera].date = Date.now();
        console.log(`Camera ${camera} lost connection`)
        return `Camera ${camera} lost connection`
      }
    }

    return false;
  }
}

module.exports = {CameraErrorHandler}