"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setVolume = exports.getVolume = exports.readVolumes = exports.cachePlaylist = exports.getTimestamp = exports.songEmbed = exports.getSongs = exports.searchYT = void 0;
const googleapis_1 = require("googleapis");
const musicClasses_1 = require("./musicClasses");
const luxon_1 = require("luxon");
const config = __importStar(require("../config.json"));
const fs_1 = __importDefault(require("fs"));
const readline_1 = __importDefault(require("readline"));
const discord_js_1 = require("discord.js");
const youtube = googleapis_1.google.youtube('v3');
const apiKey = process.env.YT_API_KEY;
const prependURL = 'https://www.youtube.com/watch?v=';
const volumesCSV = './memes/volumes.csv';
const regexURL = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
let cachedPlaylist = [];
let volumesFile;
let volumes = {};
readVolumes((data) => {
    volumes = data;
});
// recursive method to get a playlist
// it's kinda slow...
function getPlaylistRec(playlist, nextPageToken) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(nextPageToken);
        // check pagination for really long playlists
        if (!nextPageToken)
            return Array();
        if (nextPageToken == 'first')
            nextPageToken = null;
        // get video IDs from playlist
        // console.log("getting playlist");
        let res = yield youtube.playlistItems.list({
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
        let videoInfo = yield youtube.videos.list({
            key: apiKey,
            part: ['snippet', 'contentDetails'],
            id: videoIds,
        });
        let songs = videoInfo.data.items.map(item => {
            return new musicClasses_1.Song(item.snippet.title, prependURL + item.id, item.contentDetails.duration, item.snippet.thumbnails.medium.url, item.snippet.channelTitle);
        });
        return songs.concat(yield getPlaylistRec(playlist, res.data.nextPageToken));
    });
}
function getPlaylist(playlist) {
    return __awaiter(this, void 0, void 0, function* () {
        return getPlaylistRec(playlist, 'first');
    });
}
function getSongMetadata(url) {
    return __awaiter(this, void 0, void 0, function* () {
        var match = url.match(regexURL);
        let songid = (match && match[7].length == 11) ? match[7] : '';
        if (!songid) {
            return null;
        }
        let res = yield youtube.videos.list({
            key: apiKey,
            part: ['snippet', 'contentDetails'],
            id: [songid],
        });
        if (!res) {
            return null;
        }
        return res.data.items[0];
    });
}
function songFromURL(url) {
    return __awaiter(this, void 0, void 0, function* () {
        let song = yield getSongMetadata(url);
        if (!song) {
            return null;
        }
        return new musicClasses_1.Song(song.snippet.title, prependURL + song.id, song.contentDetails.duration, song.snippet.thumbnails.medium.url, song.snippet.channelTitle);
    });
}
function searchYT(keyword) {
    return __awaiter(this, void 0, void 0, function* () {
        let res;
        try {
            res = yield youtube.search.list({
                q: keyword,
                key: apiKey,
                part: ['snippet'],
                safeSearch: "none",
                maxResults: 1,
            });
        }
        catch (err) {
            console.error(err);
        }
        if (!res.data.items) {
            return null;
        }
        let id = res.data.items[0].id.videoId;
        let videoInfo;
        try {
            videoInfo = yield youtube.videos.list({
                key: apiKey,
                part: ['snippet', 'contentDetails'],
                id: [id],
            });
        }
        catch (err) {
            console.error(err);
        }
        const firstResult = videoInfo.data.items[0];
        return new musicClasses_1.Song(firstResult.snippet.title, prependURL + firstResult.id, firstResult.contentDetails.duration, firstResult.snippet.thumbnails.medium.url, firstResult.snippet.channelTitle);
    });
}
exports.searchYT = searchYT;
function getSongs(url) {
    return __awaiter(this, void 0, void 0, function* () {
        if (url.includes('/playlist?list=')) {
            let playlistId = url.split('/playlist?list=')[1];
            playlistId = playlistId.split('&')[0];
            if (playlistId == config.playlistId) {
                console.log('fetching from cache');
                return cachePlaylist();
            }
            return getPlaylist(playlistId);
        }
        return songFromURL(url);
    });
}
exports.getSongs = getSongs;
// Utilities
function songEmbed(title, song, streamTime) {
    let ltime = luxon_1.Duration.fromMillis(streamTime);
    let tTime = luxon_1.Duration.fromISO(song.duration);
    let format = tTime.as('hours') < 1 ? 'mm:ss' : 'hh:mm:ss';
    let timestamp;
    if (streamTime > 0) {
        timestamp = ltime.toFormat(format) + '/' + tTime.toFormat(format);
    }
    else {
        timestamp = tTime.toFormat(format);
    }
    let embed = new discord_js_1.MessageEmbed()
        .setAuthor(`${title}:`, config.avatarUrl)
        .setTitle(song.title)
        .setURL(song.url)
        .setThumbnail(config.avatarUrl)
        .addField(song.author, `${timestamp} Volume: ${getVolume(song.url)}`)
        // .addField("Volume: " + getVolume(song.url), "")
        .setImage(song.thumbnail);
    return embed;
}
exports.songEmbed = songEmbed;
function getTimestamp(stream, total) {
}
exports.getTimestamp = getTimestamp;
function cachePlaylist(refresh = false) {
    return __awaiter(this, void 0, void 0, function* () {
        if (cachedPlaylist.length < 1 || refresh) {
            console.log("trayendo playlist");
            let res = yield getPlaylist(config.playlistId);
            if (!(res instanceof Array))
                res = [res];
            cachedPlaylist = res;
        }
        console.log("playlist guardada, regresando de cache");
        return cachedPlaylist;
    });
}
exports.cachePlaylist = cachePlaylist;
function readVolumes(callback) {
    console.log("reading volumes csv");
    let stream;
    stream = fs_1.default.createReadStream(volumesCSV).on('error', (err) => {
        fs_1.default.closeSync(fs_1.default.openSync('volumes.csv', 'w'));
    });
    var lineReader = readline_1.default.createInterface({
        input: stream
    });
    lineReader.on('line', (str) => {
        // console.log('Line from file:', str);
        let line = str.split(',');
        volumes[line[0]] = parseInt(line[1]);
    });
    stream.once('end', () => {
        stream.close();
        writeVolumes();
        volumesFile = fs_1.default.openSync(volumesCSV, 'a');
    });
}
exports.readVolumes = readVolumes;
function writeVolumes() {
    var file = fs_1.default.createWriteStream(volumesCSV);
    file.on('error', function (err) {
        console.error("Can't write");
    });
    Object.keys(volumes).forEach((url) => {
        file.write(`${url},${volumes[url]}\n`);
    });
    file.end();
}
function getVolume(url) {
    let vol = volumes[url] || 5;
    return vol;
}
exports.getVolume = getVolume;
function setVolume(url, volume) {
    volumes[url] = volume;
    fs_1.default.appendFileSync(volumesFile, `${url},${volume}\n`);
}
exports.setVolume = setVolume;
