import Agenda from "agenda";
import dotenv from "dotenv";

dotenv.config();

const mongoConnectionString = process.env.MONGODB_URI;

const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: "agendaJobs" },
  processEvery: "1 minute",
});

export default agenda;