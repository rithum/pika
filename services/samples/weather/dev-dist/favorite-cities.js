import { c as create_custom_element, f as from_svg, a as attribute_effect, r as rest_props, b as append, p as push, d as append_styles, s as state, e as proxy, u as user_effect, g as from_html, i as if_block, h as sibling, j as pop, k as get, l as set, m as getPikaContext, n as child, o as first_child, t as template_effect, q as set_text, v as next, w as reset, x as comment } from "./wc-utils-za2Oi3n3.js";
import { e as each, i as index } from "./each-DO0Vkoj8.js";
import { R as Refresh_cw } from "./refresh-cw-pu7uKzd9.js";
import { X } from "./x-BIkiFl-N.js";
import { B as Button } from "./button-CLUnrs-q.js";
var root$1 = from_svg(`<svg><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14"></path></svg>`);
function Plus($$anchor, $$props) {
  const p = rest_props($$props, ["$$slots", "$$events", "$$legacy", "$$host"]);
  var svg = root$1();
  attribute_effect(svg, () => ({ viewBox: "0 0 24 24", width: "1.2em", height: "1.2em", ...p }));
  append($$anchor, svg);
}
create_custom_element(Plus, {}, [], [], true);
var root_1 = from_html(`<span class="last-update svelte-11shnrv"> </span>`);
var root_2 = from_html(`<!> `, 1);
var root_3 = from_html(`<!> Add`, 1);
var root_4 = from_html(`<p class="loading svelte-11shnrv">Loading...</p>`);
var root_6 = from_html(`<p class="error svelte-11shnrv"> </p>`);
var root_9 = from_html(`<span class="temp svelte-11shnrv"> </span>`);
var root_11 = from_html(`<span class="error-text svelte-11shnrv"> </span>`);
var root_8 = from_html(`<li class="city-item svelte-11shnrv"><div class="city-info svelte-11shnrv"><span class="city-name svelte-11shnrv"> </span> <!></div> <!></li>`);
var root_7 = from_html(`<ul class="cities-list svelte-11shnrv"></ul>`);
var root = from_html(`<div class="favorite-cities svelte-11shnrv"><div class="header svelte-11shnrv"><h3 class="text-base font-semibold m-0">My Favorite Cities</h3> <div class="actions svelte-11shnrv"><!> <!> <!></div></div> <!></div>`);
const $$css = {
  hash: "svelte-11shnrv",
  code: ".favorite-cities.svelte-11shnrv {padding:0.75rem;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0, 0, 0, 0.1);}.header.svelte-11shnrv {display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;}.actions.svelte-11shnrv {display:flex;gap:0.25rem;align-items:center;}.last-update.svelte-11shnrv {font-size:0.65rem;color:#6b7280;margin-right:0.5rem;}.cities-list.svelte-11shnrv {list-style:none;padding:0;margin:0;}.city-item.svelte-11shnrv {display:flex;justify-content:space-between;align-items:center;padding:0.5rem;border-bottom:1px solid #e5e7eb;}.city-item.svelte-11shnrv:last-child {border-bottom:none;}.city-info.svelte-11shnrv {display:flex;align-items:center;gap:0.75rem;flex:1;}.city-name.svelte-11shnrv {font-size:0.875rem;color:#374151;font-weight:500;}.temp.svelte-11shnrv {font-size:1rem;color:#3b82f6;font-weight:600;}.error-text.svelte-11shnrv {font-size:0.75rem;color:#ef4444;}.loading.svelte-11shnrv,\n    .error.svelte-11shnrv {text-align:center;padding:1.5rem;color:#6b7280;font-size:0.875rem;}.error.svelte-11shnrv {color:#ef4444;}"
};
function Favorite_cities($$anchor, $$props) {
  push($$props, true);
  append_styles($$anchor, $$css);
  const REFRESH_INTERVAL_MS = 60 * 60 * 1e3;
  let cities = state(proxy([]));
  let loading = state(true);
  let error = state("");
  let initialized = state(false);
  let context = state(void 0);
  let fetchingWeather = state(false);
  let lastRefreshTime = state("");
  user_effect(() => {
    if (!get(initialized)) {
      init();
    }
  });
  async function init() {
    set(context, await getPikaContext($$props.$$host), true);
    set(initialized, true);
    const metadata = get(context).chatAppState.getWidgetMetadataAPI("weather", "favorite-cities", get(context).instanceId, get(context).renderingContext);
    metadata.setMetadata({
      title: "Favorite Cities",
      actions: [
        {
          id: "refresh",
          title: "Refresh Weather",
          // refresh-cw icon svg
          iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw-icon lucide-refresh-cw"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
          disabled: get(fetchingWeather),
          callback: async () => {
            await refreshWeather();
          }
        }
      ]
    });
    try {
      const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "favorite-cities");
      const storedCityNames = await userWidgetData.getValue("cities");
      const cityNames = storedCityNames || ["San Francisco", "New York", "London"];
      set(cities, cityNames.map((name) => ({ name, loading: false })), true);
      const cachedData = await userWidgetData.getValue("weatherData");
      if (cachedData) {
        set(lastRefreshTime, cachedData.timestamp, true);
        set(
          cities,
          get(cities).map((city) => {
            const weatherData = cachedData.response.locations.find((loc) => loc.location.toLowerCase().includes(city.name.toLowerCase()));
            return {
              ...city,
              weather: weatherData,
              error: weatherData ? void 0 : void 0
            };
          }),
          true
        );
        const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
        if (cacheAge > REFRESH_INTERVAL_MS) {
          await refreshWeather();
        }
      } else {
        await refreshWeather();
      }
      set(loading, false);
    } catch (e) {
      set(error, "Failed to load favorite cities");
      set(loading, false);
    }
  }
  async function refreshWeather() {
    if (!get(context) || get(fetchingWeather)) return;
    set(fetchingWeather, true);
    const cityNames = get(cities).map((c) => c.name).join(", ");
    try {
      const response = await get(context).chatAppState.invokeAgentAsComponent("weather", "favorite-cities", "getCurrentWeather", `Get current weather for: ${cityNames}`);
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "favorite-cities");
      await userWidgetData.setValue("weatherData", { response, timestamp });
      set(lastRefreshTime, timestamp, true);
      set(
        cities,
        get(cities).map((city) => {
          const weatherData = response.locations.find((loc) => loc.location.toLowerCase().includes(city.name.toLowerCase()));
          return {
            ...city,
            weather: weatherData,
            loading: false,
            error: weatherData ? void 0 : "No data"
          };
        }),
        true
      );
    } catch (e) {
      console.error("Error fetching weather:", e);
      set(cities, get(cities).map((city) => ({ ...city, loading: false, error: "Failed to fetch" })), true);
    } finally {
      set(fetchingWeather, false);
    }
  }
  async function addCity() {
    if (!get(context)) return;
    const cityName = prompt("Enter city name:");
    if (cityName) {
      const newCities = [...get(cities), { name: cityName, loading: false }];
      set(cities, newCities, true);
      const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "favorite-cities");
      await userWidgetData.setValue("cities", newCities.map((c) => c.name));
    }
  }
  async function removeCity(index2) {
    if (!get(context)) return;
    set(cities, get(cities).filter((_, i) => i !== index2), true);
    const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "favorite-cities");
    await userWidgetData.setValue("cities", get(cities).map((c) => c.name));
  }
  var div = root();
  var div_1 = child(div);
  var div_2 = sibling(child(div_1), 2);
  var node = child(div_2);
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
    variant: "outline",
    size: "sm",
    onclick: refreshWeather,
    get disabled() {
      return get(fetchingWeather);
    },
    children: ($$anchor2, $$slotProps) => {
      var fragment = root_2();
      var node_2 = first_child(fragment);
      Refresh_cw(node_2, { class: "h-3 w-3 mr-1" });
      var text_1 = sibling(node_2);
      template_effect(() => set_text(text_1, ` ${get(fetchingWeather) ? "Refreshing..." : "Refresh"}`));
      append($$anchor2, fragment);
    },
    $$slots: { default: true }
  });
  var node_3 = sibling(node_1, 2);
  Button(node_3, {
    variant: "outline",
    size: "sm",
    onclick: addCity,
    children: ($$anchor2, $$slotProps) => {
      var fragment_1 = root_3();
      var node_4 = first_child(fragment_1);
      Plus(node_4, { class: "h-3 w-3 mr-1" });
      next();
      append($$anchor2, fragment_1);
    },
    $$slots: { default: true }
  });
  reset(div_2);
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
          var text_2 = child(p_1, true);
          reset(p_1);
          template_effect(() => set_text(text_2, get(error)));
          append($$anchor3, p_1);
        };
        var alternate_1 = ($$anchor3) => {
          var ul = root_7();
          each(ul, 21, () => get(cities), index, ($$anchor4, city, i) => {
            var li = root_8();
            var div_3 = child(li);
            var span_1 = child(div_3);
            var text_3 = child(span_1, true);
            reset(span_1);
            var node_7 = sibling(span_1, 2);
            {
              var consequent_3 = ($$anchor5) => {
                var span_2 = root_9();
                var text_4 = child(span_2);
                reset(span_2);
                template_effect(($0) => set_text(text_4, `${$0 ?? ""}°F`), [() => Math.round(get(city).weather.tempF)]);
                append($$anchor5, span_2);
              };
              var alternate = ($$anchor5) => {
                var fragment_3 = comment();
                var node_8 = first_child(fragment_3);
                {
                  var consequent_4 = ($$anchor6) => {
                    var span_3 = root_11();
                    var text_5 = child(span_3, true);
                    reset(span_3);
                    template_effect(() => set_text(text_5, get(city).error));
                    append($$anchor6, span_3);
                  };
                  if_block(
                    node_8,
                    ($$render) => {
                      if (get(city).error) $$render(consequent_4);
                    },
                    true
                  );
                }
                append($$anchor5, fragment_3);
              };
              if_block(node_7, ($$render) => {
                if (get(city).weather) $$render(consequent_3);
                else $$render(alternate, false);
              });
            }
            reset(div_3);
            var node_9 = sibling(div_3, 2);
            Button(node_9, {
              variant: "ghost",
              size: "icon",
              onclick: () => removeCity(i),
              class: "h-6 w-6",
              children: ($$anchor5, $$slotProps) => {
                X($$anchor5, { class: "h-4 w-4" });
              },
              $$slots: { default: true }
            });
            reset(li);
            template_effect(() => set_text(text_3, get(city).name));
            append($$anchor4, li);
          });
          reset(ul);
          append($$anchor3, ul);
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
customElements.define("favorite-cities", create_custom_element(Favorite_cities, {}, [], [], true));
