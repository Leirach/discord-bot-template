"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const bot_1 = require("./bot");
// static webpage
const app = express_1.default();
let port = process.env.PORT || 8080;
app.listen(port);
let client = path_1.default.join(__dirname, '..', 'client');
app.use(express_1.default.static(client));
let authToken = process.env.TOKEN;
if (!authToken) {
    console.error("Bot authentication token not found!");
    console.error("Exiting now.");
    process.exit(1);
}
// init discord bot
bot_1.initBot(authToken);
