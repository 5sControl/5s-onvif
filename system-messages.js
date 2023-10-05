const sendSystemMessage = async (IP, messageBody) => {
    try {
      const res = await fetch(`http://${IP}:8000/api/core/system-message/`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: JSON.stringify(messageBody)
        })
        console.log(res, 'res sendSystemMessage')
    } catch(e) {
        console.log(e, 'sendSystemMessage error')
    }
}

module.exports = {sendSystemMessage}