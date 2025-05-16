import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve("/app/.env") });

export function getSystemUserId() {
    console.log(process.env)
    return process.env.SYSTEM_USER_ID;
  }