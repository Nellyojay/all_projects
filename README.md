# Mine

Mine opens on the PROUD.DEV project archive. Choose **Enter my space** in the header to open the responsive personal workspace for finances, calendar events, tasks, notes, and lists. It is a browser-based React and Vite app and does not require Expo or a native mobile runtime.

## Run locally

```sh
npm install
npm run dev
```

Create a production build with `npm run build`, or preview one with `npm run preview`.

## Local database

The app uses SQLite compiled to WebAssembly. Your database is saved in the browser's IndexedDB storage on this device; records are not sent to a server and do not automatically sync between browsers or devices. Keep browser site data enabled to retain your records.

## Responsive layout

The workspace uses a desktop sidebar, a compact tablet layout, and a fixed bottom navigation on phones. The web app can also be installed where the browser supports progressive web apps.
