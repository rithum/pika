import { c as create_custom_element, f as from_svg, a as attribute_effect, b as append, r as rest_props, p as push, d as append_styles, u as user_effect, k as get, s as state, l as set, m as getPikaContext, g as from_html, h as sibling, n as child, i as if_block, o as first_child, t as template_effect, q as set_text, j as pop, w as reset, x as comment } from "./wc-utils-za2Oi3n3.js";
import { B as Button } from "./button-CLUnrs-q.js";
var root$1 = from_svg(`<svg><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4m2-2h-4"></path><circle cx="4" cy="20" r="2"></circle></g></svg>`);
function Sparkles($$anchor, $$props) {
  const p = rest_props($$props, ["$$slots", "$$events", "$$legacy", "$$host"]);
  var svg = root$1();
  attribute_effect(svg, () => ({ viewBox: "0 0 24 24", width: "1.2em", height: "1.2em", ...p }));
  append($$anchor, svg);
}
create_custom_element(Sparkles, {}, [], [], true);
var root_1 = from_html(`<span class="last-update svelte-uopn5k"> </span>`);
var root_2 = from_html(`<!> `, 1);
var root_3 = from_html(`<p class="loading svelte-uopn5k">Generating fun fact...</p>`);
var root_5 = from_html(`<p class="error svelte-uopn5k"> </p>`);
var root_8 = from_html(`<span class="category svelte-uopn5k"> </span>`);
var root_7 = from_html(`<div class="fact-card svelte-uopn5k"><!> <p class="fact-text svelte-uopn5k"> </p></div>`);
var root_9 = from_html(`<p class="no-data svelte-uopn5k">Click "New Fact" to learn something interesting!</p>`);
var root = from_html(`<div class="weather-fun-fact svelte-uopn5k"><div class="header svelte-uopn5k"><div class="title-section svelte-uopn5k"><h3 class="text-base font-semibold m-0">⚡ Weather Fun Fact</h3> <!></div> <!></div> <!></div>`);
const $$css = {
  hash: "svelte-uopn5k",
  code: ".weather-fun-fact.svelte-uopn5k {padding:0.75rem;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0, 0, 0, 0.1);}.header.svelte-uopn5k {display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;}.title-section.svelte-uopn5k {display:flex;flex-direction:column;gap:0.125rem;}.last-update.svelte-uopn5k {font-size:0.65rem;color:#6b7280;}.fact-card.svelte-uopn5k {padding:1rem;background:linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);border-left:3px solid #8b5cf6;border-radius:6px;}.category.svelte-uopn5k {display:inline-block;padding:0.125rem 0.5rem;background:#8b5cf6;color:white;border-radius:10px;font-size:0.625rem;font-weight:600;text-transform:uppercase;margin-bottom:0.5rem;}.fact-text.svelte-uopn5k {margin:0;font-size:0.875rem;line-height:1.5;color:#374151;}.loading.svelte-uopn5k,\n    .no-data.svelte-uopn5k,\n    .error.svelte-uopn5k {text-align:center;padding:1.5rem;color:#6b7280;font-size:0.875rem;}.error.svelte-uopn5k {color:#ef4444;}"
};
function Weather_fun_fact($$anchor, $$props) {
  push($$props, true);
  append_styles($$anchor, $$css);
  const REFRESH_INTERVAL_MS = 60 * 60 * 1e3;
  let funFact = state("");
  let category = state("");
  let loading = state(true);
  let error = state("");
  let initialized = state(false);
  let context = state(void 0);
  let lastRefreshTime = state("");
  user_effect(() => {
    if (!get(initialized)) {
      init();
    }
  });
  async function init() {
    set(context, await getPikaContext($$props.$$host), true);
    set(initialized, true);
    const metadata = get(context).chatAppState.getWidgetMetadataAPI("weather", "weather-fun-fact", get(context).instanceId, get(context).renderingContext);
    metadata.setMetadata({
      title: "Weather Fun Fact",
      actions: [
        {
          id: "new-fact",
          title: "New Fact",
          // sparkles icon svg
          iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles-icon lucide-sparkles"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>',
          callback: async () => {
            await fetchFunFact();
          }
        }
      ]
    });
    const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "weather-fun-fact");
    const cachedData = await userWidgetData.getValue("funFactData");
    if (cachedData) {
      set(lastRefreshTime, cachedData.timestamp, true);
      set(funFact, cachedData.response.fact, true);
      set(category, cachedData.response.category || "", true);
      const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
      if (cacheAge > REFRESH_INTERVAL_MS) {
        await fetchFunFact();
      }
    } else {
      await fetchFunFact();
    }
    set(loading, false);
  }
  async function fetchFunFact() {
    if (!get(context)) return;
    set(loading, true);
    set(error, "");
    try {
      const response = await get(context).chatAppState.invokeAgentAsComponent("weather", "weather-fun-fact", "getFunFact", "Generate an interesting weather-related fun fact or trivia");
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "weather-fun-fact");
      await userWidgetData.setValue("funFactData", { response, timestamp });
      set(lastRefreshTime, timestamp, true);
      set(funFact, response.fact, true);
      set(category, response.category || "", true);
    } catch (e) {
      console.error("Error fetching fun fact:", e);
      set(error, "Failed to fetch fun fact");
    } finally {
      set(loading, false);
    }
  }
  var div = root();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var node = sibling(child(div_2), 2);
  {
    var consequent = ($$anchor2) => {
      var span = root_1();
      var text = child(span);
      reset(span);
      template_effect(($0) => set_text(text, `Updated ${$0 ?? ""}`), [() => new Date(get(lastRefreshTime)).toLocaleTimeString()]);
      append($$anchor2, span);
    };
    if_block(node, ($$render) => {
      if (get(lastRefreshTime)) $$render(consequent);
    });
  }
  reset(div_2);
  var node_1 = sibling(div_2, 2);
  Button(node_1, {
    variant: "outline",
    size: "sm",
    onclick: fetchFunFact,
    get disabled() {
      return get(loading);
    },
    children: ($$anchor2, $$slotProps) => {
      var fragment = root_2();
      var node_2 = first_child(fragment);
      Sparkles(node_2, { class: "h-3 w-3 mr-1" });
      var text_1 = sibling(node_2);
      template_effect(() => set_text(text_1, ` ${get(loading) ? "Loading..." : "New Fact"}`));
      append($$anchor2, fragment);
    },
    $$slots: { default: true }
  });
  reset(div_1);
  var node_3 = sibling(div_1, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var p = root_3();
      append($$anchor2, p);
    };
    var alternate_2 = ($$anchor2) => {
      var fragment_1 = comment();
      var node_4 = first_child(fragment_1);
      {
        var consequent_2 = ($$anchor3) => {
          var p_1 = root_5();
          var text_2 = child(p_1, true);
          reset(p_1);
          template_effect(() => set_text(text_2, get(error)));
          append($$anchor3, p_1);
        };
        var alternate_1 = ($$anchor3) => {
          var fragment_2 = comment();
          var node_5 = first_child(fragment_2);
          {
            var consequent_4 = ($$anchor4) => {
              var div_3 = root_7();
              var node_6 = child(div_3);
              {
                var consequent_3 = ($$anchor5) => {
                  var span_1 = root_8();
                  var text_3 = child(span_1, true);
                  reset(span_1);
                  template_effect(() => set_text(text_3, get(category)));
                  append($$anchor5, span_1);
                };
                if_block(node_6, ($$render) => {
                  if (get(category)) $$render(consequent_3);
                });
              }
              var p_2 = sibling(node_6, 2);
              var text_4 = child(p_2, true);
              reset(p_2);
              reset(div_3);
              template_effect(() => set_text(text_4, get(funFact)));
              append($$anchor4, div_3);
            };
            var alternate = ($$anchor4) => {
              var p_3 = root_9();
              append($$anchor4, p_3);
            };
            if_block(
              node_5,
              ($$render) => {
                if (get(funFact)) $$render(consequent_4);
                else $$render(alternate, false);
              },
              true
            );
          }
          append($$anchor3, fragment_2);
        };
        if_block(
          node_4,
          ($$render) => {
            if (get(error)) $$render(consequent_2);
            else $$render(alternate_1, false);
          },
          true
        );
      }
      append($$anchor2, fragment_1);
    };
    if_block(node_3, ($$render) => {
      if (get(loading)) $$render(consequent_1);
      else $$render(alternate_2, false);
    });
  }
  reset(div);
  append($$anchor, div);
  pop();
}
customElements.define("weather-fun-fact", create_custom_element(Weather_fun_fact, {}, [], [], true));
