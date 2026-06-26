const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data", "sample-leaderboard.json");
const CONFIG_FILE = path.join(__dirname, "config.local.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(body);
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, data, MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  });
}

function parseDuration(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parts = String(value).trim().split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(value) || 0;
}

function cleanNumber(value) {
  return Number(String(value || "0").replace(/,/g, "").trim()) || 0;
}

function normalizeAgent(row, index) {
  const sales = cleanNumber(row.sales || row.Sales || row.closes || 0);
  const nonPauseSeconds = parseDuration(
    row.nonPauseSeconds || row.nonpauseSeconds ||
    row.nonPauseTime || row.nonpauseTime ||
    row["Nonpause Time"]
  );
  const hours = nonPauseSeconds / 3600;
  const salesPerWorkingHour = cleanNumber(
    row.salesPerWorkingHour ||
    row["Sales per Working Hour"] ||
    (hours ? sales / hours : 0)
  );

  return {
    rank: index + 1,
    name: row.name || row.agent || row["Agent Name"] || "Agent " + (index + 1),
    team: row.team || row.campaign || row["Agent ID"] || "Main floor",
    sales,
    salesPerWorkingHour,
    nonPauseSeconds
  };
}

function stripHtml(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseVicidialTextReport(text) {
  const plain = stripHtml(text);
  const lines = plain.split(/\r?\n/);
  const headerLine = lines.find(
    (line) => line.includes("Agent Name") && line.includes("Sales per Working Hour")
  );

  if (!headerLine) {
    if (/Login incorrect|BAD|Unauthorized|401/i.test(plain)) {
      throw new Error("VICIdial needs a valid login before this report can be read.");
    }
    throw new Error("Could not find the VICIdial table headers in the report.");
  }

  const headers = headerLine.split("|").map((item) => item.trim()).filter(Boolean);
  const headerIndex = lines.indexOf(headerLine);
  const agents = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.includes("|")) continue;
    if (/TOTALS\s*:/i.test(line)) break;
    if (/^-+$/.test(line.replace(/[+|]/g, "").trim())) continue;

    const cells = line.split("|").map((item) => item.trim());
    if (cells.length < headers.length) continue;

    const values = cells[0] === "" ? cells.slice(1) : cells;
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    if (row["Agent Name"] && row["Agent Name"] !== "Agent Name") {
      agents.push(normalizeAgent(row, agents.length));
    }
  }

  if (!agents.length) {
    throw new Error("The VICIdial report loaded, but no agent rows were found.");
  }

  return agents;
}

function parseLeaderboardJson(body) {
  const parsed = JSON.parse(body);
  const rows = Array.isArray(parsed) ? parsed : parsed.agents || parsed.leaderboard || [];
  return rows.map(normalizeAgent);
}

function parseLeaderboard(body, contentType = "") {
  const trimmed = String(body).trim();
  if (contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseLeaderboardJson(trimmed);
  }
  return parseVicidialTextReport(trimmed);
}

function readSampleLeaderboard() {
  return parseLeaderboardJson(fs.readFileSync(DATA_FILE, "utf8"));
}

/**
 * Replace date-stamped query params in the VICIdial URL with today's date.
 * This keeps the URL in config.local.json working day after day without edits.
 */
function patchUrlDates(rawUrl) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const todayEncoded = encodeURIComponent(today);

  return rawUrl
    // Replace query_date date portion (YYYY-MM-DD before the +HH:MM:SS)
    .replace(/query_date=\d{4}-\d{2}-\d{2}/g, `query_date=${todayEncoded}`)
    .replace(/query_date_D=\d{4}-\d{2}-\d{2}/g, `query_date_D=${todayEncoded}`)
    // Replace end_date date portion
    .replace(/end_date=\d{4}-\d{2}-\d{2}/g, `end_date=${todayEncoded}`)
    .replace(/end_date_D=\d{4}-\d{2}-\d{2}/g, `end_date_D=${todayEncoded}`);
}

async function fetchRemoteLeaderboard() {
  const config = readConfig();
  let reportUrl = process.env.VICIDIAL_REPORT_URL || config.reportUrl;
  if (!reportUrl) return null;

  // Always use today's date — no manual URL edits needed each day
  reportUrl = patchUrlDates(reportUrl);

  const headers = {};
  if (process.env.VICIDIAL_BASIC_AUTH) {
    headers.Authorization = "Basic " + Buffer.from(process.env.VICIDIAL_BASIC_AUTH).toString("base64");
  }
  if (process.env.VICIDIAL_COOKIE) {
    headers.Cookie = process.env.VICIDIAL_COOKIE;
  }

  const response = await fetch(reportUrl, { headers });
  const body = await response.text();

  if (!response.ok) {
    if (/Login incorrect|BAD/i.test(body)) {
      throw new Error("VICIdial rejected the login. Add the right login method, then refresh again.");
    }
    throw new Error("VICIdial report returned " + response.status);
  }

  return parseLeaderboard(body, response.headers.get("content-type") || "");
}

async function handleLeaderboard(res) {
  try {
    const remote = await fetchRemoteLeaderboard();
    const agents = (remote || readSampleLeaderboard())
      .sort((a, b) => b.salesPerWorkingHour - a.salesPerWorkingHour || b.sales - a.sales)
      .map((agent, index) => ({ ...agent, rank: index + 1 }));

    send(
      res,
      200,
      JSON.stringify({ source: remote ? "vicidial" : "sample", refreshedAt: new Date().toISOString(), agents }),
      "application/json; charset=utf-8"
    );
  } catch (error) {
  send(
    res,
    500,
    JSON.stringify({
      error: "Could not refresh the leaderboard.",
      detail: error.message
    }),
    "application/json; charset=utf-8"
  );
}
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);
  if (url.pathname === "/api/leaderboard") {
    handleLeaderboard(res);
    return;
  }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log("Leaderboard running at http://localhost:" + PORT);
});
