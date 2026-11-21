# Hafiz Gas Appliances - Frontend

Angular frontend for the Hafiz Gas Appliances ecommerce application.

## Requirements

- Node.js and npm
- The backend API running at `http://https://hafiz-gas-appliances.onrender.com` for API-powered features

The API address is currently configured in the frontend source. Start the backend separately before using features that load or update server data.

## Setup

From this directory, install dependencies and start the development server:

```bash
npm ci
npm start
```

Open `http://localhost:4200/` in your browser.

## Production build

```bash
npm run build
```

The generated build files are written to `dist/` and are not committed to Git.

## GitHub

Push this entire `ecommerce-frontend` project folder to its own GitHub repository. Do not upload only an individual source file; the app also needs its Angular configuration, dependency manifests, assets, and source files.
