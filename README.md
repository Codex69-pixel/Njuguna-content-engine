# Njuguna Content Engine 🎬

Your lazy-day content machine. Every night it writes scripts, finds clips, records an AI voiceover, stitches vertical videos with subtitles, writes the caption (problem in the video, solution + your contact details in the caption), and **sends the finished videos to your WhatsApp**. You tap **Approve**, **Changes** or **Reject**. Approved videos get scheduled, and at posting time WhatsApp pings you with the video + caption (and posts to Instagram/Facebook for you if you switch that on).

Everything here is free to run on your own machine.

---

## What a normal day looks like

1. 02:00: the engine builds 3 videos (change this in `.env`).
2. 07:30: WhatsApp: "☀️ Morning! 3 waiting for review, 5 scheduled..."
3. You open WhatsApp, watch each video, tap a button:
   - ✅ **Approve** → scheduled into the next free slot (08:00 / 13:00 / 19:00 by default)
   - ✏️ **Changes** → type what to fix ("make the hook funnier", "swap clip 2", "that footage is too much, change it"). You get a new version a few minutes later.
   - 🗑️ **Reject** → binned.
4. Tired day? Type **approve all**. Or do nothing; it won't post anything you haven't approved.
5. Got an idea in the shower? Text the bot the idea in one sentence. It makes the video.

### Everything you can text the bot
| You send | What happens |
|---|---|
| any sentence (e.g. `clients who pay late`) | becomes a new video |
| `idea: ...` | same, explicit |
| `make 3` | builds 3 videos from the idea bank now |
| `approve all` | approves everything waiting |
| `tone: funnier` / `tone: more serious` / `tone:` (empty) | changes the writing voice (empty = reset) |
| `status` | what's waiting / scheduled / posted |
| `pause` / `resume` | stop or restart autopilot |
| `cancel` | cancels a pending "Changes" request |
| `help` | shows this list |

The idea bank refills itself with AI-brainstormed ideas (about 60% business problems, 40% developer takes like "AI vs developers"), so it never runs dry.

---

## Part 1: Install the tools (one time, ~20 min)

1. **Node.js 20+**: nodejs.org (LTS). Check: `node -v`
2. **FFmpeg**: Windows: open a terminal and run `winget install ffmpeg`, then close and reopen the terminal. Check: `ffmpeg -version`
3. **Python + edge-tts** (the free AI voice): install Python from python.org (tick "Add to PATH"), then run `pip install edge-tts`
4. **A script writer. Pick ONE:**
   - **Ollama (fully offline, free):** ollama.com → install → run `ollama pull llama3.2:3b` (needs ~4GB free RAM).
   - **Gemini (free key, better writing, needs internet):** aistudio.google.com → "Get API key". In `.env` set `LLM_PROVIDER=gemini` and paste the key. If the default model name stops working, set `GEMINI_MODEL` to a current Flash model name from their docs.
5. **Pexels API key (free clips):** pexels.com/api → sign up → copy the key.

## Part 2: Set up the project

```
cd njuguna-content-engine
npm install
copy .env.example .env        (Mac/Linux: cp .env.example .env)
```
Open `.env` in your editor. Fill in `PEXELS_API_KEY`, your script writer choice, and `WA_OWNER_NUMBER` (your personal WhatsApp number, country code first, digits only, e.g. `2547XXXXXXXX`). Leave the WhatsApp token/ID for Part 3.

Run `npm run selftest`. It fakes the internet and the voice but runs real FFmpeg and the real logic. You should see a list of ✅. That proves FFmpeg and the code work on your machine.

## Part 3: WhatsApp (the official free way: WhatsApp Cloud API)

Meta menus change a little over time, so if a button name differs slightly, look for the closest one.

1. Go to **developers.facebook.com** → log in with Facebook → **My Apps → Create App**. Choose the WhatsApp / business messaging option. It will ask you to create or pick a **Business portfolio**. Create one (any name, e.g. Njuguna Devs).
2. In the app dashboard open **WhatsApp → API Setup**. You'll see a free **test phone number**, a **Phone number ID**, and a **temporary access token**.
3. Under "To", add **your own WhatsApp number** as a recipient and enter the code Meta sends you.
4. Copy the **Phone number ID** into `WA_PHONE_NUMBER_ID`. For now paste the temporary token into `WA_TOKEN` (it dies after 24 hours; step 5 fixes that).
5. **Permanent token** (do this the same day):
   business.facebook.com → **Business settings → Users → System users → Add** (role: Admin) → **Add assets**: your app (full control) and your WhatsApp account (full control) → **Generate token**, tick `whatsapp_business_messaging` and `whatsapp_business_management`, no expiry → copy it into `WA_TOKEN`.
6. **App secret:** app dashboard → **App settings → Basic → App secret → Show** → paste into `WA_APP_SECRET`. This makes sure only Meta can talk to your webhook.
7. Pick any secret word for `WA_VERIFY_TOKEN` (you'll type the same word in Meta in Part 5).
8. **Open the chat:** from your phone, WhatsApp the test number (shown on API Setup) with "hi". This opens the 24-hour window.

> **Why the template setting?** WhatsApp only lets a bot message you freely within 24h of your last message to it. If you go quiet for a day, the engine parks videos and sends a short wake-up message (`WA_TEMPLATE_NAME`, default `hello_world`, which works out of the box on the test number). The moment you reply with anything ("hi", "👍"), everything waiting is delivered. To make the wake-up nicer ("Your videos are ready, reply to see them"), create your own template in **WhatsApp Manager → Message templates** (category Utility, no variables), wait for approval, and put its name in `WA_TEMPLATE_NAME`. Tip: replying with a quick "hi" each morning keeps the window open so videos arrive instantly.

## Part 4: A public address so WhatsApp can reach your PC (ngrok, free)

WhatsApp sends your button taps to a web address, so your PC needs one.

1. Sign up at **ngrok.com**, install it, and run the authtoken command they show you.
2. In the ngrok dashboard open **Domains** and claim your **free static domain** (looks like `something-random.ngrok-free.app`).
3. Put it in `.env`: `PUBLIC_URL=https://something-random.ngrok-free.app`
4. Edit `start.bat`: replace `YOUR-NGROK-DOMAIN` with that domain (without `https://`).

## Part 5: Connect WhatsApp to your engine

1. Double-click `start.bat` (or run `ngrok http --url=YOUR-DOMAIN 3000` in one terminal and `npm start` in another). **The engine must be running before the next step.**
2. In your Meta app: **WhatsApp → Configuration → Webhook → Edit**.
   - Callback URL: `https://YOUR-DOMAIN/webhook`
   - Verify token: the secret word from `WA_VERIFY_TOKEN`
   - Click **Verify and save**.
3. Under **Webhook fields**, **subscribe to `messages`**.
4. Now WhatsApp "hi" to the test number. It should answer with the help list. 🎉

## Part 6: Your first real video

1. `npm run check`: ticks everything and tells you exactly what to fix if something's missing.
2. `npm run make -- "customers keep asking if you have a website"`: builds one video without WhatsApp. Open the printed path and watch it. First run is slow (downloads, voice, render).
3. In WhatsApp, text the bot: `make 2`. Two videos arrive for review. Tap away.
4. Leave the two windows open. Autopilot is on.

**Keep the PC awake and the two windows open**, or the nightly build and posting won't run (turn off sleep in Windows power settings, or just leave it plugged in with the lid open). Later you can move it to a cheap always-on server.

---

## Part 7: Where posting actually happens

| Platform | How it works now |
|---|---|
| **Instagram + Facebook** | Auto-posted if you do Part 8 (optional). Otherwise, manual from the reminder. |
| **TikTok** | WhatsApp sends you the video + caption at the scheduled time. Save the video and upload it (30 seconds). TikTok's posting API is locked down for new apps. |
| **YouTube Shorts** | Same: manual from the reminder, or schedule in YouTube Studio. Google's API keeps new unaudited apps' uploads private. |
| **WhatsApp Status** | Post from the video the bot sent you. |

The HD video and caption of every approved video are also saved in `ready-to-post/` with the date in the file name, so you can batch-schedule a whole week in TikTok/YouTube/Meta's own free schedulers if you prefer.

## Part 8 (optional, do after week 1): Auto-post to Instagram + Facebook

This is the fiddliest part (Meta permissions), so get the rest working first. You need:
- Instagram **Professional** account (Business or Creator) linked to a **Facebook Page** you manage.
- In your Meta app, add the Instagram / Pages permissions `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. While you're the app admin/tester, you can use them on your own accounts without app review.
- In **Graph API Explorer** (developers.facebook.com/tools/explorer): pick your app, generate a user token with those permissions, exchange it for a long-lived one (`GET /oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN`), then call `GET /me/accounts`. That returns your Page's `id` and a long-lived Page `access_token`.
- Get your Instagram ID: `GET /{page-id}?fields=instagram_business_account`.
- Fill in `.env`: `META_PAGE_TOKEN`, `FB_PAGE_ID`, `IG_USER_ID`, `AUTO_POST_META=true`. Restart.

Instagram downloads the video from your ngrok address (protected by `MEDIA_KEY`, so set that to a long random string). If a post fails, the WhatsApp reminder tells you why and you can post it by hand. Nothing is lost.

---

## Customising

- **Your own clips (best option):** drop screen recordings of your real projects into `my_clips/`. Name them with keywords like `website_scroll_phone.mp4`, `code_typing.mp4`. When a script line's footage keywords match a file name, your clip is used instead of stock.
- **Music:** drop royalty-free tracks you have the licence for into `music/`. It mixes in quietly under the voice. Leave the folder empty for no music.
- **Voice:** `TTS_VOICE` (`en-KE-AsiliaNeural` / `en-KE-ChilembaNeural`; other languages exist too) and `TTS_RATE`.
- **Videos per night / posting times / reminder time:** `VIDEOS_PER_DAY`, `POST_TIMES`, `GENERATE_CRON`, `DIGEST_CRON`. It stops building when `MAX_PENDING_REVIEW` videos are already waiting, so a few lazy days never create a mountain.
- **Brand voice and rules:** `src/script.js` (the writing instructions) and the contact block in `.env`.
- **Idea bank:** the engine fills it itself. Starter ideas are in `src/ideas.js`.

## Copyright (so you don't get sued)

- Clips come from **Pexels** (free for commercial use, no attribution needed) and **your own recordings**. The engine deliberately does **not** pull clips from movies, TV or other people's videos, because that is how channels get strikes and lawsuits. Keep it that way.
- Don't use trending/commercial music unless you hold the licence. Use the `music/` folder only for tracks you're allowed to use.
- The prompts forbid fake statistics and guaranteed results, but you're the final check. That's what the approval step is for.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm run check` says edge-tts not found | `pip install edge-tts`, reopen the terminal |
| Videos have plain dark backgrounds | `PEXELS_API_KEY` empty or wrong |
| Script quality is weak | Use Gemini instead of Ollama, or `tone:` the bot. Small local models are the usual cause |
| No messages arrive on WhatsApp | Reply "hi" to the bot (24h window); check `npm run check`; temporary token expired → make the permanent one |
| Webhook "Verify and save" fails | Engine/ngrok not running, or verify token differs from `.env` |
| Button taps do nothing | Webhook field `messages` not subscribed, or `WA_APP_SECRET` is wrong |
| Subtitles too big/small or too low | `STYLE` line in `src/stitch.js` (`FontSize`, `MarginV`) |
| Error 131047 in the logs | Normal: 24h window closed; the engine handles it |

All your data (ideas, jobs, videos) lives in `data/`. Delete `data/db.json` to start fresh.
