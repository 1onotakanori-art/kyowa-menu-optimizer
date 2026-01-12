# Kyowa Menu Scrape - AI Coding Instructions

## Project Overview
This is a **Playwright-based web scraper + Express API** that automatically fetches cafeteria menus from Kyowa's menu system (`https://kyowa2407225.uguide.info`). The scraper transforms dynamic menu pages into structured JSON data and serves it via REST API.

## Architecture

### Core Components
- **`src/scraper/fetchMenus.js`**: Main scraping logic using Playwright. Handles browser automation, UI interaction, and data extraction
- **`src/utils/date.js`**: Date utility functions for weekday detection, date label formatting ("1/12(月)"), and parsing
- **`src/index.js`**: Express server exposing REST API endpoint at `GET /menus`
- **`scrape.js`**: Standalone standalone scraper script (development/testing)

### Data Flow
1. Client calls `GET /menus?date=YYYY-MM-DD` (optional; defaults to nearest weekday)
2. Date utilities convert input to UI-friendly format ("1/12(月)")
3. `fetchMenus()` launches headless browser, navigates site, performs UI interactions
4. Extracts menu data (name + nutrition fields) from DOM
5. Returns JSON: `{dateLabel, count, menus: [{name, nutrition: {...}}]}`

## Key Patterns & Conventions

### Playwright Page Automation
- All interactions wrapped in `try/finally` to ensure browser cleanup (`browser.close()`)
- Always use `waitForSelector()` + timeouts (5000ms default) before DOM operations
- UI waits: `waitForTimeout(800)` for tab/date changes, `waitForTimeout(300)` for element stability
- Click targets may be off-screen; use `scrollLeft` in `page.evaluate()` before clicking
- Detail panels toggled with `click({ force: true })` to interact with covered elements

### Date Handling
- **Weekday check**: Exclude Sunday (0) and Saturday (6)
- **Date labels**: "1/12(月)" format—always includes day-of-week kanji
- **API input**: "YYYY-MM-DD" format; parsed by `parseDate()` to JS Date
- **Default behavior**: If no date specified, use `getNearestWeekday()` to find next business day

### Error Resilience
- Individual menu extraction failures are logged but don't halt scraping (continue to next menu)
- Provide detailed error messages (e.g., "日付「1/12(月)」が見つかりません。利用可能な日付: 1/11(日), 1/12(月)...")
- Always close browser in `finally` block; don't leave zombie processes

### DOM Selectors (Site-Specific)
- Tab navigation: `#menu-target .tab-button` (text-matched within `page.evaluate()`)
- Date buttons: `.weeks-day-btn button.after-btn` (text-matched, scrollable)
- Menu expansion: `.menu-next-btn:not([disabled])` (repeats until no more buttons)
- Menu items: `.menu-content` (looped with `locator().nth(i)`)
- Nutrition data: `.menu-detail-cell` pairs (key at index `2i`, value at `2i+1`)

## Developer Workflows

### Running the Scraper
- **Standalone**: `node scrape.js` (headless: false, logs to menu_YYYY-MM-DD.csv)
- **API server**: `node src/index.js` (starts on port 3000 or `$PORT`)
- **API endpoints**:
  - `GET /menus` → scrapes nearest weekday
  - `GET /menus?date=2025-01-12` → scrapes specific date
  - `GET /health` → `{status: 'ok'}`

### Dependencies
- `playwright ^1.57.0`: Browser automation (Chromium only)
- `express`: Web framework (implicitly for API)

## Integration Points
- Tightly coupled to Kyowa site's DOM structure (selectors in `fetchMenus.js`)
- Site changes (new classes, layout shifts) require scraper updates
- If site blocking occurs, may need `{ headless: false }` or user agent headers

## Important Notes for AI Agents
- Always handle the "日付が見つかりません" case—site may not have menus for all dates
- Nutrition values are parsed as floats if possible; non-numeric values stored as strings
- Browser memory: Each `fetchMenus()` call creates a new browser instance; reuse via module export is preferred
- Timeouts tuned for typical network conditions; may need adjustment for slow/flaky connections
