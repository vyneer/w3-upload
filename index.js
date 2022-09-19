import process from 'process'
import minimist from 'minimist'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import * as fs from 'fs'
import * as nodepath from 'path'
import moment from 'moment'
import * as gvd from 'get-video-duration'

async function main () {
  const args = minimist(process.argv.slice(2))
  const lbryurl = args.lbryurl
  const lbrychannel = args.lbrychannel
  const dbpath = args.db
  const path = args.path

  if (!lbrychannel) {
    return console.error('Please supply the lbry/odysee channel name')
  }

  if (!lbryurl) {
    return console.error('Please supply the lbrynet API url')
  }

  if (!dbpath) {
    return console.error('Please supply the path to the SQLite db')
  }

  if (!path) {
    return console.error('Please supply the path to a file or directory')
  }

  const platform = path.includes("YOUTUBE") ? "youtube" : "twitch";

  const folderName = nodepath.parse(path).base

  const baseFolder = nodepath.parse(dbpath).base

  console.log(folderName)
  console.log(baseFolder)
  
  let videoID
  let videoInfo

  videoID = fs.readdirSync(path).filter((str) => {
    return str.includes("json")
  })[0].slice(0, -5)

  videoInfo = JSON.parse(fs.readFileSync(`${path}/${videoID}.json`))

  console.log(videoInfo)
  console.log(videoID)
  
  const startTime = moment(folderName.match(/\d{8}_\d{6}/gm)[0], "YYYYMMDD_HHmmss")
  console.log(startTime)
  const duration = await gvd.getVideoDurationInSeconds(`${path}/${videoID}.mp4`)
  console.log(duration)
  const endTime = startTime.clone().add(duration, "s")
  console.log(endTime)
  console.log(`${videoID} - ${videoInfo.title.replace(/[^a-zA-Z0-9\- ]/g, "_")}`);

  const uploadData = {
    "method": "publish", 
    "params": {
      "name": `${videoID}-r-${Math.floor(Math.random() * (100) + 1)}`, 
      "title": `[${videoID}] - ${videoInfo.title}`, 
      "bid": "0.0001", 
      "file_path": `/home/${path.slice(path.indexOf("captured/"))}/${videoID}.mp4`, 
      "validate_file": false, 
      "optimize_file": false, 
      "author": "Destiny",
      "description": `${startTime.toISOString().slice(0,-5) + "Z"}\n${endTime.toISOString().slice(0,-5) + "Z"}`,
      "tags": [
        "destiny",
        "streamer",
        "vod",
        startTime.format("YYYY-MM-DD HH:mm:ss"),
        "politics"
      ], 
      "languages": [
        "en"
      ], 
      "locations": [], 
      "channel_name": lbrychannel, 
      "wallet_id": "default_wallet",
      "funding_account_ids": [], 
      "preview": false, 
      "blocking": false
    }
  }

  await fetch(lbryurl, {
    method: "POST",
    body: JSON.stringify(uploadData)
  })
  .then((resp) => resp.json())
  .then((data) => {
    console.log("LBRY success:", data)
    open({
      filename: dbpath,
      driver: sqlite3.Database
    }).then(async (db) => {
      db.exec(
        `create table if not exists odysee (
             timest integer,
             platform text,
             id text,
             username text,
             title text,
             starttime text,
             endtime text, 
             thumbnail text,
             url text
         )`
      )
      db.run("INSERT INTO odysee (platform, timest, id, username, title, starttime, endtime, thumbnail, url) VALUES ($platform, $timest, $id, $username, $title, $start, $end, $thumbnail, $url)", {
        $platform: platform.toLowerCase(),
        $timest: Date.now(),
        $id: videoID,
        $username: videoInfo.author_name,
        $title: videoInfo.title,
        $start: startTime.toISOString().slice(0,-5) + "Z",
        $end: endTime.toISOString().slice(0,-5) + "Z",
        $thumbnail: videoInfo.thumbnail_url.includes("hqdefault.jpg") ? `${videoInfo.thumbnail_url.slice(0, -14)}/mqdefault_live.jpg` : videoInfo.thumbnail_url,
        $url: `${data.result.outputs[0].permanent_url.substring(7).split("#")[0]}/${data.result.outputs[0].claim_id}`
      })
      db.close()
    })
  })
  .catch((error) => {
    console.error('LBRY error:', error);
  });
}

main()