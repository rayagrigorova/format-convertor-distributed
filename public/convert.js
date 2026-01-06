/**
 * convert.js – Core format transformation engine
 *
 * This file contains logic for converting data between various formats:
 * JSON, YAML, XML, CSV, and Emmet.
 *
 * It is designed to be logic-only (no UI or DOM manipulation), and exposes
 * everything via the global 'DataTransformer' singleton.
 *
 * The main public method is:
 *    DataTransformer.convert(inputString, settingsString)
 *
 * Supported conversion settings (in INI-style format):
 *   inputformat     = json | yaml | xml | csv | emmet | auto (auto-detect)
 *   outputformat    = json | yaml | xml | csv | emmet
 *   align           = true | false      -> pretty-print output
 *   case            = upper | camel | snake | none -> renames object keys
 *   replace.tag.X   = Y -> replaces key/tag name X with Y
 *   replace.val.X   = Y -> replaces value X with Y
 *   savetohistory   = true | false -> optional external usage
 *
 * Internally:
 * - JSON to Emmet and Emmet to JSON handled with custom parser/
 * - YAML, XML, CSV rely on lightweight or inline implementations
 */

(function (global) {
  "use strict";

  // Basic utilities: type checks, string case conversion, array repetition
  const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
  const repeat = (str, n) => Array.from({ length: n }, () => str);

  // Case helpers
  const toCamel = (s) => s.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
  const toSnake = (s) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
  const toUpper = (s) => s.toUpperCase();
  const CASE_FNS = {
    camel: toCamel,
    snake: toSnake,
    upper: toUpper,
    none: (s) => s,
  };

  /* ──────────────────────  SETTINGS PARSER  ───────────────────────── */
  // Parses user settings from a string and validates them.
  // Supports input/output formats, formatting, key casing, and tag/value replacements.
  function parseSettings(raw) {
    const out = {
      inputformat: "auto",
      outputformat: "json",
      savetohistory: false,
      align: true,
      case: "none",
      replace: { tag: {}, val: {} },
    };

    const VALID_INPUTS = ["json", "yaml", "xml", "csv", "emmet", "auto"];
    const VALID_OUTPUTS = ["json", "yaml", "xml", "csv", "emmet"];
    const VALID_BOOL = ["true", "false", "1", "0", "yes", "no"];
    const VALID_CASE = ["upper", "camel", "snake", "none"];

    if (!raw) return out;

    raw.split(/\r?\n/).forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const [k, ...rest] = trimmed.split("=");
      const v = rest.join("=").trim();
      if (!k || v === undefined) return;

      const key = k.startsWith("replace.") ? k : k.toLowerCase();

      // Parse known keys or capture replace.tag.X / replace.val.X patterns
      switch (key) {
        case "inputformat":
          if (!VALID_INPUTS.includes(v.toLowerCase())) {
            throw Error(`Невалидна настройка: inputformat=${v}`);
          }
          out.inputformat = v.toLowerCase();
          break;
        case "outputformat":
          if (!VALID_OUTPUTS.includes(v.toLowerCase())) {
            throw Error(`Невалидна настройка: outputformat=${v}`);
          }
          out.outputformat = v.toLowerCase();
          break;
        case "savetohistory":
        case "align":
          if (!VALID_BOOL.includes(v.toLowerCase())) {
            throw Error(`Невалидна настройка: ${key}=${v}`);
          }
          out[key] = /^(true|1|yes)$/i.test(v);
          break;
        case "case":
          if (!VALID_CASE.includes(v.toLowerCase())) {
            throw Error(`Невалидна настройка: case=${v}`);
          }
          out.case = v.toLowerCase();
          break;
        default: {
          const m = key.match(/^replace\.(tag|val)\.(.+)$/);
          if (m) {
            const [, type, find] = m;
            out.replace[type][find] = v;
          } else {
            throw Error(`Непозната настройка: ${key}`);
          }
        }
      }
    });

    return out;
  }

  /* ───────────────────────  FORMAT DETECTION  ─────────────────────── */
  // Detects format type (json/yaml/xml/csv) from string heuristics
  function detectFormat(str) {
    const trimmed = str.trim();
    if (!trimmed) return "unknown";
    try {
      JSON.parse(trimmed);
      return "json";
    } catch (_) {}
    if (/^---/.test(trimmed) || /:\s*[^:]+/m.test(trimmed)) return "yaml";
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) return "xml";
    if (trimmed.includes(",")) return "csv";
    return "unknown";
  }

  /* ───────────────────────────── EMMET SECTION ───────────────────────────── */
  // Converts between JSON and Emmet format
  // Includes both generation (jsonToEmmet) and parsing (emmetToJSON)
  function jsonToEmmet(json) {
    function walk(node) {
      if (isObject(node)) {
        // Process each key-value pair in the object
        return Object.entries(node)
          .map(([k, v]) => {
            // Handle arrays
            if (Array.isArray(v)) {
              if (v.length === 0) return k; // Empty array: output just the tag name, li -> []

              const parts = v.map((el) => {
                // Array of primitive values -> li{foo}
                if (!isObject(el) && !Array.isArray(el)) return `${k}{${el}}`;

                // Empty object -> plain tag with no children
                if (isObject(el) && Object.keys(el).length === 0) return k;

                // Nested structure -> recurse and format as li>...
                const inner = walk(el);
                const grouped = inner.includes("+") ? `(${inner})` : inner;
                return `${k}>${grouped}`;
              });

              // Combine parts with "+" (e.g. li{a}+li{b}+li{c}
              return parts.join("+");
            }

            // Nested object
            if (isObject(v)) {
              const nested = walk(v);
              const needsGroup = nested.includes("+");
              return `${k}>${needsGroup ? `(${nested})` : nested}`;
            }

            // Primitive leaf value
            return typeof v === "number" ? `${k}{${v}}` : `${k}{${String(v)}}`;
          })
          .join("+"); // Combine sibling elements
      }

      // Root-level array (uncommon but supported)
      if (Array.isArray(node)) {
        return node.map(walk).join("+");
      }

      // Single primitive value
      return `{${String(node)}}`;
    }

    return walk(json);
  }

  function mergeJSON(a, b) {
    const res = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (k in res) {
        // merge same-key siblings into array
        const prev = res[k];
        res[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
      } else {
        res[k] = v;
      }
    }
    return res;
  }

  /**
   * Converts a simplified Emmet-style string into a JavaScript object (JSON).
   *
   * This parser supports a minimal Emmet-like grammar that matches the output of jsonToEmmet().
   *
   * Supported syntax:
   *   - Tag names:       div, ul, li
   *   - Nesting:         ul > li
   *   - Siblings:        li + li
   *   - Text content:    li{Item}
   *   - Repetition:      li*3
   *   - Grouping:        div>(h1+span)
   *
   * Example:
   *   emmetToJSON('ul>li*2') -> { ul: { li: [{}, {}] } }
   */
  function emmetToJSON(str) {
    let i = 0; // Current position in the input string

    // Returns the current character without consuming it
    function peek() {
      return str[i];
    }

    // Returns the current character and moves to the next
    function next() {
      return str[i++];
    }

    // Consumes specific characters or throws an error if not matched
    function eat(chars) {
      if (str.substr(i, chars.length) === chars) i += chars.length;
      else throw Error("Unexpected token");
    }

    // Checks if a character is valid for identifiers (letters, digits, dash, underscore)
    function isIdentChar(c) {
      return /[A-Za-z0-9_-]/.test(c);
    }

    // Parses a tag name like 'div' or 'item'
    function parseIdent() {
      let out = "";
      while (isIdentChar(peek())) out += next();
      if (!out) throw Error("Expected identifier");
      return out;
    }

    // Parses a numeric value (used for repetition: *3)
    function parseNumber() {
      let out = "";
      while (/[0-9]/.test(peek())) out += next();
      return Number(out);
    }

    // Parses a text block inside { and }
    function parseText() {
      let out = "";
      while (peek() && peek() !== "}") out += next();
      eat("}");
      return out;
    }

    // Parses a single Emmet term (for example: li, li{hello}, li*3, ul>li, (div+span))
    function parseTerm() {
      // Grouped expression inside parentheses
      if (peek() === "(") {
        next(); // consume '('
        const group = parseNode();
        if (peek() !== ")") throw Error("Expected ')'");
        next(); // consume ')'
        return { __group: group };
      }

      const name = parseIdent();

      let value = {};
      let count = 1;

      // Check for repetition
      if (peek() === "*") {
        next();
        count = parseNumber();
      }

      // Check for leaf content
      if (peek() === "{") {
        next();
        const text = parseText();
        value = text;
      }

      // Check for child
      if (peek() === ">") {
        next();
        let child = parseTerm();
        if (child && child.__group) child = child.__group;
        value = child;
      }

      // Return object or repeated array
      if (count > 1) {
        return { name, value: repeat(value, count) };
      } else {
        return { name, value };
      }
    }

    // Converts a parsed term into a structured JSON object
    function buildObj(term) {
      const coerce = (v) => {
        const n = Number(v);
        return String(n) === v ? n : v;
      };

      function flatten(node) {
        if (
          isObject(node) &&
          "name" in node &&
          "value" in node &&
          typeof node.name === "string"
        ) {
          return { [node.name]: flatten(node.value) };
        }
        if (Array.isArray(node)) {
          return node.map(flatten);
        }
        return node;
      }

      const obj = {};

      if (Array.isArray(term.value)) {
        obj[term.name] = term.value.map((v) =>
          typeof v === "string" || typeof v === "number"
            ? coerce(v)
            : flatten(v)
        );
        return obj;
      }

      if (term.value !== "" && term.value !== null) {
        if (typeof term.value === "string") {
          obj[term.name] = coerce(term.value);
        } else {
          obj[term.name] = flatten(term.value);
        }
      } else {
        obj[term.name] = {};
      }

      return obj;
    }

    /**
     * Parses a sequence of terms joined by '>' (child) or '+' (sibling)
     * Builds the object structure recursively
     */
    function parseChain() {
      const firstTerm = parseTerm();
      const tree = firstTerm.__group ? firstTerm.__group : buildObj(firstTerm);

      // Returns the deepest object to attach new children or siblings
      const getParentPtr = () => {
        let obj = tree;
        // walk to deepest object whose only key is an object
        while (isObject(obj) && Object.keys(obj).length === 1) {
          const k = Object.keys(obj)[0];
          if (isObject(obj[k])) obj = obj[k];
          else break;
        }
        return obj;
      };

      while (true) {
        if (peek() === ">") {
          // Child
          next(); // Consume '>'
          const child = parseTerm();
          const childOb = child.__group ? child.__group : buildObj(child);

          const parentPtr = getParentPtr();
          const parentKey = Object.keys(parentPtr)[0];

          // Handle special flattening for nested name/value objects
          if (
            isObject(childOb) &&
            Object.keys(childOb).length === 1 &&
            isObject(Object.values(childOb)[0]) &&
            "name" in Object.values(childOb)[0] &&
            "value" in Object.values(childOb)[0]
          ) {
            // Flatten nested { name, value } under parent
            const inner = Object.values(childOb)[0];
            parentPtr[parentKey][inner.name] = inner.value;
          } else {
            const [childKey, childVal] = Object.entries(childOb)[0];
            parentPtr[parentKey][childKey] = childVal;
          }

          // Preallocate for the next nested level if needed
          if (peek() === ">") {
            const childKey = Object.keys(childOb)[0];
            parentPtr[childKey] =
              parentPtr[childKey] || childOb[childKey] || {};
          }
        } else if (peek() === "+") {
          next();
          const sibling = parseTerm();
          const siblingOb = sibling.__group
            ? sibling.__group
            : buildObj(sibling);

          const parentPtr = getParentPtr();
          for (const [k, v] of Object.entries(siblingOb)) {
            if (k in parentPtr) {
              const prev = parentPtr[k];
              parentPtr[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
            } else {
              parentPtr[k] = v;
            }
          }
        } else {
          break;
        }
      }

      return tree;
    }

    // Top-level parser that merges sibling chains at the root level
    function parseNode() {
      let chain = parseChain();
      while (peek() === "+") {
        next();
        const rhs = parseChain();
        chain = mergeJSON(chain, rhs);
      }
      return chain;
    }

    const tree = parseNode();

    // Ensure the entire string was parsed
    if (i !== str.length) {
      const trailing = str.slice(i);
      throw new Error(`Unexpected trailing input: '${trailing}'`);
    }

    return tree;
  }

  /* ────────────────────  YAML / XML / CSV helpers  ─────────────────── */

  /**
   * Dynamically loads a script from a CDN and resolves once a specific global symbol is available.
   *
   * This is used to defer loading of large libraries (like js-yaml) until they're actually needed.
   *
   * Arguments:
   *   url        -> the full URL to the script (e.g. CDN)
   *   globalSym  -> the name of the global variable to wait for (e.g. 'jsyaml')
   *
   * Returns:
   *   A Promise that resolves to the global symbol (e.g. window[globalSym])
   *   or rejects if the script fails to load.
   */

  function lazyLoad(url, globalSym) {
    return new Promise((resolve, reject) => {
      // If the global symbol is already available, resolve immediately
      if (global[globalSym]) return resolve(global[globalSym]);

      // Create a <script> tag to load the external script
      const s = document.createElement("script");
      s.src = url;

      // Resolve the promise once the script is loaded and symbol is defined
      s.onload = () => resolve(global[globalSym]);

      // Reject the promise if the script fails to load
      s.onerror = reject;

      // Append the <script> to the document head to start loading
      document.head.appendChild(s);
    });
  }

  /* ───────────────────────────── YAML SECTION ───────────────────────────── */
  /**
   * Converts a JavaScript object to a YAML string.
   * Uses the js-yaml library loaded from CDN only when needed.
   */
  async function jsonToYAML(obj, align) {
    // Dynamically load the js-yaml library if not already loaded
    const jsYaml = await lazyLoad(
      "https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js",
      "jsyaml"
    );

    // Dump the object into YAML format with readable formatting
    return jsYaml.dump(obj, {
      indent: 2, // 2-space indentation
      flowLevel: -1, // force block style for all collections
      sortKeys: false, // do not reorder keys
      lineWidth: 160, // long line wrapping threshold
    });
  }
  /**
   * Converts a YAML string to a JavaScript object.
   * Uses the js-yaml library loaded lazily via CDN.
   */
  async function yamlToJSON(text) {
    const jsYaml = await lazyLoad(
      "https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js",
      "jsyaml"
    );
    // Parse YAML into a JS object
    return jsYaml.load(text);
  }

  /* ───────────────────────────── XML SECTION ───────────────────────────── */

  /**
   * Recursively builds a formatted XML string from a JS object.
   * Handles objects, arrays, and primitive values.
   */
  function buildXML(node, tagName = "root", indent = "") {
    const pad = "  "; // indentation padding (2 spaces)

    // Handle primitive values or null
    if (typeof node !== "object" || node === null) {
      return `${indent}<${tagName}>${String(node)}</${tagName}>\n`;
    }

    // Handle arrays by repeating the same tag for each item
    if (Array.isArray(node)) {
      return node
        .map((n) => buildXML(n, tagName, indent)) // repeat same tag
        .join("");
    }

    // Handle nested objects by recursively generating inner XML
    const inner = Object.entries(node)
      .map(([k, v]) => buildXML(v, k, indent + pad))
      .join("");
    return `${indent}<${tagName}>\n${inner}${indent}</${tagName}>\n`;
  }

  /**
   * Converts a JS object to an XML string.
   * Root tag is always <root>; arrays use <record> as default tag.
   */
  function jsonToXML(obj) {
    if (Array.isArray(obj)) {
      const children = obj
        .map((item) => buildXML(item, "record", "  "))
        .join("");
      return `<root>\n${children}</root>`;
    }
    return buildXML(obj, "root").trim();
  }

  /**
   * Recursively parses a DOM XML node into a JS object.
   * Handles element nodes and text nodes. Repeated tags become arrays.
   */
  function xmlNodeToJSON(node) {
    // Text node: try to convert to number, otherwise return trimmed text
    if (node.nodeType === 3) {
      const raw = node.nodeValue.trim();
      const n = Number(raw);
      return String(n) === raw ? n : raw;
    }

    const obj = {};
    node.childNodes.forEach((child) => {
      const val = xmlNodeToJSON(child);
      if (val === "") return; // ignore empty text nodes
      const tag = child.nodeName;

      // If the tag already exists, convert to array or append
      if (obj[tag]) {
        // make it an array if repeated
        obj[tag] = Array.isArray(obj[tag])
          ? [...obj[tag], val]
          : [obj[tag], val];
      } else {
        obj[tag] = val;
      }
    });
    return obj;
  }

  /**
   * Converts an XML string into a JS object.
   * Parses using DOMParser and unwraps nested objects.
   */
  function xmlToJSON(xmlStr) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "application/xml");
    const root = doc.documentElement;

    // Recursively removes wrapper objects like { '#text': ... }
    function unwrap(node) {
      if (Array.isArray(node)) return node.map(unwrap);

      if (typeof node === "object" && node !== null) {
        const keys = Object.keys(node);
        if (keys.length === 1 && keys[0] === "#text") return node["#text"];
        return Object.fromEntries(keys.map((k) => [k, unwrap(node[k])]));
      }

      return node;
    }

    return { [root.nodeName]: unwrap(xmlNodeToJSON(root)) };
  }

  /* ───────────────────────────── CSV SECTION ───────────────────────────── */

  /**
   * Flattens a nested JavaScript object into a flat one.
   * Used to prepare JSON data for CSV export (which does not support nesting).
   *
   * Example:
   * { user: { name: "Alice" } }  ->  { "user.name": "Alice" }
   */
  function flattenObject(obj, prefix = "") {
    return Object.entries(obj).reduce((acc, [key, val]) => {
      const newKey = prefix ? `${prefix}.${key}` : key;

      // Recursively flatten nested objects (excluding arrays)
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        Object.assign(acc, flattenObject(val, newKey));
      } else {
        acc[newKey] = val;
      }
      return acc;
    }, {});
  }

  /**
   * Rebuilds a nested JavaScript object from a flat one.
   * Used to reconstruct structure after importing CSV data.
   *
   * Example:
   * { "user.name": "Alice" }  ->  { user: { name: "Alice" } }
   */
  function unflattenObject(flat) {
    const out = {};
    for (const [key, val] of Object.entries(flat)) {
      const parts = key.split(".");
      let ptr = out;
      parts.forEach((part, idx) => {
        if (idx === parts.length - 1) {
          // Last key part: assign value, try to coerce number if appropriate
          const num = Number(val);
          ptr[part] = !Number.isNaN(num) && val.trim() !== "" ? num : val;
        } else {
          ptr[part] = ptr[part] || {};
          ptr = ptr[part];
        }
      });
    }
    return out;
  }

  /**
   * Converts JSON data to CSV format.
   * - Flattens each object
   * - Builds a dynamic header row
   * - Escapes values with quotes if needed
   */
  function jsonToCSV(data) {
    const arr = Array.isArray(data) ? data : [data];

    // Flatten all objects for CSV row compatibility
    const flat = arr.map(flattenObject);

    // Get all unique keys (columns) across all objects
    const cols = Array.from(new Set(flat.flatMap((obj) => Object.keys(obj))));

    // Build CSV header row
    const header = cols.join(",");

    // Build each CSV data row
    const rows = flat.map((row) =>
      cols
        .map((c) => {
          const cell = row[c] ?? "";
          // Quote cells with commas or double quotes
          return /[,"]/g.test(cell)
            ? `"${String(cell).replace(/"/g, '""')}"`
            : cell;
        })
        .join(",")
    );
    return header + "\n" + rows.join("\n");
  }

  /**
   * Parses a CSV string and converts it to a JSON object or array.
   * - Assumes the first line contains headers.
   * - Uses unflattening to restore original nested structure.
   */
  function csvToJSON(text) {
    const [headerLine, ...lines] = text.trim().split(/\r?\n/);
    if (!headerLine) return [];

    const cols = headerLine.split(",");
    const rows = lines.map((line) => line.split(","));

    // Build array of objects using headers as keys
    const objects = rows.map((cells) => {
      const flat = Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
      return unflattenObject(flat);
    });

    // If only one object, return the object instead of array
    return objects.length === 1 ? objects[0] : objects;
  }

  /**
   * Recursively transforms all keys in a JSON object using a provided function.
   * Used for key case transformation (e.g. camelCase -> snake_case).
   */
  function transformKeys(obj, fn) {
    if (Array.isArray(obj)) return obj.map((v) => transformKeys(v, fn));
    if (!isObject(obj)) return obj;
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [fn(k), transformKeys(v, fn)])
    );
  }

  /**
   * Recursively applies tag name and value replacements to a JSON object.
   * Tag names are replaced based on 'opts.replace.tag'.
   * Leaf values are replaced based on 'opts.replace.val'.
   * */
  function applyReplacements(obj, opts) {
    function walk(node) {
      if (Array.isArray(node)) return node.map(walk);
      if (isObject(node)) {
        return Object.fromEntries(
          Object.entries(node).map(([k, v]) => {
            const nk = opts.replace.tag[k] || k;
            return [nk, walk(v)];
          })
        );
      }

      // Replace primitive value if match exists
      return Object.prototype.hasOwnProperty.call(
        opts.replace.val,
        String(node)
      )
        ? opts.replace.val[String(node)]
        : node;
    }
    return walk(obj);
  }

  /* ───────────────────────────  MAIN API  ─────────────────────────── */

  /**
   * Main conversion pipeline between supported data formats.
   * 1. Parses input from its format to JS object.
   * 2. Applies key case transformation and replacements if enabled.
   * 3. Converts data to the desired output format.
   */
  async function convert(inputStr, settingsStr = "") {
    const opts = parseSettings(settingsStr);

    //  Detect input and output format
    let inFmt =
      opts.inputformat === "auto" ? detectFormat(inputStr) : opts.inputformat;
    let outFmt = opts.outputformat;

    if (inFmt === "unknown")
      throw Error(
        "Не може да се определи входният формат и не е зададен ръчно."
      );

    // Check if any transformation is needed (case or replacements)
    const needsChanges =
      opts.case !== "none" ||
      Object.keys(opts.replace.tag).length > 0 ||
      Object.keys(opts.replace.val).length > 0;

    // If input == output and no changes are needed, return as-is (except pretty print)
    if (inFmt === outFmt && !needsChanges) {
      if (inFmt === "json" && opts.align) {
        try {
          const pretty = JSON.stringify(JSON.parse(inputStr), null, 2);
          return { result: pretty, meta: { inFmt, outFmt, opts } };
        } catch {}
      }
      return { result: inputStr, meta: { inFmt, outFmt, opts } };
    }

    // Parse input string into JS object
    let data;
    switch (inFmt) {
      case "json":
        data = JSON.parse(inputStr);
        break;
      case "yaml":
        data = await yamlToJSON(inputStr);
        break;
      case "xml":
        data = await xmlToJSON(inputStr);
        break;
      case "csv":
        data = csvToJSON(inputStr);
        break;
      case "emmet":
        data = emmetToJSON(inputStr.trim());
        break;
      default:
        throw Error("Непознат входен формат: " + inFmt);
    }

    // Apply case transformation and replacements
    if (opts.case && opts.case !== "none") {
      const fn = CASE_FNS[opts.case] || ((s) => s);
      data = transformKeys(data, fn);
    }
    data = applyReplacements(data, opts);

    // Convert JS object to output format
    let result;
    switch (outFmt) {
      case "json": {
        result = opts.align
          ? JSON.stringify(data, null, 2)
          : JSON.stringify(data);
        break;
      }
      case "yaml": {
        result = await jsonToYAML(data, opts.align);
        break;
      }
      case "xml": {
        result = jsonToXML(data);
        break;
      }
      case "csv": {
        result = jsonToCSV(data);
        break;
      }
      case "emmet": {
        result = jsonToEmmet(data);
        break;
      }
      default:
        throw Error("Неподдържан изходен формат: " + outFmt);
    }

    return { result, meta: { inFmt, outFmt, opts } };
  }

  /* ─────────────────────  public surface  ─────────────────────────── */
  /**
   * Exposed interface for using the conversion library from outside.
   * Available on global.DataTransformer.
   */
  global.DataTransformer = {
    parseSettings, // Parses settings string into a usable options object
    convert, // Main async convert function
    detectFormat, // Auto-detects format from input text (for debugging)
    jsonToEmmet, // Explicit converters
    emmetToJSON,
    jsonToXML,
    __testonly: {
      mergeJSON, // Internal merge function (exposed only for testing)
    },
  };
})(typeof window !== "undefined" ? window : global);
