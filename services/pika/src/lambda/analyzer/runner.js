"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
var index_1 = require("./index");
//let { handler } = require("./index");
//import { pikaConfig } from "../../../../../pika-config";
var stage = (_a = process.argv[1]) !== null && _a !== void 0 ? _a : "test";
var name = "ai-bot"; //pikaConfig.pika.projNameKebabCase;
process.env.AWS_REGION = (_b = process.env.AWS_REGION) !== null && _b !== void 0 ? _b : 'us-east-1';
process.env.STAGE = stage;
process.env.CHAT_APP_TABLE = "chat-app-".concat(name, "-").concat(stage);
process.env.AGENT_DEFINITIONS_TABLE = "agent-definitions-".concat(name, "-").concat(stage);
//process.env.CHAT_ADMIN_API_ID = appConfig.chatApiId;
process.env.CHAT_MESSAGES_TABLE = "chat-message-".concat(name, "-").concat(stage);
process.env.CHAT_SESSION_TABLE = "chat-session-".concat(name, "-").concat(stage);
process.env.CHAT_USER_TABLE = "chat-user-".concat(name, "-").concat(stage);
process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE = name;
process.env.TOOL_DEFINITIONS_TABLE = "tool-definitions-".concat(name, "-").concat(stage);
process.env.UPLOAD_S3_BUCKET = "file-uploads-".concat(name, "-").concat(stage);
(0, index_1.handler)({}, {})
    .then(function (d) { return console.log("Data:", d); })
    .catch(function (e) { return console.log("Error:", e); })
    .finally(function () { return console.log("Done"); });
