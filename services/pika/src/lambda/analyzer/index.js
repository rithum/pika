"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
var chat_admin_ddb_1 = require("../../lib/chat-admin-ddb");
var sessionSettleDurationMS = 1000 * 60 * 1; // 1 minute
function handler(event, context) {
    return __awaiter(this, void 0, void 0, function () {
        var lastRun, lastKey, sessions, _i, _a, session, lastUpdate, lastMessageId, lastAnalyzedMessage;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    lastRun = {
                        lastRun: new Date("2020-01-01").valueOf()
                    };
                    lastKey = undefined;
                    _e.label = 1;
                case 1: return [4 /*yield*/, (0, chat_admin_ddb_1.getSessions)(lastKey)];
                case 2:
                    sessions = _e.sent();
                    for (_i = 0, _a = (_b = sessions.Items) !== null && _b !== void 0 ? _b : []; _i < _a.length; _i++) {
                        session = _a[_i];
                        lastUpdate = new Date(session.lastUpdate).valueOf();
                        lastMessageId = (_c = session.lastMessageId) !== null && _c !== void 0 ? _c : "";
                        lastAnalyzedMessage = (_d = session.lastAnalyzedMessage) !== null && _d !== void 0 ? _d : "";
                        if (lastUpdate - sessionSettleDurationMS > lastRun.lastRun &&
                            lastAnalyzedMessage < lastMessageId) {
                            // New Messages to analyze
                            console.log("Session: ".concat(session.chatAppId, ":").concat(session.sessionId, ", lm: ").concat(lastMessageId, ", lam: ").concat(lastAnalyzedMessage));
                        }
                    }
                    lastKey = sessions.LastEvaluatedKey;
                    _e.label = 3;
                case 3:
                    if (!!lastKey) return [3 /*break*/, 1];
                    _e.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
