const { makeid } = require('./gen-id');
const express = require('express');
const QRCode = require('qrcode');
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
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

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

router.get('/', async (req, res) => {
    const id = makeid();
    const startTime = Date.now();
    const sessionType = (req.query.session || 'long').toLowerCase();
    let responseSent = false;

    async function SILA_MD_QR_CODE() {
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
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS(randomItem),
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;
                const latency = Date.now() - startTime;
                const performanceLevel = latency < 200 ? "🟢 Excellent" : latency < 500 ? "🟡 Good" : "🔴 Slow";

                try {
                    if (qr && !responseSent && !res.headersSent) {
                        responseSent = true;
                        return await res.end(await QRCode.toBuffer(qr));
                    }

                    if (connection == "open") {
                        await delay(5000);
                        
                        // Force save creds
                        await saveCreds();
                        await delay(2000);

                        let credsPath = path.join(sessionDir, 'creds.json');
                        
                        // Wait for valid creds.json
                        let sessionData = null;
                        let attempts = 0;
                        const maxAttempts = 20;

                        while (attempts < maxAttempts && !sessionData) {
                            try {
                                if (fs.existsSync(credsPath)) {
                                    const stats = fs.statSync(credsPath);
                                    const data = fs.readFileSync(credsPath, 'utf8');
                                    if (data && data.length > 200 && stats.size > 200) {
                                        try {
                                            const parsed = JSON.parse(data);
                                            if (parsed.noiseKey && parsed.signedIdentityKey && parsed.signedPreKey) {
                                                sessionData = data;
                                                break;
                                            }
                                        } catch (parseError) {
                                            // JSON not complete
                                        }
                                    }
                                }
                                await delay(5000);
                                attempts++;
                            } catch (readError) {
                                console.error("Read error:", readError);
                                await delay(2000);
                                attempts++;
                            }
                        }

                        if (!sessionData) {
                            if (!responseSent && !res.headersSent) {
                                res.status(500).json({ code: "Session data not found" });
                                responseSent = true;
                            }
                            await removeFile(sessionDir);
                            return;
                        }

                        try {
                            let sessionCode;
                            let sessionLabel;

                            if (sessionType === 'long') {
                                const compressedData = zlib.gzipSync(sessionData);
                                const b64data = compressedData.toString('base64');
                                sessionCode = SESSION_PREFIX + b64data;
                                sessionLabel = 'LONG SESSION';
                            } else {
                                sessionCode = sessionData;
                                sessionLabel = 'CREDS.JSON SESSION';
                            }

                            // Send session code
                            await sock.sendMessage(sock.user.id, { 
                                text: `*✅ YOUR ${sessionLabel}*\n\n${sessionCode}`
                            });

                            await delay(2000);

                            // Buttons
                            const msgButtons = [
                                { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Session', copy_code: sessionCode }) },
                                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📂 Bot Repository', url: BOT_REPO }) },
                                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📢 Join Channel', url: WA_CHANNEL }) }
                            ];

                            await sendButtons(sock, sock.user.id, {
                                title: 'SILA MD',
                                text: `*${sessionLabel}*\n\nTap button below to copy your session.`,
                                footer: MSG_FOOTER,
                                buttons: msgButtons
                            });

                            // Info message
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

╔► 𝐏𝐞𝐫𝐟𝐨𝐫𝐦𝐚𝐧𝐜𝐞 𝐋𝐞𝐯𝐞𝐥:
╠► ${performanceLevel}
╚► → 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 𝐭𝐢𝐦𝐞: ${latency}ms

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
                                text: `*⚠️ Error*\n\n${e.message || e.toString()}`
                            });
                        }

                        await delay(2000);
                        await sock.ws.close();
                        await removeFile(sessionDir);
                        console.log(`👤 QR Session Connected (${sessionType.toUpperCase()}) ✅`);
                        process.exit();
                    }

                } catch (err) {
                    console.log("⚠️ Error:", err);
                }

                if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode != 401) {
                    await delay(5000);
                    SILA_MD_QR_CODE();
                }
            });

        } catch (err) {
            console.log("⚠️ Connection failed:", err);
            await removeFile(sessionDir);
            if (!responseSent && !res.headersSent) {
                await res.send({ code: "❗ Service Unavailable" });
                responseSent = true;
            }
        }
    }

    await SILA_MD_QR_CODE();
});

module.exports = router;
