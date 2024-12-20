const validateRequestBody = (req, res, next) => {
    const { ip, username, password } = req.body;
    if (!ip || !username || !password) {
      return res.send({ "status": false, "message": "Required fields not found" });
    }
    next();
};

module.exports = validateRequestBody;