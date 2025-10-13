import { c as create_custom_element, p as push, d as append_styles, s as state, e as proxy, u as user_effect, k as get, l as set, m as getPikaContext, g as from_html, h as sibling, n as child, y as text, t as template_effect, b as append, z as user_derived, j as pop, w as reset, v as next, o as first_child, i as if_block, q as set_text } from "./wc-utils-za2Oi3n3.js";
import { e as each, i as index } from "./each-DO0Vkoj8.js";
import { X } from "./x-BIkiFl-N.js";
import { B as Button } from "./button-CLUnrs-q.js";
import { I as Input } from "./input-CAt9mIdC.js";
var root_4 = from_html(`<span class="check svelte-zc6ksc">✓</span>`);
var root_3 = from_html(` <!>`, 1);
var root = from_html(`<div class="city-selector svelte-zc6ksc"><header class="svelte-zc6ksc"><h2 class="text-lg font-semibold m-0">Select Cities</h2> <!></header> <!> <div class="cities-grid svelte-zc6ksc"></div> <footer class="svelte-zc6ksc"><!></footer></div>`);
const $$css = {
  hash: "svelte-zc6ksc",
  code: ".city-selector.svelte-zc6ksc {background:white;border-radius:12px;padding:1.5rem;max-width:600px;margin:0 auto;}header.svelte-zc6ksc {display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;}.cities-grid.svelte-zc6ksc {display:grid;grid-template-columns:repeat(auto-fill, minmax(120px, 1fr));gap:0.5rem;margin-bottom:1rem;max-height:300px;overflow-y:auto;}.check.svelte-zc6ksc {position:absolute;top:0.25rem;right:0.25rem;font-size:0.875rem;}footer.svelte-zc6ksc {display:flex;justify-content:flex-end;}"
};
function City_selector($$anchor, $$props) {
  push($$props, true);
  append_styles($$anchor, $$css);
  let searchQuery = state("");
  let selectedCities = state(proxy([]));
  let initialized = state(false);
  let context = state(void 0);
  user_effect(() => {
    if (!get(initialized)) {
      init();
    }
  });
  async function init() {
    set(context, await getPikaContext($$props.$$host), true);
    set(initialized, true);
    const metadata = get(context).chatAppState.getWidgetMetadataAPI("weather", "city-selector", get(context).instanceId, get(context).renderingContext);
    metadata.setMetadata({
      title: "Select Favorite Cities",
      actions: [
        {
          id: "cancel",
          title: "Cancel",
          // x icon svg
          iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
          callback: () => {
            get(context).chatAppState.closeDialog();
          }
        },
        {
          id: "save",
          title: "Save Changes",
          // check icon svg
          iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-icon lucide-check"><path d="M20 6 9 17l-5-5"/></svg>',
          primary: true,
          callback: async () => {
            await saveCities();
          }
        }
      ]
    });
  }
  const popularCities = [
    "San Francisco",
    "New York",
    "Los Angeles",
    "Chicago",
    "Miami",
    "Seattle",
    "Boston",
    "Austin",
    "London",
    "Paris",
    "Tokyo",
    "Sydney"
  ];
  const filteredCities = user_derived(() => () => {
    if (!get(searchQuery)) return popularCities;
    return popularCities.filter((city) => city.toLowerCase().includes(get(searchQuery).toLowerCase()));
  });
  function toggleCity(city) {
    if (get(selectedCities).includes(city)) {
      set(selectedCities, get(selectedCities).filter((c) => c !== city), true);
    } else {
      set(selectedCities, [...get(selectedCities), city], true);
    }
  }
  async function saveCities() {
    const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "favorite-cities");
    await userWidgetData.setValue("cities", get(selectedCities));
    get(context).chatAppState.showToast("Cities saved!", { type: "success" });
    get(context).chatAppState.closeDialog();
  }
  var div = root();
  var header = child(div);
  var node = sibling(child(header), 2);
  Button(node, {
    variant: "ghost",
    size: "icon",
    onclick: () => get(context).chatAppState.closeDialog(),
    class: "h-8 w-8",
    children: ($$anchor2, $$slotProps) => {
      X($$anchor2, { class: "h-4 w-4" });
    },
    $$slots: { default: true }
  });
  reset(header);
  var node_1 = sibling(header, 2);
  Input(node_1, {
    type: "text",
    placeholder: "Search cities...",
    class: "mb-4",
    get value() {
      return get(searchQuery);
    },
    set value($$value) {
      set(searchQuery, $$value, true);
    }
  });
  var div_1 = sibling(node_1, 2);
  each(div_1, 21, () => get(filteredCities)(), index, ($$anchor2, city) => {
    {
      let $0 = user_derived(() => get(selectedCities).includes(get(city)) ? "default" : "outline");
      Button($$anchor2, {
        get variant() {
          return get($0);
        },
        size: "sm",
        onclick: () => toggleCity(get(city)),
        class: "relative justify-start h-auto py-2",
        children: ($$anchor3, $$slotProps) => {
          next();
          var fragment_2 = root_3();
          var text2 = first_child(fragment_2);
          var node_2 = sibling(text2);
          {
            var consequent = ($$anchor4) => {
              var span = root_4();
              append($$anchor4, span);
            };
            if_block(node_2, ($$render) => {
              if (get(selectedCities).includes(get(city))) $$render(consequent);
            });
          }
          template_effect(() => set_text(text2, `${get(city) ?? ""} `));
          append($$anchor3, fragment_2);
        },
        $$slots: { default: true }
      });
    }
  });
  reset(div_1);
  var footer = sibling(div_1, 2);
  var node_3 = child(footer);
  {
    let $0 = user_derived(() => get(selectedCities).length === 0);
    Button(node_3, {
      onclick: saveCities,
      get disabled() {
        return get($0);
      },
      class: "w-full",
      children: ($$anchor2, $$slotProps) => {
        next();
        var text_1 = text();
        template_effect(() => set_text(text_1, `Save ${get(selectedCities).length > 0 ? `(${get(selectedCities).length})` : ""}`));
        append($$anchor2, text_1);
      },
      $$slots: { default: true }
    });
  }
  reset(footer);
  reset(div);
  append($$anchor, div);
  pop();
}
customElements.define("city-selector", create_custom_element(City_selector, {}, [], [], true));
