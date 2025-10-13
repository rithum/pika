import { c as create_custom_element, f as from_svg, a as attribute_effect, b as append, r as rest_props } from "./wc-utils-za2Oi3n3.js";
var root = from_svg(`<svg><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"></path></svg>`);
function X($$anchor, $$props) {
  const p = rest_props($$props, ["$$slots", "$$events", "$$legacy", "$$host"]);
  var svg = root();
  attribute_effect(svg, () => ({ viewBox: "0 0 24 24", width: "1.2em", height: "1.2em", ...p }));
  append($$anchor, svg);
}
create_custom_element(X, {}, [], [], true);
export {
  X
};
