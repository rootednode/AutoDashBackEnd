import fs from "fs";

const PAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function attribute(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? match[1].trim() : "";
}

export function discoverDashboardPages(htmlFile) {
  try {
    const html = fs.readFileSync(htmlFile, "utf8");
    const pages = [];
    const seen = new Set();
    const tags = html.match(/<[^>]+\bdata-dashboard-page=["'][^"']+["'][^>]*>/gi) || [];

    for (const tag of tags) {
      const id = attribute(tag, "data-dashboard-page");
      if (!PAGE_ID.test(id) || seen.has(id)) continue;
      seen.add(id);
      pages.push({
        id,
        label: attribute(tag, "data-dashboard-label") ||
          id.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        icon: attribute(tag, "data-dashboard-icon") || "layout-dashboard"
      });
    }

    return pages;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[CONTROLLER] Unable to discover dashboard pages:", error.message);
    }
    return [];
  }
}
