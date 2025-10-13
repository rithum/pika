import { c as create_custom_element, f as from_svg, a as attribute_effect, b as append, r as rest_props } from "./wc-utils-za2Oi3n3.js";
var root = from_svg(`<svg><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle></g></svg>`);
function Map_pin($$anchor, $$props) {
  const p = rest_props($$props, ["$$slots", "$$events", "$$legacy", "$$host"]);
  var svg = root();
  attribute_effect(svg, () => ({ viewBox: "0 0 24 24", width: "1.2em", height: "1.2em", ...p }));
  append($$anchor, svg);
}
create_custom_element(Map_pin, {}, [], [], true);
export {
  Map_pin as M
};
