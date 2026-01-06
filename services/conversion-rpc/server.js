const express = require("express");
const cors = require("cors");
const path = require("path");

// Polyfills for convert.js (XML in Node)
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;

// If your convert.js expects Papa global for CSV:
global.Papa = require("papaparse");

// If your convert.js dynamically loads js-yaml in browser,
// in Node it's ok to have it available:
global.jsyaml = require("js-yaml");

// Import the same converter you use in the browser:
const DataTransformer = require(path.join(
  __dirname,
  "../../public/convert.js"
));

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

/**
 * Minimal JSON-RPC 2.0 endpoint
 * POST /rpc
 * Body: { "jsonrpc":"2.0", "id":1, "method":"convert", "params":{...} }
 */
app.post("/rpc", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};

  const reply = (result) => res.json({ jsonrpc: "2.0", id, result });
  const error = (code, message, data) =>
    res.status(200).json({
      jsonrpc: "2.0",
      id,
      error: { code, message, data },
    });

  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return error(-32600, "Invalid Request");
  }

  try {
    if (method === "health") {
      return reply({ ok: true, service: "conversion-rpc" });
    }

    if (method === "convert") {
      let inputString = params?.inputString ?? "";
      let settingsString = params?.settingsString ?? "";

      // Normalize Windows newlines + strip BOM (common copy/paste issue)
      inputString = String(inputString).replace(/^\uFEFF/, "");
      settingsString = String(settingsString)
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n");

      console.log(
        "FIRST CHAR CODE:",
        inputString ? inputString.charCodeAt(0) : null
      );
      console.log("FIRST 30 CHARS:", JSON.stringify(inputString.slice(0, 30)));
      console.log("SETTINGS RECEIVED:", JSON.stringify(settingsString));

      // In this project convert() returns { result, meta }.
      // We must return only the string result.
      const converted = await DataTransformer.convert(
        inputString,
        settingsString
      );

      const outputText =
        typeof converted === "string" ? converted : converted?.result ?? "";

      return reply({ output: outputText });
    }

    return error(-32601, "Method not found", { method });
  } catch (e) {
    return error(-32000, "Server error", { message: e?.message || String(e) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`conversion-rpc listening on http://localhost:${PORT}/rpc`);
});
