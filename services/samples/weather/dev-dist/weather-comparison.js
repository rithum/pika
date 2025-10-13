import { c as create_custom_element, f as from_svg, a as attribute_effect, b as append, r as rest_props, p as push, d as append_styles, s as state, e as proxy, u as user_effect, k as get, l as set, m as getPikaContext, g as from_html, i as if_block, h as sibling, n as child, o as first_child, t as template_effect, q as set_text, j as pop, w as reset, x as comment, B as set_class, v as next } from "./wc-utils-za2Oi3n3.js";
import { e as each, i as index } from "./each-DO0Vkoj8.js";
import { B as Button } from "./button-CLUnrs-q.js";
import { M as Message_square } from "./message-square-BKNp11os.js";
var root$1 = from_svg(`<svg><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m18 14l4 4l-4 4m0-20l4 4l-4 4"></path><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22M2 6h1.972a4 4 0 0 1 3.6 2.2M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"></path></g></svg>`);
function Shuffle($$anchor, $$props) {
  const p = rest_props($$props, ["$$slots", "$$events", "$$legacy", "$$host"]);
  var svg = root$1();
  attribute_effect(svg, () => ({ viewBox: "0 0 24 24", width: "1.2em", height: "1.2em", ...p }));
  append($$anchor, svg);
}
create_custom_element(Shuffle, {}, [], [], true);
var root_1 = from_html(`<span class="last-update svelte-vrv901"> </span>`);
var root_2 = from_html(`<!> `, 1);
var root_4 = from_html(`<p class="status thinking svelte-vrv901"> </p>`);
var root_5 = from_html(`<p class="status tool svelte-vrv901"> </p>`);
var root_3 = from_html(`<div class="loading svelte-vrv901"><p>Loading weather data...</p> <!> <!></div>`);
var root_7 = from_html(`<p class="error svelte-vrv901"> </p>`);
var root_9 = from_html(`<p class="no-data svelte-vrv901">Click "Compare" to see weather across the globe</p>`);
var root_12 = from_html(`<div class="condition svelte-vrv901"> </div>`);
var root_11 = from_html(`<div><h4 class="svelte-vrv901"> </h4> <div class="temp svelte-vrv901"> </div> <div class="temp-c svelte-vrv901"> </div> <!></div>`);
var root_13 = from_html(`<!> Add to Prompt`, 1);
var root_10 = from_html(`<div class="comparison-grid svelte-vrv901"></div> <!>`, 1);
var root = from_html(`<div class="weather-comparison svelte-vrv901"><div class="header svelte-vrv901"><div class="title-section svelte-vrv901"><!></div> <!></div> <!></div>`);
const $$css = {
  hash: "svelte-vrv901",
  code: ".weather-comparison.svelte-vrv901 {padding:0.75rem;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0, 0, 0, 0.1);}.header.svelte-vrv901 {display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;}.title-section.svelte-vrv901 {display:flex;flex-direction:column;gap:0.125rem;}.last-update.svelte-vrv901 {font-size:0.65rem;color:#6b7280;}.comparison-grid.svelte-vrv901 {display:grid;grid-template-columns:repeat(auto-fit, minmax(100px, 1fr));gap:0.5rem;margin-bottom:0.75rem;}.city-card.svelte-vrv901 {padding:0.75rem;border-radius:6px;text-align:center;border:2px solid #e5e7eb;}.city-card.hot.svelte-vrv901 {background:linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);border-color:#fbbf24;}.city-card.warm.svelte-vrv901 {background:linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);border-color:#60a5fa;}.city-card.cool.svelte-vrv901 {background:linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);border-color:#818cf8;}.city-card.cold.svelte-vrv901 {background:linear-gradient(135deg, #dbeafe 0%, #bae6fd 100%);border-color:#38bdf8;}.city-card.svelte-vrv901 h4:where(.svelte-vrv901) {margin:0 0 0.375rem 0;font-size:0.875rem;color:#111827;}.temp.svelte-vrv901 {font-size:1.5rem;font-weight:bold;color:#111827;}.temp-c.svelte-vrv901 {font-size:0.75rem;color:#6b7280;margin-top:0.125rem;}.condition.svelte-vrv901 {margin-top:0.375rem;font-size:0.75rem;color:#374151;font-style:italic;}.loading.svelte-vrv901,\n    .no-data.svelte-vrv901,\n    .error.svelte-vrv901 {text-align:center;padding:1.5rem;color:#6b7280;font-size:0.875rem;}.loading.svelte-vrv901 .status:where(.svelte-vrv901) {font-size:0.75rem;padding:0.375rem;margin:0.375rem 0 0 0;border-radius:3px;background:#f3f4f6;}.loading.svelte-vrv901 .status.thinking:where(.svelte-vrv901) {color:#6366f1;background:#eef2ff;}.loading.svelte-vrv901 .status.tool:where(.svelte-vrv901) {color:#059669;background:#d1fae5;}.error.svelte-vrv901 {color:#ef4444;}"
};
function Weather_comparison($$anchor, $$props) {
  push($$props, true);
  append_styles($$anchor, $$css);
  let cities = state(proxy([]));
  let loading = state(false);
  let error = state("");
  let initialized = state(false);
  let context = state(void 0);
  let thinkingStatus = state("");
  let toolStatus = state("");
  let lastRefreshTime = state("");
  user_effect(() => {
    if (!get(initialized)) {
      init();
    }
  });
  async function init() {
    set(context, await getPikaContext($$props.$$host), true);
    set(initialized, true);
    const metadata = get(context).chatAppState.getWidgetMetadataAPI("weather", "weather-comparison", get(context).instanceId, get(context).renderingContext);
    metadata.setMetadata({
      title: "Weather Comparison",
      actions: [
        {
          id: "compare",
          title: "Compare Random Cities",
          // shuffle icon svg
          iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shuffle-icon lucide-shuffle"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg>',
          callback: async () => {
            await compareRandomCities();
          }
        }
      ]
    });
    const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "weather-comparison");
    const cachedData = await userWidgetData.getValue("comparisonData");
    if (cachedData) {
      set(lastRefreshTime, cachedData.timestamp, true);
      set(cities, cachedData.response.cities, true);
    }
  }
  async function compareRandomCities() {
    if (!get(context) || get(loading)) return;
    set(loading, true);
    set(error, "");
    set(thinkingStatus, "");
    set(toolStatus, "");
    try {
      const options = {
        onThinking: (text) => {
          set(thinkingStatus, text.length > 60 ? text.substring(0, 60) + "..." : text, true);
        },
        onToolCall: (call) => {
          const funcName = call.name.split("__")[1] || call.name;
          set(toolStatus, `🔧 Calling ${funcName}...`);
        }
      };
      const response = await get(context).chatAppState.invokeAgentAsComponent("weather", "weather-comparison", "compareCities", "Get current weather for 4 random major cities around the world", options);
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "weather-comparison");
      await userWidgetData.setValue("comparisonData", { response, timestamp });
      set(lastRefreshTime, timestamp, true);
      set(cities, response.cities, true);
      set(thinkingStatus, "");
      set(toolStatus, "");
    } catch (e) {
      console.error("Error comparing cities:", e);
      set(error, "Failed to compare cities");
    } finally {
      set(loading, false);
    }
  }
  async function addToPrompt() {
    if (!get(context) || get(cities).length === 0) return;
    const comparisonText = get(cities).map((city) => `${city.location}: ${Math.round(city.tempF)}°F`).join(", ");
    get(context).appState.showToast(`Weather comparison: ${comparisonText}`, { type: "info" });
  }
  function getRelativeTemp(tempF) {
    if (tempF >= 85) return "hot";
    if (tempF >= 70) return "warm";
    if (tempF >= 50) return "cool";
    return "cold";
  }
  var div = root();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var node = child(div_2);
  {
    var consequent = ($$anchor2) => {
      var span = root_1();
      var text_1 = child(span);
      reset(span);
      template_effect(($0) => set_text(text_1, `Last: ${$0 ?? ""}`), [() => new Date(get(lastRefreshTime)).toLocaleTimeString()]);
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
    onclick: compareRandomCities,
    get disabled() {
      return get(loading);
    },
    children: ($$anchor2, $$slotProps) => {
      var fragment = root_2();
      var node_2 = first_child(fragment);
      Shuffle(node_2, { class: "h-3 w-3 mr-1" });
      var text_2 = sibling(node_2);
      template_effect(() => set_text(text_2, ` ${get(loading) ? "Loading..." : "Compare"}`));
      append($$anchor2, fragment);
    },
    $$slots: { default: true }
  });
  reset(div_1);
  var node_3 = sibling(div_1, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var div_3 = root_3();
      var node_4 = sibling(child(div_3), 2);
      {
        var consequent_1 = ($$anchor3) => {
          var p = root_4();
          var text_3 = child(p);
          reset(p);
          template_effect(() => set_text(text_3, `💭 ${get(thinkingStatus) ?? ""}`));
          append($$anchor3, p);
        };
        if_block(node_4, ($$render) => {
          if (get(thinkingStatus)) $$render(consequent_1);
        });
      }
      var node_5 = sibling(node_4, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var p_1 = root_5();
          var text_4 = child(p_1, true);
          reset(p_1);
          template_effect(() => set_text(text_4, get(toolStatus)));
          append($$anchor3, p_1);
        };
        if_block(node_5, ($$render) => {
          if (get(toolStatus)) $$render(consequent_2);
        });
      }
      reset(div_3);
      append($$anchor2, div_3);
    };
    var alternate_2 = ($$anchor2) => {
      var fragment_1 = comment();
      var node_6 = first_child(fragment_1);
      {
        var consequent_4 = ($$anchor3) => {
          var p_2 = root_7();
          var text_5 = child(p_2, true);
          reset(p_2);
          template_effect(() => set_text(text_5, get(error)));
          append($$anchor3, p_2);
        };
        var alternate_1 = ($$anchor3) => {
          var fragment_2 = comment();
          var node_7 = first_child(fragment_2);
          {
            var consequent_5 = ($$anchor4) => {
              var p_3 = root_9();
              append($$anchor4, p_3);
            };
            var alternate = ($$anchor4) => {
              var fragment_3 = root_10();
              var div_4 = first_child(fragment_3);
              each(div_4, 21, () => get(cities), index, ($$anchor5, city) => {
                var div_5 = root_11();
                var h4 = child(div_5);
                var text_6 = child(h4, true);
                reset(h4);
                var div_6 = sibling(h4, 2);
                var text_7 = child(div_6);
                reset(div_6);
                var div_7 = sibling(div_6, 2);
                var text_8 = child(div_7);
                reset(div_7);
                var node_8 = sibling(div_7, 2);
                {
                  var consequent_6 = ($$anchor6) => {
                    var div_8 = root_12();
                    var text_9 = child(div_8, true);
                    reset(div_8);
                    template_effect(() => set_text(text_9, get(city).condition));
                    append($$anchor6, div_8);
                  };
                  if_block(node_8, ($$render) => {
                    if (get(city).condition) $$render(consequent_6);
                  });
                }
                reset(div_5);
                template_effect(
                  ($0, $1, $2) => {
                    set_class(div_5, 1, `city-card ${$0 ?? ""}`, "svelte-vrv901");
                    set_text(text_6, get(city).location);
                    set_text(text_7, `${$1 ?? ""}°F`);
                    set_text(text_8, `${$2 ?? ""}°C`);
                  },
                  [
                    () => getRelativeTemp(get(city).tempF),
                    () => Math.round(get(city).tempF),
                    () => Math.round(get(city).tempC)
                  ]
                );
                append($$anchor5, div_5);
              });
              reset(div_4);
              var node_9 = sibling(div_4, 2);
              Button(node_9, {
                variant: "outline",
                size: "sm",
                onclick: addToPrompt,
                class: "w-full",
                children: ($$anchor5, $$slotProps) => {
                  var fragment_4 = root_13();
                  var node_10 = first_child(fragment_4);
                  Message_square(node_10, { class: "h-3 w-3 mr-1" });
                  next();
                  append($$anchor5, fragment_4);
                },
                $$slots: { default: true }
              });
              append($$anchor4, fragment_3);
            };
            if_block(
              node_7,
              ($$render) => {
                if (get(cities).length === 0) $$render(consequent_5);
                else $$render(alternate, false);
              },
              true
            );
          }
          append($$anchor3, fragment_2);
        };
        if_block(
          node_6,
          ($$render) => {
            if (get(error)) $$render(consequent_4);
            else $$render(alternate_1, false);
          },
          true
        );
      }
      append($$anchor2, fragment_1);
    };
    if_block(node_3, ($$render) => {
      if (get(loading)) $$render(consequent_3);
      else $$render(alternate_2, false);
    });
  }
  reset(div);
  append($$anchor, div);
  pop();
}
customElements.define("weather-comparison", create_custom_element(Weather_comparison, {}, [], [], true));
