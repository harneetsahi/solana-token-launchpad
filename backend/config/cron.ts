import { CronJob } from "cron";
import https from "https";
import "dotenv/config";

const url = process.env.API_URL as string;

const job = new CronJob("*/14 * * * *", function () {
  https
    .get(url, (res: any) => {
      if (res.statusCode === 200) console.log("Get request sent");
      else console.log("Get request failed", res.statusCode);
    })
    .on("error", (e) => console.error("Error while sending request", e));
});

export default job;
