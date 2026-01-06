require("./public/convert.js");

global.DT = global.DataTransformer;

global.jsyaml = require("js-yaml");

if (global.NodeList && !NodeList.prototype.forEach) {
  NodeList.prototype.forEach = Array.prototype.forEach;
}
