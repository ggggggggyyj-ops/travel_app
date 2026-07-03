const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const TABLES = [
  "comment_likes",
  "comment_replies",
  "travel_comments",
  "city_attraction_override",
  "city_attractions",
  "cities"
];

const IMPORT_ORDER = [
  "cities",
  "city_attractions",
  "city_attraction_override",
  "travel_comments",
  "comment_replies",
  "comment_likes"
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`Skip missing file: ${filePath}`);
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  if (!raw.trim()) return [];

  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;

  if (typeof value === "object") {
    if (value instanceof Date) return value;
    return JSON.stringify(value);
  }

  return value;
}

async function getColumns(conn, tableName) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
  return rows.map((row) => row.Field);
}

async function truncateTables(conn) {
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");

  for (const tableName of TABLES) {
    try {
      await conn.query(`TRUNCATE TABLE \`${tableName}\``);
      console.log(`Truncated ${tableName}`);
    } catch (err) {
      console.log(`Skip truncate ${tableName}: ${err.message}`);
    }
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function importTable(conn, tableName) {
  const filePath = path.join(__dirname, "..", "data_export", `${tableName}.json`);
  const rows = readJson(filePath);

  if (!rows.length) {
    console.log(`No data for ${tableName}`);
    return;
  }

  const columns = await getColumns(conn, tableName);
  let imported = 0;

  for (const row of rows) {
    const usableColumns = columns.filter((col) =>
      Object.prototype.hasOwnProperty.call(row, col)
    );

    if (!usableColumns.length) continue;

    const placeholders = usableColumns.map(() => "?").join(", ");
    const columnSql = usableColumns.map((col) => `\`${col}\``).join(", ");
    const values = usableColumns.map((col) => normalizeValue(row[col]));

    const sql = `INSERT INTO \`${tableName}\` (${columnSql}) VALUES (${placeholders})`;
    await conn.execute(sql, values);
    imported++;
  }

  console.log(`Imported ${tableName}: ${imported} rows`);
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQLHOST,
    port: Number(process.env.MYSQLPORT || 3306),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    charset: "utf8mb4"
  });

  console.log("Connected to Railway MySQL");

  await truncateTables(conn);

  for (const tableName of IMPORT_ORDER) {
    await importTable(conn, tableName);
  }

  await conn.end();
  console.log("Import finished.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});