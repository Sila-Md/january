const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const zlib = require('zlib');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    Browsers, 
    makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys');

// === CONFIGURATION ===
const SESSION_PREFIX = "SILA-MD~";

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

// Generate creds.json session (raw JSON as string)
function generateCredsSession(credsPath) {
    try {
        const credsData = fs.readFileSync(credsPath, 'utf8');
        return credsData; // Return raw JSON string
    } catch (error) {
        console.error("Error reading creds:", error);
        return null;
    }
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    const sessionType = req.query.session || 'long'; // Default 'long', option: 'creds'

    async function SILA_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
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
                if (!res.headersSent) {
                    await res.send({ code });
                }
            }
            
            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection == "open") {
                    await delay(3000);
                    let credsPath = __dirname + `/temp/${id}/creds.json`;

                    try {
                        let sessionCode;
                        
                        if (sessionType === 'long') {
                            // Long session: compressed + base64
                            sessionCode = generateLongSession(credsPath);
                            if (!sessionCode) throw new Error("Failed to generate long session");
                        } else {
                            // Creds.json session: raw JSON
                            sessionCode = generateCredsSession(credsPath);
                            if (!sessionCode) throw new Error("Failed to read creds.json");
                        }

                        // Send session code to user
                        let sessionLabel = sessionType === 'long' ? 'LONG SESSION' : 'CREDS.JSON SESSION';
                        
                        // First message: session code only
                        let codeMsg = await sock.sendMessage(sock.user.id, { 
                            text: `*📱 YOUR ${sessionLabel}*\n\n${sessionCode}`
                        });

                        // Second message: formatted with info
                        let desc = `┏━❑ *SILA-MD ${sessionLabel}* ✅
┏━❑ *SAFETY RULES* ━━━━━━━━━
┃ 🔹 *Session ID:* Sent above.
┃ 🔹 *Warning:* Do not share this code!
┃ 🔹 Keep this code safe.
┃ 🔹 Valid for 24 hours only.
┗━━━━━━━━━━━━━━━
┏━❑ *CHANNEL* ━━━━━━━━━
┃ 📢 Follow our channel: https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02
┗━━━━━━━━━━━━━━━
┏━❑ *REPOSITORY* ━━━━━━━━━
┃ 💻 Repository: https://github.com/Sila-Md/SILA-MD
┃ 👉 Fork & contribute!
┗━━━━━━━━━━━━━━━

> © 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

                        await sock.sendMessage(sock.user.id, {
                            text: desc,
                            contextInfo: {
                                externalAdReply: {
                                    title: 'SILA MD',
                                    body: '© Sila Tech',
                                    thumbnailUrl: 'https://files.catbox.moe/36vahk.png',
                                    thumbnailWidth: 64,
                                    thumbnailHeight: 64,
                                    sourceUrl: 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02',
                                    mediaUrl: 'https://files.catbox.moe/36vahk.png',
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
                        }, { quoted: codeMsg });

                    } catch (e) {
                        console.error("Session generation error:", e);
                        
                        let errorMsg = await sock.sendMessage(sock.user.id, { 
                            text: `*⚠️ Session Generation Error*\n\n${e.message || e.toString()}\n\nPlease try again.`
                        });
                        
                        let desc = `┏━❑ *SILA-MD SESSION* ⚠️
┏━❑ *SAFETY RULES* ━━━━━━━━━
┃ 🔹 *Error:* Session creation failed.
┃ 🔹 Please try again later.
┃ 🔹 Contact support if issue persists.
┗━━━━━━━━━━━━━━━
┏━❑ *CHANNEL* ━━━━━━━━━
┃ 📢 Follow our channel: https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02
┗━━━━━━━━━━━━━━━
┏━❑ *REPOSITORY* ━━━━━━━━━
┃ 💻 Repository: https://github.com/Sila-Md/SILA-MD
┗━━━━━━━━━━━━━━━

> © 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

                        await sock.sendMessage(sock.user.id, {
                            text: desc,
                            contextInfo: {
                                externalAdReply: {
                                    title: 'SILA MD',
                                    body: '© Sila Tech',
                                    thumbnailUrl: 'https://files.catbox.moe/98k75b.jpeg',
                                    thumbnailWidth: 64,
                                    thumbnailHeight: 64,
                                    sourceUrl: 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02',
                                    mediaUrl: 'https://files.catbox.moe/98k75b.jpeg',
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
                        }, { quoted: errorMsg });
                    }

                    await delay(10);
                    await sock.ws.close();
                    await removeFile('./temp/' + id);
                    console.log(`👤 ${sock.user.id} 🔥 SILA-MD Session Connected (${sessionType.toUpperCase()}) ✅`);
                    await delay(10);
                    process.exit();

                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10);
                    SILA_MD_PAIR_CODE();
                }
            });
            
        } catch (err) {
            console.log("⚠️ SILA-MD Connection failed — Restarting service...");
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: "❗ SILA-MD Service Unavailable" });
            }
        }
    }

    return await SILA_MD_PAIR_CODE();
});

module.exports = router;
