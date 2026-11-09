import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import puppeteer from "puppeteer";
import type { Browser, Page } from "puppeteer";

// Persistent multi-supervisor real-time cloud rooms (each supervisor has an isolated roomId)
const CLOUD_ROOMS_FILE = path.join(process.cwd(), ".quran-cloud-rooms.json");
const cloudRooms: Record<string, Record<string, any>> = {};
const roomSubscribers: Record<string, Set<express.Response>> = {};

try {
  if (fs.existsSync(CLOUD_ROOMS_FILE)) {
    const raw = fs.readFileSync(CLOUD_ROOMS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      Object.assign(cloudRooms, parsed);
    }
  }
} catch (err) {
  console.warn("Could not load existing cloud rooms file:", err);
}

let saveRoomsTimeout: ReturnType<typeof setTimeout> | null = null;
function scheduleSaveCloudRooms() {
  if (saveRoomsTimeout) clearTimeout(saveRoomsTimeout);
  saveRoomsTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(CLOUD_ROOMS_FILE, JSON.stringify(cloudRooms), "utf-8");
    } catch (e) {
      console.warn("Failed to persist cloud rooms:", e);
    }
  }, 400);
}

function setNestedValue(root: Record<string, any>, rawPath: string, value: any) {
  const segments = rawPath.split("/").map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) {
    if (value === null || value === undefined) {
      for (const k of Object.keys(root)) delete root[k];
    } else if (typeof value === "object") {
      for (const k of Object.keys(root)) delete root[k];
      Object.assign(root, value);
    }
    return;
  }
  let curr: any = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (curr[seg] === null || typeof curr[seg] !== "object" || Array.isArray(curr[seg])) {
      curr[seg] = {};
    }
    curr = curr[seg];
  }
  const lastSeg = segments[segments.length - 1];
  if (value === null || value === undefined) {
    delete curr[lastSeg];
  } else {
    curr[lastSeg] = value;
  }
}

function broadcastRoomUpdate(roomId: string, payload: { path: string; value: any; updatedAt: number }) {
  const subs = roomSubscribers[roomId];
  if (!subs || subs.size === 0) return;
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of subs) {
    try {
      res.write(message);
    } catch {
      subs.delete(res);
    }
  }
}

// Keep a persistent single instance of the browser to avoid expensive spawn on each request
let browserInstance: Browser | null = null;

async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (e) {
      console.warn("Failed to close old browser instance:", e);
    }
  }

  browserInstance = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--disable-features=IsolateOrigins,site-per-process',
      '--js-flags="--max-old-space-size=512"'
    ],
    headless: true,
  });
  
  return browserInstance;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing large HTML payloads
  app.use(express.json({ limit: '50mb' }));

  // Health check routes
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/healthz", (_req, res) => {
    res.send("ok");
  });

  // ==================== Multi-Supervisor Instant Cloud Realtime Sync API ====================
  // Each supervisor gets a completely isolated roomId based on their account
  app.get("/api/realtime-sync/:roomId", (req, res) => {
    const roomId = String(req.params.roomId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!roomId) {
      res.status(400).json({ error: "Invalid roomId" });
      return;
    }
    if (!cloudRooms[roomId]) {
      cloudRooms[roomId] = {};
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ roomId, state: cloudRooms[roomId], updatedAt: Date.now() });
  });

  app.get("/api/realtime-sync/:roomId/stream", (req, res) => {
    const roomId = String(req.params.roomId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!roomId) {
      res.status(400).end();
      return;
    }
    if (!cloudRooms[roomId]) {
      cloudRooms[roomId] = {};
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    if (!roomSubscribers[roomId]) {
      roomSubscribers[roomId] = new Set();
    }
    roomSubscribers[roomId].add(res);

    // Send initial full state snapshot immediately
    res.write(
      `data: ${JSON.stringify({ path: "", value: cloudRooms[roomId], updatedAt: Date.now() })}\n\n`
    );

    const keepAliveTimer = setInterval(() => {
      try {
        res.write(`: keepalive ${Date.now()}\n\n`);
      } catch {
        clearInterval(keepAliveTimer);
      }
    }, 20000);

    req.on("close", () => {
      clearInterval(keepAliveTimer);
      roomSubscribers[roomId]?.delete(res);
    });
  });

  app.post("/api/realtime-sync/:roomId/set", (req, res) => {
    const roomId = String(req.params.roomId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!roomId) {
      res.status(400).json({ error: "Invalid roomId" });
      return;
    }
    const { path: targetPath = "", value = null } = req.body || {};
    if (!cloudRooms[roomId]) {
      cloudRooms[roomId] = {};
    }

    setNestedValue(cloudRooms[roomId], String(targetPath), value);
    scheduleSaveCloudRooms();

    const updatedAt = Date.now();
    broadcastRoomUpdate(roomId, {
      path: String(targetPath),
      value,
      updatedAt,
    });

    res.json({ ok: true, updatedAt });
  });

  // Server-side proxy for Quran page text (bypasses browser CORS & network restrictions)
  const quranServerCache = new Map<number, any>();
  app.get("/api/quran-page-text/:page", async (req, res) => {
    const pageNum = parseInt(req.params.page, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > 604) {
      res.status(400).json({ error: "Invalid page number" });
      return;
    }

    if (quranServerCache.has(pageNum)) {
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(quranServerCache.get(pageNum));
      return;
    }

    try {
      const upstreamUrl = `https://api.quran.com/api/v4/verses/by_page/${pageNum}?words=true&per_page=50&word_fields=text_uthmani,line_number,position`;
      const response = await fetch(upstreamUrl, {
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Upstream returned ${response.status}`);
      }

      const data = await response.json();
      quranServerCache.set(pageNum, data);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(data);
    } catch (err: any) {
      console.error(`Failed to fetch page ${pageNum} from upstream:`, err?.message || err);
      res.status(502).json({ error: "Failed to fetch page text from upstream", details: err?.message });
    }
  });

  // API constraints
  app.post("/api/pdf", async (req, res) => {
    let page: Page | null = null;
    try {
      const { html, orientation = "landscape" } = req.body;
      
      if (!html) {
        res.status(400).send("محتوى HTML مفقود");
        return;
      }

      const browser = await getBrowser();
      page = await browser.newPage();

      await page.setViewport({
        width: orientation === "landscape" ? 1123 : 794,
        height: orientation === "landscape" ? 794 : 1123,
        deviceScaleFactor: 2,
      });

      // Fast DOM load since styles & images are already inlined by the client
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 8000 });

      // Wait briefly (max 500ms) for fonts if any are still decoding
      try {
        await page.evaluate(async () => {
          if (document.fonts) {
            await Promise.race([
              document.fonts.ready,
              new Promise(resolve => setTimeout(resolve, 500))
            ]);
          }
        });
      } catch {
        // ignore font wait error
      }

      await page.emulateMediaType('print');
      const pdfBuffer = await page.pdf({
        format: "A4",
        landscape: orientation === "landscape",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: "4mm",
          right: "4mm",
          bottom: "4mm",
          left: "4mm",
        },
        timeout: 20000
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="report.pdf"');
      res.status(200).send(Buffer.from(pdfBuffer));
      
    } catch (error: any) {
      console.error("Error creating PDF:", error);
      res.status(500).send("Internal Server Error: " + error.message);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.error("Failed to close page:", e);
        }
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    // Pre-warm headless browser in background so the first PDF export is instant
    getBrowser().catch(err => console.warn("Pre-warm browser warning:", err?.message || err));
  });
}

startServer();
