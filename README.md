# Talk Circle

React + Vite app for an English speaking club. Create or join a room, pick any of 200 topics (searchable),
choose a question and who answers it. The question is shown to everyone; after answering, that person
chooses any topic, question, and next speaker.

## Run locally
    npm install
    cp .env.example .env   # add Supabase keys (optional: one-phone mode works without)
    npm run dev

## Live rooms (Supabase Realtime)
1. Create a project at supabase.com. Realtime is on by default.
2. Copy the Project URL and a client-safe public key (`anon` or `sb_publishable_`).
3. Put them in `.env` as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.

Each player publishes their name and the shared game state to Realtime Presence on `talk-circle:<code>`.
Active players receive updates and late joiners receive the current state. The same browser tab saves
its active room and last known game state in session storage, so reloading rejoins the room and restores
the game. This is a local recovery copy, not server-side room history; clearing tab data removes it.
Custom codes are checked against active rooms and can be reused after everyone leaves. Creating a room
after everyone has left starts a new game with that code.

The browser uses the Supabase public key, which is public by design. Never put a `service_role` or
`sb_secret_` key in
the frontend. Rooms use public Realtime Presence channels: room codes are invitations, not access controls,
and room data is not private. Do not share sensitive information in a room.

## Deploy to Vercel
Push to GitHub, import the repo in Vercel (Framework: Vite is auto-detected), and add the same two
environment variables in Project Settings > Environment Variables for each environment, then deploy.
The variable names must start with `VITE_` because Vite exposes only those client-side. After changing
them, create a new deployment. Verify the deployed page by creating a room on one device and joining its
code from another; both should show the same topic, question, and turn.

## Your questions
Topics, category names, colors, and emojis are in `src/topics.json` (10 categories x 20 topics).
All questions are in `src/questions.json`, organized as arrays keyed by the exact topic names in
`src/topics.json`. Edit a topic's array to change its questions; each question is loaded directly
from this file, with no question generation in the app.
