import { c as create_custom_element, f as from_svg, a as attribute_effect, b as append, r as rest_props } from "./wc-utils-za2Oi3n3.js";
var root = from_svg(`<svg><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path></svg>`);
function Message_square($$anchor, $$props) {
  const p = rest_props($$props, ["$$slots", "$$events", "$$legacy", "$$host"]);
  var svg = root();
  attribute_effect(svg, () => ({ viewBox: "0 0 24 24", width: "1.2em", height: "1.2em", ...p }));
  append($$anchor, svg);
}
create_custom_element(Message_square, {}, [], [], true);
export {
  Message_square as M
};
