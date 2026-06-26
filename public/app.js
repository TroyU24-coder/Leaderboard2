const rowsEl = document.querySelector("#leaderboardRows");
const refreshButton = document.querySelector("#refreshButton");
const sourceBadge = document.querySelector("#sourceBadge");
const errorMessage = document.querySelector("#errorMessage");
const topAgent = document.querySelector("#topAgent");
const totalSales = document.querySelector("#totalSales");
const bestSalesHour = document.querySelector("#bestSalesHour");
const lastRefresh = document.querySelector("#lastRefresh");

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#039;");
}
function formatDuration(seconds) {
  const total = Number(seconds || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}
function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
function renderRows(agents) {
  rowsEl.innerHTML = agents.map((agent) =>
    '<article class="agent-row">' +
      '<span><span class="rank">' + agent.rank + '</span></span>' +
      '<span class="agent"><strong>' + escapeHtml(agent.name) + '</strong><span>' + escapeHtml(agent.team) + '</span></span>' +
      '<span class="metric sales">' + agent.sales.toLocaleString() + '</span>' +
      '<span class="metric sales-hour">' + agent.salesPerWorkingHour.toFixed(2) + '</span>' +
      '<span class="metric">' + formatDuration(agent.nonPauseSeconds) + '</span>' +
    '</article>'
  ).join("");
}
function renderSummary(payload) {
  const agents = payload.agents;
  topAgent.textContent = agents[0]?.name || "-";
  totalSales.textContent = agents.reduce((sum, agent) => sum + agent.sales, 0).toLocaleString();
  bestSalesHour.textContent = agents[0] ? agents[0].salesPerWorkingHour.toFixed(2) : "-";
  lastRefresh.textContent = formatTime(payload.refreshedAt);
  sourceBadge.textContent = payload.source === "vicidial" ? "VICIdial connected" : "Sample data";
}
async function refreshLeaderboard() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing";
  errorMessage.textContent = "";
  try {
    const response = await fetch("/api/leaderboard?ts=" + Date.now());
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "Refresh failed");
    renderRows(payload.agents);
    renderSummary(payload);
  } catch (error) {
    errorMessage.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh";
  }
}
refreshButton.addEventListener("click", refreshLeaderboard);
refreshLeaderboard();
setInterval(refreshLeaderboard, 60000);
