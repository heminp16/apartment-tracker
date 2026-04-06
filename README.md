# Apartment Tracker

Apartment hunting tracker using Cloudflare Pages + KV. Tampermonkey script saves units from apartments.com, web app syncs to shared database.

## Files

```
apt-tracker/
├── index.html               -  web app with table, filters, reactions
├── functions/api.js         - Pages Function for KV storage
├── apt-unit-tracker.user.js - Tampermonkey script for saving units
└── README.md
```

## Setup

1. Create KV namespace `APT_DATA` in Cloudflare dashboard
2. Deploy to Cloudflare Pages (upload files or connect repo)
3. Bind `APT_DATA` KV to Pages Functions
4. Open site, set passcode on first login

## Usage

- **Tampermonkey**: Install `apt-unit-tracker.user.js`, browse apartments.com, save units (optionally sync immediately)
- **Web app**: View/edit units, add reactions (❤️⭐🤔👎), export data
- **Sync**: Direct API upload or localStorage polling every 4s

## Costs

- Cloudflare Pages: Free (unlimited sites, 500 deploys/month)
- Cloudflare KV: Free (100k reads/day, 1k writes/day)

## Troubleshooting

- **Server error**: Check KV binding and redeploy
- **Wrong passcode**: Delete `passcode` key in KV namespace
- **Sync issues**: Refresh app, check sync dot (green=ok)
