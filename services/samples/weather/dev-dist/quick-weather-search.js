import { c as create_custom_element, f as from_svg, a as attribute_effect, b as append, r as rest_props, p as push, d as append_styles, u as user_effect, k as get, s as state, l as set, m as getPikaContext, g as from_html, h as sibling, n as child, i as if_block, z as user_derived, j as pop, w as reset, t as template_effect, q as set_text, x as comment, o as first_child, v as next } from "./wc-utils-za2Oi3n3.js";
import { M as Message_square } from "./message-square-BKNp11os.js";
import { B as Button } from "./button-CLUnrs-q.js";
import { I as Input } from "./input-CAt9mIdC.js";
var root$1 = from_svg(`<svg><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m21 21l-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></g></svg>`);
function Search($$anchor, $$props) {
  const p = rest_props($$props, ["$$slots", "$$events", "$$legacy", "$$host"]);
  var svg = root$1();
  attribute_effect(svg, () => ({ viewBox: "0 0 24 24", width: "1.2em", height: "1.2em", ...p }));
  append($$anchor, svg);
}
create_custom_element(Search, {}, [], [], true);
var root_1 = from_html(`<span class="last-update svelte-4uxa4s"> </span>`);
var root_3 = from_html(`<p class="loading svelte-4uxa4s">Searching...</p>`);
var root_5 = from_html(`<p class="error svelte-4uxa4s"> </p>`);
var root_9 = from_html(`<span> </span>`);
var root_10 = from_html(`<span> </span>`);
var root_8 = from_html(`<div class="additional-info svelte-4uxa4s"><!> <!></div>`);
var root_11 = from_html(`<!> Ask for Details`, 1);
var root_7 = from_html(`<div class="weather-result svelte-4uxa4s"><h4 class="svelte-4uxa4s"> </h4> <div class="current-temp svelte-4uxa4s"><span class="temp-f svelte-4uxa4s"> </span> <span class="temp-c svelte-4uxa4s"> </span></div> <p class="condition svelte-4uxa4s"> </p> <!> <!></div>`);
var root_12 = from_html(`<p class="no-data svelte-4uxa4s">Search for a city to see weather</p>`);
var root = from_html(`<div class="quick-weather-search svelte-4uxa4s"><div class="header-section svelte-4uxa4s"><h3 class="text-base font-semibold m-0">🔍 Quick Weather Search</h3> <!></div> <div class="search-bar svelte-4uxa4s"><!> <!></div> <!></div>`);
const $$css = {
  hash: "svelte-4uxa4s",
  code: ".quick-weather-search.svelte-4uxa4s {padding:0.75rem;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0, 0, 0, 0.1);}.header-section.svelte-4uxa4s {display:flex;flex-direction:column;gap:0.125rem;margin-bottom:0.75rem;}.last-update.svelte-4uxa4s {font-size:0.65rem;color:#6b7280;}.search-bar.svelte-4uxa4s {display:flex;gap:0.375rem;margin-bottom:0.75rem;}.weather-result.svelte-4uxa4s {padding:1rem;background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);border-radius:6px;border:2px solid #3b82f6;}.weather-result.svelte-4uxa4s h4:where(.svelte-4uxa4s) {margin:0 0 0.5rem 0;font-size:1.125rem;color:#111827;}.current-temp.svelte-4uxa4s {margin-bottom:0.375rem;}.temp-f.svelte-4uxa4s {font-size:2rem;font-weight:bold;color:#1e40af;}.temp-c.svelte-4uxa4s {font-size:0.875rem;color:#6b7280;margin-left:0.375rem;}.condition.svelte-4uxa4s {margin:0 0 0.75rem 0;font-size:1rem;color:#374151;font-weight:500;}.additional-info.svelte-4uxa4s {display:flex;gap:0.75rem;margin-bottom:0.75rem;font-size:0.75rem;color:#6b7280;}.loading.svelte-4uxa4s,\n    .no-data.svelte-4uxa4s,\n    .error.svelte-4uxa4s {text-align:center;padding:1.5rem;color:#6b7280;font-size:0.875rem;}.error.svelte-4uxa4s {color:#ef4444;}"
};
function Quick_weather_search($$anchor, $$props) {
  push($$props, true);
  append_styles($$anchor, $$css);
  let searchCity = state("");
  let weatherData = state(null);
  let loading = state(false);
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
    const metadata = get(context).chatAppState.getWidgetMetadataAPI("weather", "quick-weather-search", get(context).instanceId, get(context).renderingContext);
    metadata.setMetadata({
      title: "Quick Weather Search",
      actions: [
        {
          id: "search",
          title: "Search",
          iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search-icon lucide-search"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>',
          callback: async () => {
            await searchWeather();
          }
        }
      ]
    });
    const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "quick-weather-search");
    const cachedData = await userWidgetData.getValue("searchData");
    if (cachedData) {
      set(lastRefreshTime, cachedData.timestamp, true);
      set(searchCity, cachedData.searchTerm, true);
      set(weatherData, cachedData.response, true);
    }
  }
  async function searchWeather() {
    if (!get(context) || get(loading) || !get(searchCity).trim()) return;
    set(loading, true);
    set(error, "");
    set(weatherData, null);
    try {
      const response = await get(context).chatAppState.invokeAgentAsComponent("weather", "quick-weather-search", "quickLookup", `Get current weather conditions for ${get(searchCity)}`);
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "quick-weather-search");
      await userWidgetData.setValue("searchData", { response, timestamp, searchTerm: get(searchCity) });
      set(lastRefreshTime, timestamp, true);
      set(weatherData, response, true);
    } catch (e) {
      console.error("Error searching weather:", e);
      set(error, "Failed to find weather data");
    } finally {
      set(loading, false);
    }
  }
  function handleKeypress(event) {
    if (event.key === "Enter") {
      searchWeather();
    }
  }
  async function askForDetails() {
    if (!get(context) || !get(weatherData)) return;
    get(context).appState.showToast(`Starting chat about ${get(weatherData).location} weather...`, { type: "info" });
  }
  var div = root();
  var div_1 = child(div);
  var node = sibling(child(div_1), 2);
  {
    var consequent = ($$anchor2) => {
      var span = root_1();
      var text = child(span);
      reset(span);
      template_effect(($0) => set_text(text, `Last search: ${$0 ?? ""}`), [() => new Date(get(lastRefreshTime)).toLocaleTimeString()]);
      append($$anchor2, span);
    };
    if_block(node, ($$render) => {
      if (get(lastRefreshTime)) $$render(consequent);
    });
  }
  reset(div_1);
  var div_2 = sibling(div_1, 2);
  var node_1 = child(div_2);
  Input(node_1, {
    type: "text",
    onkeypress: handleKeypress,
    placeholder: "Enter city name...",
    get disabled() {
      return get(loading);
    },
    class: "flex-1",
    get value() {
      return get(searchCity);
    },
    set value($$value) {
      set(searchCity, $$value, true);
    }
  });
  var node_2 = sibling(node_1, 2);
  {
    let $0 = user_derived(() => get(loading) || !get(searchCity).trim());
    Button(node_2, {
      variant: "outline",
      size: "icon",
      onclick: searchWeather,
      get disabled() {
        return get($0);
      },
      children: ($$anchor2, $$slotProps) => {
        Search($$anchor2, { class: "h-4 w-4" });
      },
      $$slots: { default: true }
    });
  }
  reset(div_2);
  var node_3 = sibling(div_2, 2);
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
          var text_1 = child(p_1, true);
          reset(p_1);
          template_effect(() => set_text(text_1, get(error)));
          append($$anchor3, p_1);
        };
        var alternate_1 = ($$anchor3) => {
          var fragment_2 = comment();
          var node_5 = first_child(fragment_2);
          {
            var consequent_6 = ($$anchor4) => {
              var div_3 = root_7();
              var h4 = child(div_3);
              var text_2 = child(h4, true);
              reset(h4);
              var div_4 = sibling(h4, 2);
              var span_1 = child(div_4);
              var text_3 = child(span_1);
              reset(span_1);
              var span_2 = sibling(span_1, 2);
              var text_4 = child(span_2);
              reset(span_2);
              reset(div_4);
              var p_2 = sibling(div_4, 2);
              var text_5 = child(p_2, true);
              reset(p_2);
              var node_6 = sibling(p_2, 2);
              {
                var consequent_5 = ($$anchor5) => {
                  var div_5 = root_8();
                  var node_7 = child(div_5);
                  {
                    var consequent_3 = ($$anchor6) => {
                      var span_3 = root_9();
                      var text_6 = child(span_3);
                      reset(span_3);
                      template_effect(() => set_text(text_6, `💧 ${get(weatherData).humidity ?? ""}%`));
                      append($$anchor6, span_3);
                    };
                    if_block(node_7, ($$render) => {
                      if (get(weatherData).humidity) $$render(consequent_3);
                    });
                  }
                  var node_8 = sibling(node_7, 2);
                  {
                    var consequent_4 = ($$anchor6) => {
                      var span_4 = root_10();
                      var text_7 = child(span_4);
                      reset(span_4);
                      template_effect(() => set_text(text_7, `💨 ${get(weatherData).windSpeed ?? ""} mph`));
                      append($$anchor6, span_4);
                    };
                    if_block(node_8, ($$render) => {
                      if (get(weatherData).windSpeed) $$render(consequent_4);
                    });
                  }
                  reset(div_5);
                  append($$anchor5, div_5);
                };
                if_block(node_6, ($$render) => {
                  if (get(weatherData).humidity || get(weatherData).windSpeed) $$render(consequent_5);
                });
              }
              var node_9 = sibling(node_6, 2);
              Button(node_9, {
                variant: "outline",
                size: "sm",
                onclick: askForDetails,
                class: "w-full",
                children: ($$anchor5, $$slotProps) => {
                  var fragment_3 = root_11();
                  var node_10 = first_child(fragment_3);
                  Message_square(node_10, { class: "h-3 w-3 mr-1" });
                  next();
                  append($$anchor5, fragment_3);
                },
                $$slots: { default: true }
              });
              reset(div_3);
              template_effect(
                ($0, $1) => {
                  set_text(text_2, get(weatherData).location);
                  set_text(text_3, `${$0 ?? ""}°F`);
                  set_text(text_4, `(${$1 ?? ""}°C)`);
                  set_text(text_5, get(weatherData).condition);
                },
                [
                  () => Math.round(get(weatherData).tempF),
                  () => Math.round(get(weatherData).tempC)
                ]
              );
              append($$anchor4, div_3);
            };
            var alternate = ($$anchor4) => {
              var p_3 = root_12();
              append($$anchor4, p_3);
            };
            if_block(
              node_5,
              ($$render) => {
                if (get(weatherData)) $$render(consequent_6);
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
customElements.define("quick-weather-search", create_custom_element(Quick_weather_search, {}, [], [], true));
