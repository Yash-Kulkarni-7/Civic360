# CIVIC360 – Municipal Complaint App (React + Express + Supabase + Leaflet)

## 1. Supabase (free)
1. Create a project at supabase.com.
2. SQL Editor → paste and run `supabase/schema.sql` (tables, demo users, photo bucket).
3. Project Settings → API: copy the Project URL and the **service_role** key.

## 2. Run the API
    cd server && cp .env.example .env    (fill in the Supabase URL + service key)
    npm install && npm run dev           (http://localhost:4000)

## 3. Run the web app
    cd client && cp .env.example .env
    npm install && npm run dev           (http://localhost:5173)

## Login (demo OTP is always 1234)
- 9999999999 → Admin (sees Citizen, Field officer and Admin tabs)
- 8888888881 / 8888888882 / 8888888883 → Officers Rahul, Meena, Sanjay (Citizen + Field officer tabs)
- Any other 10-digit number starting with 6-9 → Citizen

## Try the flow
Citizen reports (tap map, add photo) → Admin assigns an officer → Officer checks in, adds before/after photos, marks complete → Admin verifies → Citizen rates.

## Going live
- Real SMS: in `server/index.js`, make `/api/auth/send` generate a random OTP, store it with an expiry, and send it via MSG91 or Twilio; make `/api/auth/verify` compare against it.
- Deploy: client on Vercel (set VITE_API_URL), server on Render or Railway (set the .env values and CLIENT_URL).
