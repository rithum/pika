import { c as create_custom_element, p as push, d as append_styles, s as state, e as proxy, u as user_effect, k as get, l as set, m as getPikaContext, g as from_html, h as sibling, n as child, i as if_block, o as first_child, t as template_effect, q as set_text, b as append, j as pop, w as reset, x as comment, A as set_style } from "./wc-utils-za2Oi3n3.js";
import { e as each, i as index } from "./each-DO0Vkoj8.js";
import { B as Button } from "./button-CLUnrs-q.js";
import { R as Refresh_cw } from "./refresh-cw-pu7uKzd9.js";
import { M as Map_pin } from "./map-pin-CuHOD0LA.js";
var root_1 = from_html(`<span class="last-update svelte-ljl42j"> </span>`);
var root_2 = from_html(`<!> `, 1);
var root_3 = from_html(`<!> `, 1);
var root_4 = from_html(`<p class="loading svelte-ljl42j">Loading data...</p>`);
var root_6 = from_html(`<p class="error svelte-ljl42j"> </p>`);
var root_8 = from_html(`<p class="no-data svelte-ljl42j">Click Refresh to load data</p>`);
var root_10 = from_html(`<div class="bar-container svelte-ljl42j"><div class="bar svelte-ljl42j"><span class="temp-label svelte-ljl42j"> </span></div> <span class="hour-label svelte-ljl42j"> </span></div>`);
var root_9 = from_html(`<div class="stats svelte-ljl42j"><span class="stat svelte-ljl42j">High: <strong class="svelte-ljl42j"> </strong></span> <span class="stat svelte-ljl42j">Low: <strong class="svelte-ljl42j"> </strong></span></div> <div class="chart svelte-ljl42j"></div>`, 1);
var root = from_html(`<div class="temperature-trend svelte-ljl42j"><div class="header svelte-ljl42j"><div class="title svelte-ljl42j"><h3 class="text-base font-semibold m-0">🌡️ Temperature Trend (24h)</h3> <!> <!></div> <!></div> <!></div>`);
const $$css = {
  hash: "svelte-ljl42j",
  code: ".temperature-trend.svelte-ljl42j {padding:0.75rem;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0, 0, 0, 0.1);}.header.svelte-ljl42j {display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;}.title.svelte-ljl42j {display:flex;flex-direction:column;gap:0.375rem;}.last-update.svelte-ljl42j {font-size:0.65rem;color:#6b7280;}.stats.svelte-ljl42j {display:flex;gap:1rem;margin-bottom:0.75rem;padding:0.5rem;background:#f9fafb;border-radius:4px;}.stat.svelte-ljl42j {font-size:0.75rem;color:#6b7280;}.stat.svelte-ljl42j strong:where(.svelte-ljl42j) {color:#111827;font-size:0.875rem;}.chart.svelte-ljl42j {display:flex;justify-content:space-between;align-items:flex-end;height:120px;padding:0.75rem 0;}.bar-container.svelte-ljl42j {display:flex;flex-direction:column;align-items:center;flex:1;height:100%;position:relative;}.bar.svelte-ljl42j {width:80%;background:linear-gradient(to top, #3b82f6, #60a5fa);border-radius:3px 3px 0 0;position:relative;min-height:20%;display:flex;align-items:flex-start;justify-content:center;}.temp-label.svelte-ljl42j {font-size:0.625rem;font-weight:bold;color:#1e40af;margin-top:0.125rem;}.hour-label.svelte-ljl42j {font-size:0.625rem;color:#6b7280;margin-top:0.375rem;}.loading.svelte-ljl42j,\n    .no-data.svelte-ljl42j,\n    .error.svelte-ljl42j {text-align:center;padding:1.5rem;color:#6b7280;font-size:0.875rem;}.error.svelte-ljl42j {color:#ef4444;}"
};
function Temperature_trend($$anchor, $$props) {
  push($$props, true);
  append_styles($$anchor, $$css);
  const REFRESH_INTERVAL_MS = 60 * 60 * 1e3;
  let location = state("San Francisco");
  let temps = state(proxy([]));
  let hours = state(proxy([]));
  let highF = state(0);
  let lowF = state(0);
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
    const metadata = get(context).chatAppState.getWidgetMetadataAPI("weather", "temperature-trend", get(context).instanceId, get(context).renderingContext);
    metadata.setMetadata({
      title: `Temperature Trend - ${get(location)}`,
      actions: [
        {
          id: "refresh",
          title: "Refresh Data",
          // refresh-cw icon svg
          iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw-icon lucide-refresh-cw"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
          callback: async () => {
            await fetchTrend();
          }
        }
      ]
    });
    const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "temperature-trend");
    const cachedData = await userWidgetData.getValue("trendData");
    if (cachedData) {
      set(lastRefreshTime, cachedData.timestamp, true);
      set(location, cachedData.location, true);
      set(temps, cachedData.response.dataPoints.map((dp) => dp.tempF), true);
      set(
        hours,
        cachedData.response.dataPoints.map((dp) => {
          const date = new Date(dp.timestamp);
          const hour = date.getHours();
          const ampm = hour >= 12 ? "pm" : "am";
          const displayHour = hour % 12 || 12;
          return `${displayHour}${ampm}`;
        }),
        true
      );
      set(highF, cachedData.response.highF, true);
      set(lowF, cachedData.response.lowF, true);
      const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
      if (cacheAge > REFRESH_INTERVAL_MS) {
        await fetchTrend();
      }
    } else {
      await fetchTrend();
    }
    set(loading, false);
  }
  async function fetchTrend() {
    if (!get(context)) return;
    set(loading, true);
    set(error, "");
    try {
      const response = await get(context).chatAppState.invokeAgentAsComponent("weather", "temperature-trend", "get24hTrend", `Get 24-hour temperature trend for ${get(location)}`);
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "temperature-trend");
      await userWidgetData.setValue("trendData", { response, timestamp, location: get(location) });
      set(lastRefreshTime, timestamp, true);
      set(temps, response.dataPoints.map((dp) => dp.tempF), true);
      set(
        hours,
        response.dataPoints.map((dp) => {
          const date = new Date(dp.timestamp);
          const hour = date.getHours();
          const ampm = hour >= 12 ? "pm" : "am";
          const displayHour = hour % 12 || 12;
          return `${displayHour}${ampm}`;
        }),
        true
      );
      set(highF, response.highF, true);
      set(lowF, response.lowF, true);
    } catch (e) {
      console.error("Error fetching temperature trend:", e);
      set(error, "Failed to fetch temperature trend");
    } finally {
      set(loading, false);
    }
  }
  function getBarHeight(temp) {
    if (get(temps).length === 0) return 0;
    const min = Math.min(...get(temps));
    const max = Math.max(...get(temps));
    const range = max - min;
    if (range === 0) return 50;
    return (temp - min) / range * 100;
  }
  function changeLocation() {
    const newLocation = prompt("Enter city name:", get(location));
    if (newLocation) {
      set(location, newLocation, true);
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
  var node_1 = sibling(node, 2);
  Button(node_1, {
    variant: "ghost",
    size: "sm",
    onclick: changeLocation,
    get disabled() {
      return get(loading);
    },
    class: "h-7 px-2",
    children: ($$anchor2, $$slotProps) => {
      var fragment = root_2();
      var node_2 = first_child(fragment);
      Map_pin(node_2, { class: "h-3 w-3 mr-1" });
      var text_1 = sibling(node_2);
      template_effect(() => set_text(text_1, ` ${get(location) ?? ""}`));
      append($$anchor2, fragment);
    },
    $$slots: { default: true }
  });
  reset(div_2);
  var node_3 = sibling(div_2, 2);
  Button(node_3, {
    variant: "outline",
    size: "sm",
    onclick: fetchTrend,
    get disabled() {
      return get(loading);
    },
    children: ($$anchor2, $$slotProps) => {
      var fragment_1 = root_3();
      var node_4 = first_child(fragment_1);
      Refresh_cw(node_4, { class: "h-3 w-3 mr-1" });
      var text_2 = sibling(node_4);
      template_effect(() => set_text(text_2, ` ${get(loading) ? "Loading..." : "Refresh"}`));
      append($$anchor2, fragment_1);
    },
    $$slots: { default: true }
  });
  reset(div_1);
  var node_5 = sibling(div_1, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var p = root_4();
      append($$anchor2, p);
    };
    var alternate_2 = ($$anchor2) => {
      var fragment_2 = comment();
      var node_6 = first_child(fragment_2);
      {
        var consequent_2 = ($$anchor3) => {
          var p_1 = root_6();
          var text_3 = child(p_1, true);
          reset(p_1);
          template_effect(() => set_text(text_3, get(error)));
          append($$anchor3, p_1);
        };
        var alternate_1 = ($$anchor3) => {
          var fragment_3 = comment();
          var node_7 = first_child(fragment_3);
          {
            var consequent_3 = ($$anchor4) => {
              var p_2 = root_8();
              append($$anchor4, p_2);
            };
            var alternate = ($$anchor4) => {
              var fragment_4 = root_9();
              var div_3 = first_child(fragment_4);
              var span_1 = child(div_3);
              var strong = sibling(child(span_1));
              var text_4 = child(strong);
              reset(strong);
              reset(span_1);
              var span_2 = sibling(span_1, 2);
              var strong_1 = sibling(child(span_2));
              var text_5 = child(strong_1);
              reset(strong_1);
              reset(span_2);
              reset(div_3);
              var div_4 = sibling(div_3, 2);
              each(div_4, 21, () => get(temps), index, ($$anchor5, temp, i) => {
                var div_5 = root_10();
                var div_6 = child(div_5);
                var span_3 = child(div_6);
                var text_6 = child(span_3);
                reset(span_3);
                reset(div_6);
                var span_4 = sibling(div_6, 2);
                var text_7 = child(span_4, true);
                reset(span_4);
                reset(div_5);
                template_effect(
                  ($0, $1) => {
                    set_style(div_6, `height: ${$0 ?? ""}%`);
                    set_text(text_6, `${$1 ?? ""}°`);
                    set_text(text_7, get(hours)[i]);
                  },
                  [
                    () => getBarHeight(get(temp)),
                    () => Math.round(get(temp))
                  ]
                );
                append($$anchor5, div_5);
              });
              reset(div_4);
              template_effect(
                ($0, $1) => {
                  set_text(text_4, `${$0 ?? ""}°F`);
                  set_text(text_5, `${$1 ?? ""}°F`);
                },
                [
                  () => Math.round(get(highF)),
                  () => Math.round(get(lowF))
                ]
              );
              append($$anchor4, fragment_4);
            };
            if_block(
              node_7,
              ($$render) => {
                if (get(temps).length === 0) $$render(consequent_3);
                else $$render(alternate, false);
              },
              true
            );
          }
          append($$anchor3, fragment_3);
        };
        if_block(
          node_6,
          ($$render) => {
            if (get(error)) $$render(consequent_2);
            else $$render(alternate_1, false);
          },
          true
        );
      }
      append($$anchor2, fragment_2);
    };
    if_block(node_5, ($$render) => {
      if (get(loading)) $$render(consequent_1);
      else $$render(alternate_2, false);
    });
  }
  reset(div);
  append($$anchor, div);
  pop();
}
customElements.define("temperature-trend", create_custom_element(Temperature_trend, {}, [], [], true));
