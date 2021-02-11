/**
 * Command functions for the bot, keywords for commands are preceded by '!'.
 * Any message that needs to be sent and is not a reply can must be returned by
 * the function. Embeds can be return as long as it can be sent via the
 * channel.send() function.
 */
import { Message, GuildMember, User, MessageEmbed } from "discord.js";
import d20 from 'd20';
import config from './config.json';
import {replies} from './replies';
import * as utilities from './utilities';

var copypastas = utilities.loadCopypastas(config.cp_files);
var castigados: any[] = [];

/**
 * Declare any new commands here for the bot to handle
 * Then declare the function as an async function to resolve as promise.
 */
type FunctionDictionary = { [key: string]: Function };
export let commands: FunctionDictionary = {
    "copypasta": copypasta,
    "oracle": oracle,
    "roll": roll,
    "castigar": castigar,
}

/**
 * Returns a random copypasta to send
 * @param discord_message
 * @param _args
 */
async function copypasta(discord_message: Message, _args: string[]) {
    return utilities.getRandom(copypastas);
}

/**
 * Sends a random reply from the "oracle" array in replies.ts
 * @param {message} discord_message
 * @param {[String]} args
 */
async function oracle(discord_message: Message, _args: string[]) {
    discord_message.reply( utilities.getRandom(replies.oracle) );
}

/**
 * Rolls the corresponding dice to the first argument
 * See https://www.npmjs.com/package/d20 for more info
 * @param discord_message
 * @param args
 */
async function roll(discord_message: Message, args: string[]) {
    if (args[0]) {
        return d20.roll(args[0]); // TODO: error checking
     }
     else {
         return "Usage: !roll (dice)"
     }
}

/**
 * SPAGHETTI CODE WARNING
 * Sends people to the purgatory channel, can send multiple people if they are all
 * mentioned in the same message. After 30 seconds returns them to their original
 * voice channel.
 * @param discord_message
 * @param _args
 */
async function castigar(discord_message: Message, _args: string[]) {
    const users: User[] = discord_message.mentions.users.array();
    let members: (GuildMember | null | undefined)[] = [];

    let vc: string | undefined;

    if (!users) { return "Usage: !castigar @wey"; }
    if (!discord_message.guild) { return "Aqui no uei"; }
    users.forEach(user => {
        members.push(discord_message.guild?.member(user));
    });
    vc = members[0]?.voice.channelID;

    //if member is in voice channel and its not purgatory, send him to the ranch
    if (vc && vc != config.purgatoryChannel) {
        castigados.push({"members": members, "vc":vc});
        members.forEach(async (member) => {
            await member?.voice.setChannel(config.purgatoryChannel, "Castigado");
        });

        if (members.length > 1){
            discord_message.channel.send("Castigados, papu");
        }
        else {
            discord_message.channel.send("Castigado, papu");
        }

        await utilities.sleep(30);

        //if member hasn't left the purgatory send him back to his original vc
        let aux = castigados.shift();
        let sentBack = 0;
        aux.members.forEach(async (member: GuildMember) => {
            if(member?.voice.channelID == config.purgatoryChannel) {
                await member?.voice.setChannel(aux.vc);
                sentBack += 1;
            }
        });
        if (sentBack > 1){
            discord_message.channel.send("Descastigados, papu");
        }
        else {
            discord_message.channel.send("Descastigado, papu");
        }
        return null;

    }
    else {
        return "No esté chingando";
    }
}
