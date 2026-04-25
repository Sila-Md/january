const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const zlib = require('zlib');
const { sendButtons } = require('gifted-btns');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    Browsers, 
    makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys');

// === CONFIGURATION ===
const SESSION_PREFIX = "SILA-MD~";
const BOT_REPO = "https://github.com/Sila-Md/SILA-MD";
const WA_CHANNEL = "https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02";
const THUMBNAIL_URL = "https://files.catbox.moe/98k75b.jpeg";
const MSG_FOOTER = "© Sila Tech";

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

// Generate long session string from creds.json
function generateLongSession(credsPath) {
    try {
        const credsData = fs.readFileSync(credsPath, 'utf8');
        const compressedData = zlib.gzipSync(credsData);
        const b64data = compressedData.toString('base64');
        return SESSION_PREFIX + b64data;
    } catch (error) {
        console.error("Error generating long session:", error);
        return null;
    }
}

// Generate creds.json session - read ALL files and combine
function generateFullCredsSession(sessionDir) {
    try {
        const credsPath = path.join(sessionDir, 'creds.json');
        
        if (!fs.existsSync(credsPath)) {
            console.error("creds.json not found");
            return null;
        }
        
        const credsData = fs.readFileSync(credsPath, 'utf8');
        return credsData;
    } catch (error) {
        console.error("Error reading full creds:", error);
        return null;
    }
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    const sessionType = (req.query.session || 'long').toLowerCase();
    let responseSent = false;

    async function SILA_MD_PAIR_CODE() {
        const sessionDir = './temp/' + id;
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        try {
            const items = ["Safari", "Chrome", "Firefox"];
            const randomItem = items[Math.floor(Math.random() * items.length)];
            
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                syncFullHistory: false,
                browser: Browsers.macOS(randomItem)
            });
            
            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                if (!responseSent && !res.headersSent) {
                    await res.send({ code });
                    responseSent = true;
                }
            }
            
            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection == "open") {
                    await delay(5000); // Wait for creds to be saved
                    
                    // Force save creds one more time
                    await saveCreds();
                    await delay(2000);

                    let credsPath = path.join(sessionDir, 'creds.json');

                    // Wait for creds.json to be fully written
                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 20;

                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            if (fs.existsSync(credsPath)) {
                                const stats = fs.statSync(credsPath);
                                const data = fs.readFileSync(credsPath, 'utf8');
                                if (data && data.length > 200 && stats.size > 200) {
                                    // Verify it's valid JSON and has required fields
                                    try {
                                        const parsed = JSON.parse(data);
                                        if (parsed.noiseKey && parsed.signedIdentityKey && parsed.signedPreKey) {
                                            sessionData = data;
                                            console.log(`✅ Valid creds.json found (${stats.size} bytes)`);
                                            break;
                                        }
                                    } catch (parseError) {
                                        console.log("JSON not complete yet, waiting...");
                                    }
                                }
                            }
                            await delay(5000);
                            attempts++;
                            console.log(`Waiting for creds.json... attempt ${attempts}`);
                        } catch (readError) {
                            console.error("Read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        console.error("❌ Could not get valid creds.json after", attempts, "attempts");
                        await sock.sendMessage(sock.user.id, { 
                            text: "❌ Failed to generate session. Please try again."
                        });
                        await delay(2000);
                        await sock.ws.close();
                        await removeFile(sessionDir);
                        process.exit();
                        return;
                    }

                    try {
                        let sessionCode;
                        let sessionLabel;

                        if (sessionType === 'long') {
                            // Long session: compressed + base64
                            const compressedData = zlib.gzipSync(sessionData);
                            const b64data = compressedData.toString('base64');
                            sessionCode = SESSION_PREFIX + b64data;
                            sessionLabel = 'LONG SESSION';
                        } else {
                            // Creds.json session: raw JSON
                            sessionCode = sessionData;
                            sessionLabel = 'CREDS.JSON SESSION';
                        }

                        console.log(`📤 Sending ${sessionLabel} (${sessionCode.length} chars)`);

                        // Send session code first
                        await sock.sendMessage(sock.user.id, { 
                            text: `*✅ YOUR ${sessionLabel}*\n\n${sessionCode}`
                        });

                        await delay(2000);

                        // Prepare buttons
                        const msgButtons = [
                            { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Session', copy_code: sessionCode }) },
                            { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📂 Bot Repository', url: BOT_REPO }) },
                            { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📢 Join Channel', url: WA_CHANNEL }) }
                        ];

                        // Send buttons
                        await sendButtons(sock, sock.user.id, {
                            title: 'SILA MD',
                            text: `*${sessionLabel}*\n\nTap button below to copy your session.`,
                            footer: MSG_FOOTER,
                            buttons: msgButtons
                        });

                        // Send formatted info message
                        let desc = `┏━❑ *SILA-MD ${sessionLabel}* ✅
┏━❑ *SAFETY RULES* ━━━━━━━━━
┃ 🔹 *Session ID:* Sent above.
┃ 🔹 *Warning:* Do not share this code!
┃ 🔹 Keep this code safe.
┃ 🔹 Valid for 24 hours only.
┗━━━━━━━━━━━━━━━
┏━❑ *CHANNEL* ━━━━━━━━━
┃ 📢 Follow our channel: ${WA_CHANNEL}
┗━━━━━━━━━━━━━━━
┏━❑ *REPOSITORY* ━━━━━━━━━
┃ 💻 Repository: ${BOT_REPO}
┃ 👉 Fork & contribute!
┗━━━━━━━━━━━━━━━

> © 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

                        await sock.sendMessage(sock.user.id, {
                            text: desc,
                            contextInfo: {
                                externalAdReply: {
                                    title: 'SILA MD',
                                    body: '© Sila Tech',
                                    thumbnailUrl: THUMBNAIL_URL,
                                    thumbnailWidth: 64,
                                    thumbnailHeight: 64,
                                    sourceUrl: WA_CHANNEL,
                                    mediaUrl: THUMBNAIL_URL,
                                    showAdAttribution: true,
                                    renderLargerThumbnail: false,
                                    previewType: 'PHOTO',
                                    mediaType: 1
                                },
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363402325089913@newsletter',
                                    newsletterName: '© Sila Tech',
                                    serverMessageId: Math.floor(Math.random() * 1000000)
                                },
                                isForwarded: true,
                                forwardingScore: 999
                            }
                        });

                    } catch (e) {
                        console.error("Session processing error:", e);
                        
                        await sock.sendMessage(sock.user.id, { 
                            text: `*⚠️ Session Generation Error*\n\n${e.message || e.toString()}\n\nPlease try again.`
                        });
                    }

                    await delay(2000);
                    await sock.ws.close();
                    await removeFile(sessionDir);
                    console.log(`👤 Session Connected (${sessionType.toUpperCase()}) ✅`);
                    await delay(10);
                    process.exit();

                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode != 401) {
                    await delay(5000);
                    SILA_MD_PAIR_CODE();
                }
            });
            
        } catch (err) {
            console.log("⚠️ Connection failed — Restarting...");
            await removeFile(sessionDir);
            if (!responseSent && !res.headersSent) {
                await res.send({ code: "❗ Service Unavailable" });
                responseSent = true;
            }
        }
    }

    return await SILA_MD_PAIR_CODE();
});

module.exports = router;
