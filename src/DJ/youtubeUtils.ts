import { google } from 'googleapis';
import { Song } from "./musicClasses";
import { Duration } from 'luxon';
import * as config from '../config.json';
import csvtojson from 'csvtojson';
import fs, { writev } from 'fs';
import readline from 'readline';
import { MessageEmbed } from 'discord.js';

const youtube = google.youtube('v3');
const apiKey = process.env.YT_API_KEY;
const prependURL = 'https://www.youtube.com/watch?v=';
const volumesCSV = './memes/volumes.csv';
const regexURL = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/

let cachedPlaylist: Song[] = [];
let volumesFile: number;
let volumes: any = {};
readVolumes((data: any) => {
    volumes = data;
});

// recursive method to get a playlist
// it's kinda slow...
async function getPlaylistRec(playlist: string, nextPageToken:string): Promise<Array<Song>> {
    console.log(nextPageToken);
    // check pagination for really long playlists
    if(!nextPageToken)
        return Array<Song>();
    if (nextPageToken == 'first')
        nextPageToken = null;

    // get video IDs from playlist
    // console.log("getting playlist");
    let res = await youtube.playlistItems.list({
        key: apiKey,
        part: ['snippet'],
        playlistId: playlist,
        pageToken: nextPageToken,
        maxResults: 50,
    });

    // map the ids to an array and then request the video info
    // 50 at a time to reduce api quota usage
    let videoIds = res.data.items.map(item => {
        return item.snippet.resourceId.videoId;
    });

    // This nasty ass bottleneck will stop the thread for ~500 ms every 50 songs in a playlist
    // I should probably do something about it
    let videoInfo = await youtube.videos.list({
        key: apiKey,
        part: ['snippet','contentDetails'],
        id: videoIds,
    });

    let songs = videoInfo.data.items.map(item => {
        return new Song(item.snippet.title,
                        prependURL+item.id,
                        item.contentDetails.duration,
                        item.snippet.thumbnails.medium.url,
                        item.snippet.channelTitle);
    });

    return songs.concat(await getPlaylistRec(playlist, res.data.nextPageToken));
}

async function getPlaylist(playlist: string): Promise<Array<Song>> {
    return getPlaylistRec(playlist, 'first');
}

async function getSongMetadata(url: string) {
    var match = url.match(regexURL);
    let songid = (match&&match[7].length == 11)? match[7] : '';
    if (!songid) {
        return null;
    }
    let res = await youtube.videos.list({
        key: apiKey,
        part: ['snippet','contentDetails'],
        id: [songid],
    });
    if (!res) {
        return null;
    }
    return res.data.items[0];
}

async function songFromURL(url: string) {
    let song = await getSongMetadata(url);
    if (!song) {
        return null;
    }
    return new Song(song.snippet.title,
                    prependURL+song.id,
                    song.contentDetails.duration,
                    song.snippet.thumbnails.medium.url,
                    song.snippet.channelTitle);
}

export async function searchYT(keyword: string){
    let res;
    try {
        res = await youtube.search.list({
            q: keyword,
            key: apiKey,
            part: ['snippet'],
            safeSearch: "none",
            maxResults: 1,
        });
    } catch (err) {
        console.error(err);
    }

    if (!res.data.items){
        return null;
    }
    let id = res.data.items[0].id.videoId;
    let videoInfo;
    try {
        videoInfo = await youtube.videos.list({
            key: apiKey,
            part: ['snippet','contentDetails'],
            id: [id],
        });
    } catch (err) {
        console.error(err);
    }

    const firstResult = videoInfo.data.items[0];
    return new Song(firstResult.snippet.title,
                    prependURL+firstResult.id,
                    firstResult.contentDetails.duration,
                    firstResult.snippet.thumbnails.medium.url,
                    firstResult.snippet.channelTitle)
}

export async function getSongs(url: string) {
    if(url.includes('/playlist?list=')){
        let playlistId = url.split('/playlist?list=')[1];
        playlistId = playlistId.split('&')[0];
        if (playlistId == config.playlistId) {
            console.log('fetching from cache');
            return cachePlaylist();
        }
        return getPlaylist(playlistId);
    }
    return songFromURL(url);
}

// Utilities
export function songEmbed(title: string, song: Song, streamTime: number) {
    let ltime = Duration.fromMillis(streamTime);
    let tTime = Duration.fromISO(song.duration);
    let format = tTime.as('hours') < 1? 'mm:ss' : 'hh:mm:ss';
    let timestamp: string;
    if (streamTime > 0){
        timestamp = ltime.toFormat(format) + '/' + tTime.toFormat(format);
    }
    else {
        timestamp = tTime.toFormat(format);
    }

    let embed = new MessageEmbed()
        .setAuthor(`${title}:`, config.avatarUrl)
        .setTitle(song.title)
        .setURL(song.url)
        .setThumbnail(config.avatarUrl)
        .addField(song.author, `${timestamp} Volume: ${getVolume(song.url)}`)
        // .addField("Volume: " + getVolume(song.url), "")
        .setImage(song.thumbnail);
    return embed;
}

export function getTimestamp(stream: number, total: string) {

}

export async function cachePlaylist(refresh=false) {
    if (cachedPlaylist.length < 1 || refresh) {
        console.log("trayendo playlist");
        let res = await getPlaylist(config.playlistId);
        if (!(res instanceof Array))
            res = [res];
        cachedPlaylist = res;
    }
    console.log("playlist guardada, regresando de cache");
    return cachedPlaylist;
}

export function readVolumes(callback: Function) {
    console.log("reading volumes csv");
    let stream: fs.ReadStream;
    stream = fs.createReadStream(volumesCSV).on('error', (err: Error) => {
        fs.closeSync(fs.openSync('volumes.csv', 'w'));
    });
    var lineReader = readline.createInterface({
        input: stream
    });
    lineReader.on('line', (str: string) => {
        // console.log('Line from file:', str);
        let line = str.split(',');
        volumes[line[0]] = parseInt(line[1]);
    });
    stream.once('end', () => {
        stream.close();
        writeVolumes();
        volumesFile = fs.openSync(volumesCSV, 'a');
    });
}

function writeVolumes() {
    var file = fs.createWriteStream(volumesCSV);
    file.on('error', function(err) {
        console.error("Can't write");
     });
    Object.keys(volumes).forEach( (url: string) => {
        file.write(`${url},${volumes[url]}\n`);
    });
    file.end();
}

export function getVolume(url: string){
    let vol = volumes[url] || 5;
    return vol;
}

export function setVolume(url: string, volume: number){
    volumes[url] = volume;
    fs.appendFileSync(volumesFile, `${url},${volume}\n`);
}