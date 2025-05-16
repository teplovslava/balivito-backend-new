export function getSystemUserId() {
    console.log(process.env)
    return process.env.SYSTEM_USER_ID;
  }