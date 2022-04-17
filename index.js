import process from 'process'
import minimist from 'minimist'
import { Web3Storage, getFilesFromPath } from 'web3.storage'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import * as fs from 'fs'
import * as nodepath from 'path'
import moment from 'moment'
import * as gvd from 'get-video-duration'

async function storeWithProgress(client, files, name) {
  // show the root cid as soon as it's ready
  const onRootCidReady = cid => {
    console.log('uploading files with cid:', cid)
  }

  // when each chunk is stored, update the percentage complete and display
  const totalSize = files.map(f => f.size).reduce((a, b) => a + b, 0)
  let uploaded = 0

  const onStoredChunk = size => {
    uploaded += size
    const pct = (uploaded / totalSize) * 100
    console.log(`Uploading... ${pct.toFixed(2)}% complete`)
  }

  // client.put will invoke our callbacks during the upload
  // and return the root cid when the upload completes
  return client.put(files, { onRootCidReady, onStoredChunk, name: name })
}

async function main () {
  const args = minimist(process.argv.slice(2))
  const token = args.token
  const dbpath = args.db
  const path = args.path
  
  if (!token) {
    return console.error('A token is needed. You can create one on https://web3.storage')
  }

  if (!dbpath) {
    return console.error('Please supply the path to the SQLite db')
  }

  if (!path) {
    return console.error('Please supply the path to a file or directory')
  }

  const platform = path.includes("YOUTUBE") ? "youtube" : "twitch";

  const storage = new Web3Storage({ token })

  const files = await getFilesFromPath(path)

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
  const duration = await gvd.getVideoDurationInSeconds(`${path}/index.m3u8`)
  console.log(duration)
  const endTime = startTime.clone().add(duration, "s")
  console.log(endTime)

  const cid = await storeWithProgress(storage, files, `${videoID}_${folderName}`)
  console.log('Content added with CID:', cid)

  open({
    filename: dbpath,
    driver: sqlite3.Database
  }).then(async (db) => {
    db.exec(
      `create table if not exists ipfs (
           timest integer,
           platform text,
           id text,
           username text,
           title text,
           starttime text,
           endtime text, 
           thumbnail text,
           cid text,
           folder text
       )`
    )
    db.run("INSERT INTO ipfs (platform, timest, id, username, title, starttime, endtime, thumbnail, cid, folder) VALUES ($platform, $timest, $id, $username, $title, $start, $end, $thumbnail, $cid, $folder)", {
      $platform: platform.toLowerCase(),
      $timest: Date.now(),
      $id: videoID,
      $username: videoInfo.author_name,
      $title: videoInfo.title,
      $start: startTime.toISOString().slice(0,-5) + "Z",
      $end: endTime.toISOString().slice(0,-5) + "Z",
      $thumbnail: videoInfo.thumbnail_url.includes("hqdefault.jpg") ? `${videoInfo.thumbnail_url.slice(0, -14)}/mqdefault_live.jpg` : videoInfo.thumbnail_url,
      $cid: cid,
      $folder: folderName
    })
    db.close()
  })
}

main()